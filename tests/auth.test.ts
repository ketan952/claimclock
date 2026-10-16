import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { app } from '../worker/app.ts';
import { SITEVERIFY_URL } from '../worker/turnstile.ts';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, VAULT_ENVELOPE_LIMIT, completeLogin, completeRegistration, loginOptions, purgeAuth, readSessionToken, registrationOptions, validateVaultEnvelope, writeVault } from '../worker/auth.ts';
import { decodeCbor, derToRaw, fromBase64url, parseAuthenticatorData, toBase64url, verifyAssertion } from '../worker/webauthn.ts';
import { quota } from '../worker/security.ts';
import type { Database, Statement, Bindings } from '../worker/types.ts';

const migrations = ['0001_initial', '0002_optional_report_city', '0003_encrypted_transfers', '0004_user_vaults'].map(name => readFileSync(new NodeURL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
class SqliteDB implements Database {
  sql = new DatabaseSync(':memory:');
  constructor() { for (const migration of migrations) this.sql.exec(migration); }
  prepare(sql: string): Statement {
    const database = this.sql; let values: (string | number | null)[] = [];
    const statement: Statement = {
      bind(...args) { values = args; return statement; },
      async first<T>() { return (database.prepare(sql).get(...values) ?? null) as T | null; },
      async all<T>() { return { results: database.prepare(sql).all(...values) as T[], success: true }; },
      async run() { const result = database.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  }
  async batch(statements: Statement[]) {
    this.sql.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sql.exec('COMMIT'); return results; }
    catch (e) { this.sql.exec('ROLLBACK'); throw e; }
  }
  count(table: string): number { return Number((this.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n); }
}
const origin = 'https://claimclock.example', rpId = 'claimclock.example';
const challengeEnv = { TURNSTILE_SECRET_KEY: 'synthetic-secret', TURNSTILE_SITE_KEY: 'synthetic-public-key', TURNSTILE_HOSTNAME: rpId };

// --- Minimal CBOR encoder and a synthetic authenticator, used only by tests. ---
function cbor(value: unknown): Uint8Array {
  const head = (major: number, argument: number): number[] => argument < 24 ? [(major << 5) | argument] : argument < 256 ? [(major << 5) | 24, argument] : argument < 65536 ? [(major << 5) | 25, argument >> 8, argument & 255] : [(major << 5) | 26, (argument >>> 24) & 255, (argument >>> 16) & 255, (argument >>> 8) & 255, argument & 255];
  const parts: number[] = [];
  const push = (bytes: ArrayLike<number>) => { for (let i = 0; i < bytes.length; i++) parts.push(bytes[i]); };
  if (typeof value === 'number') push(value >= 0 ? head(0, value) : head(1, -1 - value));
  else if (value instanceof Uint8Array) { push(head(2, value.length)); push(value); }
  else if (typeof value === 'string') { const bytes = new TextEncoder().encode(value); push(head(3, bytes.length)); push(bytes); }
  else if (Array.isArray(value)) { push(head(4, value.length)); for (const item of value) push(cbor(item)); }
  else if (value instanceof Map) { push(head(5, value.size)); for (const [k, v] of value) { push(cbor(k)); push(cbor(v)); } }
  else throw new Error('unsupported');
  return Uint8Array.from(parts);
}
const utf8 = (text: string) => new TextEncoder().encode(text);
const sha = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
function rawToDer(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => { let start = 0; while (start < bytes.length - 1 && bytes[start] === 0) start++; let body = Array.from(bytes.slice(start)); if (body[0] & 0x80) body = [0, ...body]; return [0x02, body.length, ...body]; };
  const content = [...integer(raw.slice(0, 32)), ...integer(raw.slice(32))];
  return Uint8Array.from([0x30, content.length, ...content]);
}
type Authenticator = { id: Uint8Array; coseKey: Uint8Array; algorithm: -7 | -257; sign: (data: Uint8Array) => Promise<Uint8Array>; signCount: number };
async function makeAuthenticator(algorithm: -7 | -257 = -7): Promise<Authenticator> {
  const id = crypto.getRandomValues(new Uint8Array(32));
  if (algorithm === -7) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey & { x: string; y: string; n: string; e: string };
    const coseKey = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, fromBase64url(jwk.x, 32)], [-3, fromBase64url(jwk.y, 32)]]));
    return { id, coseKey, algorithm, signCount: 0, sign: async data => rawToDer(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, data))) };
  }
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey & { x: string; y: string; n: string; e: string };
  const coseKey = cbor(new Map<number, unknown>([[1, 3], [3, -257], [-1, fromBase64url(jwk.n, 512)], [-2, fromBase64url(jwk.e, 8)]]));
  return { id, coseKey, algorithm, signCount: 0, sign: async data => new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, pair.privateKey, data)) };
}
async function authData(auth: Authenticator | null, flags: number, signCount: number, rp = rpId): Promise<Uint8Array> {
  const header = new Uint8Array(37); header.set(await sha(utf8(rp))); header[32] = flags; new DataView(header.buffer).setUint32(33, signCount);
  if (!auth) return header;
  const attested = new Uint8Array(16 + 2 + auth.id.length + auth.coseKey.length);
  attested[16] = auth.id.length >> 8; attested[17] = auth.id.length & 255; attested.set(auth.id, 18); attested.set(auth.coseKey, 18 + auth.id.length);
  const out = new Uint8Array(header.length + attested.length); out.set(header); out.set(attested, header.length); return out;
}
const clientData = (type: string, challenge: string, requestOrigin = origin) => toBase64url(utf8(JSON.stringify({ type, challenge, origin: requestOrigin, crossOrigin: false })));
async function registrationResponse(auth: Authenticator, challenge: string, options: { flags?: number; origin?: string; rp?: string; fmt?: string } = {}) {
  const attestation = cbor(new Map<string, unknown>([['fmt', options.fmt ?? 'none'], ['attStmt', new Map()], ['authData', await authData(auth, options.flags ?? 0x45, 0, options.rp)]]));
  return { id: toBase64url(auth.id), response: { clientDataJSON: clientData('webauthn.create', challenge, options.origin), attestationObject: toBase64url(attestation), transports: ['internal', 'hybrid'] } };
}
async function assertionResponse(auth: Authenticator, challenge: string, userHandle: string | null, options: { signCount?: number; flags?: number; origin?: string; rp?: string; tamper?: boolean } = {}) {
  const data = await authData(null, options.flags ?? 0x05, options.signCount ?? ++auth.signCount, options.rp);
  const client = clientData('webauthn.get', challenge, options.origin);
  const signed = new Uint8Array(data.length + 32); signed.set(data); signed.set(await sha(fromBase64url(client, 4096)), data.length);
  const signature = await auth.sign(signed);
  if (options.tamper) signature[signature.length - 1] ^= 1;
  return { id: toBase64url(auth.id), response: { clientDataJSON: client, authenticatorData: toBase64url(data), signature: toBase64url(signature), userHandle } };
}
async function request(path: string, method: string, body?: unknown, env: Bindings = {}, headers: Record<string, string> = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => url === SITEVERIFY_URL ? Response.json({ success: true, hostname: rpId, action: 'auth_register' }) : originalFetch(url, options);
  try {
    return await app.request(`${origin}${path}`, { method, headers: { origin, 'content-type': 'application/json', 'X-Turnstile-Token': 'synthetic-token', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { ...(env.DB ? challengeEnv : {}), ...env });
  } finally { globalThis.fetch = originalFetch; }
}
const cookieOf = (response: Response) => { const header = response.headers.get('set-cookie') ?? ''; const match = header.match(/cc_session=([0-9a-f]*)/); return match ? match[1] : null; };
async function registerAccount(db: SqliteDB, auth: Authenticator, wrappedKey?: string) {
  const options = await (await request('/api/auth/register/options', 'POST', {}, { DB: db })).json() as { challenge_id: string; publicKey: { challenge: string } };
  const response = await registrationResponse(auth, options.publicKey.challenge);
  const verified = await request('/api/auth/register/verify', 'POST', { challenge_id: options.challenge_id, ...response, ...(wrappedKey ? { wrapped_key: wrappedKey } : {}) }, { DB: db });
  assert.equal(verified.status, 201);
  const cookie = cookieOf(verified)!; assert.match(cookie, /^[0-9a-f]{64}$/);
  return { cookie, body: await verified.json() as { user_id: string; credential_id: string } };
}
const envelope = (length = 64, version = 1) => { const bytes = new Uint8Array(length); bytes[0] = version; return toBase64url(bytes); };

test('registration options bind a random account handle and require resident, user-verified passkeys behind Turnstile', async () => {
  const db = new SqliteDB();
  const unverified = await app.request(`${origin}/api/auth/register/options`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' }, { DB: db, ...challengeEnv });
  assert.equal(unverified.status, 403);
  assert.equal((await request('/api/auth/register/options', 'POST', { extra: 1 }, { DB: db })).status, 400);
  assert.equal((await request('/api/auth/register/options', 'POST', {}, {})).status, 503);
  const response = await request('/api/auth/register/options', 'POST', {}, { DB: db });
  assert.equal(response.status, 200);
  const options = await response.json() as Record<string, any>;
  assert.match(options.challenge_id, /^[0-9a-f-]{36}$/);
  assert.equal(options.publicKey.rp.id, rpId); assert.equal(options.publicKey.attestation, 'none');
  assert.deepEqual(options.publicKey.authenticatorSelection, { residentKey: 'required', requireResidentKey: true, userVerification: 'required' });
  assert.equal(options.publicKey.challenge.length, 43);
  assert.doesNotMatch(JSON.stringify(options), /@|name":"[A-Z][a-z]+ /);
  const row = db.sql.prepare('SELECT * FROM webauthn_challenges').get() as Record<string, unknown>;
  assert.notEqual(row.challenge_hash, options.publicKey.challenge); assert.equal(row.kind, 'register');
  assert.equal(db.count('users'), 0);
});
test('registration verifies the challenge, origin, rp id and flags, stores only the public key and sets a hashed session cookie', async () => {
  const db = new SqliteDB(), auth = await makeAuthenticator();
  // Direct calls keep these negative cases outside the five-per-minute registration quota.
  const bad = async (patch: (challenge: string) => Promise<Record<string, unknown>>) => {
    const options = await registrationOptions(db, rpId);
    const body = { challenge_id: options.challenge_id, ...await patch(options.publicKey.challenge) };
    await assert.rejects(() => completeRegistration(db, body, origin, rpId), (error: Error) => error.name === 'Error' && error.message === 'Invalid request.');
  };
  const options = await (await request('/api/auth/register/options', 'POST', {}, { DB: db })).json() as { challenge_id: string; publicKey: { challenge: string } };
  const foreign = await request('/api/auth/register/verify', 'POST', { challenge_id: options.challenge_id, ...await registrationResponse(auth, options.publicKey.challenge, { origin: 'https://evil.example' }) }, { DB: db });
  assert.equal(foreign.status, 400); assert.deepEqual(await foreign.json(), { error: 'Invalid request.' });
  await bad(async challenge => registrationResponse(auth, challenge, { rp: 'evil.example' }));
  await bad(async () => registrationResponse(auth, toBase64url(new Uint8Array(32))));
  await bad(async challenge => registrationResponse(auth, challenge, { flags: 0x41 })); // no user verification
  await bad(async challenge => registrationResponse(auth, challenge, { flags: 0x05 })); // no attested credential
  await bad(async challenge => ({ ...await registrationResponse(auth, challenge), id: toBase64url(new Uint8Array(32)) }));
  await bad(async challenge => ({ ...await registrationResponse(auth, challenge), wrapped_key: 'too-short' }));
  assert.equal(db.count('users'), 0); assert.equal(db.count('passkey_credentials'), 0); assert.equal(db.count('sessions'), 0);
  const { cookie, body } = await registerAccount(db, auth, envelope(60));
  assert.match(body.user_id, /^[0-9a-f-]{36}$/); assert.equal(body.credential_id, toBase64url(auth.id));
  const credential = db.sql.prepare('SELECT * FROM passkey_credentials').get() as Record<string, unknown>;
  assert.deepEqual(Object.keys(credential).sort(), ['algorithm', 'created_at', 'credential_id', 'last_used_at', 'public_key', 'sign_count', 'transports', 'user_id', 'wrapped_key']);
  assert.equal(credential.public_key, toBase64url(auth.coseKey)); assert.equal(credential.algorithm, -7); assert.equal(credential.wrapped_key, envelope(60));
  const session = db.sql.prepare('SELECT * FROM sessions').get() as Record<string, unknown>;
  assert.notEqual(session.token_hash, cookie); assert.equal(session.user_id, body.user_id);
  // Every attempt that reached the authenticator check consumed its challenge; only the body
  // rejected before any lookup (the short wrapped key) left its unused row for the hourly purge.
  assert.equal(db.count('webauthn_challenges'), 1, 'challenge rows are consumed on use');
  const header = (await request('/api/auth/register/verify', 'POST', {}, { DB: db })).headers.get('set-cookie');
  assert.equal(header, null);
  const summary = await (await request('/api/auth/session', 'GET', undefined, { DB: db }, { cookie: `${SESSION_COOKIE}=${cookie}` })).json() as Record<string, any>;
  assert.equal(summary.authenticated, true); assert.equal(summary.vault_version, 0); assert.equal(summary.credentials.length, 1); assert.equal(summary.credentials[0].has_wrapped_key, true);
});
test('a registration challenge cannot be replayed and expired challenges are rejected', async () => {
  const db = new SqliteDB(), auth = await makeAuthenticator();
  const options = await registrationOptions(db, rpId);
  const response = await registrationResponse(auth, options.publicKey.challenge);
  await assert.rejects(() => completeRegistration(db, { challenge_id: options.challenge_id, ...response }, origin, rpId, Date.now() + 301_000));
  const fresh = await registrationOptions(db, rpId);
  const second = await registrationResponse(auth, fresh.publicKey.challenge);
  await completeRegistration(db, { challenge_id: fresh.challenge_id, ...second }, origin, rpId);
  await assert.rejects(() => completeRegistration(db, { challenge_id: fresh.challenge_id, ...second }, origin, rpId));
  assert.equal(db.count('users'), 1);
});
test('login is usernameless: the authenticator returns the account handle, the counter must advance and signatures are verified for ES256 and RS256', async () => {
  for (const algorithm of [-7, -257] as const) {
    const db = new SqliteDB(), auth = await makeAuthenticator(algorithm);
    const { body: account } = await registerAccount(db, auth, envelope(60));
    const handle = toBase64url(utf8(account.user_id));
    const login = async (patch: Partial<Parameters<typeof assertionResponse>[3]> = {}, challengeOverride?: string, userHandle: string | null = handle) => {
      const options = await (await request('/api/auth/login/options', 'POST', {}, { DB: db })).json() as { challenge_id: string; publicKey: { challenge: string; allowCredentials: unknown[] } };
      assert.deepEqual(options.publicKey.allowCredentials, []);
      const response = await assertionResponse(auth, challengeOverride ?? options.publicKey.challenge, userHandle, patch);
      return request('/api/auth/login/verify', 'POST', { challenge_id: options.challenge_id, ...response }, { DB: db });
    };
    const ok = await login();
    assert.equal(ok.status, 200);
    const body = await ok.json() as Record<string, unknown>;
    assert.equal(body.authenticated, true); assert.equal(body.wrapped_key, envelope(60)); assert.equal(body.vault_version, 0); assert.equal(body.credential_id, toBase64url(auth.id));
    const cookie = cookieOf(ok)!; assert.match(cookie, /^[0-9a-f]{64}$/);
    assert.equal((db.sql.prepare('SELECT sign_count FROM passkey_credentials').get() as { sign_count: number }).sign_count, auth.signCount);
    assert.equal((await login({ signCount: auth.signCount - 1 })).status, 400, 'a repeated counter is a cloned-credential signal');
    assert.equal((await login({ tamper: true })).status, 400);
    assert.equal((await login({ origin: 'https://evil.example' })).status, 400);
    assert.equal((await login({ flags: 0x01 })).status, 400, 'user verification is required');
    assert.equal((await login({}, toBase64url(new Uint8Array(32)))).status, 400);
    assert.equal((await login({}, undefined, toBase64url(utf8(crypto.randomUUID())))).status, 400, 'a foreign user handle is rejected');
    assert.equal((await login({}, undefined, null)).status, 200, 'authenticators may omit the handle');
    assert.equal(db.count('sessions'), 3);
    assert.equal(db.count('webauthn_challenges'), 0);
  }
});
test('unknown credentials, replayed login challenges and malformed bodies fail without creating sessions', async () => {
  const db = new SqliteDB(), auth = await makeAuthenticator(), stranger = await makeAuthenticator();
  await registerAccount(db, auth);
  const options = await loginOptions(db, rpId);
  const response = await assertionResponse(stranger, options.publicKey.challenge, null);
  assert.equal((await request('/api/auth/login/verify', 'POST', { challenge_id: options.challenge_id, ...response }, { DB: db })).status, 400);
  const again = await loginOptions(db, rpId);
  const good = await assertionResponse(auth, again.publicKey.challenge, null);
  await completeLogin(db, { challenge_id: again.challenge_id, ...good }, origin, rpId);
  await assert.rejects(() => completeLogin(db, { challenge_id: again.challenge_id, ...good }, origin, rpId));
  for (const body of [{}, { challenge_id: 'x', id: 'y', response: {} }, { challenge_id: again.challenge_id, id: good.id, response: { ...good.response, extra: 1 } }])
    assert.equal((await request('/api/auth/login/verify', 'POST', body, { DB: db })).status, 400);
  assert.equal(db.count('sessions'), 2);
});
test('vault routes require a session; envelopes are opaque, bounded and versioned; conflicts are reported, not overwritten', async () => {
  const db = new SqliteDB(), auth = await makeAuthenticator();
  assert.equal((await request('/api/vault', 'GET', undefined, { DB: db })).status, 401);
  assert.equal((await request('/api/vault', 'PUT', { ciphertext: envelope(), version: 0 }, { DB: db })).status, 401);
  assert.equal((await request('/api/vault', 'GET', undefined, { DB: db }, { cookie: `${SESSION_COOKIE}=${'0'.repeat(64)}` })).status, 401);
  const { cookie } = await registerAccount(db, auth);
  const headers = { cookie: `${SESSION_COOKIE}=${cookie}` };
  assert.deepEqual(await (await request('/api/vault', 'GET', undefined, { DB: db }, headers)).json(), { version: 0, ciphertext: null, updated_at: null });
  for (const body of [{ ciphertext: envelope(64, 2), version: 0 }, { ciphertext: envelope(29), version: 0 }, { ciphertext: envelope() + '=', version: 0 }, { ciphertext: envelope(), version: -1 }, { ciphertext: envelope(), version: 0, key: 'never' }, { ciphertext: 'plain text vault', version: 0 }])
    assert.equal((await request('/api/vault', 'PUT', body, { DB: db }, headers)).status, 400);
  assert.throws(() => validateVaultEnvelope(envelope(VAULT_ENVELOPE_LIMIT + 1)));
  assert.equal(validateVaultEnvelope(envelope(VAULT_ENVELOPE_LIMIT)), envelope(VAULT_ENVELOPE_LIMIT));
  const created = await request('/api/vault', 'PUT', { ciphertext: envelope(80), version: 0 }, { DB: db }, headers);
  assert.equal(created.status, 200); assert.equal((await created.json() as { version: number }).version, 1);
  assert.equal((await request('/api/vault', 'PUT', { ciphertext: envelope(81), version: 0 }, { DB: db }, headers)).status, 409, 'a second device cannot create over an existing vault');
  assert.equal((await request('/api/vault', 'PUT', { ciphertext: envelope(82), version: 2 }, { DB: db }, headers)).status, 409);
  const updated = await request('/api/vault', 'PUT', { ciphertext: envelope(90), version: 1 }, { DB: db }, headers);
  assert.equal(updated.status, 200); assert.equal((await updated.json() as { version: number }).version, 2);
  const stored = await (await request('/api/vault', 'GET', undefined, { DB: db }, headers)).json() as Record<string, unknown>;
  assert.equal(stored.version, 2); assert.equal(stored.ciphertext, envelope(90));
  assert.deepEqual(Object.keys(db.sql.prepare('SELECT * FROM vaults').get() as object).sort(), ['ciphertext', 'updated_at', 'user_id', 'version']);
  assert.equal(await writeVault(db, 'missing-user', { ciphertext: envelope(), version: 3 }), 'conflict');
});
test('wrapped keys attach only to the signing credential; logout and account erasure clear every row and the cookie', async () => {
  const db = new SqliteDB(), auth = await makeAuthenticator(), other = await makeAuthenticator();
  const first = await registerAccount(db, auth), second = await registerAccount(db, other);
  const headers = { cookie: `${SESSION_COOKIE}=${first.cookie}` };
  assert.equal((await request('/api/auth/wrapped-key', 'PUT', { wrapped_key: 'short' }, { DB: db }, headers)).status, 400);
  assert.deepEqual(await (await request('/api/auth/wrapped-key', 'PUT', { wrapped_key: envelope(60) }, { DB: db }, headers)).json(), { saved: true });
  assert.equal((db.sql.prepare('SELECT wrapped_key FROM passkey_credentials WHERE credential_id=?').get(first.body.credential_id) as { wrapped_key: string }).wrapped_key, envelope(60));
  assert.equal((db.sql.prepare('SELECT wrapped_key FROM passkey_credentials WHERE credential_id=?').get(second.body.credential_id) as { wrapped_key: null }).wrapped_key, null);
  await request('/api/vault', 'PUT', { ciphertext: envelope(80), version: 0 }, { DB: db }, headers);
  const loggedOut = await request('/api/auth/logout', 'POST', {}, { DB: db }, headers);
  assert.match(loggedOut.headers.get('set-cookie') ?? '', /cc_session=;.*Max-Age=0/);
  assert.equal((await request('/api/vault', 'GET', undefined, { DB: db }, headers)).status, 401);
  assert.deepEqual(await (await request('/api/auth/session', 'GET', undefined, { DB: db }, headers)).json(), { authenticated: false });
  assert.deepEqual(await (await request('/api/auth/session', 'GET', undefined, {}, {})).json(), { authenticated: false }, 'no cookie means no database access');
  const login = await loginOptions(db, rpId);
  const assertion = await assertionResponse(auth, login.publicKey.challenge, null);
  const { token } = await completeLogin(db, { challenge_id: login.challenge_id, ...assertion }, origin, rpId);
  const fresh = { cookie: `${SESSION_COOKIE}=${token}` };
  assert.equal((await request('/api/auth/account', 'DELETE', { confirm: false }, { DB: db }, fresh)).status, 400);
  const erased = await request('/api/auth/account', 'DELETE', { confirm: true }, { DB: db }, fresh);
  assert.deepEqual(await erased.json(), { erased: true }); assert.match(erased.headers.get('set-cookie') ?? '', /Max-Age=0/);
  assert.equal(db.count('users'), 1); assert.equal(db.count('passkey_credentials'), 1); assert.equal(db.count('vaults'), 0);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM sessions WHERE user_id=?').get(first.body.user_id)!.n, 0);
  assert.equal((await request('/api/vault', 'GET', undefined, { DB: db }, fresh)).status, 401);
  assert.equal((await request('/api/vault', 'GET', undefined, { DB: db }, { cookie: `${SESSION_COOKIE}=${second.cookie}` })).status, 200, 'the other account is untouched');
});
test('session cookies are HttpOnly, Secure, SameSite=Strict, scoped to /api and parsed strictly', async () => {
  const db = new SqliteDB(), auth = await makeAuthenticator();
  const options = await (await request('/api/auth/register/options', 'POST', {}, { DB: db })).json() as { challenge_id: string; publicKey: { challenge: string } };
  const verified = await request('/api/auth/register/verify', 'POST', { challenge_id: options.challenge_id, ...await registrationResponse(auth, options.publicKey.challenge) }, { DB: db });
  const header = verified.headers.get('set-cookie')!;
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api', `Max-Age=${SESSION_TTL_SECONDS}`]) assert.ok(header.includes(attribute), attribute);
  assert.equal(readSessionToken(new Request(origin, { headers: { cookie: `other=1; ${SESSION_COOKIE}=${'a'.repeat(64)}; x=y` } })), 'a'.repeat(64));
  for (const value of ['short', 'A'.repeat(64), `${'a'.repeat(64)}; evil`, '']) assert.equal(readSessionToken(new Request(origin, { headers: { cookie: `${SESSION_COOKIE}=${value}` } })), value === `${'a'.repeat(64)}; evil` ? 'a'.repeat(64) : null);
  assert.equal(readSessionToken(new Request(origin)), null);
});
test('expired sessions and challenges are purged hourly and never authenticate', async () => {
  const db = new SqliteDB(), auth = await makeAuthenticator(), now = Date.now();
  await registerAccount(db, auth);
  await loginOptions(db, rpId, now);
  const options = await registrationOptions(db, rpId, now - 400_000);
  const stale = await registrationResponse(await makeAuthenticator(), options.publicKey.challenge);
  await assert.rejects(() => completeRegistration(db, { challenge_id: options.challenge_id, ...stale }, origin, rpId, now));
  db.sql.prepare('UPDATE sessions SET expires_at=?').run(Math.floor(now / 1000) - 1);
  const cookie = `${SESSION_COOKIE}=${'b'.repeat(64)}`;
  assert.equal((await request('/api/vault', 'GET', undefined, { DB: db }, { cookie })).status, 401);
  await purgeAuth(db, now);
  assert.equal(db.count('sessions'), 0); assert.equal(db.count('webauthn_challenges'), 1);
  await purgeAuth(db, now + 400_000);
  assert.equal(db.count('webauthn_challenges'), 0);
});
test('account quotas are separate and atomic', async () => {
  const start = Date.UTC(2026, 9, 10);
  for (const [action, minuteCap] of [['auth_register', 5], ['auth_login', 20], ['vault_write', 30], ['account_erase', 5]] as const) {
    const db = new SqliteDB();
    assert.equal((await Promise.all(Array.from({ length: 40 }, () => quota(db, action, start)))).filter(Boolean).length, minuteCap);
  }
});
test('CBOR, COSE and DER parsers reject indefinite lengths, floats, oversized items and malformed signatures', async () => {
  for (const bytes of [[0x5f], [0xf9, 0, 0], [0xc0, 0], [0x7f], [0x9b, 1, 0, 0, 0, 0, 0, 0, 0], [0x18], [0xa1, 0xf5, 1]]) assert.throws(() => decodeCbor(Uint8Array.from(bytes)));
  assert.deepEqual(decodeCbor(cbor(new Map<number | string, unknown>([[1, 2], [-1, 'x'], ['k', [1, utf8('ab')]]]))).value, new Map<number | string, unknown>([[1, 2], [-1, 'x'], ['k', [1, utf8('ab')]]]));
  assert.equal(decodeCbor(Uint8Array.from([0x18, 200, 0xff])).length, 2);
  const auth = await makeAuthenticator();
  const data = await authData(auth, 0x45, 7);
  const parsed = parseAuthenticatorData(data);
  assert.equal(parsed.signCount, 7); assert.ok(parsed.userVerified); assert.deepEqual(parsed.credential?.id, auth.id); assert.equal(parsed.credential?.key.algorithm, -7);
  assert.throws(() => parseAuthenticatorData(Uint8Array.from([...data, 0]))); assert.throws(() => parseAuthenticatorData(data.slice(0, 36)));
  const weakKey = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 8], [-2, new Uint8Array(32)], [-3, new Uint8Array(32)]]));
  const weakData = await authData({ ...auth, coseKey: weakKey }, 0x45, 0);
  assert.throws(() => parseAuthenticatorData(weakData));
  for (const der of [[0x30, 6, 2, 1, 1, 2, 1], [0x31, 6, 2, 1, 1, 2, 1, 1], [0x30, 0x81, 7, 2, 1, 1, 2, 1, 1], [0x30, 72, ...new Array(70).fill(2), 1, 1]]) assert.throws(() => derToRaw(Uint8Array.from(der)));
  const raw = derToRaw(Uint8Array.from([0x30, 8, 2, 2, 0, 0x80, 2, 2, 0x01, 0x02]));
  assert.equal(raw.length, 64); assert.equal(raw[31], 0x80); assert.equal(raw[62], 1); assert.equal(raw[63], 2);
  const challenge = toBase64url(new Uint8Array(32));
  const assertion = await assertionResponse(auth, challenge, null, { signCount: 3 });
  const stored = { publicKey: toBase64url(auth.coseKey), algorithm: -7 as const, signCount: 2 };
  assert.deepEqual(await verifyAssertion(assertion.response, stored, { challenge, origin, rpId }), { signCount: 3 });
  await assert.rejects(() => verifyAssertion(assertion.response, { ...stored, algorithm: -257 }, { challenge, origin, rpId }));
  await assert.rejects(() => verifyAssertion(assertion.response, { ...stored, signCount: 3 }, { challenge, origin, rpId }));
  const counterless = await assertionResponse(auth, challenge, null, { signCount: 0 });
  assert.deepEqual(await verifyAssertion(counterless.response, { ...stored, signCount: 0 }, { challenge, origin, rpId }), { signCount: 0 });
});
