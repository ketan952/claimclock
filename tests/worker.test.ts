import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { app } from '../worker/app.ts';
import { provider, quota, redact, validateReport } from '../worker/security.ts';
import type { Database, Statement, Bindings } from '../worker/types.ts';

const migration = readFileSync(new NodeURL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
const maintenance = readFileSync(new NodeURL('../worker/aggregate.sql', import.meta.url), 'utf8');
class SqliteDB implements Database {
  sql = new DatabaseSync(':memory:');
  constructor() { this.sql.exec(migration); }
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
const report = () => ({ insurer: 'star-health', tpa: null, city: 'नई दिल्ली', request_type: 'discharge',
  submitted_at: new Date(Date.now() - 5 * 3600000).toISOString(), decided_at: new Date(Date.now() - 3600000).toISOString(),
  outcome: 'approved', consent_version: '2026-10-10', consent: true, adult: true });
async function request(path: string, method = 'GET', body?: unknown, env: Bindings = {}, headers: Record<string, string> = {}) {
  return app.request(`${origin}${path}`, { method, headers: { origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env);
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
test('report requires adult consent, known identifiers, a city without numbers and no extra fields', async () => {
  for (const patch of [{ adult: false }, { consent: false }, { consent_version: 'old' }, { insurer: 'invented' }, { tpa: 'invented' }, { city: 'Room 123' }, { hospital: 'Private data' }, { ip: '1.1.1.1' }, { city: 'a'.repeat(71) }]) {
    assert.equal((await request('/api/reports', 'POST', { ...report(), ...patch })).status, 400);
  }
  assert.equal(validateReport(report()).city, 'नई दिल्ली');
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
  assert.deepEqual(await (await request('/api/config')).json(), { ai_enabled: false, provider: null, model: null });
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
    assert.equal(options?.redirect, 'error');
    payload = JSON.parse(String(options?.body));
    return Response.json({ choices: [{ message: { content: '<think>private reasoning</think>Ask for the policy clause.', reasoning: 'never return this' } }] });
  };
  try {
    const db = new SqliteDB();
    const env = { DB: db, LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_API_KEY: 'example-not-a-secret', LLM_MODEL: 'openai/gpt-oss-120b', LLM_FREE_TIER_CONFIRMED: 'true' };
    const result = await request('/api/explain', 'POST', { lines: 'Name: Jane Doe\nEmail jane@example.com\nPhone 9876543210\nConsumables 400', consent: true }, env);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { explanation: 'Ask for the policy clause.', advisory_only: true });
    assert.equal(payload!.max_completion_tokens, 300);
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
