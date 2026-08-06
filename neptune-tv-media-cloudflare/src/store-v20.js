import { StudioStore as LegacyStore } from './store-v17.js';
import { notificationPolicyState, smartWorkflowEmailDue } from './portal-notification-governor-v84.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const body = method === 'POST' ? await request.clone().json().catch(() => ({})) : {};

    try {
      if (method === 'POST' && url.pathname === '/portal/workflow-email-due') {
        return smartWorkflowEmailDue(this);
      }
      if (method === 'POST' && url.pathname === '/portal/notification-policy-state-v84') {
        return notificationPolicyState(this, body);
      }
    } catch (error) {
      console.error('portal_notification_governor_v84_failed', {
        path: url.pathname,
        name: String(error?.name || 'Error').slice(0, 120),
        message: String(error?.message || error || 'unknown').slice(0, 500),
      });
      return json({ error: 'notification_governor_failed' }, 500);
    }

    return super.fetch(request);
  }
}
