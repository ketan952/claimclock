import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { app } from '../worker/app.ts';
import { provider, quota, redact, validateReport, sha256 } from '../worker/security.ts';
import { SITEVERIFY_URL, verifyTurnstile } from '../worker/turnstile.ts';
import { TRANSFER_BODY_LIMIT, TRANSFER_TTL_SECONDS, createTransfer, lookupTransfer, purgeTransfers, scheduledTask, validateCiphertext } from '../worker/transfers.ts';
import type { Database, Statement, Bindings } from '../worker/types.ts';

const migration = readFileSync(new NodeURL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
const optionalCityMigration = readFileSync(new NodeURL('../migrations/0002_optional_report_city.sql', import.meta.url), 'utf8');
const transferMigration = readFileSync(new NodeURL('../migrations/0003_encrypted_transfers.sql', import.meta.url), 'utf8');
const vaultMigration = readFileSync(new NodeURL('../migrations/0004_user_vaults.sql', import.meta.url), 'utf8');
const maintenance = readFileSync(new NodeURL('../worker/aggregate.sql', import.meta.url), 'utf8');
class SqliteDB implements Database {
  sql = new DatabaseSync(':memory:');
  constructor() { this.sql.exec(migration); this.sql.exec(optionalCityMigration); this.sql.exec(transferMigration); this.sql.exec(vaultMigration); }
  prepare(sql: string): Statement {
    const database = this.sql;
    let values: (string | number | null)[] = [];
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
}
const origin = 'https://claimclock.example';
const challengeEnv = { TURNSTILE_SECRET_KEY: 'synthetic-secret', TURNSTILE_SITE_KEY: 'synthetic-public-key', TURNSTILE_HOSTNAME: 'claimclock.example' };
const actionFor = (path: string) => path === '/api/transfers/lookup' ? 'transfer_lookup' : path === '/api/transfers' ? 'transfer_create' : path === '/api/explain' ? 'explain' : 'reports';
const report = () => ({ insurer: 'star-health', tpa: null, city: 'नई दिल्ली', request_type: 'discharge',
  submitted_at: new Date(Date.now() - 5 * 3600000).toISOString(), decided_at: new Date(Date.now() - 3600000).toISOString(),
  outcome: 'approved', consent_version: '2026-10-10', consent: true, adult: true });
async function request(path: string, method = 'GET', body?: unknown, env: Bindings = {}, headers: Record<string, string> = {}) {
  const originalFetch = globalThis.fetch, action = actionFor(path), token = `synthetic-${crypto.randomUUID()}`;
  globalThis.fetch = async (url, options) => {
    if (String(url) !== SITEVERIFY_URL) return originalFetch(url, options);
    assert.deepEqual(JSON.parse(String(options?.body)), { secret: challengeEnv.TURNSTILE_SECRET_KEY, response: token });
    return Response.json({ success: true, hostname: challengeEnv.TURNSTILE_HOSTNAME, action });
  };
  try {
    return await app.request(`${origin}${path}`, { method, headers: { origin, 'content-type': 'application/json', 'X-Turnstile-Token': token, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { ...(env.DB ? challengeEnv : {}), ...env });
  } finally { globalThis.fetch = originalFetch; }
}

test('requires same origin and rejects missing/cross-site origins', async () => {
  assert.equal((await request('/api/reports', 'POST', report(), {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/api/reports', 'POST', report(), {}, { origin, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await app.request(`${origin}/api/reports`, { method: 'POST', body: '{}' }, {})).status, 403);
  const get = await app.request(`${origin}/api/config`, { headers: { 'sec-fetch-site': 'same-origin' } }, {});
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('cache-control'), 'no-store');
});
test('body streaming limit applies without Content-Length; malformed JSON/type rejected', async () => {
  assert.equal((await app.request(`${origin}/api/reports`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: ' '.repeat(4097) }, {})).status, 413);
  assert.equal((await app.request(`${origin}/api/reports`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' }, {})).status, 400);
  assert.equal((await request('/api/reports', 'POST', [], {})).status, 400);
  assert.equal((await request('/api/reports', 'POST', report(), {}, { 'content-type': 'text/plain' })).status, 415);
});
test('report requires adult consent, known identifiers, valid supplied city and no extra fields', async () => {
  for (const patch of [{ adult: false }, { consent: false }, { consent_version: 'old' }, { insurer: 'invented' }, { tpa: 'invented' }, { city: 'Room 123' }, { hospital: 'Private data' }, { ip: '1.1.1.1' }, { city: 'a'.repeat(71) }]) {
    assert.equal((await request('/api/reports', 'POST', { ...report(), ...patch })).status, 400);
  }
  assert.equal(validateReport(report()).city, 'नई दिल्ली');
});
test('omitted, null and blank cities store SQL NULL and the report can still be erased', async () => {
  const db = new SqliteDB();
  for (const city of [undefined, null, '', '   ']) {
    const value = { ...report(), city };
    assert.equal(validateReport(value).city, null);
    const response = await request('/api/reports', 'POST', value, { DB: db });
    assert.equal(response.status, 201);
    const saved = await response.json() as { id: string; erase_token: string };
    assert.equal(db.sql.prepare('SELECT city FROM reports WHERE id=?').get(saved.id)!.city, null);
    const erased = await request(`/api/reports/${saved.id}`, 'DELETE', { erase_token: saved.erase_token }, { DB: db });
    assert.deepEqual(await erased.json(), { erased: true });
    assert.equal(db.sql.prepare('SELECT id FROM reports WHERE id=?').get(saved.id), undefined);
  }
});
test('report validation identifies a fixed field without echoing rejected input', async () => {
  for (const [patch, field] of [
    [{ city: 'PRIVATE_ROOM_123' }, 'city'], [{ city: false }, 'city'], [{ insurer: 'private-name' }, 'insurer'],
    [{ decided_at: report().submitted_at, submitted_at: report().decided_at }, 'decided_at'],
    [{ consent: false }, 'consent'], [{ extra_private_field: 'secret' }, 'report'],
  ] as const) {
    const response = await request('/api/reports', 'POST', { ...report(), ...patch });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid request.', field });
  }
});
test('optional-city migration preserves existing data, aggregates, suppressions, constraints and erasure trigger', () => {
  const db = new DatabaseSync(':memory:');db.exec(migration);
  db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('legacy', 'retained-hash', 'star-health', null, 'Delhi', 'discharge', '2026-06-01T00:00:00Z', '2026-06-01T04:00:00Z', 'approved', '2026-10-10', '2026-06-02T00:00:00Z');
  db.prepare('INSERT INTO aggregates VALUES(?,?,?,?,?,?,?)').run('star-health', 'discharge', '2026-06', 10, 2400, 10, '2026-07-09');
  db.prepare('INSERT INTO aggregate_suppressions VALUES(?,?,?)').run('care', 'preauth', '2026-05');
  const oldReport = db.prepare('SELECT * FROM reports').get();
  const oldAggregate = db.prepare('SELECT * FROM aggregates').get();
  const oldSuppression = db.prepare('SELECT * FROM aggregate_suppressions').get();
  db.exec(`BEGIN;${optionalCityMigration}COMMIT;`);
  assert.deepEqual(db.prepare('SELECT * FROM reports').get(), oldReport);
  assert.deepEqual(db.prepare('SELECT * FROM aggregates').get(), oldAggregate);
  assert.deepEqual(db.prepare('SELECT * FROM aggregate_suppressions').get(), oldSuppression);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'reports_%' ORDER BY name").all().map(row=>row.name), ['reports_cohort','reports_created']);
  assert.throws(()=>db.prepare("UPDATE reports SET request_type='invalid'").run());
  assert.throws(()=>db.prepare("UPDATE reports SET outcome='invalid'").run());
  db.prepare('UPDATE reports SET city=NULL').run();assert.equal(db.prepare('SELECT city FROM reports').get()!.city, null);
  db.prepare('DELETE FROM reports WHERE id=?').run('legacy');
  assert.equal(db.prepare('SELECT * FROM aggregates').get(), undefined);
  assert.ok(db.prepare("SELECT * FROM aggregate_suppressions WHERE insurer='star-health' AND period='2026-06'").get());
  assert.ok(db.prepare("SELECT * FROM aggregate_suppressions WHERE insurer='care' AND period='2026-05'").get());
  db.close();
});
test('timestamps require real UTC dates, past times and ordered decisions', () => {
  for (const patch of [
    { decided_at: new Date(Date.now() + 60000).toISOString() },
    { submitted_at: report().decided_at, decided_at: report().submitted_at },
    { submitted_at: '2026-02-30T12:00:00Z' },
    { submitted_at: '2026-10-10T12:00:00' },
  ]) assert.throws(() => validateReport({ ...report(), ...patch }));
});
test('optional binding absence is graceful and AI config is disabled', async () => {
  for (const [path, method, body] of [
    ['/api/reports', 'POST', report()], ['/api/events', 'POST', { counts: { session_started: 1 } }],
    ['/api/explain', 'POST', { lines: 'Consumables 400', consent: true }], ['/api/aggregates?insurer=star-health', 'GET', undefined],
  ] as const) assert.equal((await request(path, method, body)).status, 503);
  assert.deepEqual(await (await request('/api/config')).json(), { ai_enabled: false, provider: null, model: null, voice_enabled: false, stt_model: null, tts_enabled: false, tts_provider: null, turnstile_enabled: false, turnstile_site_key: null });
});
test('report stores only erasure hash and wrong-token deletion is non-enumerating', async () => {
  const db = new SqliteDB();
  const result = await request('/api/reports', 'POST', report(), { DB: db });
  assert.equal(result.status, 201);
  const saved = await result.json() as { id: string; erase_token: string };
  assert.match(saved.erase_token, /^[0-9a-f]{64}$/);
  const row = db.sql.prepare('SELECT * FROM reports').get()!;
  assert.notEqual(row.erase_hash, saved.erase_token);
  assert.equal(row.city, 'नई दिल्ली');
  assert.equal('ip' in row, false); assert.equal('hospital' in row, false);
  const wrong = await request(`/api/reports/${saved.id}`, 'DELETE', { erase_token: '0'.repeat(64) }, { DB: db });
  assert.equal(wrong.status, 200); assert.deepEqual(await wrong.json(), { erased: false }); assert.equal(db.sql.prepare('SELECT count(*) AS n FROM reports').get()!.n, 1);
  const right = await request(`/api/reports/${saved.id}`, 'DELETE', { erase_token: saved.erase_token }, { DB: db });
  assert.equal(right.status, 200); assert.deepEqual(await right.json(), { erased: true }); assert.equal(db.sql.prepare('SELECT count(*) AS n FROM reports').get()!.n, 0);
  const repeated = await request(`/api/reports/${saved.id}`, 'DELETE', { erase_token: saved.erase_token }, { DB: db });
  assert.deepEqual(await repeated.json(), { erased: false });
});
test('global quotas enforce AI minute and day caps atomically', async () => {
  const db = new SqliteDB(), now = Date.now();
  const concurrent = await Promise.all(Array.from({ length: 10 }, () => quota(db, 'explain', now)));
  assert.equal(concurrent.filter(Boolean).length, 3);
  const other = new SqliteDB();
  const start = Date.UTC(2026, 9, 10);
  for (let i = 0; i < 100; i++) assert.equal(await quota(other, 'explain', start + i * 60000), true);
  assert.equal(await quota(other, 'explain', start + 101 * 60000), false);
});
test('events accept only five named counts and no identifier or oversized batch', async () => {
  const db = new SqliteDB();
  for (const body of [{ counts: { secret: 1 } }, { counts: { session_started: 21 } }, { counts: { session_started: 20, opt_in_submitted: 1 } }, { counts: { session_started: 1 }, user_id: 'id' }])
    assert.equal((await request('/api/events', 'POST', body, { DB: db })).status, 400);
  assert.equal((await request('/api/events', 'POST', { counts: { session_started: 2, clock_lock_copied: 1 } }, { DB: db })).status, 200);
  assert.equal(db.sql.prepare('SELECT sum(n) AS n FROM events').get()!.n, 3);
});
function addCohort(db: SqliteDB, insurer: string, n: number, prefix: string) {
  const date = new Date(); date.setUTCDate(15); date.setUTCMonth(date.getUTCMonth() - 2); date.setUTCHours(0, 0, 0, 0);
  const submitted = date.toISOString(), decided = new Date(date.getTime() + 4 * 3600000).toISOString();
  for (let i = 0; i < n; i++) db.sql.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(`${prefix}-${i}`, 'hash', insurer, null, 'Delhi', 'discharge', submitted, decided, 'approved', '2026-10-10', submitted);
  return submitted.slice(0, 7);
}
test('monthly SQL suppresses n<10, freezes snapshots, hides erased cohorts and purges retention', async () => {
  const db = new SqliteDB();
  addCohort(db, 'star-health', 10, 'a'); addCohort(db, 'care', 9, 'b');
  db.sql.exec(maintenance);
  const response = await request('/api/aggregates?insurer=star-health', 'GET', undefined, { DB: db });
  const body = await response.json() as { rows: Record<string, unknown>[] };
  assert.equal(body.rows.length, 1); assert.equal(body.rows[0].n, 10); assert.equal(body.rows[0].total_minutes, 2400); assert.equal(body.rows[0].beyond_window, 10);
  assert.equal('city' in body.rows[0], false); assert.equal('submitted_at' in body.rows[0], false);
  assert.equal((await (await request('/api/aggregates?insurer=care', 'GET', undefined, { DB: db })).json() as { rows: unknown[] }).rows.length, 0);
  addCohort(db, 'star-health', 1, 'c'); db.sql.exec(maintenance);
  assert.equal(db.sql.prepare("SELECT n FROM aggregates WHERE insurer='star-health'").get()!.n, 10);
  db.sql.prepare('DELETE FROM reports WHERE id=?').run('a-0');
  assert.equal(db.sql.prepare("SELECT * FROM aggregates WHERE insurer='star-health'").get(), undefined);
  db.sql.exec(maintenance);
  assert.equal(db.sql.prepare("SELECT * FROM aggregates WHERE insurer='star-health'").get(), undefined);
  db.sql.prepare('INSERT INTO events VALUES(?,?,?)').run('2000-01-01', 'session_started', 5);
  db.sql.prepare('INSERT INTO quotas VALUES(?,?,?)').run('old', 1, 1);
  db.sql.exec(maintenance);
  assert.equal(db.sql.prepare("SELECT * FROM events WHERE day='2000-01-01'").get(), undefined);
  assert.equal(db.sql.prepare("SELECT * FROM quotas WHERE key='old'").get(), undefined);
});
test('AI fails closed without explicit free-tier confirmation and allows only pinned HTTPS hosts/paths', () => {
  const env = { LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_API_KEY: 'example-not-a-secret', LLM_MODEL: 'openai/gpt-oss-120b', LLM_FREE_TIER_CONFIRMED: 'true' };
  assert.ok(provider(env)); assert.equal(provider({ ...env, LLM_FREE_TIER_CONFIRMED: undefined }), null);
  for (const url of ['http://api.groq.com/openai/v1', 'https://api.groq.com.evil.example/openai/v1', 'https://api.groq.com/openai/v1?key=x', 'https://user:pass@api.groq.com/openai/v1', 'https://127.0.0.1/v1', 'https://api.groq.com/other']) assert.equal(provider({ ...env, LLM_BASE_URL: url }), null);
  assert.equal(provider({ ...env, LLM_BASE_URL: 'https://openrouter.ai/api/v1', LLM_MODEL: 'paid-model' }), null);
  assert.ok(provider({ ...env, LLM_BASE_URL: 'https://openrouter.ai/api/v1', LLM_MODEL: 'model:free' }));
});
test('AI proxy bounds tokens, redacts obvious identifiers and returns only explanation', async () => {
  const originalFetch = globalThis.fetch;
  let payload: { max_completion_tokens: number; messages: { content: string }[] } | undefined;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options?.redirect, 'manual');
    payload = JSON.parse(String(options?.body));
    return Response.json({ choices: [{ message: { content: '<think>private reasoning</think>Ask for the policy clause.', reasoning: 'never return this' } }] });
  };
  try {
    const db = new SqliteDB();
    const env = { DB: db, LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_API_KEY: 'example-not-a-secret', LLM_MODEL: 'openai/gpt-oss-120b', LLM_FREE_TIER_CONFIRMED: 'true' };
    const result = await request('/api/explain', 'POST', { lines: 'Name: Jane Doe\nEmail jane@example.com\nPhone 9876543210\nConsumables 400', consent: true }, env);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { explanation: 'Ask for the policy clause.', advisory_only: true });
    assert.equal(payload!.max_completion_tokens, 600);
    assert.doesNotMatch(payload!.messages[1].content, /Jane Doe|jane@example.com|9876543210/);
    assert.match(payload!.messages[1].content, /Consumables 400/);
  } finally { globalThis.fetch = originalFetch; }
});
test('redaction is defense in depth, not a claim of complete anonymization', () => {
  assert.doesNotMatch(redact('UHID: AB123456\nPolicy Number: POL987654\nABCDE1234F\n1234 5678 9012'), /AB123456|POL987654|ABCDE1234F|1234 5678 9012/);
});

test('database failures are generic and erasure invalidation rolls back atomically', async () => {
  const broken: Database = { prepare() { throw new Error('SENSITIVE DATABASE DETAIL'); }, async batch() { throw new Error('SENSITIVE'); } };
  const response = await request('/api/reports', 'POST', report(), { DB: broken });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /SENSITIVE/);
  const db = new SqliteDB(); addCohort(db, 'star-health', 10, 'atomic'); db.sql.exec(maintenance);
  db.sql.exec("CREATE TRIGGER fail_erase BEFORE DELETE ON reports BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
  assert.throws(() => db.sql.prepare('DELETE FROM reports WHERE id=?').run('atomic-0'));
  assert.equal(db.sql.prepare("SELECT count(*) AS n FROM reports WHERE insurer='star-health'").get()!.n, 10);
  assert.equal(db.sql.prepare("SELECT n FROM aggregates WHERE insurer='star-health'").get()!.n, 10);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM aggregate_suppressions').get()!.n, 0);
});
test('unavailable provider does not expose provider error text or fall back', async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('Private provider diagnostic', { status: 429 }); };
  try {
    const result = await request('/api/explain', 'POST', { lines: 'Deduction 400', consent: true }, { DB: new SqliteDB(), LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_API_KEY: 'example-not-a-secret', LLM_MODEL: 'openai/gpt-oss-120b', LLM_FREE_TIER_CONFIRMED: 'true' });
    assert.equal(result.status, 503); assert.equal(calls, 1); assert.doesNotMatch(await result.text(), /Private provider/);
  } finally { globalThis.fetch = originalFetch; }
});
test('AI language is an exact optional enum and Hindi requests select Hindi provider instructions', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const payload = JSON.parse(String(options?.body));
    assert.match(payload.messages[0].content, /Hindi using Devanagari/);
    return Response.json({ choices: [{ message: { content: 'बीमाकर्ता ने कटौती बताई है। लागू शर्त की पुष्टि आवश्यक है।' } }] });
  };
  const env = { DB: new SqliteDB(), LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_API_KEY: 'example-not-a-secret', LLM_MODEL: 'openai/gpt-oss-120b', LLM_FREE_TIER_CONFIRMED: 'true' };
  try {
    for (const language of [['en'], {}, 'fr', 1, null]) assert.equal((await request('/api/explain','POST',{lines:'Deduction 400',consent:true,language},env)).status,400);
    assert.equal(calls,0);
    const result = await request('/api/explain','POST',{lines:'Deduction 400',consent:true,language:'hi'},env);
    assert.equal(result.status,200);assert.equal(calls,1);
    assert.match((await result.json() as {explanation:string}).explanation,/बीमाकर्ता/);
  } finally { globalThis.fetch = originalFetch; }
});
test('provider redirects are rejected without following or forwarding authorization', async () => {
  const originalFetch = globalThis.fetch;let calls=0;
  globalThis.fetch = async (_url, options) => { calls++;assert.equal(options?.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://other.example/'}}); };
  try {
    const result=await request('/api/explain','POST',{lines:'Deduction 400',consent:true},{DB:new SqliteDB(),LLM_BASE_URL:'https://api.groq.com/openai/v1',LLM_API_KEY:'example-not-a-secret',LLM_MODEL:'openai/gpt-oss-120b',LLM_FREE_TIER_CONFIRMED:'true'});
    assert.equal(result.status,503);assert.equal(calls,1);
  } finally { globalThis.fetch = originalFetch; }
});

const envelope = (length = 64, version = 1) => { const bytes = new Uint8Array(length); bytes[0] = version; return Buffer.from(bytes).toString('base64url'); };
const rawRequest = (path: string, body: unknown, env: Bindings, token?: string) => app.request(`${origin}${path}`, {
  method: 'POST', headers: { origin, 'content-type': 'application/json', ...(token === undefined ? {} : { 'X-Turnstile-Token': token }) }, body: JSON.stringify(body),
}, env);
test('Turnstile config exposes only the public key and never derives trust from request Host', async () => {
  const env = { ...challengeEnv, DB: new SqliteDB() };
  const config = await (await request('/api/config', 'GET', undefined, env)).json();
  assert.deepEqual(config, { ai_enabled: false, provider: null, model: null, voice_enabled: false, stt_model: null, tts_enabled: false, tts_provider: null, turnstile_enabled: true, turnstile_site_key: 'synthetic-public-key' });
  assert.doesNotMatch(JSON.stringify(config), /synthetic-secret|TURNSTILE_SECRET|hostname/);
  for (const patch of [{ TURNSTILE_SECRET_KEY: '' }, { TURNSTILE_SITE_KEY: undefined }, { TURNSTILE_HOSTNAME: 'https://evil.example' }]) {
    const disabled = await (await request('/api/config', 'GET', undefined, { ...env, ...patch })).json() as { turnstile_enabled: boolean; turnstile_site_key: null };
    assert.equal(disabled.turnstile_enabled, false); assert.equal(disabled.turnstile_site_key, null);
  }
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, hostname: 'claimclock.example', action: 'reports' });
  try {
    assert.equal(await verifyTurnstile(new Request(origin, { headers: { 'X-Turnstile-Token': 'valid-token' } }), { ...challengeEnv, TURNSTILE_HOSTNAME: undefined }, 'reports'), 403);
  } finally { globalThis.fetch = original; }
});
test('Turnstile verifies the exact action and hostname with no identity fields and bounded timeout', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(url, SITEVERIFY_URL); assert.equal(options?.method, 'POST'); assert.equal(options?.redirect, 'manual'); assert.ok(options?.signal);
    assert.deepEqual(JSON.parse(String(options?.body)), { secret: challengeEnv.TURNSTILE_SECRET_KEY, response: 'valid-token' });
    return Response.json({ success: true, hostname: challengeEnv.TURNSTILE_HOSTNAME, action: 'transfer_lookup' });
  };
  const req = new Request(origin, { headers: { 'X-Turnstile-Token': 'valid-token', 'CF-Connecting-IP': '192.0.2.1' } });
  try {
    assert.equal(await verifyTurnstile(req, challengeEnv, 'transfer_lookup'), null);
    assert.equal(await verifyTurnstile(req, challengeEnv, 'transfer_create'), 403);
    assert.equal(await verifyTurnstile(req, { ...challengeEnv, TURNSTILE_HOSTNAME: 'other.example' }, 'transfer_lookup'), 403);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});
test('Turnstile rejects missing and oversized tokens without fetch; unavailable verification fails closed', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Private network error'); };
  try {
    for (const token of [undefined, '', 'a'.repeat(2049), 'bad token']) {
      assert.equal(await verifyTurnstile(new Request(origin, { headers: token === undefined ? {} : { 'X-Turnstile-Token': token } }), challengeEnv, 'reports'), 403);
    }
    assert.equal(calls, 0);
    const req = new Request(origin, { headers: { 'X-Turnstile-Token': 'valid-token' } });
    assert.equal(await verifyTurnstile(req, {}, 'reports'), 503); assert.equal(calls, 0);
    assert.equal(await verifyTurnstile(req, challengeEnv, 'reports'), 503);
    for (const response of [new Response('private', { status: 500 }), new Response(null, { status: 302 }), new Response('{'), Response.json({}), new Response('a'.repeat(4097)), Response.json({ success: false, 'error-codes': ['internal-error'] }), Response.json({ success: false, 'error-codes': ['invalid-input-secret'] })]) {
      globalThis.fetch = async () => response;
      assert.equal(await verifyTurnstile(req, challengeEnv, 'reports'), 503);
    }
    for (const code of ['timeout-or-duplicate', 'invalid-input-response']) {
      globalThis.fetch = async () => Response.json({ success: false, 'error-codes': [code] });
      assert.equal(await verifyTurnstile(req, challengeEnv, 'reports'), 403);
    }
  } finally { globalThis.fetch = original; }
});
test('all protected APIs validate first and reject missing verification without consuming quotas', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected verification'); };
  const db = new SqliteDB(), env = { DB: db, ...challengeEnv, LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_API_KEY: 'synthetic-provider-key', LLM_MODEL: 'synthetic-model', LLM_FREE_TIER_CONFIRMED: 'true' };
  try {
    for (const [path, body] of [['/api/reports', report()], ['/api/explain', { lines: 'Deduction 400', consent: true }], ['/api/transfers', { ciphertext: envelope() }], ['/api/transfers/lookup', { code: 'ABCDEFGH' }]] as const) {
      assert.equal((await rawRequest(path, body, env)).status, 403);
      assert.equal((await rawRequest(path, { ...body, key: 'never-accepted' }, env, 'valid-token')).status, 400);
      assert.equal((await rawRequest(path, body, { ...env, TURNSTILE_SECRET_KEY: undefined }, 'valid-token')).status, 503);
    }
    assert.equal(calls, 0); assert.equal(db.sql.prepare('SELECT count(*) AS n FROM quotas').get()!.n, 0);
  } finally { globalThis.fetch = original; }
});
test('a replayed Turnstile token does not create a second report or burn another quota permit', async () => {
  const original = globalThis.fetch, db = new SqliteDB(); let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? Response.json({ success: true, hostname: challengeEnv.TURNSTILE_HOSTNAME, action: 'reports' }) : Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
  try {
    assert.equal((await rawRequest('/api/reports', report(), { DB: db, ...challengeEnv }, 'single-use-token')).status, 201);
    assert.equal((await rawRequest('/api/reports', report(), { DB: db, ...challengeEnv }, 'single-use-token')).status, 403);
    assert.equal(db.sql.prepare('SELECT count(*) AS n FROM reports').get()!.n, 1);
    assert.deepEqual(db.sql.prepare('SELECT count FROM quotas').all().map(row => row.count), [1, 1]);
  } finally { globalThis.fetch = original; }
});
test('transfers strictly bound the opaque versioned envelope and reject key or plaintext fields', async () => {
  for (const ciphertext of ['', envelope(29), envelope(65537), envelope(64, 2), envelope() + '=', envelope() + '\n', 'A', '_'.repeat(40), envelope(31).slice(0, -1) + 'B']) assert.throws(() => validateCiphertext({ ciphertext }));
  assert.equal(validateCiphertext({ ciphertext: envelope(30) }), envelope(30));
  assert.equal(validateCiphertext({ ciphertext: envelope(65536) }), envelope(65536));
  const db = new SqliteDB();
  for (const body of [{ ciphertext: envelope(), key: 'private' }, { ciphertext: envelope(), timeline: {} }, { ciphertext: 1 }, {}]) assert.equal((await request('/api/transfers', 'POST', body, { DB: db })).status, 400);
  const large = await app.request(`${origin}/api/transfers`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: ' '.repeat(TRANSFER_BODY_LIMIT + 1) }, { DB: db });
  assert.equal(large.status, 413);
  const valid = await request('/api/transfers', 'POST', { ciphertext: envelope(65536) }, { DB: db });
  assert.equal(valid.status, 201);
});
test('transfer create and lookup expose only ciphertext; DB stores only hash, ciphertext, expiry and attempts', async () => {
  const db = new SqliteDB(), ciphertext = envelope();
  const response = await request('/api/transfers', 'POST', { ciphertext }, { DB: db });
  assert.equal(response.status, 201);
  const saved = await response.json() as { code: string; expires_at: string };
  assert.match(saved.code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.ok(Math.abs(Date.parse(saved.expires_at) - Date.now() - TRANSFER_TTL_SECONDS * 1000) < 2000);
  const stored = db.sql.prepare('SELECT * FROM transfers').get()!;
  assert.deepEqual(Object.keys(stored).sort(), ['attempts', 'ciphertext', 'code_hash', 'expires_at']);
  assert.equal(stored.code_hash, await sha256(saved.code)); assert.notEqual(stored.code_hash, saved.code); assert.equal(stored.ciphertext, ciphertext);
  for (let i = 1; i <= 3; i++) {
    const found = await request('/api/transfers/lookup', 'POST', { code: saved.code }, { DB: db });
    assert.equal(found.status, 200); assert.deepEqual(await found.json(), { ciphertext, expires_at: saved.expires_at, attempts_remaining: 3 - i });
    assert.equal(db.sql.prepare('SELECT attempts FROM transfers').get()?.attempts, i < 3 ? i : undefined);
  }
  const gone = await request('/api/transfers/lookup', 'POST', { code: saved.code }, { DB: db });
  const missing = await request('/api/transfers/lookup', 'POST', { code: '00000000' }, { DB: db });
  assert.equal(gone.status, 404); assert.equal(missing.status, 404); assert.deepEqual(await gone.json(), await missing.json());
});
test('concurrent lookups deliver at most three copies and TTL is enforced even before cleanup', async () => {
  const db = new SqliteDB(), now = Date.now(), saved = await createTransfer(db, envelope(), now);
  const values = await Promise.all(Array.from({ length: 12 }, () => lookupTransfer(db, saved.code, now)));
  assert.equal(values.filter(Boolean).length, 3); assert.equal(db.sql.prepare('SELECT count(*) AS n FROM transfers').get()!.n, 0);
  const expired = await createTransfer(db, envelope(), now - TRANSFER_TTL_SECONDS * 1000);
  assert.equal(await lookupTransfer(db, expired.code, now), null);
  assert.equal(db.sql.prepare('SELECT attempts FROM transfers').get()!.attempts, 0);
  const response = await request('/api/transfers/lookup', 'POST', { code: expired.code }, { DB: db });
  assert.equal(response.status, 404);
});
test('third-lookup deletion failure rolls back the attempt and never returns a false success', async () => {
  const db = new SqliteDB(), saved = await createTransfer(db, envelope());
  await lookupTransfer(db, saved.code); await lookupTransfer(db, saved.code);
  db.sql.exec("CREATE TRIGGER fail_transfer_delete BEFORE DELETE ON transfers BEGIN SELECT RAISE(ABORT,'private injected error'); END;");
  const failed = await request('/api/transfers/lookup', 'POST', { code: saved.code }, { DB: db });
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private|injected|ciphertext/);
  assert.equal(db.sql.prepare('SELECT attempts FROM transfers').get()!.attempts, 2);
});
test('transfer quotas are atomic and enforce separate creation and lookup minute/day caps', async () => {
  const start = Date.UTC(2026, 9, 10);
  for (const [action, minuteCap, dayCap] of [['transfer_create', 3, 100], ['transfer_lookup', 10, 500]] as const) {
    const concurrent = new SqliteDB();
    assert.equal((await Promise.all(Array.from({ length: 20 }, () => quota(concurrent, action, start)))).filter(Boolean).length, minuteCap);
    const daily = new SqliteDB();
    for (let i = 0; i < dayCap; i++) assert.equal(await quota(daily, action, start + i * 60000), true);
    assert.equal(await quota(daily, action, start + dayCap * 60000), false);
  }
});
test('hourly transfer purge does not aggregate reports; daily maintenance purges and aggregates', async () => {
  const db = new SqliteDB(), now = Date.now(); addCohort(db, 'star-health', 10, 'hourly');
  const active = await createTransfer(db, envelope(), now);
  await createTransfer(db, envelope(), now - TRANSFER_TTL_SECONDS * 1000);
  assert.equal(scheduledTask('43 * * * *'), 'purge'); assert.equal(scheduledTask('17 2 * * *'), 'aggregate'); assert.equal(scheduledTask('unknown'), null);
  await purgeTransfers(db, now);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM transfers').get()!.n, 1);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM aggregates').get()!.n, 0);
  await createTransfer(db, envelope(), now - TRANSFER_TTL_SECONDS * 1000);
  db.sql.exec(maintenance);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM transfers').get()!.n, 1);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM aggregates').get()!.n, 1);
  assert.ok(await lookupTransfer(db, active.code, now));
});
test('report erasure remains available without Turnstile configuration or tokens', async () => {
  const db = new SqliteDB(), result = await request('/api/reports', 'POST', report(), { DB: db });
  const saved = await result.json() as { id: string; erase_token: string };
  const response = await app.request(`${origin}/api/reports/${saved.id}`, { method: 'DELETE', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ erase_token: saved.erase_token }) }, { DB: db });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { erased: true });
});
