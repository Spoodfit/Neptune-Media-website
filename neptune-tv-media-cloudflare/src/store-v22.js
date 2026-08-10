import { StudioStore as LegacyStore } from './store-v21.js';
import { json } from './security.js';
import {
  applyFilmingPreferenceV86,
  clientActionContextV86,
  createCrmOpportunityV86,
  crmSnapshotV86,
  markCrmActionSentV86,
  prepareCrmActionV86,
  submitClientActionV86,
} from './portal-crm-v86.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const routes = {
      '/portal/crm-snapshot-v86': crmSnapshotV86,
      '/portal/crm-opportunity-v86': createCrmOpportunityV86,
      '/portal/crm-action-prepare-v86': prepareCrmActionV86,
      '/portal/crm-action-sent-v86': markCrmActionSentV86,
      '/portal/crm-client-action-context-v86': clientActionContextV86,
      '/portal/crm-client-action-submit-v86': submitClientActionV86,
      '/portal/crm-filming-preference-apply-v86': applyFilmingPreferenceV86,
    };
    const handler = routes[url.pathname];
    if (method === 'POST' && handler) {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await handler(this, body);
      } catch (error) {
        console.error('crm_v86_route_failed', url.pathname, safeError(error));
        return json({ error: 'crm_v86_failed' }, 500);
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
