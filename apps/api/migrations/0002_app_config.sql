-- Small key/value store for deployment settings the Worker manages itself.
-- On preview deployments without a GT_SECRET, the Worker generates one here
-- on first start (never on production, which must have GT_SECRET set).
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
