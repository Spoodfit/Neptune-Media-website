import base from './entry-v10.js';
import { StudioStore } from './store-v7.js';
import { handleEdgeAnalytics } from './edge-analytics-v1.js';
import { handleClientMediaRoute } from './portal-client-media-v51.js';
import { handleClientYoutubeRoute } from './portal-youtube-client-v53.js';

export { StudioStore };

const RELEASE = 'neptune-efficiency-operational-fallback-20260730-v5';
const BATCHER_ASSET = '/analytics-batcher-v1.js?v=3';
const CLIENT_MEDIA_ASSET = '/espace-client/client-media-runtime-v51.js?v=2';

export default {
  async fetch(request, env, ctx) {
    const analytics = await handleEdgeAnalytics(request, env, ctx);
    if (analytics) return withRuntimeHeaders(analytics);

    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    const youtube = await handleClientYoutubeRoute(request, env, studio);
    if (youtube) return withRuntimeHeaders(youtube);
    const clientMedia = await handleClientMediaRoute(request, env, studio);
    if (clientMedia) return withRuntimeHeaders(clientMedia);

    const response = await base.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      return withRuntimeHeaders(await augmentRelease(response));
    }
    if (request.method === 'GET' && response.ok && (response.headers.get('Content-Type') || '').includes('text/html')) {
      return withRuntimeHeaders(await injectRuntimeAssets(response, url.pathname));
    }
    return withRuntimeHeaders(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    efficiencyRelease: RELEASE,
    telemetryStorage: 'operational-sqlite-with-optional-analytics-engine',
    telemetryBatching: 'decision-events-60-seconds-watch-checkpoint-10-minutes-and-lifecycle-flush',
    analyticsEngineBinding: 'optional-not-required-for-deployment',
    rawTelemetryInOperationalSqlite: false,
    driveSynchronization: 'google-drive-changes-cursor-with-shared-drive-support-and-daily-reconciliation',
    driveBatchEndpoint: '/api/webhooks/drive/delta',
    driveTombstones: 'removed-files-pruned-from-client-library',
    driveStaleRecovery: 'explicit-store-route-and-404-self-heal-v1',
    driveDeliveryEmail: 'resend-compact-current-library-summary-idempotent-v2',
    driveDeliveryEmailContent: 'current-library-counts-and-single-cta-no-file-list',
    workflowStore: 'store-v7',
    clientMediaTransport: 'authenticated-same-origin-drive-proxy-with-range-v1',
    clientMediaMetadata: 'drive-id-preview-thumbnail-and-download-v1',
    youtubePublicationDiscovery: 'public-channel-feed-client-title-matching-v1',
    youtubePublicationMatcher: 'channel-feed-and-exact-long-title-search-v2',
    youtubePublicationIntegrity: 'thumbnail-video-id-consistency-v1',
    clientMediaRuntime: 'client-media-runtime-v51.2-stable-broadcast-download-feedback',
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function injectRuntimeAssets(response, pathname) {
  let body = await response.text();
  if (!body.includes('/analytics-batcher-v1.js')) {
    body = body.replace('</head>', `<script src="${BATCHER_ASSET}"></script></head>`);
  }
  if (pathname.startsWith('/espace-client')) {
    if (body.includes('/espace-client/client-media-runtime-v51.js?v=1')) {
      body = body.replaceAll('/espace-client/client-media-runtime-v51.js?v=1', CLIENT_MEDIA_ASSET);
    } else if (!body.includes('/espace-client/client-media-runtime-v51.js')) {
      body = body.replace('</body>', `<script type="module" src="${CLIENT_MEDIA_ASSET}"></script></body>`);
    }
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', pathname.startsWith('/espace-client') ? 'private, no-store, max-age=0' : headers.get('Cache-Control') || 'no-store');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withRuntimeHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Efficiency-Release', RELEASE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
