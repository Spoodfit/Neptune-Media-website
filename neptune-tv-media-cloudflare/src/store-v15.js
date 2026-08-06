import { StudioStore as LegacyStore } from './store-v14.js';
import { adminPassageUpdate } from './portal-passage-admin-v80.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'POST' && url.pathname === '/portal/admin-passage-update') {
      const body = await request.clone().json().catch(() => ({}));
      const validation = await super.fetch(new Request('https://store/portal/admin-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      if (!validation.ok) return validation;

      try {
        return adminPassageUpdate(this, body.payload || {});
      } catch (error) {
        console.error('portal_admin_passage_failed', {
          name: String(error?.name || 'Error').slice(0, 120),
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'passage_update_failed' }, 500);
      }
    }

    return super.fetch(request);
  }
}
