import { StudioStore as LegacyStore } from './store-v24.js';
import { simpleJourneyActionV92, simpleJourneyContextV92 } from './portal-simple-journey-v92.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'POST' && url.pathname === '/portal/simple-journey-context-v92') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await simpleJourneyContextV92(this, body);
      } catch (error) {
        console.error('simple_journey_context_v92_failed', safeError(error));
        return json({ error: 'simple_journey_context_failed' }, 500);
      }
    }
    if (method === 'POST' && url.pathname === '/portal/simple-journey-action-v92') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await simpleJourneyActionV92(this, body);
      } catch (error) {
        console.error('simple_journey_action_v92_failed', safeError(error));
        return json({ error: 'simple_journey_action_failed' }, 500);
      }
    }
    return super.fetch(request);
  }
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 120),
    message: String(error?.message || error || 'unknown').slice(0, 500),
  };
}
