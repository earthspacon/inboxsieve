import { PLAN_LIMITS, type PaidPlan, type ScheduledChange } from "@inboxsieve/contract";

import { createEnumGuard } from "../api/context";
import type { Deps } from "../deps";
import { isRecord, json } from "../http";
import {
  applyBrandLimit,
  findAccountIdForPaddle,
  getBillingRow,
  recordPaddleEvent,
  saveSubscription,
  setPaddleEventOutcome,
  type BillingRow,
} from "../repo";
import { findPlanByPrice } from "./prices";
import { verifyPaddleSignature } from "./signature";
import { nextSubscriptionStatus, type PaddleStatus, type SubscriptionEvent } from "./state";

type PaddleEvent = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

type SubscriptionData = {
  id: string;
  status: PaddleStatus;
  customerId: string | null;
  priceId: string | null;
  periodEnd: string | null;
  scheduledChange: ScheduledChange | null;
  accountId: string | null;
};

type StatusEventType = Exclude<
  SubscriptionEvent["type"],
  "subscription.created" | "subscription.updated" | "period_ended" | "trial_started" | "trial_ended"
>;

const PADDLE_STATUSES: Record<PaddleStatus, true> = {
  active: true,
  canceled: true,
  past_due: true,
  paused: true,
  trialing: true,
};
const STATUS_EVENT_TYPES: Record<StatusEventType, true> = {
  "subscription.trialing": true,
  "subscription.activated": true,
  "subscription.past_due": true,
  "subscription.paused": true,
  "subscription.resumed": true,
  "subscription.canceled": true,
};

const isPaddleStatus = createEnumGuard(PADDLE_STATUSES);
const isStatusEventType = createEnumGuard(STATUS_EVENT_TYPES);

export async function handlePaddleWebhook({ deps, request }: { deps: Deps; request: Request }) {
  const rawBody = await request.text();
  const secret = deps.env.PADDLE_WEBHOOK_SECRET;
  const isValid = secret
    ? await verifyPaddleSignature({
        header: request.headers.get("paddle-signature"),
        rawBody,
        secret,
        now: deps.now(),
      })
    : false;

  if (!isValid) {
    console.warn("paddle webhook rejected: invalid signature");
    return json({ error: "unauthorized", message: "Invalid signature" }, 401);
  }

  const event = parsePaddleEvent(rawBody);
  if (!event) {
    return json({ error: "invalid_json", message: "Not a Paddle event" }, 400);
  }

  const isNew = await recordPaddleEvent({
    db: deps.db,
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    now: deps.now(),
  });
  if (!isNew) {
    return json({ received: true, outcome: "duplicate" });
  }

  const outcome = await applyPaddleEvent({ deps, event });
  await setPaddleEventOutcome({ db: deps.db, eventId: event.eventId, outcome });
  console.log("paddle webhook", event.eventType, outcome);
  return json({ received: true, outcome });
}

async function applyPaddleEvent({ deps, event }: { deps: Deps; event: PaddleEvent }) {
  if (!event.eventType.startsWith("subscription.")) {
    return "recorded";
  }
  const data = parseSubscriptionData(event.data);
  if (!data) {
    return "invalid_subscription";
  }

  const accountId = await findAccountIdForPaddle({
    db: deps.db,
    accountId: data.accountId,
    paddleSubscriptionId: data.id,
  });
  const row = accountId ? await getBillingRow({ db: deps.db, accountId }) : null;

  if (!accountId || !row) {
    return "unknown_account";
  }
  if (
    row.paddle_subscription_id &&
    row.paddle_subscription_id !== data.id &&
    event.eventType !== "subscription.created"
  ) {
    return "other_subscription";
  }
  if (row.last_event_at && event.occurredAt < row.last_event_at) {
    return "stale";
  }

  const transition = nextSubscriptionStatus({
    current: row.status,
    event: toSubscriptionEvent({ eventType: event.eventType, status: data.status }),
  });
  if (!transition.ok) {
    return transition.reason;
  }

  const planChange = decidePlanChange({
    row,
    newPlan: findPlanByPrice({ env: deps.env, priceId: data.priceId }) ?? row.plan,
    periodEnd: data.periodEnd ?? row.current_period_end,
    now: deps.now(),
  });
  const isStatusChanged = transition.status !== row.status;

  await saveSubscription({
    db: deps.db,
    accountId,
    now: deps.now(),
    update: {
      status: transition.status,
      plan: planChange.plan,
      pendingPlan: planChange.pendingPlan,
      paddleSubscriptionId: data.id,
      paddleCustomerId: data.customerId ?? row.paddle_customer_id,
      paddlePriceId: data.priceId ?? row.paddle_price_id,
      currentPeriodEnd: data.periodEnd ?? row.current_period_end,
      scheduledChange: data.scheduledChange,
      pastDueSince: transition.status === "past_due" ? (row.past_due_since ?? event.occurredAt) : null,
      statusSince: isStatusChanged ? event.occurredAt : row.status_since,
      lastEventAt: event.occurredAt,
    },
  });
  await applyBrandLimit({
    db: deps.db,
    accountId,
    limit: PLAN_LIMITS[planChange.plan].brands,
  });
  return "applied";
}

