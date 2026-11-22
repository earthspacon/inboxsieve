-- Pitches: vendor offers set aside next to spam. SQLite can't alter a CHECK constraint, so the leads table is rebuilt
-- with the same columns and indexes. Existing leads keep their stage.
PRAGMA defer_foreign_keys = true;

CREATE TABLE leads_new (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  dedupe_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('received', 'parsed', 'spam_filtered', 'queued', 'analyzing', 'analyzed', 'analysis_failed', 'over_quota', 'parse_failed')),
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'meeting', 'won', 'lost', 'spam', 'pitch')),
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  raw TEXT,
  auth_results TEXT,
  analysis TEXT,
  score INTEGER,
  category TEXT,
  draft TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  counts_to_quota INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  analyzed_at TEXT,
  replied_at TEXT,
  UNIQUE (brand_id, dedupe_key)
);

INSERT INTO leads_new SELECT * FROM leads;

-- Dropping leads cascades into its child tables even with deferred foreign keys, so their rows are kept aside first.
CREATE TABLE lead_events_keep AS SELECT * FROM lead_events;
CREATE TABLE feedback_keep AS SELECT * FROM feedback;
CREATE TABLE alert_deliveries_keep AS SELECT * FROM alert_deliveries;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;
CREATE INDEX leads_brand_received ON leads(brand_id, received_at DESC);
CREATE INDEX leads_due ON leads(status, next_attempt_at);
CREATE INDEX leads_raw_received ON leads(received_at) WHERE raw IS NOT NULL;

INSERT INTO lead_events SELECT * FROM lead_events_keep;
INSERT INTO feedback SELECT * FROM feedback_keep;
INSERT INTO alert_deliveries SELECT * FROM alert_deliveries_keep;
DROP TABLE lead_events_keep;
DROP TABLE feedback_keep;
DROP TABLE alert_deliveries_keep;
