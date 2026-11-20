-- Free plan + no-card Solo trial. accounts.plan keeps the paid plan (solo/agency) and Free is derived from the
-- subscription status, so the plan CHECK doesn't need a table rebuild. A set trial_ends_at marks the one trial as used.
ALTER TABLE subscriptions ADD COLUMN trial_ends_at TEXT;
