import { StudioStore as LegacyStore } from './store-v15.js';
import { adminPassageUpdateV81 } from './portal-passage-admin-v81.js';
import { requireOperator } from './workflow-db-v5.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'POST' && url.pathname === '/portal/admin-passage-update-v81') {
      const body = await request.clone().json().catch(() => ({}));
      const access = await requireOperator(this, body);
      if (!access.ok) return access.response;

      try {
        return adminPassageUpdateV81(this, body.payload || {}, access.actor);
      } catch (error) {
        console.error('portal_admin_passage_v81_failed', {
          name: String(error?.name || 'Error').slice(0, 120),
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'passage_update_failed' }, 500);
      }
    }

    return super.fetch(request);
  }
}
