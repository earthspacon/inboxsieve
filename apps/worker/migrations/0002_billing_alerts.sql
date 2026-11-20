-- S5: Paddle billing state, plan changes, past_due pause and hot-lead alerts
ALTER TABLE subscriptions ADD COLUMN paddle_customer_id TEXT;
ALTER TABLE subscriptions ADD COLUMN paddle_price_id TEXT;
ALTER TABLE subscriptions ADD COLUMN pending_plan TEXT CHECK (pending_plan IN ('solo', 'agency'));
ALTER TABLE subscriptions ADD COLUMN scheduled_change TEXT;
ALTER TABLE subscriptions ADD COLUMN past_due_since TEXT;
ALTER TABLE subscriptions ADD COLUMN status_since TEXT;
ALTER TABLE subscriptions ADD COLUMN last_event_at TEXT;
CREATE UNIQUE INDEX subscriptions_paddle ON subscriptions(paddle_subscription_id);

ALTER TABLE accounts ADD COLUMN checkout_reminder_sent_at TEXT;

CREATE TABLE paddle_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  received_at TEXT NOT NULL
);

ALTER TABLE brands ADD COLUMN read_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE brands ADD COLUMN alerts_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE brands ADD COLUMN slack_webhook_url TEXT;
ALTER TABLE brands ADD COLUMN alert_failed_at TEXT;
ALTER TABLE brands ADD COLUMN alert_last_error TEXT;

CREATE TABLE alert_deliveries (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack')),
  target TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (lead_id, channel, target)
);
CREATE INDEX alert_deliveries_due ON alert_deliveries(status, next_attempt_at);
