CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY NOT NULL,
  erase_hash TEXT NOT NULL,
  insurer TEXT NOT NULL,
  tpa TEXT,
  city TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('preauth','enhancement','discharge')),
  submitted_at TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','partial','rejected','paid-and-left')),
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_cohort ON reports(insurer,request_type,submitted_at);
CREATE INDEX IF NOT EXISTS reports_created ON reports(created_at);
CREATE TABLE IF NOT EXISTS aggregates (
  insurer TEXT NOT NULL,
  request_type TEXT NOT NULL,
  period TEXT NOT NULL,
  n INTEGER NOT NULL CHECK(n >= 10),
  total_minutes INTEGER NOT NULL,
  beyond_window INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(insurer,request_type,period)
);
CREATE TABLE IF NOT EXISTS aggregate_suppressions (
  insurer TEXT NOT NULL,
  request_type TEXT NOT NULL,
  period TEXT NOT NULL,
  PRIMARY KEY(insurer,request_type,period)
);
CREATE TABLE IF NOT EXISTS events (
  day TEXT NOT NULL,
  name TEXT NOT NULL CHECK(name IN ('session_started','clock_lock_copied','escalation_copied','delay_charge_generated','opt_in_submitted')),
  n INTEGER NOT NULL,
  PRIMARY KEY(day,name)
);
CREATE TABLE IF NOT EXISTS quotas (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS quotas_expiry ON quotas(expires_at);
-- Invalidation belongs to the same database transaction as erasure, including
-- deletion by maintenance scripts. Never expose an aggregate containing an erased row.
CREATE TRIGGER IF NOT EXISTS reports_erase_aggregate BEFORE DELETE ON reports
BEGIN
  INSERT OR IGNORE INTO aggregate_suppressions(insurer,request_type,period)
    VALUES(OLD.insurer,OLD.request_type,substr(OLD.submitted_at,1,7));
  DELETE FROM aggregates WHERE insurer=OLD.insurer AND request_type=OLD.request_type
    AND period=substr(OLD.submitted_at,1,7);
END;
