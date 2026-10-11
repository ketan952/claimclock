-- Seven-day opaque, client-encrypted envelopes. No key, identity or raw code.
CREATE TABLE transfers (
  code_hash TEXT PRIMARY KEY NOT NULL CHECK(length(code_hash)=64),
  ciphertext TEXT NOT NULL CHECK(length(ciphertext) BETWEEN 40 AND 87382),
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3)
);
CREATE INDEX transfers_expiry ON transfers(expires_at);
-- UPDATE...RETURNING reads the third payload while this same atomic statement
-- removes the stored copy. A crashed Worker cannot leave a fourth readable copy.
CREATE TRIGGER transfers_final_lookup AFTER UPDATE OF attempts ON transfers
WHEN NEW.attempts >= 3
BEGIN
  DELETE FROM transfers WHERE code_hash=NEW.code_hash;
END;
