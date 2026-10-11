-- SQL-side maintenance, identical for Workers Cron and the Actions fallback.
-- Separate statements deliberately invalidate before inserting snapshots.
DELETE FROM transfers WHERE expires_at <= unixepoch();
DELETE FROM reports WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-365 days');
DELETE FROM events WHERE day < date('now','-90 days');
DELETE FROM quotas WHERE expires_at <= unixepoch();
DELETE FROM aggregates WHERE period < strftime('%Y-%m','now','-365 days');
-- Freeze a closed monthly cohort after a seven-day grace period. Late submissions
-- are retained for the stated retention period but cannot change a published cell.
INSERT OR IGNORE INTO aggregates(insurer,request_type,period,n,total_minutes,beyond_window,updated_at)
SELECT r.insurer, r.request_type, substr(r.submitted_at,1,7), count(*),
  CAST(round(sum((julianday(r.decided_at)-julianday(r.submitted_at))*1440)) AS INTEGER),
  CASE WHEN r.request_type='enhancement' THEN NULL ELSE
    sum(CASE WHEN (julianday(r.decided_at)-julianday(r.submitted_at))*1440 >
      CASE WHEN r.request_type='preauth' THEN 60 ELSE 180 END + 0.00001 THEN 1 ELSE 0 END) END,
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM reports r
WHERE datetime(r.submitted_at,'start of month','+1 month','+7 days') <= datetime('now')
  AND datetime(r.created_at) < datetime(r.submitted_at,'start of month','+1 month','+7 days')
  AND NOT EXISTS (SELECT 1 FROM aggregate_suppressions s WHERE s.insurer=r.insurer
    AND s.request_type=r.request_type AND s.period=substr(r.submitted_at,1,7))
GROUP BY r.insurer,r.request_type,substr(r.submitted_at,1,7)
HAVING count(*) >= 10;
