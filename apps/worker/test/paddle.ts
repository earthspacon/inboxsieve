import { env, SELF } from "cloudflare:test";

import activated from "../fixtures/paddle/subscription.activated.json?raw";
import canceled from "../fixtures/paddle/subscription.canceled.json?raw";
import created from "../fixtures/paddle/subscription.created.json?raw";
import pastDue from "../fixtures/paddle/subscription.past_due.json?raw";
import trialing from "../fixtures/paddle/subscription.trialing.json?raw";
import downgrade from "../fixtures/paddle/subscription.updated-downgrade.json?raw";
import scheduledCancel from "../fixtures/paddle/subscription.updated-scheduled-cancel.json?raw";
import upgrade from "../fixtures/paddle/subscription.updated-upgrade.json?raw";
import transactionCompleted from "../fixtures/paddle/transaction.completed.json?raw";
import { signPaddlePayload } from "../src/billing/signature";
import { BASE } from "./session";

export const PADDLE_FIXTURES = {
  created,
  trialing,
  activated,
  upgrade,
  downgrade,
  scheduledCancel,
  pastDue,
  canceled,
  transactionCompleted,
};

export type PaddleFixture = keyof typeof PADDLE_FIXTURES;

type FixtureOptions = {
  accountId: string;
  occurredAt?: Date;
  subscriptionId?: string;
  periodEnd?: string;
};

// Fills the fixture for one account: a fresh event id, the account in custom_data and the event time.
export function buildPaddleEvent({ fixture, options }: { fixture: PaddleFixture; options: FixtureOptions }) {
  const event = JSON.parse(PADDLE_FIXTURES[fixture]);
  event.event_id = `evt_${crypto.randomUUID().replaceAll("-", "")}`;
  event.occurred_at = (options.occurredAt ?? new Date()).toISOString();
  event.data.custom_data = { account_id: options.accountId };

  // One Paddle subscription per test account, so accounts never collide on paddle_subscription_id.
  if (event.data.subscription_id !== undefined) {
    event.data.subscription_id = options.subscriptionId ?? `sub_${options.accountId}`;
  } else {
    event.data.id = options.subscriptionId ?? `sub_${options.accountId}`;
  }
  if (options.periodEnd && event.data.current_billing_period) {
    event.data.current_billing_period.ends_at = options.periodEnd;
  }
  return JSON.stringify(event);
}

export async function postPaddleEvent({
  body,
  secret = env.PADDLE_WEBHOOK_SECRET,
  ts = Math.floor(Date.now() / 1000),
}: {
  body: string;
  secret?: string;
  ts?: number;
}) {
  const h1 = await signPaddlePayload({ ts: String(ts), rawBody: body, secret });
  return SELF.fetch(`${BASE}/paddle/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paddle-signature": `ts=${ts};h1=${h1}`,
    },
    body,
  });
}

export async function sendFixture({ fixture, options }: { fixture: PaddleFixture; options: FixtureOptions }) {
  const response = await postPaddleEvent({ body: buildPaddleEvent({ fixture, options }) });
  return {
    status: response.status,
    body: await response.json<{ outcome?: string }>(),
  };
}
