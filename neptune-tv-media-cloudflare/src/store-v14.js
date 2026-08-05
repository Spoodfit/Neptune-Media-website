import { StudioStore as LegacyStore } from './store-v13.js';
import { managePortalClient } from './portal-client-management-v76.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'POST' && url.pathname === '/portal/admin-client-manage') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await managePortalClient(this, body);
      } catch (error) {
        console.error('portal_client_management_failed', {
          name: String(error?.name || 'Error').slice(0, 120),
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'client_management_failed' }, 500);
      }
    }

    if (method === 'POST' && url.pathname === '/portal/admin-list') {
      const response = await super.fetch(request);
      if (!response.ok) return response;
      const result = await response.json().catch(() => ({}));
      const activeClientIds = new Set(
        (result.clients || []).filter((client) => client.active !== false).map((client) => client.id),
      );
      return json({
        ...result,
        orders: (result.orders || []).filter((order) => activeClientIds.has(order.clientId)),
        archivedClients: (result.clients || []).filter((client) => client.active === false).length,
      });
    }

    return super.fetch(request);
  }
}
