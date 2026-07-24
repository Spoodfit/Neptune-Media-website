import base from './entry-v8.js';
import { StudioStore } from './store-v5.js';

export { StudioStore };

const RELEASE_ID = 'neptune-workspace-google-appointment-20260724-v10';
const RELEASE_PATH = '/api/public/release';
const ORDER_WEBHOOKS = new Set(['/api/webhooks/client-order', '/api/webhooks/conversion']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === RELEASE_PATH) {
      return releaseResponse(request, env);
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

function releaseResponse(request, env) {
  const resendSecretPresent = typeof env?.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.trim().length > 0;
  const webhookSecretPresent = typeof env?.CONVERSION_WEBHOOK_SECRET === 'string' && env.CONVERSION_WEBHOOK_SECRET.trim().length > 0;

  return new Response(JSON.stringify({
    ok: resendSecretPresent && webhookSecretPresent,
    release: RELEASE_ID,
    worker: 'neptune-media-webtv',
    host: new URL(request.url).host,
    resendSecretPresent,
    webhookSecretPresent,
    workflowStore: 'store-v5',
    clientWorkflowUi: 'workflow-v45-google-authoritative',
    studioWorkflowUi: 'workspace-v42-fullscreen',
    appointmentAuthority: 'google_calendar_event',
    emailTransport: 'resend-rest-v1',
    sender: 'Neptune Media <contact@neptunebusiness.com>',
    trustedTestClient: 'contact@neptunebusiness.com',
  }), {
    status: resendSecretPresent && webhookSecretPresent ? 200 : 503,
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
