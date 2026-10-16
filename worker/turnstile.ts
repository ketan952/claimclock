import type { Bindings } from './types.ts';
import { record } from './security.ts';

export type TurnstileAction = 'reports' | 'explain' | 'transfer_create' | 'transfer_lookup' | 'auth_register' | 'voice' | 'copilot';
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export function turnstileConfig(env: Bindings) {
  const secret = env.TURNSTILE_SECRET_KEY?.trim(), sitekey = env.TURNSTILE_SITE_KEY?.trim();
  const hostname = env.TURNSTILE_HOSTNAME ?? 'claimclock.ketan952.workers.dev';
  if (!secret || !sitekey || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)) return null;
  return { secret, sitekey, hostname };
}
// Siteverify enforces its five-minute, single-use token lifetime. Never cache a
// successful result, forward an IP, log a token, or accept the request Host.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
export async function verifyTurnstile(request: Request, env: Bindings, action: TurnstileAction): Promise<403 | 503 | null> {
  const config = turnstileConfig(env);
  if (!config) return 503;
  const token = request.headers.get('X-Turnstile-Token');
  if (!token || token.length > 2048 || !/^[\x21-\x7e]+$/.test(token)) return 403;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: config.secret, response: token }),
    });
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 4096) return 503;
    const reader = response.body?.getReader();
    if (!reader) return 503;
    let length = 0, text = '';
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > 4096) { await reader.cancel(); return 503; }
      text += decoder.decode(part.value, { stream: true });
    }
    const result: unknown = JSON.parse(text + decoder.decode());
    if (!record(result) || typeof result.success !== 'boolean') return 503;
    if (!result.success) {
      const errors = result['error-codes'];
      return Array.isArray(errors) && errors.some(code => ['internal-error', 'missing-input-secret', 'invalid-input-secret'].includes(code)) ? 503 : 403;
    }
    return result.hostname === config.hostname && result.action === action ? null : 403;
  } catch { return 503; }
}
