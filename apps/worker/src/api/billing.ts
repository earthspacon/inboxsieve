import { PAST_DUE_GRACE_DAYS, type BillingDto, type ScheduledChange } from "@inboxsieve/contract";

import { createPortalSession, getPaddleEnvironment } from "../billing/paddle-api";
import { buildPriceTable } from "../billing/prices";
import { HttpError, json, route, type Route } from "../http";
import { getBillingRow } from "../repo";
import { requireOwner, type ApiContext } from "./context";

const DAY_MS = 24 * 60 * 60 * 1000;

export const billingRoutes: Route<ApiContext>[] = [
  route("GET", "/api/billing", async ({ deps, account }) => {
    const row = await getBillingRow({ db: deps.db, accountId: account.accountId });

    if (!row) {
      throw new HttpError(404, "not_found", "No subscription record");
    }
    const graceStart = new Date(deps.now().getTime() - PAST_DUE_GRACE_DAYS * DAY_MS).toISOString();
    const scheduledChange: ScheduledChange | null = row.scheduled_change ? JSON.parse(row.scheduled_change) : null;
    const billing: BillingDto = {
      plan: row.plan,
      subscription: row.status,
      currentPeriodEnd: row.current_period_end,
      pendingPlan: row.pending_plan,
      scheduledChange,
      pastDueSince: row.past_due_since,
      isAnalysisPaused: row.status === "past_due" && row.past_due_since !== null && row.past_due_since <= graceStart,
      hasCustomer: row.paddle_customer_id !== null,
      checkout: {
        environment: getPaddleEnvironment(deps.env),
        clientToken: deps.env.PADDLE_CLIENT_TOKEN || null,
        prices: buildPriceTable(deps.env),
      },
    };
    return json(billing);
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
