import base from './entry-v25.js';
import { StudioStore } from './store-v22.js';
import { adminAuth } from './portal-http-utils.js';
import { flushWorkflowOutbox } from './portal-workflow-routes-v5.js';
import { sendCrmActionEmailV86 } from './portal-crm-email-v86.js';
import { isSameOrigin, json, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-studio-crm-autopilot-20260810-v86';
const CRM_JS = '/studio/crm-autopilot-v86.js?v=1';
const CRM_CSS = '/studio/crm-autopilot-v86.css?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'GET' && url.pathname === '/api/admin/crm-v86') {
      return withHeaders(secure(await callStore(studio, '/portal/crm-snapshot-v86', adminAuth(request))), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/crm-v86/opportunity') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const createdResponse = await callStore(studio, '/portal/crm-opportunity-v86', { ...adminAuth(request), payload });
      const created = await createdResponse.json().catch(() => ({}));
      if (!createdResponse.ok) return withHeaders(json(created, createdResponse.status), url.pathname);
      let delivery = null;
      if (payload.autopilot !== false) {
        delivery = await deliverCrmAction(request, env, studio, { opportunityId: created.opportunityId, action: 'autopilot' });
      }
      return withHeaders(json({ ...created, delivery }), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/crm-v86/action') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const delivery = await deliverCrmAction(request, env, studio, payload);
      return withHeaders(json(delivery, delivery.ok === false ? 502 : 200), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/crm-v86/apply-preference') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      const appliedResponse = await callStore(studio, '/portal/crm-filming-preference-apply-v86', { ...adminAuth(request), payload });
      const applied = await appliedResponse.json().catch(() => ({}));
      if (!appliedResponse.ok) return withHeaders(json(applied, appliedResponse.status), url.pathname);

      let supplierDelivery = null;
      if (applied.supplierConfirmationRequired) {
        const supplierResponse = await callStore(studio, '/portal/workflow-action', {
          ...adminAuth(request),
          payload: { orderId: applied.orderId, action: 'resend_supplier_confirmation' },
        });
        const supplier = await supplierResponse.json().catch(() => ({}));
        if (supplierResponse.ok) supplierDelivery = await flushWorkflowOutbox(env, request.url, studio);
        else supplierDelivery = { failed: 1, error: supplier.error || 'supplier_confirmation_failed' };
      }
      return withHeaders(json({ ...applied, supplierDelivery }), url.pathname);
    }

    if (request.method === 'GET' && url.pathname === '/api/public/client-action-v86/context') {
      return withHeaders(secure(await callStore(studio, '/portal/crm-client-action-context-v86', {
        token: url.searchParams.get('token') || '',
      })), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/public/client-action-v86/submit') {
      const payload = await request.json().catch(() => ({}));
      return withHeaders(secure(await callStore(studio, '/portal/crm-client-action-submit-v86', payload)), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) response = await augmentRelease(response);
    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectCrmAssets(response);
    }
    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function deliverCrmAction(request, env, studio, payload = {}) {
  const preparedResponse = await callStore(studio, '/portal/crm-action-prepare-v86', { ...adminAuth(request), payload });
  const prepared = await preparedResponse.json().catch(() => ({}));
  if (!preparedResponse.ok) return { ok: false, error: prepared.error || 'crm_action_prepare_failed' };
  if (prepared.suppressed) return { ok: true, action: prepared.action, suppressed: true, reason: prepared.reason, sentAt: prepared.sentAt || null };

  const sent = await sendCrmActionEmailV86(env, request.url, prepared);
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
  };
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioCrmAutopilot: RELEASE,
    studioCrmPipeline: ['to_convert', 'payment_pending', 'preparation_pending', 'filming_pending', 'ready'],
    studioExistingClientSelection: 'search-and-reuse-client-or-prospect-v86',
    studioZeroWritingActions: ['payment', 'preparation', 'filming_preferences'],
    studioNextMessagePolicy: 'one-next-useful-message-with-two-hour-dedup-v86',
    filmingPreferences: 'up-to-three-secure-client-choices-v86',
    manualPaymentSemantics: 'amount-is-price-not-proof-of-payment-v86',
  }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function injectCrmAssets(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/crm-autopilot-v86\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/crm-autopilot-v86\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${CRM_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${CRM_JS}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
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
  headers.set('X-Neptune-CRM-Autopilot', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/api/admin')) headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
