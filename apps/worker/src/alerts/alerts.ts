import {
  getEffectivePlan,
  PLAN_LIMITS,
  SET_ASIDE_STAGES,
  type LeadStage,
  type PaidPlan,
  type SubscriptionStatus,
} from "@inboxsieve/contract";

import type { Mailer } from "../mailer";
import type { SlackPoster } from "./slack";

export const ALERT_MAX_ATTEMPTS = 3;
export const ALERT_RETRY_DELAYS_MS = [10_000, 30_000];
const ALERT_BATCH = 50;

type DueAlert = {
  id: string;
  brand_id: string;
  lead_id: string;
  channel: "email" | "slack";
  target: string;
  attempts: number;
  brand_name: string;
  name: string;
  email: string;
  company: string;
  subject: string;
  score: number;
};

export type AlertChannels = {
  mailer: Mailer;
  slack: SlackPoster;
  appUrl: string;
};

// Queues one email per active seat, plus one Slack post on plans with Slack, when the score reaches the threshold.
// Spam and pitches never alert.
export async function queueHotLeadAlerts({
  db,
  brandId,
  leadId,
  now,
}: {
  db: D1Database;
  brandId: string;
  leadId: string;
  now: Date;
}) {
  const brand = await db
    .prepare(
      `SELECT b.account_id, b.alerts_enabled, b.alert_threshold, b.slack_webhook_url, l.score, l.stage, a.plan, s.status
       FROM leads l JOIN brands b ON b.id = l.brand_id
       JOIN accounts a ON a.id = b.account_id
       JOIN subscriptions s ON s.account_id = b.account_id
       WHERE l.id = ? AND l.brand_id = ?`,
    )
    .bind(leadId, brandId)
    .first<{
      account_id: string;
      alerts_enabled: number;
      alert_threshold: number;
      slack_webhook_url: string | null;
      score: number | null;
      stage: LeadStage;
      plan: PaidPlan;
      status: SubscriptionStatus;
    }>();

  if (!brand || !brand.alerts_enabled || brand.score === null || brand.score < brand.alert_threshold) {
    return 0;
  }
  if (SET_ASIDE_STAGES.includes(brand.stage)) {
    return 0;
  }
  const at = now.toISOString();
  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO alert_deliveries (id, brand_id, lead_id, channel, target, status, next_attempt_at, created_at)
         SELECT lower(hex(randomblob(16))), ?, ?, 'email', email, 'pending', ?, ?
         FROM seats WHERE account_id = ? AND status = 'active'`,
      )
      .bind(brandId, leadId, at, at, brand.account_id),
  ];
  const plan = getEffectivePlan({ paidPlan: brand.plan, subscription: brand.status });
  if (brand.slack_webhook_url && PLAN_LIMITS[plan].slackAlerts) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO alert_deliveries (id, brand_id, lead_id, channel, target, status, next_attempt_at, created_at)
           VALUES (lower(hex(randomblob(16))), ?, ?, 'slack', ?, 'pending', ?, ?)`,
        )
        .bind(brandId, leadId, brand.slack_webhook_url, at, at),
    );
  }
  const results = await db.batch(statements);
  return results.reduce((sum, result) => sum + result.meta.changes, 0);
}

export async function runAlertDeliveries({
  db,
  channels,
  now,
}: {
  db: D1Database;
  channels: AlertChannels;
  now: Date;
}) {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.brand_id, d.lead_id, d.channel, d.target, d.attempts, b.name AS brand_name,
              l.name, l.email, l.company, l.subject, l.score
       FROM alert_deliveries d
       JOIN leads l ON l.id = d.lead_id
       JOIN brands b ON b.id = d.brand_id
       WHERE d.status = 'pending' AND d.next_attempt_at <= ?
       ORDER BY d.next_attempt_at LIMIT ?`,
    )
    .bind(now.toISOString(), ALERT_BATCH)
    .all<DueAlert>();

  for (const alert of results) {
    await deliverAlert({ db, channels, alert, now });
  }
  return results.length;
}

async function deliverAlert({
  db,
  channels,
  alert,
  now,
}: {
  db: D1Database;
  channels: AlertChannels;
  alert: DueAlert;
  now: Date;
}) {
  const attempts = alert.attempts + 1;
  const message = buildAlertMessage({ alert, appUrl: channels.appUrl });

  try {
    if (alert.channel === "email") {
      await channels.mailer.send({
        to: alert.target,
        subject: message.subject,
        text: message.text,
      });
    } else {
      await channels.slack.post({
        url: alert.target,
        text: message.text,
      });
    }
    await db.batch([
      db
        .prepare("UPDATE alert_deliveries SET status = 'sent', attempts = ?, last_error = NULL WHERE id = ?")
        .bind(attempts, alert.id),
      db.prepare("UPDATE brands SET alert_failed_at = NULL, alert_last_error = NULL WHERE id = ?").bind(alert.brand_id),
    ]);
  } catch (error) {
    const lastError = `${alert.channel === "email" ? "Email" : "Slack"}: ${error instanceof Error ? error.message : "delivery failed"}`;

    if (attempts >= ALERT_MAX_ATTEMPTS) {
      await db.batch([
        db
          .prepare("UPDATE alert_deliveries SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?")
          .bind(attempts, lastError, alert.id),
        db
          .prepare("UPDATE brands SET alert_failed_at = ?, alert_last_error = ? WHERE id = ?")
          .bind(now.toISOString(), lastError, alert.brand_id),
      ]);
      return;
    }
    await db
      .prepare("UPDATE alert_deliveries SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?")
      .bind(attempts, lastError, new Date(now.getTime() + ALERT_RETRY_DELAYS_MS[attempts - 1]).toISOString(), alert.id)
      .run();
  }
}

function buildAlertMessage({ alert, appUrl }: { alert: DueAlert; appUrl: string }) {
  const sender = [alert.name || alert.email, alert.company].filter(Boolean).join(", ");
  const link = `${appUrl}/app/leads/${alert.lead_id}`;
  return {
    subject: `Hot lead (${alert.score}) for ${alert.brand_name}: ${alert.subject}`,
    text: `Hot lead for ${alert.brand_name}, score ${alert.score}\n${sender}\n"${alert.subject}"\n\nOpen it: ${link}`,
  };
}
