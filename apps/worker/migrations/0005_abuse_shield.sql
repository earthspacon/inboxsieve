-- Abuse shield. Rate-limit hits for windows longer than the Workers binding allows (it only does 10 s / 60 s);
-- keys are SHA-256 hashes, never raw emails or IPs.
CREATE TABLE rate_limit_hits (
  key TEXT NOT NULL,
  hit_at TEXT NOT NULL
);
CREATE INDEX rate_limit_hits_key_at ON rate_limit_hits (key, hit_at);

-- LLM spend per UTC day and account, in USD. The daily caps read it before every analysis.
CREATE TABLE llm_spend (
  day TEXT NOT NULL,
  account_id TEXT NOT NULL,
  usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, account_id)
);

-- One owner email per UTC day when the global LLM cap is reached.
CREATE TABLE llm_cap_alerts (
  day TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);
