import base from './entry-v11.js';
import { StudioStore } from './store-v8.js';
import { handleEditorialRoute } from './portal-editorial-routes-v2.js';

export { StudioStore };

const RELEASE = 'neptune-editorial-workspace-20260730-v2';
const EDITORIAL_CSS = '/assets/neptune-editorial-workspace-v59.css?v=1';
const EDITORIAL_JS = '/assets/neptune-editorial-workspace-v59.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    const editorial = await handleEditorialRoute(request, env, studio);
    if (editorial) return withHeaders(editorial);

    const response = await base.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      return withHeaders(await augmentRelease(response));
    }
    if (request.method === 'GET' && response.ok && isEditorialPage(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      return withHeaders(await injectEditorialWorkspace(response));
    }
    return withHeaders(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    editorialWorkspace: RELEASE,
    editorialPrompt: 'neptune-social-v2-burger-king-mechanics-and-linkedin-marketing-rhythm',
    editorialProposals: 3,
    editorialSelection: 'per-content-and-per-occurrence',
    editorialActions: 'select-edit-save-copy-download-publish-express-reuse',
    editorialStorage: 'single-draft-upsert-no-write-on-navigation',
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function injectEditorialWorkspace(response) {
  let body = await response.text();
  if (!body.includes('/assets/neptune-editorial-workspace-v59.css')) {
    body = body.replace('</head>', `<link rel="stylesheet" href="${EDITORIAL_CSS}"></head>`);
  }
  if (!body.includes('/assets/neptune-editorial-workspace-v59.js')) {
    body = body.replace('</body>', `<script type="module" src="${EDITORIAL_JS}"></script></body>`);
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isEditorialPage(pathname) {
  return pathname === '/espace-client/calendrier'
    || pathname.startsWith('/espace-client/calendrier/')
    || pathname === '/espace-client/videos'
    || pathname.startsWith('/espace-client/videos/');
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Editorial-Release', RELEASE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
