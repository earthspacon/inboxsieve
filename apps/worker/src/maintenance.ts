import { PLAN_LIMITS } from "@inboxsieve/contract";

import { nextSubscriptionStatus } from "./billing/state";
import type { Deps } from "./deps";
import {
  applyBrandLimit,
  getBillingRow,
  listCheckoutReminders,
  listDuePlanChanges,
  listEndedCancellations,
  markCheckoutReminded,
  saveSubscription,
  type BillingRow,
} from "./repo";

export const MAINTENANCE_CRON = "0 * * * *";
const CHECKOUT_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

// Hourly: plan downgrades due at period end, canceled → expired, and the one-time checkout reminder.
export async function runMaintenance({ deps, now }: { deps: Pick<Deps, "db" | "mailer" | "env">; now: Date }) {
  const db = deps.db;
  const summary = {
    planChanges: 0,
    expired: 0,
    reminders: 0,
  };

  for (const accountId of await listDuePlanChanges({ db, now })) {
    const row = await getBillingRow({ db, accountId });
    if (row?.pending_plan) {
      await saveRow({ db, row, now, changes: { plan: row.pending_plan, pendingPlan: null } });
      await applyBrandLimit({ db, accountId, limit: PLAN_LIMITS[row.pending_plan].brands });
      summary.planChanges += 1;
    }
  }

  for (const accountId of await listEndedCancellations({ db, now })) {
    const row = await getBillingRow({ db, accountId });
    const transition = row ? nextSubscriptionStatus({ current: row.status, event: { type: "period_ended" } }) : null;
    if (row && transition?.ok) {
      await saveRow({ db, row, now, changes: { status: transition.status, statusSince: now.toISOString() } });
      summary.expired += 1;
    }
  }

  const reminders = await listCheckoutReminders({
    db,
    createdBefore: new Date(now.getTime() - CHECKOUT_REMINDER_DELAY_MS),
  });
  for (const reminder of reminders) {
    await deps.mailer.send({
      to: reminder.email,
      subject: "Your InboxSieve trial is one step away",
      text: `You signed up for InboxSieve but didn't finish checkout.\nStart your 7-day trial here: ${deps.env.APP_URL}/app/checkout\n\nWe only send this once.`,
    });
    await markCheckoutReminded({ db, accountId: reminder.account_id, now });
    summary.reminders += 1;
  }
  return summary;
}

async function saveRow({
  db,
  row,
  now,
  changes,
}: {
  db: D1Database;
  row: BillingRow;
  now: Date;
  changes: Partial<{
    plan: BillingRow["plan"];
    pendingPlan: BillingRow["pending_plan"];
    status: BillingRow["status"];
    statusSince: string;
  }>;
}) {
  await saveSubscription({
    db,
    accountId: row.account_id,
    now,
    update: {
      status: changes.status ?? row.status,
      plan: changes.plan ?? row.plan,
      pendingPlan: changes.pendingPlan === undefined ? row.pending_plan : changes.pendingPlan,
      paddleSubscriptionId: row.paddle_subscription_id,
      paddleCustomerId: row.paddle_customer_id,
      paddlePriceId: row.paddle_price_id,
      currentPeriodEnd: row.current_period_end,
      scheduledChange: row.scheduled_change ? JSON.parse(row.scheduled_change) : null,
      pastDueSince: row.past_due_since,
      statusSince: changes.statusSince ?? row.status_since,
      lastEventAt: row.last_event_at,
    },
  });
}
