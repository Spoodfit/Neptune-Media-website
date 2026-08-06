import base from './entry-v21.js';
import { StudioStore } from './store-v18.js';
import { adminAuth, clientToken } from './portal-http-utils.js';
import { flushWorkflowOutbox } from './portal-workflow-routes-v5.js';
import { isSameOrigin, json, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-change-requests-20260806-v83';
const CLIENT_CSS = '/espace-client/change-requests-v83.css?v=1';
const CLIENT_JS = '/espace-client/change-requests-v83.js?v=1';
const STUDIO_CSS = '/studio/change-requests-v83.css?v=1';
const STUDIO_JS = '/studio/change-requests-v83.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'GET' && url.pathname === '/api/client/change-requests') {
      return withHeaders(secure(await callStore(studio, '/portal/change-client-state-v83', {
        token: clientToken(request),
      })), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/client/change-requests') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const response = await callStore(studio, '/portal/change-client-submit-v83', {
        token: clientToken(request),
        payload,
      });
      return withHeaders(await flushMutation(response, env, request.url, studio), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/client/change-response') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const response = await callStore(studio, '/portal/change-client-respond-v83', {
        token: clientToken(request),
        payload,
      });
      return withHeaders(await flushMutation(response, env, request.url, studio), url.pathname);
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/change-requests') {
      return withHeaders(secure(await callStore(studio, '/portal/change-admin-state-v83', {
        ...adminAuth(request),
        payload: { orderId: url.searchParams.get('orderId') || '' },
      })), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/change-requests/action') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const response = await callStore(studio, '/portal/change-admin-action-v83', {
        ...adminAuth(request),
        payload,
      });
      return withHeaders(await flushMutation(response, env, request.url, studio), url.pathname);
    }

    if (request.method === 'GET' && url.pathname === '/api/change-request/supplier') {
      return withHeaders(secure(await callStore(studio, '/portal/change-supplier-context-v83', {
        token: url.searchParams.get('token') || '',
      })), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/change-request/supplier') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const response = await callStore(studio, '/portal/change-supplier-respond-v83', payload);
      return withHeaders(await flushMutation(response, env, request.url, studio), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }

    if (request.method === 'GET' && response.ok && isClientDashboardPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectAssets(response, [CLIENT_CSS], [CLIENT_JS], 'X-Neptune-Change-Requests', RELEASE);
    }

    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectAssets(response, [STUDIO_CSS], [STUDIO_JS], 'X-Neptune-Change-Requests', RELEASE);
    }

    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function flushMutation(response, env, requestUrl, studio) {
  const result = await response.clone().json().catch(() => ({}));
  if (!response.ok) return secure(json(result, response.status));
  const emailDelivery = Number(result.notificationsQueued || 0) > 0
    ? await flushWorkflowOutbox(env, requestUrl, studio)
    : { sent: 0, failed: 0, processed: 0, sentItems: [] };
  return secure(json({ ...result, emailDelivery }, response.status));
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioChangeRequests: RELEASE,
    filmingDateChangePolicy: 'client-request-only-at-least-15-days-before-current-filming-v83',
    filmingDateSupplierDecision: 'yes-or-propose-alternate-date-v83',
    preparationDateChangeFlow: 'client-and-neptune-only-v83',
    formatChangeFlow: 'client-request-neptune-approval-supplier-preparation-pack-v83',
    studioDecorCatalog: [
      'hors-norme-chaise-sombre',
      'hors-norme-canape-sombre',
      'concept-libre-plateau-clair',
      'concept-libre-chaise-clair',
      'concept-libre-canape-clair',
      'concept-libre-bar-clair',
      'concept-libre-sur-mesure',
    ],
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function injectAssets(response, styles, scripts, headerName, headerValue) {
  let body = await response.text();
  for (const href of styles) {
    const filename = href.split('?')[0].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    body = body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${filename}[^"']*["'][^>]*>\\s*`, 'giu'), '');
    body = body.replace('</head>', `<link rel="stylesheet" href="${href}"></head>`);
  }
  for (const src of scripts) {
    const filename = src.split('?')[0].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    body = body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${filename}[^"']*["'][^>]*>\\s*</script>\\s*`, 'giu'), '');
    body = body.replace('</body>', `<script type="module" src="${src}"></script></body>`);
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set(headerName, headerValue);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isClientDashboardPath(pathname) {
  return pathname === '/espace-client'
    || pathname === '/espace-client/'
    || pathname === '/espace-client/index.html';
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients'
    || pathname === '/studio/clients/'
    || pathname === '/studio/clients.html';
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Change-Requests', RELEASE);
  if (pathname.startsWith('/studio')
      || pathname.startsWith('/espace-client')
      || pathname.startsWith('/api/admin')
      || pathname.startsWith('/api/client')) {
    headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
