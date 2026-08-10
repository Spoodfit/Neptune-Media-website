import base from './entry-v30.js';
import { StudioStore } from './store-v25.js';
import { adminAuth } from './portal-http-utils.js';
import { flushWorkflowOutbox } from './portal-workflow-routes-v5.js';
import { fallbackPaymentLinksV92 } from './payment-links-v92.js';
import { isSameOrigin, json, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-simple-client-journey-20260810-v92';
const JOURNEY_CONTEXT = '/api/admin/journey-v92/context';
const JOURNEY_ACTION = '/api/admin/journey-v92/action';
const PREPARATION_SYNC = '/api/admin/journey-v92/preparation-sync';
const SIMPLE_JS = '/studio/simple-journey-v92.js?v=1';
const SIMPLE_CSS = '/studio/simple-journey-v92.css?v=1';
const PAYMENT_REQUIRED_ACTIONS = new Set([
  'request_filming_preferences',
  'resend_supplier_confirmation',
  'send_preparation_link',
  'set_filming_date',
  'set_appointment',
  'preparation_completed',
  'filming_completed',
  'send_sources_received',
  'source_received',
  'force_majeure_reschedule',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'POST' && url.pathname === JOURNEY_CONTEXT) {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      return withHeaders(secure(await journeyContext(request, env, ctx, studio)), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === JOURNEY_ACTION) {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      return withHeaders(secure(await journeyAction(request, env, ctx, studio)), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === PREPARATION_SYNC) {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      return withHeaders(secure(await syncPreparationFromGoogle(request, env, ctx, studio)), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }
    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectSimpleJourney(response);
    }
    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function journeyContext(request, env, ctx, studio) {
  const payload = await request.json().catch(() => ({}));
  const auth = adminAuth(request);
  const contextResponse = await callStore(studio, '/portal/simple-journey-context-v92', { ...auth, payload });
  const context = await contextResponse.json().catch(() => ({}));
  if (!contextResponse.ok) return json(context, contextResponse.status);
  const stripeResponse = await callBase(request, base, env, ctx, '/api/admin/stripe/status', { orderId: context.order.id });
  const stripe = await stripeResponse.json().catch(() => ({}));
  const fallbackPaymentLinks = fallbackPaymentLinksV92(context.order.format, context.order.id, context.order.email);
  return json({
    ...context,
    stripe: stripeResponse.ok ? stripe : { stripe: { state: 'unconfigured', options: [], error: stripe.error || 'stripe_status_failed' } },
    fallbackPaymentLinks,
  });
}

async function journeyAction(request, env, ctx, studio) {
  const payload = await request.json().catch(() => ({}));
  const action = String(payload.action || '').trim();
  const orderId = String(payload.orderId || '').trim();
  if (!action || !orderId) return json({ error: 'invalid_action' }, 400);

  if (PAYMENT_REQUIRED_ACTIONS.has(action)) {
    const gate = await paymentGate(request, env, ctx, orderId);
    if (!gate.ok) return json({ error: 'payment_not_verified', stripeState: gate.state }, 409);
  }

  if (action === 'request_filming_preferences') {
    return proxyBase(request, base, env, ctx, '/api/admin/crm-v86/action', { orderId, action: 'filming_preferences' });
  }

  if (action === 'resend_supplier_confirmation') {
    const context = await readContext(request, studio, { orderId });
    if (!context.ok) return context.response;
    if (!context.data.order.supplierRelaunchAvailable) {
      return json({ error: 'supplier_relaunch_too_early', supplierWaitHours: context.data.order.supplierWaitHours }, 409);
    }
    return proxyBase(request, base, env, ctx, '/api/admin/workflow/action', { orderId, action: 'resend_supplier_confirmation' });
  }

  if (['preparation_completed', 'filming_completed', 'source_received'].includes(action)) {
    const context = await readContext(request, studio, { orderId });
    if (!context.ok) return context.response;
    if (action === 'preparation_completed') {
      const appointment = new Date(context.data.order.appointmentAt || '');
      if (Number.isNaN(appointment.getTime()) || appointment.getTime() > Date.now() + 5 * 60 * 1000) {
        return json({ error: 'preparation_not_due' }, 409);
      }
    }
    if (action === 'filming_completed') {
      const filming = new Date(context.data.order.filmingAt || '');
      if (Number.isNaN(filming.getTime()) || filming.getTime() > Date.now() + 5 * 60 * 1000) {
        return json({ error: 'filming_not_due' }, 409);
      }
    }
    return proxyBase(request, base, env, ctx, '/api/admin/workflow/action', { orderId, action });
  }

  const auth = adminAuth(request);
  const storeResponse = await callStore(studio, '/portal/simple-journey-action-v92', { ...auth, payload });
  const result = await storeResponse.json().catch(() => ({}));
  if (!storeResponse.ok) return json(result, storeResponse.status);

  let calendar = null;
  let supplier = null;
  if (action === 'set_appointment' && result.calendarSyncRecommended && result.appointmentAt) {
    const calendarResponse = await callBase(request, base, env, ctx, '/api/admin/preparation-calendar', {
      orderId,
      action: 'upsert',
      appointmentAt: result.appointmentAt,
      durationMinutes: Number(payload.durationMinutes || 30),
    });
    calendar = await calendarResponse.json().catch(() => ({}));
    if (!calendarResponse.ok) calendar = { ok: false, error: calendar.error || 'calendar_sync_failed' };
  }
  if (action === 'set_filming_date' && result.workflowAction) {
    const supplierResponse = await callBase(request, base, env, ctx, '/api/admin/workflow/action', { orderId, action: result.workflowAction });
    supplier = await supplierResponse.json().catch(() => ({}));
    if (!supplierResponse.ok) supplier = { ok: false, error: supplier.error || 'supplier_confirmation_failed' };
  }

  const emailDelivery = await flushWorkflowOutbox(env, request.url, studio);
  return json({ ...result, calendar, supplier, emailDelivery });
}

async function paymentGate(request, env, ctx, orderId) {
  const response = await callBase(request, base, env, ctx, '/api/admin/stripe/status', { orderId });
  const data = await response.json().catch(() => ({}));
  const state = String(data.stripe?.state || 'unconfigured');
  return { ok: response.ok && ['paid_verified', 'not_required'].includes(state), state };
}

async function syncPreparationFromGoogle(request, env, ctx, studio) {
  const payload = await request.json().catch(() => ({}));
  const orderId = String(payload.orderId || '').trim();
  if (!orderId) return json({ error: 'invalid_order' }, 400);
  const gate = await paymentGate(request, env, ctx, orderId);
  if (!gate.ok) return json({ error: 'payment_not_verified', stripeState: gate.state }, 409);
  const context = await readContext(request, studio, { orderId });
  if (!context.ok) return context.response;
  const order = context.data.order;
  if (order.appointmentAt && payload.force !== true) {
    return json({ ok: true, state: 'already_synced', appointmentAt: order.appointmentAt, preparationUrl: order.preparationUrl || '' });
  }

  const credentialResponse = await callStore(studio, '/portal/drive-token-get', {});
  const credential = await credentialResponse.json().catch(() => ({}));
  if (!credentialResponse.ok || !credential.accessToken) return json({ error: 'calendar_access_missing' }, 503);

  const timeMin = new Date(Math.max(new Date(order.createdAt || Date.now()).getTime() - 2 * 86400000, Date.now() - 180 * 86400000)).toISOString();
  const timeMax = order.filmingAt
    ? new Date(order.filmingAt).toISOString()
    : new Date(Date.now() + 365 * 86400000).toISOString();
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  const googleResponse = await fetch(url, { headers: { Authorization: `Bearer ${credential.accessToken}`, Accept: 'application/json' } });
  const google = await googleResponse.json().catch(() => ({}));
  if (!googleResponse.ok) return json({ error: 'calendar_sync_failed', providerStatus: googleResponse.status }, 502);

  const email = String(order.email || '').trim().toLowerCase();
  const candidates = (google.items || []).filter((event) => {
    if (event.status === 'cancelled' || !event.start?.dateTime) return false;
    const privateOrder = event.extendedProperties?.private?.neptuneOrderId;
    if (privateOrder && privateOrder !== orderId) return false;
    return Array.isArray(event.attendees) && event.attendees.some((attendee) => String(attendee.email || '').toLowerCase() === email);
  });
  if (!candidates.length) return json({ ok: true, state: 'not_found', candidates: [] });
  if (candidates.length > 1) {
    return json({
      ok: true,
      state: 'ambiguous',
      candidates: candidates.slice(0, 8).map((event) => ({ eventId: event.id, appointmentAt: event.start?.dateTime, summary: event.summary || '' })),
    });
  }

  const event = candidates[0];
  const meetingUrl = event.hangoutLink
    || event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri
    || event.htmlLink
    || '';
  const auth = adminAuth(request);
  const savedResponse = await callStore(studio, '/portal/preparation-calendar-synced-v85', {
    ...auth,
    payload: {
      orderId,
      appointmentAt: new Date(event.start.dateTime).toISOString(),
      calendarEventId: event.id,
      meetingUrl,
      calendarHtmlUrl: event.htmlLink || '',
    },
  });
  const saved = await savedResponse.json().catch(() => ({}));
  if (!savedResponse.ok) return json(saved, savedResponse.status);
  return json({ ok: true, state: 'synced', event: { id: event.id, appointmentAt: event.start.dateTime, meetingUrl, htmlLink: event.htmlLink || '' }, saved });
}

async function readContext(request, studio, payload) {
  const response = await callStore(studio, '/portal/simple-journey-context-v92', { ...adminAuth(request), payload });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, data } : { ok: false, response: json(data, response.status) };
}

async function callBase(request, handler, env, ctx, pathname, payload) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  const headers = new Headers(request.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json');
  return handler.fetch(new Request(url.toString(), { method: 'POST', headers, body: JSON.stringify(payload || {}) }), env, ctx);
}

async function proxyBase(request, handler, env, ctx, pathname, payload) {
  const response = await callBase(request, handler, env, ctx, pathname, payload);
  const data = await response.json().catch(() => ({}));
  return json(data, response.status);
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    simpleClientJourney: RELEASE,
    passageModel: 'one-order-one-passage-multiple-passages-per-client-v92',
    studioJourneySteps: 8,
    reservationLink: 'https://media.neptunebusiness.com/reserver',
    preparationBookingLink: 'https://calendar.app.google/X9q1T5JT9ngMfZY67',
    supplierSlaHours: 48,
    clientDateChangeMinimumDays: 15,
    sourceDeadlineDays: 7,
    editingDeadlineDays: 7,
  }), { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function injectSimpleJourney(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/client-journey-v90\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/client-journey-v90\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/operational-clarity-v91\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/client-dossier-v8[89]\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/simple-journey-v92\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/simple-journey-v92\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${SIMPLE_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${SIMPLE_JS}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Simple-Journey', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/api/admin')) headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
}
