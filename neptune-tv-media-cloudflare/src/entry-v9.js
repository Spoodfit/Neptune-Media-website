import base from './entry-v8.js';
import { StudioStore } from './store-v5.js';

export { StudioStore };

const RELEASE_ID = 'neptune-visual-content-library-20260725-v17';
const RELEASE_PATH = '/api/public/release';
const ORDER_WEBHOOKS = new Set(['/api/webhooks/client-order', '/api/webhooks/conversion']);
const STUDIO_CANONICAL_PATH = '/studio/clients';
const LEGACY_STUDIO_PATHS = new Set([
  '/studio/index.html',
  '/studio/control',
  '/studio/control/',
  '/studio/control.html',
  '/studio/dashboard',
  '/studio/dashboard/',
  '/studio/dashboard.html',
]);
const RETIRED_STUDIO_ASSETS = new Set([
  '/studio/control-v37.js',
  '/studio/control-v36.css',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === RELEASE_PATH) {
      return releaseResponse(request, env);
    }

    if (request.method === 'GET' && RETIRED_STUDIO_ASSETS.has(url.pathname)) {
      return retiredStudioAssetResponse();
    }

    if (request.method === 'GET' && LEGACY_STUDIO_PATHS.has(url.pathname)) {
      return studioRedirect(url);
    }

    const tracked = request.method === 'POST' && ORDER_WEBHOOKS.has(url.pathname) ? request.clone() : null;
    const response = await base.fetch(request, env, ctx);
    if (tracked && response.ok) {
      ctx.waitUntil(linkProspectToOrder(tracked, response.clone(), env).catch((error) => {
        console.error('prospect_payment_link_failed', {
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
      }));
    }
    return withReleaseHeader(response);
  },
  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

function retiredStudioAssetResponse() {
  return withReleaseHeader(new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  }));
}

function studioRedirect(url) {
  const target = new URL(STUDIO_CANONICAL_PATH, url.origin);
  target.search = url.search;
  return withReleaseHeader(new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'no-store',
    },
  }));
}

function releaseResponse(request, env) {
  const resendSecretPresent = typeof env?.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.trim().length > 0;
  const webhookSecretPresent = typeof env?.CONVERSION_WEBHOOK_SECRET === 'string' && env.CONVERSION_WEBHOOK_SECRET.trim().length > 0;
  const driveSecretPresent = typeof env?.DRIVE_WEBHOOK_SECRET === 'string' && env.DRIVE_WEBHOOK_SECRET.trim().length > 0;
  const healthy = resendSecretPresent && webhookSecretPresent && driveSecretPresent;

  return new Response(JSON.stringify({
    ok: healthy,
    release: RELEASE_ID,
    worker: 'neptune-media-webtv',
    host: new URL(request.url).host,
    resendSecretPresent,
    webhookSecretPresent,
    driveSecretPresent,
    workflowStore: 'store-v5',
    clientWorkflowUi: 'workflow-v45-content-snapshot-v48',
    clientVideoLibrary: 'passage-selector-paginated-eight-items-v3',
    clientCalendarLibrary: 'passage-selector-paginated-eight-shorts-v5',
    studioWorkflowUi: 'workspace-v42-drive-sync-v47-content-gallery-v49',
    studioContentLibrary: 'visual-grid-paginated-eight-items',
    contentPreviewMode: 'single-dialog-on-demand',
    contentScrollModel: 'bounded-by-passage-filter-and-page',
    driveSynchronization: 'apps-script-polling-5-minutes',
    driveFolderArchitecture: 'client/passage/long-and-shorts',
    driveDeliveryEmail: 'resend-grouped-idempotent',
    driveFileAuthority: 'google-drive-file-id-and-modified-at',
    studioDriveObserver: 'disconnect-during-render-and-fingerprint',
    studioCanonicalPath: STUDIO_CANONICAL_PATH,
    studioEntryMode: 'login-gateway-to-canonical-workspace',
    legacyStudioDashboard: 'removed',
    retiredStudioAssets: 'blocked-with-404',
    premiumIconSystem: 'neptune-premium-icons-v46',
    clientResponsiveAudit: 'desktop-laptop-tablet-mobile',
    appointmentAuthority: 'google_calendar_event',
    responsiveAudit: 'client-and-studio-v17',
    tabletTopbar: 'aligned-no-overlap',
    interactionModel: 'inline-confirmation-no-native-popup',
    legacyAutopilot: 'removed-direct-and-transitive',
    emailTransport: 'resend-rest-v1',
    sender: 'Neptune Media <contact@neptunebusiness.com>',
    trustedTestClient: 'contact@neptunebusiness.com',
  }), {
    status: healthy ? 200 : 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Neptune-Release': RELEASE_ID,
    },
  });
}

function withReleaseHeader(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Release', RELEASE_ID);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function linkProspectToOrder(request, response, env) {
  const payload = await request.json().catch(() => ({}));
  const source = payload?.data?.object && typeof payload.data.object === 'object' ? payload.data.object : payload;
  const reference = String(source.client_reference_id || source.clientReferenceId || source.metadata?.client_reference_id || '').trim();
  if (!/^NP:[0-9a-f-]{36}(?::|$)/iu.test(reference)) return;

  const result = await response.json().catch(() => ({}));
  if (!result.orderId) return;

  const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const linked = await studio.fetch('https://store/portal/prospect-paid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, orderId: result.orderId }),
  });
  if (!linked.ok) {
    const detail = await linked.text().catch(() => '');
    throw new Error(`prospect_link_http_${linked.status}:${detail.slice(0, 180)}`);
  }
}
