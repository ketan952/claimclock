import { app } from './app.ts';
import { aggregate } from './maintenance.ts';
import { purgeTransfers, scheduledTask } from './transfers.ts';
import type { Bindings } from './types.ts';
export default {
  fetch(request: Request, env: Bindings): Promise<Response> | Response {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS?.fetch(request) ?? new Response('Not found', { status: 404 });
    return app.fetch(request, env);
  },
  async scheduled(controller: { cron: string }, env: Bindings): Promise<void> {
    if (!env.DB) return;
    // Reject scheduled invocation on failure so platform job status shows failure;
    // do not log SQL exceptions or include any report data.
    try {
      const task = scheduledTask(controller.cron);
      if (task === 'aggregate') await aggregate(env.DB);
      else if (task === 'purge') await purgeTransfers(env.DB);
    } catch { throw new Error('Scheduled maintenance unavailable'); }
  },
};
