CREATE TABLE IF NOT EXISTS simulations (
  id TEXT PRIMARY KEY,
  digest TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  prepared_at INTEGER
);
CREATE INDEX IF NOT EXISTS simulations_expiry ON simulations(expires_at);
