import base, { StudioStore } from './entry-v29.js';
import { adminAuth } from './portal-http-utils.js';
import {
  stripeConfiguration,
  stripePaidCandidates,
  stripePaymentOptions,
} from './stripe-journey-v90.js';
import { isSameOrigin, json, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-studio-operational-ux-20260810-v91';
const JOURNEY_CSS = '/studio/client-journey-v90.css?v=3';
const JOURNEY_JS = '/studio/client-journey-v90.js?v=3';
const MANUAL_JS = '/studio/manual-scheduling-v85.js?v=2';
const CLARITY_JS = '/studio/operational-clarity-v91.js?v=1';
const STRIPE_STATUS_PATH = '/api/admin/stripe/status';
const WORKFLOW_ACTION_PATH = '/api/admin/workflow/action';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'POST' && url.pathname === '/api/admin/manual-passage') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const paymentStatus = payload.paymentStatus === 'no_payment_required'
        ? 'no_payment_required'
        : 'payment_pending';
      return withHeaders(await forwardJson(request, base, env, ctx, { ...payload, paymentStatus }), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === STRIPE_STATUS_PATH) {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      return withHeaders(secure(await stripeStatus(request, env, studio)), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === WORKFLOW_ACTION_PATH) {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const gate = await operationalPaymentGate(request, studio, payload.orderId);
      if (!gate.ok) return withHeaders(json({ error: gate.error, paymentStatus: gate.paymentStatus }, gate.status), url.pathname);
      return withHeaders(await forwardJson(request, base, env, ctx, payload), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }

    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectOperationalAssets(response);
    }

    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function operationalPaymentGate(request, studio, orderId) {
  const id = String(orderId || '').trim();
  if (!id) return { ok: false, error: 'invalid_order', paymentStatus: '', status: 400 };
  const auth = adminAuth(request);
  const targetResponse = await callStore(studio, '/portal/stripe-target-v90', { ...auth, payload: { orderId: id } });
  const target = await targetResponse.json().catch(() => ({}));
  if (!targetResponse.ok) return { ok: false, error: target.error || 'stripe_target_not_found', paymentStatus: '', status: targetResponse.status };
  const paymentStatus = String(target.order?.paymentStatus || '').toLowerCase();
  if (paymentStatus === 'no_payment_required') return { ok: true, paymentStatus };
  const locallyPaid = ['paid', 'succeeded', 'complete', 'completed'].includes(paymentStatus);
  const verified = locallyPaid && Boolean(target.externalPaymentId || target.order?.externalPaymentId);
  return verified
    ? { ok: true, paymentStatus }
    : { ok: false, error: 'payment_not_verified', paymentStatus, status: 409 };
}

async function stripeStatus(request, env, studio) {
  const payload = await request.json().catch(() => ({}));
  const auth = adminAuth(request);
  const targetResponse = await callStore(studio, '/portal/stripe-target-v90', { ...auth, payload });
  const target = await targetResponse.json().catch(() => ({}));
  if (!targetResponse.ok) return json(target, targetResponse.status);

  const config = stripeConfiguration(env);
  if (!config.configured) {
    return json({
      ok: true,
      target,
      stripe: {
        configured: false,
        webhookConfigured: config.webhookConfigured,
        state: 'unconfigured',
        options: [],
        candidates: [],
      },
    });
  }

  const paymentStatus = String(target.order?.paymentStatus || '').toLowerCase();
  const noPaymentRequired = paymentStatus === 'no_payment_required';
  const locallyPaid = ['paid', 'succeeded', 'complete', 'completed'].includes(paymentStatus);
  const alreadyVerified = locallyPaid && Boolean(target.externalPaymentId || target.order?.externalPaymentId);

  const paidResult = noPaymentRequired || alreadyVerified
    ? { configured: true, candidates: [], confident: false, session: null, ambiguous: false }
    : await stripePaidCandidates(env, target);

  const options = noPaymentRequired || alreadyVerified
    ? { configured: true, options: [] }
    : await stripePaymentOptions(env, target);

  return json({
    ok: true,
    target,
    stripe: {
      configured: true,
      webhookConfigured: config.webhookConfigured,
      state: noPaymentRequired
        ? 'not_required'
        : alreadyVerified
          ? 'paid_verified'
          : paidResult.ambiguous
            ? 'ambiguous'
            : paidResult.confident
              ? 'payment_found'
              : locallyPaid
                ? 'local_paid_unverified'
                : 'unpaid',
      paymentFound: Boolean(paidResult.confident),
      candidates: paidResult.candidates || [],
      ambiguous: Boolean(paidResult.ambiguous),
      options: options.options || [],
      optionsError: options.error || '',
    },
  });
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioOperationalUx: RELEASE,
    studioJourneyPresentation: 'single-next-action-plus-automatic-checks-v91',
    stripeReadMode: 'read-only-status-until-explicit-reconcile-v91',
    manualPaymentMode: 'explicit-stripe-pending-or-no-payment-required-v91',
    paymentGate: 'stripe-verified-or-no-payment-required-before-operational-actions-v91',
    paymentGateEnforcement: 'server-and-ui-v91',
    pipelineActions: 'open-dossier-only-v91',
    billingSemantics: 'amount-is-not-payment-proof-v91',
    responsiveReadability: 'minimum-readable-controls-and-mobile-stack-v91',
  }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function injectOperationalAssets(response) {
  let body = await response.text();
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/manual-scheduling-v85\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/client-journey-v90\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/client-journey-v90\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/operational-clarity-v91\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${JOURNEY_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${MANUAL_JS}"></script><script type="module" src="${CLARITY_JS}"></script><script type="module" src="${JOURNEY_JS}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function forwardJson(request, handler, env, ctx, payload) {
  const headers = new Headers(request.headers);
  headers.delete('Content-Length');
  const forwarded = new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(payload || {}),
  });
  return handler.fetch(forwarded, env, ctx);
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
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Operational-UX', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/api/admin')) {
    headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
}
