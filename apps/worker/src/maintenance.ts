import { getEffectivePlan, PLAN_LIMITS, TRIAL_DAYS } from "@inboxsieve/contract";

import { nextSubscriptionStatus, type SubscriptionEvent } from "./billing/state";
import { purgeDeletedAccounts, purgeOldRawBodies } from "./data/purge";
import type { Deps } from "./deps";
import {
  applyBrandLimit,
  getBillingRow,
  listDuePlanChanges,
  listEndedCancellations,
  listEndedLocalTrials,
  purgeOldRateLimitHits,
  saveSubscription,
  type BillingRow,
} from "./repo";

export const MAINTENANCE_CRON = "0 * * * *";

// Hourly: plan downgrades due at period end, canceled → expired (Free), ended no-card trials → Free,
// the 90-day raw-body purge and account deletions.
export async function runMaintenance({ deps, now }: { deps: Pick<Deps, "db" | "mailer" | "env">; now: Date }) {
  const db = deps.db;
  const summary = {
    planChanges: 0,
    expired: 0,
    trialsEnded: 0,
    rawPurged: 0,
    accountsDeleted: 0,
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
    if (await endPaidAccess({ db, accountId, now, event: { type: "period_ended" } })) {
      summary.expired += 1;
    }
  }

  for (const trial of await listEndedLocalTrials({ db, now })) {
    if (await endPaidAccess({ db, accountId: trial.account_id, now, event: { type: "trial_ended" } })) {
      await deps.mailer.send({
        to: trial.email,
        subject: "Your InboxSieve Solo trial has ended",
        text: `Your ${TRIAL_DAYS}-day Solo trial has ended, so your workspace is on the Free plan now: ${PLAN_LIMITS.free.leadsPerMonth} analyzed leads a month and email alerts. Nothing was deleted.\nTo keep Solo, upgrade here: ${deps.env.APP_URL}/app/billing`,
      });
      summary.trialsEnded += 1;
    }
  }

  summary.rawPurged = await purgeOldRawBodies({ db, now });
  summary.accountsDeleted = await purgeDeletedAccounts({ db, mailer: deps.mailer, now });
  await purgeOldRateLimitHits({ db, now });
  return summary;
}

// Moves the account onto Free limits; brands over them turn read-only, nothing is deleted.
async function endPaidAccess({
  db,
  accountId,
  now,
  event,
}: {
  db: D1Database;
  accountId: string;
  now: Date;
  event: SubscriptionEvent;
}) {
  const row = await getBillingRow({ db, accountId });
  const transition = row ? nextSubscriptionStatus({ current: row.status, event }) : null;

  if (!row || !transition?.ok) {
    return false;
  }
  await saveRow({ db, row, now, changes: { status: transition.status, statusSince: now.toISOString() } });
  const plan = getEffectivePlan({ paidPlan: row.plan, subscription: transition.status });
  await applyBrandLimit({ db, accountId, limit: PLAN_LIMITS[plan].brands });
  return true;
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
