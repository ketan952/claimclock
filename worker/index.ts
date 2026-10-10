import { app } from './app.ts';
import { aggregate } from './maintenance.ts';
import type { Bindings } from './types.ts';
export default {
  fetch(request: Request, env: Bindings): Promise<Response> | Response {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS?.fetch(request) ?? new Response('Not found', { status: 404 });
    return app.fetch(request, env);
  },
  async scheduled(_controller: unknown, env: Bindings): Promise<void> {
    if (!env.DB) return;
    // Reject scheduled invocation on failure so platform job status shows failure;
    // do not log SQL exceptions or include any report data.
    try { await aggregate(env.DB); } catch { throw new Error('Scheduled maintenance unavailable'); }
  },
};
