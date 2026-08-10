import base from './entry-v28.js';
import { StudioStore } from './store-v24.js';
import { adminAuth } from './portal-http-utils.js';
import { sendCrmActionEmailV90 } from './portal-crm-email-v90.js';
import {
  normalizeStripeCheckoutSession,
  stripeConfiguration,
  stripePaidCandidates,
  stripePaymentOptions,
  verifyStripeWebhook,
} from './stripe-journey-v90.js';
import { isSameOrigin, json, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-stripe-client-journey-20260810-v90';
const JOURNEY_CSS = '/studio/client-journey-v90.css?v=1';
const JOURNEY_JS = '/studio/client-journey-v90.js?v=1';
const STRIPE_WEBHOOK_PATH = '/api/webhooks/stripe';
const RECONCILE_PATH = '/api/admin/stripe/reconcile';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'POST' && url.pathname === STRIPE_WEBHOOK_PATH) {
      return withHeaders(await stripeWebhook(request, env, studio), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === RECONCILE_PATH) {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      return withHeaders(secure(await reconcileStripe(request, env, studio)), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/crm-v86/opportunity') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const createdResponse = await callStore(studio, '/portal/crm-opportunity-v86', { ...adminAuth(request), payload });
      const created = await createdResponse.json().catch(() => ({}));
      if (!createdResponse.ok) return withHeaders(json(created, createdResponse.status), url.pathname);
      let delivery = null;
      if (payload.autopilot !== false) {
        delivery = await deliverCrmActionV90(request, env, studio, {
          opportunityId: created.opportunityId,
          action: 'autopilot',
        });
      }
      return withHeaders(json({ ...created, delivery }), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/crm-v86/action') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const delivery = await deliverCrmActionV90(request, env, studio, payload);
      const status = delivery.ok === false
        ? ['stripe_payment_link_ambiguous', 'stripe_payment_link_missing'].includes(delivery.error) ? 409 : 502
        : 200;
      return withHeaders(json(delivery, status), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response, env);
    }
    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectJourney(response);
    }

    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function reconcileStripe(request, env, studio) {
  const payload = await request.json().catch(() => ({}));
  const auth = adminAuth(request);
  let targetResult = await readTarget(studio, auth, payload);
  if (!targetResult.ok) return json(targetResult.body, targetResult.status);
  let target = targetResult.body;

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

  const locallyPaid = ['paid', 'succeeded', 'complete', 'completed'].includes(
    String(target.order?.paymentStatus || '').toLowerCase(),
  );
  const noPaymentRequired = String(target.order?.paymentStatus || '').toLowerCase() === 'no_payment_required';
  const paidResult = noPaymentRequired
    ? { configured: true, candidates: [], confident: false, session: null, ambiguous: false }
    : await stripePaidCandidates(env, target);

  let applied = null;
  if (paidResult.confident && paidResult.session) {
    const normalized = normalizeStripeCheckoutSession(paidResult.session);
    const applyResponse = await callStore(studio, '/portal/stripe-apply-v90', {
      ...auth,
      target: {
        orderId: target.orderId,
        opportunityId: target.opportunityId,
        clientId: target.clientId,
        prospectId: target.prospectId,
      },
      session: normalized,
    });
    applied = await applyResponse.json().catch(() => ({}));
    if (!applyResponse.ok) {
      return json({
        ok: false,
        error: applied.error || 'stripe_apply_failed',
        target,
        stripe: {
          configured: true,
          webhookConfigured: config.webhookConfigured,
          candidates: paidResult.candidates,
          ambiguous: paidResult.ambiguous,
        },
      }, applyResponse.status);
    }
    targetResult = await readTarget(studio, auth, { orderId: applied.orderId || target.orderId, clientId: target.clientId });
    if (targetResult.ok) target = targetResult.body;
  }

  const paidNow = ['paid', 'succeeded', 'complete', 'completed'].includes(
    String(target.order?.paymentStatus || '').toLowerCase(),
  );
  const options = paidNow || noPaymentRequired
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
        : paidResult.confident || (paidNow && applied)
          ? 'paid_verified'
          : paidResult.ambiguous
            ? 'ambiguous'
            : locallyPaid
              ? 'local_paid_unverified'
              : 'unpaid',
      applied,
      candidates: paidResult.candidates || [],
      ambiguous: Boolean(paidResult.ambiguous),
      options: options.options || [],
      optionsError: options.error || '',
    },
  });
}

