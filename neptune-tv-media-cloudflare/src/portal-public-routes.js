import { isSameOrigin, json, timingSafeEqual } from './security.js';
import { clientToken, clientCookie, normalizeOrderPayload, unwrapWebhookPayload, safeFilename } from './portal-http-utils.js';
import { sendCode, sendOrderConfirmation, sendAppointmentConfirmation, sendDeletionRequest } from './portal-email.js';
import { sendReferralConfirmed } from './portal-referral-email.js';
import { generateContentMetadata } from './portal-content-ai.js';

export async function handlePortalPublicRoute(request, env, studio) {
  const url = new URL(request.url);

  if (url.pathname === '/api/client/request-code' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    const email = String(payload.email || '').trim().toLowerCase();
    const response = await callStore(studio, '/portal/request-code', { email });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(result, response.status);
    let delivered = false;
    let codeExpected = Boolean(result.retryAfter || result.throttled);
    let emailId = null;
    if (result.deliver && result.code) {
      const sent = await sendCode(env, request.url, email, result.code);
      if (!sent.ok) return json({ error: sent.error }, 503);
      delivered = true;codeExpected = true;emailId = sent.id || null;
      console.log('client_security_code_sent', { emailId, to: email });
    } else if (!codeExpected) {
      console.warn('client_security_code_not_sent', { to: email, reason: result.reason || 'client_not_found' });
    }
    return json({ ok: true, delivered, codeExpected, emailId, retryAfter: result.retryAfter || 0, throttled: Boolean(result.throttled) });
  }

  if (url.pathname === '/api/client/verify-code' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    const response = await callStore(studio, '/portal/verify-code', payload);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(result, response.status);
    return json({ ok: true, client: result.client }, 200, { 'Set-Cookie': clientCookie(result.token, request.url, result.expiresIn) });
  }

  if (url.pathname === '/api/client/session' && request.method === 'GET') return callStore(studio, '/portal/session', { token: clientToken(request) });
  if (url.pathname === '/api/client/content-calendar' && request.method === 'GET') return callStore(studio, '/portal/content-calendar', { token: clientToken(request) });

  if (url.pathname === '/api/client/content-calendar/update' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    return callStore(studio, '/portal/content-update', { token: clientToken(request), payload });
  }

  if (url.pathname === '/api/client/content-calendar/reuse' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    const token = clientToken(request);
    const contextResponse = await callStore(studio, '/portal/content-reuse-context', { token, payload: { fileId: payload.fileId } });
    const context = await contextResponse.json().catch(() => ({}));
    if (!contextResponse.ok || !context.item) return json(context, contextResponse.status);
    const item = context.item;
    const previousTitles = Array.isArray(item.previousTitles) ? item.previousTitles.join(' | ') : '';
    const editorialContext = [
      `Réutilisation n°${item.reuseIndex || 2} du même short, espacée d’au moins 30 jours.`,
      'Crée un nouvel angle éditorial et une nouvelle promesse sans modifier le sens réel de la vidéo.',
      'Le titre, la description et les questions doivent être nettement différents des utilisations précédentes.',
      previousTitles ? `Titres déjà utilisés à ne pas répéter : ${previousTitles}` : '',
    ].filter(Boolean).join(' ');
    const metadata = await generateContentMetadata(env, {
      ...item,
      filename: item.name,
      editorialContext,
    });
    const createResponse = await callStore(studio, '/portal/content-reuse-create', {
      token,
      payload: {
        fileId: payload.fileId,
        publishAt: payload.publishAt || item.nextAllowedAt,
        networks: payload.networks,
        ...metadata,
      },
    });
    const created = await createResponse.json().catch(() => ({}));
    return json(created, createResponse.status);
  }

  if (url.pathname === '/api/client/content-calendar/publish' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    return callStore(studio, '/portal/content-publish-log', { token: clientToken(request), payload });
  }

  if (url.pathname === '/api/client/logout' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    await callStore(studio, '/portal/logout', { token: clientToken(request) });
    return json({ ok: true }, 200, { 'Set-Cookie': clientCookie('', request.url, 0) });
  }

  if (url.pathname === '/api/client/delete-request' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    const response = await callStore(studio, '/portal/delete-request', { token: clientToken(request), note: payload.note });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(result, response.status);
    const sent = await sendDeletionRequest(env, request.url, result.email, result);
    return sent.ok ? json(result) : json({ ...result, warning: sent.error });
  }

  if (url.pathname === '/api/client/feedback' && request.method === 'GET') {
    return callStore(studio, '/portal/feedback-get', { token: url.searchParams.get('token') || '' });
  }

  if (url.pathname === '/api/client/feedback' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    return callStore(studio, '/portal/feedback-submit', payload);
  }

  if (url.pathname.startsWith('/api/client/files/') && request.method === 'GET') {
    const fileId = decodeURIComponent(url.pathname.slice('/api/client/files/'.length));
    const response = await callStore(studio, '/portal/file-authorize', { token: clientToken(request), fileId });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(result, response.status);
    const file = result.file || {};
    if (file.storageKey) {
      const object = await env.MEDIA.get(file.storageKey);
      if (!object) return json({ error: 'file_not_found' }, 404);
      const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="${safeFilename(file.name)}"` });
      if (object.httpMetadata?.contentType) headers.set('Content-Type', object.httpMetadata.contentType);
      if (object.httpEtag) headers.set('ETag', object.httpEtag);
      return new Response(object.body, { headers });
    }
    if (file.externalUrl) return new Response(null, { status: 302, headers: { Location: file.externalUrl, 'Cache-Control': 'private, no-store' } });
    return json({ error: 'file_not_found' }, 404);
  }

  if (['/api/webhooks/client-order', '/api/webhooks/conversion'].includes(url.pathname) && request.method === 'POST') {
    if (!authorizedWebhook(request, env)) return json({ error: 'unauthorized' }, 401);
    const payload = await request.json().catch(() => ({}));
    const source = unwrapWebhookPayload(payload);
    const normalized = normalizeOrderPayload(payload, env);
    if (url.pathname === '/api/webhooks/conversion') {
      await callStore(studio, '/webhook/conversion', {
        id: String(source.id || normalized.externalPaymentId || crypto.randomUUID()),
        sessionId: String(source.sessionId || source.client_reference_id || ''),episodeId: String(source.episodeId || ''),format: normalized.format,
        externalId: normalized.externalPaymentId,amountCents: normalized.amountTotal,currency: normalized.currency,status: normalized.paymentStatus,
        occurredAt: String(source.createdAt || source.occurredAt || new Date().toISOString()),
      });
    }
    if (!normalized.email || !normalized.externalPaymentId) return json({ ok: true, conversionRecorded: url.pathname === '/api/webhooks/conversion', portalSkipped: true });
    const response = await callStore(studio, '/portal/order-upsert', normalized);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(result, response.status);
    if (result.created && result.email && !result.workflowManaged) {
      const sent = await sendOrderConfirmation(env, request.url, result.email, source);
      if (!sent.ok) console.error('client_order_confirmation_failed', sent.error);
    }
    let referral = null;
    if (normalized.referralCode && result.orderId && result.clientId) {
      const referralResponse = await callStore(studio, '/portal/referral-register', {
        orderId: result.orderId,
        referredClientId: result.clientId,
        referralCode: normalized.referralCode,
        paymentStatus: normalized.paymentStatus,
      });
      referral = await referralResponse.json().catch(() => null);
      if (referralResponse.ok && referral?.created && referral.referrerEmail) {
        const sent = await sendReferralConfirmed(env, request.url, referral.referrerEmail, referral);
        if (!sent.ok) console.error('referral_confirmation_failed', sent.error);
      }
    }
    return json({ ...result, referral: referral ? { effective: Boolean(referral.effective), created: Boolean(referral.created) } : null, conversionRecorded: url.pathname === '/api/webhooks/conversion' });
  }

  if (url.pathname === '/api/webhooks/client-appointment' && request.method === 'POST') {
    if (!authorizedWebhook(request, env)) return json({ error: 'unauthorized' }, 401);
    const payload = await request.json().catch(() => ({}));
    const source = unwrapWebhookPayload(payload);
    const response = await callStore(studio, '/portal/appointment-upsert', source);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(result, response.status);
    if (!result.workflowManaged) {
      const sent = await sendAppointmentConfirmation(env, request.url, result.email, result);
      if (!sent.ok) console.error('client_appointment_confirmation_failed', sent.error);
    }
    return json(result);
  }
  return null;
}
function authorizedWebhook(request, env) { const supplied = request.headers.get('X-Neptune-Webhook-Secret') || '';return Boolean(env.CONVERSION_WEBHOOK_SECRET) && timingSafeEqual(supplied, env.CONVERSION_WEBHOOK_SECRET); }
async function callStore(studio, path, body) { return studio.fetch(`https://store${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
