import { StudioStore as LegacyStore } from './store-v22.js';
import { json } from './security.js';

const RECIPIENT_COOLDOWN_MS = 45 * 60 * 1000;

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method.toUpperCase() === 'POST' && url.pathname === '/portal/crm-action-prepare-v86') {
      const response = await super.fetch(request);
      if (!response.ok) return response;
      const prepared = await response.json().catch(() => ({}));
      if (prepared.suppressed || !prepared.client?.id || prepared.action === 'none') return json(prepared);
      const since = new Date(Date.now() - RECIPIENT_COOLDOWN_MS).toISOString();
      const recent = this.sql.exec(`
        SELECT action,sent_at AS sentAt FROM portal_crm_messages_v86
        WHERE client_id=? AND sent_at>=? ORDER BY sent_at DESC LIMIT 1
      `, prepared.client.id, since).toArray()[0];
      if (recent) {
        return json({
          ...prepared,
          suppressed: true,
          reason: 'recipient_cooldown',
          previousAction: recent.action,
          sentAt: recent.sentAt,
        });
      }
      return json(prepared);
    }
    return super.fetch(request);
  }
}
