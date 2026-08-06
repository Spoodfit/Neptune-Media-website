import base from './entry-v19.js';
import { StudioStore } from './store-v16.js';
import { adminAuth } from './portal-http-utils.js';
import { flushWorkflowOutbox } from './portal-workflow-routes-v5.js';
import { isSameOrigin, json, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-studio-smart-passage-notifications-20260806-v81';
const NOTIFICATION_CSS = '/studio/passage-notifications-v81.css?v=1';
const NOTIFICATION_JS = '/studio/passage-notifications-v81.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'POST' && url.pathname === '/api/admin/passage-update') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const response = await studio.fetch('https://store/portal/admin-passage-update-v81', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adminAuth(request), payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return withHeaders(secure(json(result, response.status)), url.pathname);

      const queued = Number(result.notificationPlan?.notificationsQueued || 0);
      const emailDelivery = queued > 0
        ? await flushWorkflowOutbox(env, request.url, studio)
        : { sent: 0, failed: 0, processed: 0 };
      return withHeaders(secure(json({ ...result, emailDelivery })), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }

    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectNotificationPreview(response);
    }

    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioSmartPassageNotifications: RELEASE,
    studioPassageNotificationMode: 'automatic-by-changed-field-v81',
    studioPassageNotificationRecipients: ['client', 'neptune-organizer', 'studio-supplier'],
    studioPassageNotificationPreview: 'visible-before-save-v81',
    studioPassageInternalEdits: 'no-email-when-no-party-is-concerned-v81',
  }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function injectNotificationPreview(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/passage-notifications-v81\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/passage-notifications-v81\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${NOTIFICATION_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${NOTIFICATION_JS}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('X-Neptune-Studio-Passage-Notifications', RELEASE);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients'
    || pathname === '/studio/clients/'
    || pathname === '/studio/clients.html';
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Studio-Passage-Notifications', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/api/admin')) {
    headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
