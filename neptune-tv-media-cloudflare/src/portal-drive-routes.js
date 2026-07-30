import { json, timingSafeEqual } from './security.js';
import { sendDriveDelivery } from './portal-drive-email.js';

const DRIVE_PATHS = new Set([
  '/api/webhooks/drive/sync-plan',
  '/api/webhooks/drive/provisioned',
  '/api/webhooks/drive/files',
  '/api/webhooks/drive/delta',
]);
const MAX_DELTA_BATCHES = 80;
const MAX_SNAPSHOTS = 80;

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

  if (url.pathname === '/api/webhooks/drive/delta') {
    const batches = Array.isArray(payload.batches) ? payload.batches.slice(0, MAX_DELTA_BATCHES) : [];
    const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots.slice(0, MAX_SNAPSHOTS) : [];
    const removedIds = Array.isArray(payload.removedFileIds) ? payload.removedFileIds.slice(0, 250) : [];
    let removed = 0;

    if (removedIds.length) {
      const removalResponse = await callStore(studio, '/portal/drive-removed', { driveFileIds: removedIds });
      const removal = await removalResponse.json().catch(() => ({}));
      if (!removalResponse.ok) return json({ error: removal.error || 'drive_removal_failed', retryable: true }, 503);
      removed += Number(removal.removed || 0);
    }

    const results = [];
    const errors = [];
    for (const batch of batches) {
      const outcome = await processDrivePayload(env, request.url, studio, batch);
      if (outcome.ok) results.push(outcome);
      else errors.push(outcome);
    }

    const pruned = [];
    if (!errors.length) {
      for (const snapshot of snapshots) {
        const pruneResponse = await callStore(studio, '/portal/drive-prune', {
          orderId: snapshot?.orderId,
          currentDriveFileIds: snapshot?.currentDriveFileIds,
        });
        const prune = await pruneResponse.json().catch(() => ({}));
        if (!pruneResponse.ok) {
          errors.push({ orderId: snapshot?.orderId || '', error: prune.error || 'drive_prune_failed', status: pruneResponse.status });
          continue;
        }
        removed += Number(prune.removed || 0);
        pruned.push({ orderId: prune.orderId, known: prune.known, current: prune.current, removed: prune.removed });
      }
    }

    const summary = {
      ok: errors.length === 0,
      processed: results.length,
      snapshots: pruned.length,
      failed: errors.length,
      accepted: results.reduce((sum, item) => sum + Number(item.accepted || 0), 0),
      changed: results.reduce((sum, item) => sum + Number(item.changed || 0), 0),
      removed,
      emailsSent: results.filter((item) => item.emailSent).length,
      orders: results.map((item) => ({
        orderId: item.orderId,
        accepted: item.accepted,
        changed: item.changed,
        emailSent: Boolean(item.emailSent),
      })),
      pruned,
      errors: errors.map((item) => ({ orderId: item.orderId || null, error: item.error, status: item.status })),
    };
    return json(summary, errors.length ? 503 : 200);
  }

  const outcome = await processDrivePayload(env, request.url, studio, payload);
  return json(outcome.body, outcome.status);
}

async function processDrivePayload(env, requestUrl, studio, payload) {
  const response = await callStore(studio, '/portal/drive-files', payload);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      orderId: result.orderId || payload?.orderId || '',
      error: result.error || 'drive_files_failed',
      body: result,
    };
  }

  const events = Array.isArray(result.pendingEvents) ? result.pendingEvents : [];
  if (!events.length) {
    const body = { ...result, emailSent: false, notificationSkipped: true };
    return { ok: true, status: 200, body, ...body };
  }

  const sent = await sendDriveDelivery(env, requestUrl, result);
  if (!sent.ok) {
    console.error('drive_delivery_email_failed', {
      orderId: result.orderId,
      error: sent.error || 'email_failed',
      eventCount: events.length,
    });
    const body = { error: 'drive_delivery_email_failed', orderId: result.orderId, retryable: true };
    return { ok: false, status: 503, orderId: result.orderId, error: body.error, body };
  }

  const markResponse = await callStore(studio, '/portal/drive-notified', {
    eventIds: events.map((item) => item.id),
    notifiedAt: new Date().toISOString(),
  });
  if (!markResponse.ok) {
    const markResult = await markResponse.json().catch(() => ({}));
    console.error('drive_delivery_mark_failed', { orderId: result.orderId, error: markResult.error || markResponse.status });
    const body = { ...result, emailSent: true, emailId: sent.id || null, notificationMarkWarning: true };
    return { ok: true, status: 200, body, ...body };
  }

  const body = { ...result, emailSent: true, emailId: sent.id || null, notifiedEvents: events.length };
  return { ok: true, status: 200, body, ...body };
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
