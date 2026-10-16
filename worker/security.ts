import contacts from '../data/contacts.json' with { type: 'json' };
import type { Database, Bindings } from './types.ts';

export const insurerIds = new Set(contacts.filter(c => c.kind === 'insurer').map(c => c.id));
export const tpaIds = new Set(contacts.filter(c => c.kind === 'tpa').map(c => c.id));
export const eventNames = ['session_started', 'clock_lock_copied', 'escalation_copied', 'delay_charge_generated', 'opt_in_submitted'] as const;
export const requestTypes = ['preauth', 'enhancement', 'discharge'] as const;
export const outcomes = ['approved', 'partial', 'rejected', 'paid-and-left'] as const;
export const CONSENT_VERSION = '2026-10-10';
export const BODY_LIMIT = 4096;
export type ReportInputField = 'report' | 'insurer' | 'tpa' | 'city' | 'request_type' | 'submitted_at' | 'decided_at' | 'outcome' | 'consent' | 'adult' | 'consent_version';

export class InputError extends Error {
  status: 400 | 413 | 415;
  field?: ReportInputField;
  constructor(status: 400 | 413 | 415 = 400, field?: ReportInputField) { super('Invalid request.'); this.status = status; this.field = field; }
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(k => keys.includes(k));
}
export async function readJson(request: Request, limit = BODY_LIMIT): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw new InputError(415);
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new InputError(413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new InputError(413); }
    chunks.push(part.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { body.set(part, offset); offset += part.byteLength; }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body));
    if (!record(parsed)) throw new InputError();
    return parsed;
  } catch { throw new InputError(); }
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  if (origin) return origin === new URL(request.url).origin;
  return request.method === 'GET' && site === 'same-origin';
}
function timestamp(value: unknown, now: number): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms > now || ms < now - 365 * 86400000) return null;
  const canonical = new Date(ms).toISOString();
  if (canonical.slice(0, 19) !== value.slice(0, 19)) return null;
  return canonical;
}
export function validateReport(value: Record<string, unknown>, now = Date.now()) {
  if (!exactKeys(value, ['insurer', 'tpa', 'city', 'request_type', 'submitted_at', 'decided_at', 'outcome', 'consent_version', 'consent', 'adult'])) throw new InputError(400, 'report');
  if (value.consent !== true) throw new InputError(400, 'consent');
  if (value.adult !== true) throw new InputError(400, 'adult');
  if (value.consent_version !== CONSENT_VERSION) throw new InputError(400, 'consent_version');
  if (typeof value.insurer !== 'string' || !insurerIds.has(value.insurer)) throw new InputError(400, 'insurer');
  if (value.tpa !== undefined && value.tpa !== null && (typeof value.tpa !== 'string' || !tpaIds.has(value.tpa))) throw new InputError(400, 'tpa');
  if (value.city !== undefined && value.city !== null && typeof value.city !== 'string') throw new InputError(400, 'city');
  const city = typeof value.city === 'string' ? value.city.normalize('NFC').trim().replace(/ +/g, ' ') || null : null;
  if (city !== null && ([...city].length > 70 || !/^[\p{L}\p{M} -]+$/u.test(city) || !/\p{L}/u.test(city))) throw new InputError(400, 'city');
  if (!requestTypes.includes(value.request_type as typeof requestTypes[number])) throw new InputError(400, 'request_type');
  if (!outcomes.includes(value.outcome as typeof outcomes[number])) throw new InputError(400, 'outcome');
  const submitted = timestamp(value.submitted_at, now), decided = timestamp(value.decided_at, now);
  if (!submitted) throw new InputError(400, 'submitted_at');
  if (!decided || decided < submitted) throw new InputError(400, 'decided_at');
  return { insurer: value.insurer, tpa: (value.tpa as string | null | undefined) ?? null, city,
    request_type: value.request_type as typeof requestTypes[number], submitted_at: submitted, decided_at: decided,
    outcome: value.outcome as typeof outcomes[number], consent_version: CONSENT_VERSION };
}
export async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function eraseToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const budgets = { explain: [100, 3], reports: [100, 5], events: [200, 10], aggregates: [500, 30], erase: [100, 10], transfer_create: [100, 3], transfer_lookup: [500, 10],
  // M20 accounts: registration is the only unauthenticated write that creates rows; reads are cookie-gated.
  auth_register: [200, 5], auth_login: [1000, 20], auth_session: [10000, 200], vault_read: [5000, 100], vault_write: [2000, 30], account_erase: [100, 5],
  // M22 voice: the free speech tier allows 20 requests/minute and 2,000/day; the chat tier 30/minute, 1,000/day and 8,000 tokens/minute,
  // so the copilot (≈2,000 tokens per call) is held to four calls a minute and explain + copilot together stay under the daily request cap.
  voice_transcribe: [300, 10], copilot: [150, 4] } as const;
export async function quota(db: Database, action: keyof typeof budgets, now = Date.now()): Promise<boolean> {
  const day = new Date(now).toISOString().slice(0, 10), minute = Math.floor(now / 60000);
  const expiry = Math.floor(now / 1000) + 86400;
  // Conditional UPSERT RETURNING is atomic. Denied attempts cannot increment past cap.
  // A denied minute may consume one daily permit, a deliberately conservative tradeoff.
  const sql = 'INSERT INTO quotas(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count';
  const dayResult = await db.prepare(sql).bind(`${action}:day:${day}`, expiry, budgets[action][0]).first<{ count: number }>();
  if (!dayResult) return false;
  const minuteResult = await db.prepare(sql).bind(`${action}:minute:${minute}`, expiry, budgets[action][1]).first<{ count: number }>();
  return minuteResult !== null;
}
export function redact(text: string): string {
  return text
    .replace(/^\s*(?:patient\s*name|name|insured|policy(?:holder|\s*(?:no\.?|number))?|member\s*id|claim\s*(?:id|number)|uhid|address|dob|date of birth)\s*[:#=-].*$/gim, '[identifier removed]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[identifier removed]')
    .replace(/(?:\+?91[ -]?)?\b[6-9]\d{9}\b/g, '[phone removed]')
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[identifier removed]')
    .replace(/\b(?:UHID|(?:POLICY|CLAIM|MEMBER)[ -]?(?:ID|NO\.?|NUMBER))\s*[:#=-]?\s*[A-Z0-9/-]{5,}\b/gi, '[identifier removed]');
}
export function provider(env: Bindings): { endpoint: string; model: string; key: string } | null {
  if (env.LLM_FREE_TIER_CONFIRMED !== 'true' || !env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) return null;
  try {
    const url = new URL(env.LLM_BASE_URL);
    const allowed: Record<string, string> = { 'api.groq.com': '/openai/v1', 'api.cerebras.ai': '/v1', 'openrouter.ai': '/api/v1' };
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || allowed[url.hostname] !== url.pathname.replace(/\/$/, '')) return null;
    if (env.LLM_MODEL.length > 100 || !/^[a-zA-Z0-9._:/-]+$/.test(env.LLM_MODEL)) return null;
    if (url.hostname === 'openrouter.ai' && !env.LLM_MODEL.endsWith(':free')) return null;
    // Groq/Cerebras free-account eligibility is an operator prerequisite. Never switch model/provider on failure.
    return { endpoint: `${url.origin}${allowed[url.hostname]}/chat/completions`, model: env.LLM_MODEL, key: env.LLM_API_KEY };
  } catch { return null; }
}