async function stripeWebhook(request, env, studio) {
  const config = stripeConfiguration(env);
  if (!config.configured || !config.webhookConfigured) {
    return secure(json({ error: 'stripe_webhook_not_configured' }, 503));
  }

  const rawBody = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';
  const verified = await verifyStripeWebhook(rawBody, signature, config.webhookSecret);
  if (!verified) return secure(json({ error: 'stripe_signature_invalid' }, 400));

  const event = safeJson(rawBody);
  if (!event?.id || !event?.type) return secure(json({ error: 'stripe_event_invalid' }, 400));
  const handled = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
  ]);
  if (!handled.has(event.type)) return secure(json({ ok: true, ignored: true }));

  if (event.type === 'checkout.session.async_payment_failed') {
    console.warn('stripe_async_payment_failed', {
      eventId: event.id,
      sessionId: event.data?.object?.id || '',
      clientReferenceId: event.data?.object?.client_reference_id || '',
    });
    return secure(json({ ok: true, paymentFailed: true }));
  }

  const session = normalizeStripeCheckoutSession(event.data?.object || {});
  if (session.paymentStatus !== 'paid' && session.paymentStatus !== 'no_payment_required') {
    return secure(json({ ok: true, pending: true }));
  }

  const response = await callStore(studio, '/portal/stripe-apply-v90', {
    system: true,
    eventId: event.id,
    eventType: event.type,
    target: session.reference || {},
    session,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && result.error === 'stripe_payment_unmatched') {
    console.warn('stripe_payment_unmatched', {
      eventId: event.id,
      sessionId: session.id,
      email: session.email,
      amountTotal: session.amountTotal,
      clientReferenceId: session.clientReferenceId,
    });
    return secure(json({ ok: true, unmatched: true, requiresManualMatch: true }));
  }
  if (!response.ok) return secure(json(result, response.status));
  return secure(json({ ok: true, ...result }));
}

async function deliverCrmActionV90(request, env, studio, payload = {}) {
  const preparedResponse = await callStore(studio, '/portal/crm-action-prepare-v86', {
    ...adminAuth(request),
    payload,
  });
  const prepared = await preparedResponse.json().catch(() => ({}));
  if (!preparedResponse.ok) return { ok: false, error: prepared.error || 'crm_action_prepare_failed' };
  if (prepared.suppressed) {
    return {
      ok: true,
      action: prepared.action,
      suppressed: true,
      reason: prepared.reason,
      sentAt: prepared.sentAt || null,
    };
  }

  if (prepared.action === 'payment') {
    const target = {
      client: prepared.client || {},
      opportunity: prepared.opportunity || {},
      clientId: prepared.client?.id || '',
      opportunityId: prepared.opportunity?.id || '',
      email: prepared.client?.email || '',
      amountTotal: prepared.opportunity?.amountTotal || 0,
      currency: prepared.opportunity?.currency || 'eur',
      format: prepared.opportunity?.format || '',
    };
    const options = await stripePaymentOptions(env, target);
    if (!options.configured) return { ok: false, action: 'payment', error: 'stripe_not_configured' };
    const selected = options.options.find((item) => item.recommended)
      || (options.options.length === 1 ? options.options[0] : null);
    if (!selected) {
      return {
        ok: false,
        action: 'payment',
        error: options.options.length ? 'stripe_payment_link_ambiguous' : 'stripe_payment_link_missing',
        options: options.options.map(publicPaymentOption),
      };
    }
    prepared.paymentUrl = selected.url;
    prepared.stripePaymentLinkId = selected.id;
  }

  const sent = await sendCrmActionEmailV90(env, request.url, prepared);
  if (!sent?.ok) return { ok: false, action: prepared.action, error: sent?.error || 'crm_email_failed' };

  const markResponse = await callStore(studio, '/portal/crm-action-sent-v86', {
    ...adminAuth(request),
    payload: {
      clientId: prepared.client?.id || '',
      opportunityId: prepared.opportunity?.id || '',
      orderId: prepared.order?.id || '',
      action: prepared.action,
    },
  });
  const marked = await markResponse.json().catch(() => ({}));
  return {
    ok: true,
    action: prepared.action,
    suppressed: false,
    emailId: sent.id || sent.emailId || '',
    sentAt: marked.sentAt || new Date().toISOString(),
    stripePaymentLinkId: prepared.stripePaymentLinkId || '',
  };
}

async function readTarget(studio, auth, payload) {
  const response = await callStore(studio, '/portal/stripe-target-v90', { ...auth, payload });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function augmentRelease(response, env) {
  const current = await response.json().catch(() => ({}));
  const config = stripeConfiguration(env);
  return new Response(JSON.stringify({
    ...current,
    studioStripeClientJourney: RELEASE,
    stripeConfigured: config.configured,
    stripeWebhookConfigured: config.webhookConfigured,
    paymentAuthority: 'stripe-checkout-session-v90',
    paymentReconciliation: 'client-reference-id-then-stripe-id-then-unique-email-amount-v90',
    paymentLinkCatalog: 'active-preconfigured-stripe-payment-links-v90',
    manualJourneyActions: [
      'stripe-reconcile',
      'send-payment-link',
      'plan-preparation',
      'supplier-date-confirmation',
      'preparation-complete',
      'filming-complete',
      'source-received',
      'source-qc',
      'delivery-complete',
    ],
    clientJourneyAuthorities: {
      payment: 'stripe',
      preparation: 'google-calendar-meet',
      filming: 'studio-supplier-workflow',
      sources: 'google-drive-r2',
      production: 'neptune',
      delivery: 'google-drive-r2',
    },
  }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function injectJourney(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/client-journey-v90\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/client-journey-v90\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${JOURNEY_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${JOURNEY_JS}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function publicPaymentOption(option) {
  return {
    id: option.id,
    url: option.url,
    amountTotal: option.amountTotal,
    currency: option.currency,
    description: option.description,
    recommended: Boolean(option.recommended),
  };
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function safeJson(value) {
  try { return JSON.parse(String(value || '{}')); } catch { return null; }
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Stripe-Journey', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/api/admin')) {
    headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
}
