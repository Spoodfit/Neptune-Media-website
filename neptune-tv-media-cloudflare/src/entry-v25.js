import base from './entry-v24.js';
import { StudioStore } from './store-v21.js';
import { adminAuth, normalizeOrderPayload } from './portal-http-utils.js';
import { sendAccess } from './portal-email.js';
import { flushWorkflowOutbox } from './portal-workflow-routes-v5.js';
import { isSameOrigin, json, sanitizeText, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-studio-manual-scheduling-20260810-v85';
const STUDIO_JS = '/studio/manual-scheduling-v85.js?v=1';
const STUDIO_CSS = '/studio/manual-scheduling-v85.css?v=1';
const CLIENT_JS = '/espace-client/client-meeting-v85.js?v=1';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TIME_ZONE = 'Europe/Paris';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'POST' && url.pathname === '/api/admin/manual-passage') {
      return withHeaders(secure(await createManualPassage(request, env, studio)), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/preparation-calendar') {
      return withHeaders(secure(await managePreparationCalendar(request, env, studio)), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }

    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectStudioScheduling(response);
    }

    if (request.method === 'GET' && response.ok && isClientHomePath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectClientMeeting(response);
    }

    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function createManualPassage(request, env, studio) {
  if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
  const payload = await request.json().catch(() => ({}));
  const normalized = normalizeOrderPayload(payload, env);
  const filmingConfirmed = payload.filmingConfirmed === true;
  const sourceType = sanitizeText(payload.sourceType || 'direct', 60) || 'direct';
  const filmingAt = normalized.filmingAt || null;
  const appointmentAt = normalized.appointmentAt || null;
  const format = normalized.format || 'Hors Norme';
  const horsNorme = /hors\s*norme/iu.test(format);
  const manualStatus = filmingAt
    ? (!horsNorme || filmingConfirmed ? 'filming_scheduled' : 'studio_date_confirmation_pending')
    : appointmentAt
      ? 'appointment_booked'
      : 'preparation_booking_pending';

  const amountTotal = Number(normalized.amountTotal || 0);
  const paymentStatus = sanitizeText(payload.paymentStatus, 50)
    || (amountTotal > 0 ? 'paid' : 'no_payment_required');

  const response = await callStore(studio, '/portal/admin-upsert', {
    ...adminAuth(request),
    payload: {
      ...normalized,
      status: manualStatus,
      paymentStatus,
      sourceType,
      filmingConfirmed,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return json(result, response.status);

  const warnings = [];
  if (payload.sendEmail !== false && result.email) {
    const access = await sendAccess(env, request.url, result.email, payload.fullName || '');
    if (!access.ok) warnings.push(access.error || 'access_email_failed');
  }

  let supplierDelivery = null;
  if (result.supplierStatus === 'pending' && filmingAt) {
    const supplier = await callStore(studio, '/portal/workflow-action', {
      ...adminAuth(request),
      payload: { orderId: result.orderId, action: 'resend_supplier_confirmation' },
    });
    const supplierResult = await supplier.json().catch(() => ({}));
    if (supplier.ok) {
      supplierDelivery = await flushWorkflowOutbox(env, request.url, studio);
      if (supplierDelivery.failed) warnings.push('supplier_confirmation_email_pending');
    } else {
      warnings.push(supplierResult.error || 'supplier_confirmation_failed');
    }
  }

  return json({
    ...result,
    sourceType,
    filmingConfirmed,
    supplierDelivery,
    ...(warnings.length ? { warning: warnings.join(',') } : {}),
  });
}

async function managePreparationCalendar(request, env, studio) {
  if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
  const payload = await request.json().catch(() => ({}));
  const orderId = sanitizeText(payload.orderId, 100);
  if (!orderId) return json({ error: 'invalid_order' }, 400);

  const auth = adminAuth(request);
  const contextResponse = await callStore(studio, '/portal/manual-schedule-context-v85', {
    ...auth,
    payload: { orderId },
  });
  const context = await contextResponse.json().catch(() => ({}));
  if (!contextResponse.ok) return json(context, contextResponse.status);
  const order = context.order || {};
  const action = payload.action === 'cancel' || !payload.appointmentAt ? 'cancel' : 'upsert';

  const credentialResponse = await callStore(studio, '/portal/drive-token-get', {});
  const credential = await credentialResponse.json().catch(() => ({}));
  if (!credentialResponse.ok || !credential.accessToken) {
    return json({
      error: 'calendar_access_missing',
      message: 'Le jeton Google Neptune n’est pas disponible. Réautorisez le relais Apps Script Drive + Agenda.',
    }, 503);
  }

  if (action === 'cancel') {
    return cancelPreparationCalendar(studio, auth, credential.accessToken, order);
  }

  const appointmentAt = validIso(payload.appointmentAt);
  if (!appointmentAt) return json({ error: 'invalid_appointment' }, 400);
  if (new Date(appointmentAt).getTime() < Date.now() - 5 * 60 * 1000) {
    return json({ error: 'appointment_in_past' }, 400);
  }

  const durationMinutes = clamp(Number(payload.durationMinutes || 30), 15, 120);
  const start = new Date(appointmentAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const eventPayload = buildCalendarEvent(request.url, order, start, end);
  let google;

  if (order.calendarEventId) {
    google = await googleCalendarRequest(
      credential.accessToken,
      `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(order.calendarEventId)}?conferenceDataVersion=1&sendUpdates=all`,
      'PATCH',
      eventPayload,
    );
    if (!google.ok && [404, 410].includes(google.status)) {
      google = await createCalendarEvent(credential.accessToken, eventPayload, orderId);
    }
  } else {
    google = await createCalendarEvent(credential.accessToken, eventPayload, orderId);
  }

  if (!google.ok) return calendarFailure(google);
  let event = google.data || {};
  if (!meetingUrl(event) && event.id) {
    const refreshed = await googleCalendarRequest(
      credential.accessToken,
      `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(event.id)}?conferenceDataVersion=1`,
      'GET',
    );
    if (refreshed.ok) event = refreshed.data || event;
  }

  const joinUrl = meetingUrl(event) || safeGoogleUrl(event.htmlLink);
  const savedResponse = await callStore(studio, '/portal/preparation-calendar-synced-v85', {
    ...auth,
    payload: {
      orderId,
      appointmentAt,
      calendarEventId: event.id,
      meetingUrl: joinUrl,
      calendarHtmlUrl: safeGoogleUrl(event.htmlLink),
    },
  });
  const saved = await savedResponse.json().catch(() => ({}));
  if (!savedResponse.ok) return json({ ...saved, calendarEventCreated: true }, savedResponse.status);

  return json({
    ...saved,
    calendar: {
      eventId: event.id,
      htmlLink: safeGoogleUrl(event.htmlLink),
      meetingUrl: joinUrl,
      status: event.status || 'confirmed',
      attendees: Array.isArray(event.attendees) ? event.attendees.length : 0,
    },
  });
}

async function cancelPreparationCalendar(studio, auth, accessToken, order) {
  const eventId = sanitizeText(order.calendarEventId, 300);
  if (eventId) {
    const deleted = await googleCalendarRequest(
      accessToken,
      `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      'DELETE',
    );
    if (!deleted.ok && ![404, 410].includes(deleted.status)) return calendarFailure(deleted);
  }

  const clearedResponse = await callStore(studio, '/portal/preparation-calendar-cleared-v85', {
    ...auth,
    payload: {
      orderId: order.id,
      calendarEventId: eventId,
      previousAppointmentAt: order.appointmentAt || null,
      oldPreparationUrl: order.preparationUrl || '',
    },
  });
  const cleared = await clearedResponse.json().catch(() => ({}));
  if (!clearedResponse.ok) return json(cleared, clearedResponse.status);
  return json({ ...cleared, calendar: { eventId, cancelled: true } });
}

async function createCalendarEvent(accessToken, eventPayload, orderId) {
  return googleCalendarRequest(
    accessToken,
    `${CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
    'POST',
    {
      ...eventPayload,
      conferenceData: {
        createRequest: {
          requestId: `neptune-${String(orderId).replace(/[^a-z0-9]/giu, '').slice(0, 32)}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  );
}

function buildCalendarEvent(requestUrl, order, start, end) {
  const identity = order.fullName || order.company || order.email || 'Client Neptune Media';
  const portal = new URL('/espace-client/', new URL(requestUrl).origin);
  if (order.email) portal.searchParams.set('email', order.email);
  return {
    summary: `Neptune Media · Préparation · ${identity}`,
    description: `Rendez-vous de préparation Neptune Media pour ${order.title || 'le passage'}.\n\nEspace client : ${portal}`,
    start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
    attendees: order.email ? [{ email: order.email, displayName: identity }] : [],
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    extendedProperties: { private: { neptuneOrderId: order.id || '' } },
  };
}

async function googleCalendarRequest(accessToken, url, method, body) {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        'User-Agent': 'Neptune-Media-Studio/1.0',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = method === 'DELETE' && response.status === 204 ? '' : await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: { message: String(error?.message || error || 'google_calendar_unavailable') } } };
  }
}

function calendarFailure(result) {
  const reason = String(
    result?.data?.error?.status
      || result?.data?.error?.errors?.[0]?.reason
      || result?.data?.error?.message
      || '',
  );
  const permission = result.status === 401 || result.status === 403 || /scope|permission|insufficient|auth/iu.test(reason);
  return json({
    error: permission ? 'calendar_permission_required' : 'calendar_sync_failed',
    providerStatus: result.status || 0,
    providerMessage: String(result?.data?.error?.message || reason || 'Google Agenda n’a pas répondu.').slice(0, 500),
  }, permission ? 503 : 502);
}

function meetingUrl(event = {}) {
  const direct = safeGoogleUrl(event.hangoutLink);
  if (direct) return direct;
  const points = Array.isArray(event.conferenceData?.entryPoints) ? event.conferenceData.entryPoints : [];
  for (const point of points) {
    if (point?.entryPointType !== 'video') continue;
    const url = safeGoogleUrl(point.uri);
    if (url) return url;
  }
  return '';
}

function safeGoogleUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /(^|\.)google\.com$|(^|\.)googleusercontent\.com$/iu.test(url.hostname) ? url.toString() : '';
  } catch {
    return '';
  }
}

function validIso(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clamp(value, min, max) {
  const number = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, number));
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioManualScheduling: RELEASE,
    studioManualPassage: 'partners-members-direct-clients-without-sales-funnel-v85',
    preparationCalendarAuthority: 'neptune-db-source-of-truth-google-calendar-projection-v85',
    preparationCalendarOperations: ['create', 'reschedule', 'cancel'],
    preparationMeeting: 'google-meet-created-from-studio-and-synced-to-client-space-v85',
    preparationInvitation: 'google-calendar-sendUpdates-all-v85',
    manualFilmingDateMode: 'already-agreed-or-supplier-confirmation-v85',
  }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function injectStudioScheduling(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/manual-scheduling-v85\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/manual-scheduling-v85\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${STUDIO_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${STUDIO_JS}"></script></body>`);
  return rebuiltHtml(response, body);
}

async function injectClientMeeting(response) {
  let body = await response.text();
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/espace-client\/client-meeting-v85\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</body>', `<script type="module" src="${CLIENT_JS}"></script></body>`);
  return rebuiltHtml(response, body);
}

function rebuiltHtml(response, body) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
}

function isClientHomePath(pathname) {
  return pathname === '/espace-client' || pathname === '/espace-client/' || pathname === '/espace-client/index.html';
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
  headers.set('X-Neptune-Manual-Scheduling', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/espace-client') || pathname.startsWith('/api/admin')) {
    headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
