// Passkey accounts and client-encrypted vault sync (M20).
// The Worker stores: a random account id, passkey public keys, SHA-256 hashes of session
// tokens and challenges, and one opaque ciphertext envelope per account. It never
// receives a vault key, a name, a policy number or a decrypted field.
import type { Database } from './types.ts';
import { InputError, exactKeys, record, sha256, eraseToken } from './security.ts';
import { CHALLENGE_TTL_SECONDS, randomBase64url, toBase64url, verifyAssertion, verifyRegistration, type Algorithm } from './webauthn.ts';

export const SESSION_COOKIE = 'cc_session';
export const SESSION_TTL_SECONDS = 30 * 86400;
export const VAULT_ENVELOPE_LIMIT = 256 * 1024;
export const VAULT_BODY_LIMIT = Math.ceil(VAULT_ENVELOPE_LIMIT * 4 / 3) + 4096;
export const VAULT_ENVELOPE_VERSION = 1;
const RP_NAME = 'ClaimClock';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Session = { userId: string; credentialId: string };

// --- Cookies. The token itself is random; only its hash is stored. ---
export function readSessionToken(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header || header.length > 4096) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) { const value = rest.join('='); return /^[0-9a-f]{64}$/.test(value) ? value : null; }
  }
  return null;
}
export function sessionCookie(token: string | null): string {
  return token
    ? `${SESSION_COOKIE}=${token}; Path=/api; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`
    : `${SESSION_COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
export async function authenticate(db: Database, request: Request, now = Date.now()): Promise<Session | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const row = await db.prepare('SELECT user_id,credential_id FROM sessions WHERE token_hash=? AND expires_at>?').bind(await sha256(token), Math.floor(now / 1000)).first<{ user_id: string; credential_id: string }>();
  return row ? { userId: row.user_id, credentialId: row.credential_id } : null;
}
async function createSession(db: Database, userId: string, credentialId: string, now: number): Promise<string> {
  const token = eraseToken();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,credential_id,created_at,expires_at) VALUES(?,?,?,?,?)')
    .bind(await sha256(token), userId, credentialId, new Date(now).toISOString(), Math.floor(now / 1000) + SESSION_TTL_SECONDS).run();
  return token;
}
export async function logout(db: Database, request: Request): Promise<void> {
  const token = readSessionToken(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
}

// --- Challenges: single use, five minutes, hash only. ---
async function createChallenge(db: Database, kind: 'register' | 'login', userId: string | null, now: number) {
  const id = crypto.randomUUID(), challenge = randomBase64url(32);
  await db.prepare('INSERT INTO webauthn_challenges(id,challenge_hash,kind,user_id,expires_at) VALUES(?,?,?,?,?)')
    .bind(id, await sha256(challenge), kind, userId, Math.floor(now / 1000) + CHALLENGE_TTL_SECONDS).run();
  return { id, challenge };
}
/** Deletes the challenge row while reading it: a replayed challenge finds nothing. */
async function consumeChallenge(db: Database, id: unknown, kind: 'register' | 'login', now: number): Promise<{ challengeHash: string; userId: string | null }> {
  if (typeof id !== 'string' || !UUID.test(id)) throw new InputError();
  const row = await db.prepare('DELETE FROM webauthn_challenges WHERE id=? AND kind=? AND expires_at>? RETURNING challenge_hash,user_id').bind(id, kind, Math.floor(now / 1000)).first<{ challenge_hash: string; user_id: string | null }>();
  if (!row) throw new InputError();
  return { challengeHash: row.challenge_hash, userId: row.user_id };
}
function userHandle(userId: string): string { return toBase64url(new TextEncoder().encode(userId)); }

// --- Registration. ---
export async function registrationOptions(db: Database, rpId: string, now = Date.now()) {
  const userId = crypto.randomUUID();
  const { id, challenge } = await createChallenge(db, 'register', userId, now);
  return {
    challenge_id: id,
    publicKey: {
      challenge, rp: { id: rpId, name: RP_NAME },
      // The handle is the random account id; no name or email is ever sent to an authenticator.
      user: { id: userHandle(userId), name: 'ClaimClock account', displayName: 'ClaimClock account' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      timeout: 120000, attestation: 'none',
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      extensions: { credProps: true, prf: {} },
    },
  };
}
function optionalWrappedKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length < 40 || value.length > 400 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new InputError();
  return value;
}
export async function completeRegistration(db: Database, body: Record<string, unknown>, origin: string, rpId: string, now = Date.now()) {
  if (!exactKeys(body, ['challenge_id', 'id', 'response', 'wrapped_key']) || !record(body.response) || !exactKeys(body.response, ['clientDataJSON', 'attestationObject', 'transports'])) throw new InputError();
  const wrappedKey = optionalWrappedKey(body.wrapped_key);
  const { challengeHash, userId } = await consumeChallenge(db, body.challenge_id, 'register', now);
  if (!userId) throw new InputError();
  const challenge = challengeFromClientData(body.response.clientDataJSON);
  if (await sha256(challenge) !== challengeHash) throw new InputError();
  const response = body.response as Record<string, unknown>;
  const credential = await verifyRegistration({ clientDataJSON: response.clientDataJSON, attestationObject: response.attestationObject, transports: response.transports }, { challenge, origin, rpId });
  if (body.id !== credential.credentialId) throw new InputError();
  const createdAt = new Date(now).toISOString();
  const existing = await db.prepare('SELECT credential_id FROM passkey_credentials WHERE credential_id=?').bind(credential.credentialId).first();
  if (existing) throw new InputError();
  await db.batch([
    db.prepare('INSERT INTO users(id,created_at) VALUES(?,?)').bind(userId, createdAt),
    db.prepare('INSERT INTO passkey_credentials(credential_id,user_id,public_key,algorithm,sign_count,transports,wrapped_key,created_at,last_used_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(credential.credentialId, userId, credential.publicKey, credential.algorithm, credential.signCount, credential.transports, wrappedKey, createdAt, createdAt),
  ]);
  const token = await createSession(db, userId, credential.credentialId, now);
  return { token, userId, credentialId: credential.credentialId, backupEligible: credential.backupEligible };
}
/** The challenge echoed inside clientDataJSON selects the stored hash to compare against. */
function challengeFromClientData(clientDataJSON: unknown): string {
  if (typeof clientDataJSON !== 'string' || clientDataJSON.length > 5500 || !/^[A-Za-z0-9_-]+$/.test(clientDataJSON)) throw new InputError();
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(clientDataJSON.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))); } catch { throw new InputError(); }
  if (!record(parsed) || typeof parsed.challenge !== 'string' || parsed.challenge.length !== 43 || !/^[A-Za-z0-9_-]+$/.test(parsed.challenge)) throw new InputError();
  return parsed.challenge;
}

// --- Login (discoverable credential: the authenticator supplies the account handle). ---
export async function loginOptions(db: Database, rpId: string, now = Date.now()) {
  const { id, challenge } = await createChallenge(db, 'login', null, now);
  return { challenge_id: id, publicKey: { challenge, rpId, timeout: 120000, userVerification: 'required', allowCredentials: [] } };
}
type CredentialRow = { credential_id: string; user_id: string; public_key: string; algorithm: Algorithm; sign_count: number; wrapped_key: string | null };
export async function completeLogin(db: Database, body: Record<string, unknown>, origin: string, rpId: string, now = Date.now()) {
  if (!exactKeys(body, ['challenge_id', 'id', 'response']) || !record(body.response) || !exactKeys(body.response, ['clientDataJSON', 'authenticatorData', 'signature', 'userHandle'])) throw new InputError();
  if (typeof body.id !== 'string' || body.id.length < 16 || body.id.length > 1366 || !/^[A-Za-z0-9_-]+$/.test(body.id)) throw new InputError();
  const { challengeHash } = await consumeChallenge(db, body.challenge_id, 'login', now);
  const challenge = challengeFromClientData(body.response.clientDataJSON);
  if (await sha256(challenge) !== challengeHash) throw new InputError();
  const row = await db.prepare('SELECT credential_id,user_id,public_key,algorithm,sign_count,wrapped_key FROM passkey_credentials WHERE credential_id=?').bind(body.id).first<CredentialRow>();
  if (!row) throw new InputError();
  const handle = body.response.userHandle;
  if (handle !== null && handle !== undefined && handle !== userHandle(row.user_id)) throw new InputError();
  const response = body.response as Record<string, unknown>;
  const { signCount } = await verifyAssertion({ clientDataJSON: response.clientDataJSON, authenticatorData: response.authenticatorData, signature: response.signature }, { publicKey: row.public_key, algorithm: row.algorithm, signCount: row.sign_count }, { challenge, origin, rpId });
  await db.prepare('UPDATE passkey_credentials SET sign_count=?,last_used_at=? WHERE credential_id=?').bind(signCount, new Date(now).toISOString(), row.credential_id).run();
  const token = await createSession(db, row.user_id, row.credential_id, now);
  const vault = await readVault(db, row.user_id);
  return { token, userId: row.user_id, credentialId: row.credential_id, wrappedKey: row.wrapped_key, vaultVersion: vault?.version ?? 0 };
}

// --- Account state. ---
export async function sessionSummary(db: Database, session: Session) {
  const [credentials, vault] = await Promise.all([
    db.prepare('SELECT credential_id,created_at,last_used_at,wrapped_key IS NOT NULL AS has_wrapped_key FROM passkey_credentials WHERE user_id=? ORDER BY created_at').bind(session.userId).all<{ credential_id: string; created_at: string; last_used_at: string | null; has_wrapped_key: number }>(),
    readVault(db, session.userId),
  ]);
  return {
    authenticated: true, user_id: session.userId, credential_id: session.credentialId,
    credentials: credentials.results.map(c => ({ id: c.credential_id, created_at: c.created_at, last_used_at: c.last_used_at, has_wrapped_key: c.has_wrapped_key === 1 })),
    vault_version: vault?.version ?? 0, vault_updated_at: vault?.updated_at ?? null,
  };
}
export async function setWrappedKey(db: Database, session: Session, body: Record<string, unknown>): Promise<boolean> {
  if (!exactKeys(body, ['wrapped_key'])) throw new InputError();
  const wrappedKey = optionalWrappedKey(body.wrapped_key);
  if (!wrappedKey) throw new InputError();
  const row = await db.prepare('UPDATE passkey_credentials SET wrapped_key=? WHERE credential_id=? AND user_id=? RETURNING credential_id').bind(wrappedKey, session.credentialId, session.userId).first();
  return row !== null;
}
export async function eraseAccount(db: Database, userId: string): Promise<void> {
  // Explicit deletes make erasure independent of foreign-key enforcement settings.
  await db.batch([
    db.prepare('DELETE FROM vaults WHERE user_id=?').bind(userId),
    db.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId),
    db.prepare('DELETE FROM passkey_credentials WHERE user_id=?').bind(userId),
    db.prepare('DELETE FROM webauthn_challenges WHERE user_id=?').bind(userId),
    db.prepare('DELETE FROM users WHERE id=?').bind(userId),
  ]);
}

// --- Vault envelopes. ---
export function validateVaultEnvelope(value: unknown): string {
  if (typeof value !== 'string' || value.length < 40 || value.length > Math.ceil(VAULT_ENVELOPE_LIMIT * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new InputError();
  let binary: string;
  try { binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')); } catch { throw new InputError(); }
  // Version byte, 12-byte IV, ciphertext and 16-byte tag. The server cannot read or verify it.
  if (binary.length < 30 || binary.length > VAULT_ENVELOPE_LIMIT || binary.charCodeAt(0) !== VAULT_ENVELOPE_VERSION || btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== value) throw new InputError();
  return value;
}
export async function readVault(db: Database, userId: string) {
  return db.prepare('SELECT version,ciphertext,updated_at FROM vaults WHERE user_id=?').bind(userId).first<{ version: number; ciphertext: string; updated_at: string }>();
}
/** Optimistic concurrency: the caller states the version it last saw; 0 means "no vault yet". */
export async function writeVault(db: Database, userId: string, body: Record<string, unknown>, now = Date.now()): Promise<{ version: number; updated_at: string } | 'conflict'> {
  if (!exactKeys(body, ['ciphertext', 'version']) || !Number.isInteger(body.version) || Number(body.version) < 0 || Number(body.version) > 1e9) throw new InputError();
  const ciphertext = validateVaultEnvelope(body.ciphertext), expected = Number(body.version), updatedAt = new Date(now).toISOString();
  const row = expected === 0
    ? await db.prepare('INSERT INTO vaults(user_id,version,ciphertext,updated_at) VALUES(?,1,?,?) ON CONFLICT(user_id) DO NOTHING RETURNING version').bind(userId, ciphertext, updatedAt).first<{ version: number }>()
    : await db.prepare('UPDATE vaults SET version=version+1,ciphertext=?,updated_at=? WHERE user_id=? AND version=? RETURNING version').bind(ciphertext, updatedAt, userId, expected).first<{ version: number }>();
  return row ? { version: row.version, updated_at: updatedAt } : 'conflict';
}
export async function purgeAuth(db: Database, now = Date.now()): Promise<void> {
  const seconds = Math.floor(now / 1000);
  await db.batch([
    db.prepare('DELETE FROM webauthn_challenges WHERE expires_at<=?').bind(seconds),
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(seconds),
  ]);
}
