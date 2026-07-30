import base from './entry-v10.js';
import { StudioStore } from './store-v7.js';
import { handleEdgeAnalytics } from './edge-analytics-v1.js';

export { StudioStore };

const RELEASE = 'neptune-efficiency-operational-fallback-20260730-v5';
const BATCHER_ASSET = '/analytics-batcher-v1.js?v=3';

export default {
  async fetch(request, env, ctx) {
    const analytics = await handleEdgeAnalytics(request, env, ctx);
    if (analytics) return withRuntimeHeaders(analytics);

    const response = await base.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      return withRuntimeHeaders(await augmentRelease(response));
    }
    if (request.method === 'GET' && response.ok && (response.headers.get('Content-Type') || '').includes('text/html')) {
      return withRuntimeHeaders(await injectAnalyticsBatcher(response));
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
    workflowStore: 'store-v7',
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function injectAnalyticsBatcher(response) {
  let body = await response.text();
  if (!body.includes('/analytics-batcher-v1.js')) {
    body = body.replace('</head>', `<script src="${BATCHER_ASSET}"></script></head>`);
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
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
