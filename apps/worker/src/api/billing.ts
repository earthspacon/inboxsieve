import {
  getEffectivePlan,
  PAST_DUE_GRACE_DAYS,
  PLAN_LIMITS,
  SUBSCRIPTION_RULES,
  TRIAL_DAYS,
  type BillingDto,
  type ScheduledChange,
} from "@inboxsieve/contract";

import { createPortalSession, getPaddleEnvironment } from "../billing/paddle-api";
import { findPriceIds } from "../billing/prices";
import { nextSubscriptionStatus } from "../billing/state";
import type { Deps } from "../deps";
import { HttpError, json, route, type Route } from "../http";
import { applyBrandLimit, getBillingRow, startLocalTrial } from "../repo";
import { requireOwner, type ApiContext } from "./context";

const DAY_MS = 24 * 60 * 60 * 1000;

export const billingRoutes: Route<ApiContext>[] = [
  route("GET", "/api/billing", async ({ deps, account }) => {
    return json(await loadBilling({ deps, accountId: account.accountId }));
  }),

  // The no-card trial of the paid plan: local only, one per account, no Paddle call.
  route("POST", "/api/billing/trial", async ({ deps, account }) => {
    requireOwner(account);
    const row = await requireBillingRow({ deps, accountId: account.accountId });

    if (row.trial_ends_at) {
      throw new HttpError(409, "trial_used", "This workspace has already used its free trial");
    }
    const transition = nextSubscriptionStatus({ current: row.status, event: { type: "trial_started" } });
    if (!transition.ok) {
      throw new HttpError(409, "already_paid", "The trial is for workspaces on the Free plan");
    }

    const now = deps.now();
    await startLocalTrial({
      db: deps.db,
      accountId: account.accountId,
      status: transition.status,
      endsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
      now,
    });
    await applyBrandLimit({ db: deps.db, accountId: account.accountId, limit: PLAN_LIMITS.solo.brands });
    return json(await loadBilling({ deps, accountId: account.accountId }));
  }),

  route("POST", "/api/billing/portal", async ({ deps, account }) => {
    requireOwner(account);
    const row = await getBillingRow({ db: deps.db, accountId: account.accountId });

    if (!row?.paddle_customer_id) {
      throw new HttpError(409, "no_customer", "There is no Paddle subscription to manage yet");
    }
    if (!deps.env.PADDLE_API_KEY) {
      throw new HttpError(503, "billing_unavailable", "Billing isn't configured on this server");
    }
    const url = await createPortalSession({
      env: deps.env,
      apiKey: deps.env.PADDLE_API_KEY,
      customerId: row.paddle_customer_id,
      subscriptionId: row.paddle_subscription_id,
    });
    return json({ url });
  }),
];

async function requireBillingRow({ deps, accountId }: { deps: Deps; accountId: string }) {
  const row = await getBillingRow({ db: deps.db, accountId });

  if (!row) {
    throw new HttpError(404, "not_found", "No subscription record");
  }
  return row;
}

async function loadBilling({ deps, accountId }: { deps: Deps; accountId: string }) {
  const row = await requireBillingRow({ deps, accountId });
  const graceStart = new Date(deps.now().getTime() - PAST_DUE_GRACE_DAYS * DAY_MS).toISOString();
  const scheduledChange: ScheduledChange | null = row.scheduled_change ? JSON.parse(row.scheduled_change) : null;
  const isFree = SUBSCRIPTION_RULES[row.status].isFree;
  const priceIds = findPriceIds(deps.env);
  const isLocalTrial = row.status === "trialing" && row.paddle_subscription_id === null;
  const billing: BillingDto = {
    plan: getEffectivePlan({ paidPlan: row.plan, subscription: row.status }),
    subscription: row.status,
    currentPeriodEnd: row.current_period_end,
    pendingPlan: row.pending_plan,
    trialEndsAt: isLocalTrial ? row.trial_ends_at : null,
    canStartTrial: isFree && row.trial_ends_at === null,
    hasPaidSubscription: !isFree && row.paddle_subscription_id !== null,
    billingPeriod: row.paddle_price_id && row.paddle_price_id === priceIds.yearly ? "yearly" : "monthly",
    scheduledChange,
    pastDueSince: row.past_due_since,
    isAnalysisPaused: row.status === "past_due" && row.past_due_since !== null && row.past_due_since <= graceStart,
    hasCustomer: row.paddle_customer_id !== null,
    checkout: {
      environment: getPaddleEnvironment(deps.env),
      clientToken: deps.env.PADDLE_CLIENT_TOKEN || null,
      priceIds,
    },
  };
  return billing;
}
