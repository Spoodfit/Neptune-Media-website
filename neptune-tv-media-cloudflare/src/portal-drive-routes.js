import { json, timingSafeEqual } from './security.js';
import { sendDriveDelivery } from './portal-drive-email.js';

const DRIVE_PATHS = new Set([
  '/api/webhooks/drive/sync-plan',
  '/api/webhooks/drive/provisioned',
  '/api/webhooks/drive/files',
  '/api/webhooks/drive/delta',
]);
const STALE_DRIVE_ERRORS = new Set([
  'drive_passage_not_provisioned',
  'order_not_found',
  'not-found',
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
    const stale = [];
    const errors = [];
    for (const batch of batches) {
      const outcome = await processDrivePayload(env, request.url, studio, batch);
      if (outcome.stale) stale.push(outcome);
      else if (outcome.ok) results.push(outcome);
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
          const orderId = prune.orderId || snapshot?.orderId || '';
          const error = prune.error || 'drive_prune_failed';
          if (isStaleDriveResponse(pruneResponse.status, error)) {
            stale.push(staleOutcome(orderId, error));
            continue;
          }
          errors.push({ orderId, error, status: pruneResponse.status });
          continue;
        }
        removed += Number(prune.removed || 0);
        pruned.push({ orderId: prune.orderId, known: prune.known, current: prune.current, removed: prune.removed });
      }
    }

    const staleOrders = uniqueStaleOrders(stale);
    const summary = {
      ok: errors.length === 0,
      processed: results.length,
      snapshots: pruned.length,
      skippedStale: staleOrders.length,
      failed: errors.length,
      accepted: results.reduce((sum, item) => sum + Number(item.accepted || 0), 0),
      changed: results.reduce((sum, item) => sum + Number(item.changed || 0), 0),
      removed,
      emailsSent: results.filter((item) => item.emailSent).length,
      emailsPending: results.filter((item) => item.emailPending).length,
      orders: results.map((item) => ({
        orderId: item.orderId,
        accepted: item.accepted,
        changed: item.changed,
        emailSent: Boolean(item.emailSent),
        emailPending: Boolean(item.emailPending),
        emailWarning: item.emailWarning || null,
      })),
      staleOrders,
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
    const orderId = result.orderId || payload?.orderId || '';
    const error = result.error || 'drive_files_failed';
    if (isStaleDriveResponse(response.status, error)) {
      console.warn('drive_stale_mapping_skipped', { orderId, error, status: response.status });
      return staleOutcome(orderId, error);
    }
    return {
      ok: false,
      status: response.status,
      orderId,
      error,
      body: result,
    };
  }

  const events = Array.isArray(result.pendingEvents) ? result.pendingEvents : [];
  if (!events.length) {
    const body = { ...result, emailSent: false, emailPending: false, notificationSkipped: true };
    return { ok: true, status: 200, body, ...body };
  }

  const sent = await sendDriveDelivery(env, requestUrl, result);
  if (!sent.ok) {
    const emailWarning = {
      code: sent.error || 'email_failed',
      providerStatus: Number(sent.providerStatus || 0),
      providerCode: sent.providerCode || '',
      providerMessage: sent.providerMessage || '',
    };
    console.error('drive_delivery_email_pending', {
      orderId: result.orderId,
      eventCount: events.length,
      ...emailWarning,
    });
    const body = {
      ...result,
      emailSent: false,
      emailPending: true,
      notificationPending: true,
      notificationWarning: 'drive_delivery_email_failed',
      emailWarning,
    };
    return { ok: true, status: 200, body, ...body };
  }

  const markResponse = await callStore(studio, '/portal/drive-notified', {
    eventIds: events.map((item) => item.id),
    notifiedAt: new Date().toISOString(),
  });
  if (!markResponse.ok) {
    const markResult = await markResponse.json().catch(() => ({}));
    console.error('drive_delivery_mark_failed', { orderId: result.orderId, error: markResult.error || markResponse.status });
    const body = { ...result, emailSent: true, emailPending: false, emailId: sent.id || null, notificationMarkWarning: true };
    return { ok: true, status: 200, body, ...body };
  }

  const body = { ...result, emailSent: true, emailPending: false, emailId: sent.id || null, notifiedEvents: events.length };
  return { ok: true, status: 200, body, ...body };
}

function staleOutcome(orderId, error) {
  const body = {
    ok: true,
    orderId: String(orderId || ''),
    accepted: 0,
    changed: 0,
    staleMapping: true,
    skipped: true,
    reason: String(error || 'drive_passage_not_provisioned'),
    emailSent: false,
    emailPending: false,
  };
  return { ok: true, stale: true, status: 200, body, ...body };
}

function isStaleDriveResponse(status, error) {
  return Number(status) === 404 && STALE_DRIVE_ERRORS.has(String(error || ''));
}

function uniqueStaleOrders(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const orderId = String(item.orderId || '');
    const reason = String(item.reason || item.error || 'drive_passage_not_provisioned');
    const key = `${orderId}:${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ orderId: orderId || null, reason });
  }
  return output;
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
