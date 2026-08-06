import base from './entry-v21.js';
import { StudioStore } from './store-v20.js';

export { StudioStore };

const RELEASE = 'neptune-smart-email-governor-20260806-v84';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      const current = await response.json().catch(() => ({}));
      response = new Response(JSON.stringify({
        ...current,
        studioSmartEmailGovernor: RELEASE,
        testClientEmailProtection: 'supplier-emails-rerouted-to-contact-neptunebusiness-com-v84',
        notificationCadence: 'one-useful-email-per-recipient-context-every-45-minutes-v84',
        notificationDecisionMode: 'state-aware-priority-and-stale-message-supersession-v84',
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const headers = new Headers(response.headers);
    headers.set('X-Neptune-Smart-Email-Governor', RELEASE);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};
