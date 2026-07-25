import { json, timingSafeEqual } from './security.js';
import { sendDriveDelivery } from './portal-drive-email.js';

const DRIVE_PATHS = new Set([
  '/api/webhooks/drive/sync-plan',
  '/api/webhooks/drive/provisioned',
  '/api/webhooks/drive/files',
]);

export async function handleDriveRoute(request, env, studio) {
  const url = new URL(request.url);
  if (!DRIVE_PATHS.has(url.pathname)) return null;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  if (!authorizedDriveWebhook(request, env)) return json({ error: 'unauthorized' }, 401);

  if (url.pathname === '/api/webhooks/drive/sync-plan') {
    return callStore(studio, '/portal/drive-sync-plan', {});
  }

  const payload = await request.json().catch(() => ({}));
  if (url.pathname === '/api/webhooks/drive/provisioned') {
    return callStore(studio, '/portal/drive-provisioned', payload);
  }

  const response = await callStore(studio, '/portal/drive-files', payload);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return json(result, response.status);
  const events = Array.isArray(result.pendingEvents) ? result.pendingEvents : [];
  if (!events.length) return json({ ...result, emailSent: false, notificationSkipped: true });

  const sent = await sendDriveDelivery(env, request.url, result);
  if (!sent.ok) {
    console.error('drive_delivery_email_failed', {
      orderId: result.orderId,
      error: sent.error || 'email_failed',
      eventCount: events.length,
    });
    return json({ error: 'drive_delivery_email_failed', orderId: result.orderId, retryable: true }, 503);
  }

  const markResponse = await callStore(studio, '/portal/drive-notified', {
    eventIds: events.map((item) => item.id),
    notifiedAt: new Date().toISOString(),
  });
  if (!markResponse.ok) {
    const markResult = await markResponse.json().catch(() => ({}));
    console.error('drive_delivery_mark_failed', { orderId: result.orderId, error: markResult.error || markResponse.status });
    return json({ ...result, emailSent: true, emailId: sent.id || null, notificationMarkWarning: true });
  }
  return json({ ...result, emailSent: true, emailId: sent.id || null, notifiedEvents: events.length });
}

function authorizedDriveWebhook(request, env) {
  const supplied = request.headers.get('X-Neptune-Drive-Secret') || request.headers.get('X-Neptune-Webhook-Secret') || '';
  return Boolean(env.DRIVE_WEBHOOK_SECRET) && timingSafeEqual(supplied, env.DRIVE_WEBHOOK_SECRET);
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}
