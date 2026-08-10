import base from './entry-v27.js';
import { StudioStore } from './store-v23.js';

export { StudioStore };

const RESERVATION_RELEASE = 'neptune-studio-reservation-flow-20260810-v87';
const RESERVATION_CSS = '/studio/reservation-flow-v87.css?v=1';
const RESERVATION_JS = '/studio/reservation-flow-v87.js?v=1';
const DOSSIER_RELEASE = 'neptune-studio-client-dossier-20260810-v89';
const DOSSIER_CSS = '/studio/client-dossier-v89.css?v=1';
const DOSSIER_JS = '/studio/client-dossier-v89.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let response = await base.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }

    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectStudioClientEnhancements(response);
    }

    const headers = new Headers(response.headers);
    headers.set('X-Neptune-Reservation-Flow', RESERVATION_RELEASE);
    headers.set('X-Neptune-Client-Dossier', DOSSIER_RELEASE);
    if (isStudioClientsPath(url.pathname)) headers.set('Cache-Control', 'private, no-store, max-age=0');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioReservationFlow: RESERVATION_RELEASE,
    studioReservationDialog: 'viewport-scroll-sticky-actions-responsive-v87',
    studioReservationPlanningGuard: 'payment-first-or-immediate-manual-planning-v87',
    studioClientDossier: DOSSIER_RELEASE,
    studioClientDossierShell: 'full-viewport-fixed-header-tabs-single-scroll-v89',
    studioClientDossierHierarchy: 'current-state-progress-facts-next-action-v89',
    studioClientDossierDeliveryGuard: 'frontend-inventory-mirrors-backend-final-plus-short-v89',
    studioClientDossierChronologyGuard: 'preparation-before-filming-visible-warning-v89',
    studioClientDossierSidebarGuard: 'legacy-hidden-navigation-auto-repair-v89',
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function injectStudioClientEnhancements(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/reservation-flow-v87\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/reservation-flow-v87\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/client-dossier-v8[89]\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/client-dossier-v8[89]\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${RESERVATION_CSS}"><link rel="stylesheet" href="${DOSSIER_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${RESERVATION_JS}"></script><script type="module" src="${DOSSIER_JS}"></script></body>`);
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
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
}