// Upgrades and new subscriptions apply now; a downgrade waits for the end of the paid period.
export function decidePlanChange({
  row,
  newPlan,
  periodEnd,
  now,
}: {
  row: Pick<BillingRow, "plan" | "status">;
  newPlan: PaidPlan;
  periodEnd: string | null;
  now: Date;
}): { plan: PaidPlan; pendingPlan: PaidPlan | null } {
  const isDowngrade = PLAN_LIMITS[newPlan].brands < PLAN_LIMITS[row.plan].brands;
  const hasPaidPeriod = row.status !== "no_subscription" && row.status !== "expired";
  const isPeriodRunning = periodEnd !== null && periodEnd > now.toISOString();

  if (isDowngrade && hasPaidPeriod && isPeriodRunning) {
    return {
      plan: row.plan,
      pendingPlan: newPlan,
    };
  }
  return {
    plan: newPlan,
    pendingPlan: null,
  };
}

function toSubscriptionEvent({ eventType, status }: { eventType: string; status: PaddleStatus }): SubscriptionEvent {
  if (eventType === "subscription.created") {
    return {
      type: "subscription.created",
      status,
    };
  }
  if (isStatusEventType(eventType)) {
    return { type: eventType };
  }
  return {
    type: "subscription.updated",
    status,
  };
}

function parsePaddleEvent(rawBody: string): PaddleEvent | null {
  const body: unknown = safeParse(rawBody);

  if (!isRecord(body) || !isRecord(body.data)) {
    return null;
  }
  const { event_id: eventId, event_type: eventType, occurred_at: occurredAt } = body;
  if (typeof eventId !== "string" || typeof eventType !== "string" || typeof occurredAt !== "string") {
    return null;
  }
  return {
    eventId,
    eventType,
    occurredAt,
    data: body.data,
  };
}

function parseSubscriptionData(data: Record<string, unknown>): SubscriptionData | null {
  const { id, status } = data;

  if (typeof id !== "string" || !isPaddleStatus(status)) {
    return null;
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const price = isRecord(items[0]) && isRecord(items[0].price) ? items[0].price : null;
  const period = isRecord(data.current_billing_period) ? data.current_billing_period : null;
  const change = isRecord(data.scheduled_change) ? data.scheduled_change : null;
  const custom = isRecord(data.custom_data) ? data.custom_data : null;

  return {
    id,
    status,
    customerId: readOptionalString(data.customer_id),
    priceId: readOptionalString(price?.id),
    periodEnd: readOptionalString(period?.ends_at),
    scheduledChange: parseScheduledChange(change),
    accountId: readOptionalString(custom?.account_id),
  };
}

function parseScheduledChange(change: Record<string, unknown> | null): ScheduledChange | null {
  const action = change?.action;
  const effectiveAt = readOptionalString(change?.effective_at);

  if ((action === "cancel" || action === "pause" || action === "resume") && effectiveAt) {
    return {
      action,
      effectiveAt,
    };
  }
  return null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
