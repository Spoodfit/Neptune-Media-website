import { StudioStore as LegacyStore } from './store-v16.js';
import {
  applyResendWebhookEvent,
  listEmailHistory,
  syncProviderSnapshots,
  trackEmailAttempt,
} from './portal-email-tracking-v82.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const body = method === 'POST' ? await request.clone().json().catch(() => ({})) : {};

    try {
      if (method === 'POST' && url.pathname === '/portal/email-track-sent-v82') {
        return trackEmailAttempt(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/email-history-v82') {
        return listEmailHistory(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/resend-event-v82') {
        return applyResendWebhookEvent(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/email-provider-sync-v82') {
        return syncProviderSnapshots(this, body);
      }
    } catch (error) {
      console.error('portal_email_activity_v82_failed', {
        path: url.pathname,
        name: String(error?.name || 'Error').slice(0, 120),
        message: String(error?.message || error || 'unknown').slice(0, 500),
      });
      return json({ error: 'email_activity_failed' }, 500);
    }

    return super.fetch(request);
  }
}
