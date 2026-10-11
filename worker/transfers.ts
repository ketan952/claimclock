import type { Database } from './types.ts';
import { exactKeys, InputError, sha256 } from './security.ts';

export const TRANSFER_BODY_LIMIT = 90 * 1024;
export const TRANSFER_ENVELOPE_LIMIT = 65536;
export const TRANSFER_TTL_SECONDS = 7 * 86400;
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function validateCiphertext(body: Record<string, unknown>): string {
  const value = body.ciphertext;
  if (!exactKeys(body, ['ciphertext']) || typeof value !== 'string' || value.length > Math.ceil(TRANSFER_ENVELOPE_LIMIT * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new InputError();
  let binary: string;
  try { binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')); } catch { throw new InputError(); }
  // Version 1: one version byte, 12-byte IV, encrypted bytes and 16-byte GCM tag.
  // The server never receives the key and cannot authenticate or interpret this.
  if (binary.length < 30 || binary.length > TRANSFER_ENVELOPE_LIMIT || binary.charCodeAt(0) !== 1 || btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== value) throw new InputError();
  return value;
}
export function validateTransferCode(body: Record<string, unknown>): string {
  if (!exactKeys(body, ['code']) || typeof body.code !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{8}$/.test(body.code)) throw new InputError();
  return body.code;
}
export async function createTransfer(db: Database, ciphertext: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + TRANSFER_TTL_SECONDS;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = [...crypto.getRandomValues(new Uint8Array(8))].map(byte => alphabet[byte & 31]).join('');
    const saved = await db.prepare('INSERT INTO transfers(code_hash,ciphertext,expires_at,attempts) VALUES(?,?,?,0) ON CONFLICT(code_hash) DO NOTHING RETURNING code_hash')
      .bind(await sha256(code), ciphertext, expires).first();
    if (saved) return { code, expires_at: new Date(expires * 1000).toISOString() };
  }
  throw new Error('Transfer unavailable');
}
export async function lookupTransfer(db: Database, code: string, now = Date.now()) {
  // UPDATE is the sole access gate. The migration's AFTER UPDATE trigger deletes
  // the third lookup atomically; RETURNING still carries that lookup's payload.
  const result = await db.prepare('UPDATE transfers SET attempts=attempts+1 WHERE code_hash=? AND attempts<3 AND expires_at>? RETURNING ciphertext,expires_at,attempts')
    .bind(await sha256(code), Math.floor(now / 1000)).first<{ ciphertext: string; expires_at: number; attempts: number }>();
  return result ? { ciphertext: result.ciphertext, expires_at: new Date(result.expires_at * 1000).toISOString(), attempts_remaining: 3 - result.attempts } : null;
}
export async function purgeTransfers(db: Database, now = Date.now()) {
  await db.prepare('DELETE FROM transfers WHERE expires_at<=?').bind(Math.floor(now / 1000)).run();
}
export function scheduledTask(cron: string): 'aggregate' | 'purge' | null {
  return cron === '17 2 * * *' ? 'aggregate' : cron === '43 * * * *' ? 'purge' : null;
}
