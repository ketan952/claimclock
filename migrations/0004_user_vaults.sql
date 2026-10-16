-- Passkey accounts and client-encrypted vaults (M20).
-- The server stores no name, policy number, medical detail or vault key. A vault is an
-- opaque AES-GCM envelope encrypted in the browser; wrapped_key is that vault key wrapped
-- by a key the authenticator derives (WebAuthn PRF) and is equally opaque here.
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  created_at TEXT NOT NULL
);
CREATE TABLE passkey_credentials (
  credential_id TEXT PRIMARY KEY NOT NULL CHECK(length(credential_id) BETWEEN 16 AND 1366),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL CHECK(length(public_key) BETWEEN 40 AND 2048),
  algorithm INTEGER NOT NULL CHECK(algorithm IN (-7,-257)),
  sign_count INTEGER NOT NULL DEFAULT 0 CHECK(sign_count>=0),
  transports TEXT CHECK(transports IS NULL OR length(transports)<=200),
  wrapped_key TEXT CHECK(wrapped_key IS NULL OR length(wrapped_key) BETWEEN 40 AND 400),
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX passkey_credentials_user ON passkey_credentials(user_id);
-- Single-use, five-minute challenges. Only a hash is kept; the row is deleted on use.
CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  challenge_hash TEXT NOT NULL CHECK(length(challenge_hash)=64),
  kind TEXT NOT NULL CHECK(kind IN ('register','login')),
  user_id TEXT CHECK(user_id IS NULL OR length(user_id)=36),
  expires_at INTEGER NOT NULL
);
CREATE INDEX webauthn_challenges_expiry ON webauthn_challenges(expires_at);
-- Sessions store only the SHA-256 of the cookie token, like report erasure tokens.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
-- One envelope per account, up to 256 KiB of ciphertext, with an optimistic version.
CREATE TABLE vaults (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version>=1),
  ciphertext TEXT NOT NULL CHECK(length(ciphertext) BETWEEN 40 AND 349528),
  updated_at TEXT NOT NULL
);
