import base from './entry-v16.js';
import { StudioStore } from './store-v14.js';
import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-studio-client-journey-20260811-v77.1';
const OPERATIONS_CSS = '/studio/studio-client-operations-v76.css?v=1';
const OPERATIONS_JS = '/studio/studio-client-operations-v76.js?v=1';
const GALLERY_CSS = '/studio/content-gallery-v76.css?v=1';
const GALLERY_JS = '/studio/content-gallery-v76.js?v=1';
const JOURNEY_CSS = '/studio/studio-journey-v77.css?v=1';
const JOURNEY_JS = '/studio/studio-journey-v77.js?v=1';
const CLIENT_PREPARATION_CSS = '/espace-client/client-preparation-v77.css?v=1';
const CLIENT_PREPARATION_JS = '/espace-client/client-preparation-v77.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'POST' && url.pathname === '/api/admin/client-manage') {
      return withHeaders(secure(await manageClient(request, env, studio)), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }
    if (request.method === 'GET' && response.ok && isStudioOperationsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectStudioOperations(response, isStudioClientsPath(url.pathname));
    } else if (request.method === 'GET' && response.ok && isClientPreparationPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectClientPreparation(response);
    }
    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function manageClient(request, env, studio) {
  if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
  const payload = await request.json().catch(() => ({}));
  const response = await studio.fetch('https://store/portal/admin-client-manage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...adminAuth(request), payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return json(result, response.status);

  let storageDeleted = 0;
  let storageDeleteFailed = 0;
  if (result.action === 'delete' && env.MEDIA && Array.isArray(result.storageKeys)) {
    for (let index = 0; index < result.storageKeys.length; index += 20) {
      const batch = result.storageKeys.slice(index, index + 20);
      const settled = await Promise.allSettled(batch.map((key) => env.MEDIA.delete(key)));
      storageDeleted += settled.filter((item) => item.status === 'fulfilled').length;
      storageDeleteFailed += settled.filter((item) => item.status === 'rejected').length;
    }
  }

  const { storageKeys, ...safeResult } = result;
  return json({
    ...safeResult,
    storageCleanup: result.action === 'delete'
      ? { deleted: storageDeleted, failed: storageDeleteFailed }
      : undefined,
  });
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioClientOperations: RELEASE,
    studioInformationArchitecture: 'four-primary-destinations-video-restored-v77.1',
    studioPrimaryNavigationCurrent: ['Parcours clients', 'Production vidéo', 'Diffusion', 'Réglages'],
    studioVideoProductionWorkspaceCurrent: 'active-local-engine-workspace-v77.1',
    studioLegacyV77Contract: {
      studioPrimaryNavigation: ['Parcours clients', 'Diffusion', 'Réglages'],
      studioVideoProductionWorkspace: 'removed-external-editing-drive-sync-only',
    },
    studioClientManagement: 'edit-archive-reactivate-confirmed-delete',
    studioClientDeletionPolicy: 'database-and-r2-deleted-google-drive-preserved',
    studioContentLibrary: 'equal-height-cards-compact-plus-upload-paginated-24-v77',
    studioCalendarReadability: 'responsive-scrollable-month-grid-v76',
    studioPreparationJourney: 'calendar-synced-link-or-one-click-booking-v77',
    supplierDateConfirmation: 'two-preselected-safe-email-actions-v77',
    clientHorsNormePreparation: 'ten-presenter-inspired-interactive-cards-v77',
    studioCanonicalVideoPath: '/studio/video-ai.html',
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function injectStudioOperations(response, includeGallery = false) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/content-gallery-v49\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/content-gallery-v49\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/content-gallery-v76\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/content-gallery-v76\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/studio-client-operations-v76\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/studio-client-operations-v76\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/studio-journey-v77\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/studio-journey-v77\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  const styles = includeGallery
    ? `<link rel="stylesheet" href="${GALLERY_CSS}"><link rel="stylesheet" href="${OPERATIONS_CSS}"><link rel="stylesheet" href="${JOURNEY_CSS}">`
    : `<link rel="stylesheet" href="${OPERATIONS_CSS}"><link rel="stylesheet" href="${JOURNEY_CSS}">`;
  const scripts = includeGallery
    ? `<script type="module" src="${GALLERY_JS}"></script><script type="module" src="${OPERATIONS_JS}"></script><script type="module" src="${JOURNEY_JS}"></script>`
    : `<script type="module" src="${OPERATIONS_JS}"></script><script type="module" src="${JOURNEY_JS}"></script>`;
  body = body.replace('</head>', `${styles}</head>`);
  body = body.replace('</body>', `${scripts}</body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function injectClientPreparation(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/espace-client\/client-preparation-v77\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/espace-client\/client-preparation-v77\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${CLIENT_PREPARATION_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${CLIENT_PREPARATION_JS}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients'
    || pathname === '/studio/clients/'
    || pathname === '/studio/clients.html';
}

function isStudioOperationsPath(pathname) {
  return isStudioClientsPath(pathname)
    || pathname === '/studio/advanced'
    || pathname === '/studio/advanced/'
    || pathname === '/studio/advanced.html';
}

function isClientPreparationPath(pathname) {
  return pathname === '/espace-client'
    || pathname === '/espace-client/'
    || pathname === '/espace-client/index.html';
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
  headers.set('X-Neptune-Studio-Operations', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/espace-client')) headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
