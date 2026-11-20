-- Better Auth tables (renamed + snake_case through the auth config)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE magic_links (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX magic_links_identifier ON magic_links(identifier);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  provider_account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  scope TEXT,
  password TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Tenancy
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'solo' CHECK (plan IN ('solo', 'agency')),
  created_at TEXT NOT NULL
);

CREATE TABLE subscriptions (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('no_subscription', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired')),
  paddle_subscription_id TEXT,
  current_period_end TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE seats (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
  created_at TEXT NOT NULL,
  UNIQUE (account_id, email)
);
CREATE INDEX seats_user ON seats(user_id);

CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  profile TEXT,
  alert_threshold INTEGER NOT NULL DEFAULT 70,
  created_at TEXT NOT NULL
);
CREATE INDEX brands_account ON brands(account_id);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'webhook')),
  name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('not_connected', 'awaiting_first_message', 'verification_pending', 'connected', 'error', 'disabled')),
  address TEXT UNIQUE,
  token TEXT UNIQUE,
  last_error TEXT,
  verification_link TEXT,
  verification_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sources_brand ON sources(brand_id);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  dedupe_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('received', 'parsed', 'spam_filtered', 'queued', 'analyzing', 'analyzed', 'analysis_failed', 'over_quota', 'parse_failed')),
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'meeting', 'won', 'lost', 'spam')),
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
CREATE INDEX leads_brand_received ON leads(brand_id, received_at DESC);
CREATE INDEX leads_due ON leads(status, next_attempt_at);

CREATE TABLE lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('status', 'stage', 'draft', 'replied', 'feedback')),
  from_value TEXT,
  to_value TEXT,
  at TEXT NOT NULL
);
CREATE INDEX lead_events_lead ON lead_events(lead_id);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('not_spam', 'wrong_score')),
  expected_score INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX feedback_brand ON feedback(brand_id, created_at DESC);

-- Dev-only outbox for LogMailer (magic links in local runs and tests)
CREATE TABLE dev_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
