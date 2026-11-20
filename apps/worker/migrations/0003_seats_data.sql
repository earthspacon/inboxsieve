-- S6: workspace deletion and the 90-day raw-body purge
ALTER TABLE accounts ADD COLUMN deletion_requested_at TEXT;
CREATE INDEX leads_raw_received ON leads(received_at) WHERE raw IS NOT NULL;
CREATE INDEX seats_email ON seats(email, status);
