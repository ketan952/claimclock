-- D1 applies each migration transactionally. Rebuild only reports to remove the
-- city's NOT NULL constraint; preserve every value, index and erasure behavior.
-- Dropping the old erasure trigger before the table prevents migration from
-- being confused with consent withdrawal. Aggregates/suppressions are untouched.
CREATE TABLE reports_optional_city (
  id TEXT PRIMARY KEY NOT NULL,
  erase_hash TEXT NOT NULL,
  insurer TEXT NOT NULL,
  tpa TEXT,
  city TEXT,
  request_type TEXT NOT NULL CHECK (request_type IN ('preauth','enhancement','discharge')),
  submitted_at TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','partial','rejected','paid-and-left')),
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO reports_optional_city SELECT id,erase_hash,insurer,tpa,city,request_type,submitted_at,decided_at,outcome,consent_version,created_at FROM reports;
DROP TRIGGER reports_erase_aggregate;
DROP TABLE reports;
ALTER TABLE reports_optional_city RENAME TO reports;
CREATE INDEX reports_cohort ON reports(insurer,request_type,submitted_at);
CREATE INDEX reports_created ON reports(created_at);
CREATE TRIGGER reports_erase_aggregate BEFORE DELETE ON reports
BEGIN
  INSERT OR IGNORE INTO aggregate_suppressions(insurer,request_type,period)
    VALUES(OLD.insurer,OLD.request_type,substr(OLD.submitted_at,1,7));
  DELETE FROM aggregates WHERE insurer=OLD.insurer AND request_type=OLD.request_type
    AND period=substr(OLD.submitted_at,1,7);
END;
