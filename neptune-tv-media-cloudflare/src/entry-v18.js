import base, { StudioStore } from './entry-v17.js';

export { StudioStore };

const RELEASE = 'neptune-client-dashboard-clean-20260805-v78';
const CLIENT_DASHBOARD_CSS = '/espace-client/client-dashboard-clean-v78.css?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let response = await base.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }

    if (request.method === 'GET' && response.ok && isClientDashboardPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectClientDashboardCleanup(response);
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
    clientDashboardCleanup: RELEASE,
    clientDashboardFirstViewport: 'quick-actions-visible-without-duplicate-summary-v78',
    clientPreparationTheme: 'light-editorial-cards-and-dialog-v78',
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function injectClientDashboardCleanup(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/espace-client\/client-dashboard-clean-v78\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${CLIENT_DASHBOARD_CSS}"></head>`);

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('X-Neptune-Client-Dashboard', RELEASE);

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

function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Client-Dashboard', RELEASE);
  if (pathname.startsWith('/espace-client')) headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
