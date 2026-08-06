import base from './entry-v20.js';
import { StudioStore } from './store-v17.js';
import { adminAuth } from './portal-http-utils.js';
import { emailConfiguration } from './email-service.js';
import { json, securityHeaders } from './security.js';
import { Resend } from 'resend';

export { StudioStore };

const RELEASE = 'neptune-studio-email-activity-20260806-v82';
const EMAIL_ACTIVITY_CSS = '/studio/email-activity-v82.css?v=1';
const EMAIL_ACTIVITY_JS = '/studio/email-activity-v82.js?v=1';
const HISTORY_PATH = '/api/admin/email-history';
const RESEND_WEBHOOK_PATH = '/api/webhooks/resend';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'GET' && url.pathname === HISTORY_PATH) {
      return withHeaders(await emailHistoryResponse(request, env, studio, url), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === RESEND_WEBHOOK_PATH) {
      return withHeaders(await resendWebhookResponse(request, env, studio), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }

    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectEmailActivity(response);
    }

    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function emailHistoryResponse(request, env, studio, url) {
  const orderId = url.searchParams.get('orderId') || '';
  const limit = Math.max(1, Math.min(250, Number(url.searchParams.get('limit') || 100)));
  const auth = adminAuth(request);
  let result = await readHistory(studio, auth, orderId, limit);
  if (!result.ok) return secure(json(result.body, result.status));

  const refresh = url.searchParams.get('refresh') !== '0';
  const config = emailConfiguration(env);
  if (refresh && config.configured) {
    const snapshots = await retrieveProviderSnapshots(config.apiKey, result.body.items || []);
    if (snapshots.length) {
      await callStore(studio, '/portal/email-provider-sync-v82', { snapshots });
      result = await readHistory(studio, auth, orderId, limit);
      if (!result.ok) return secure(json(result.body, result.status));
    }
  }

  return secure(json({
    ...result.body,
    tracking: {
      ...(result.body.tracking || {}),
      providerSyncAvailable: config.configured,
      webhookConfigured: Boolean(env.RESEND_WEBHOOK_SECRET),
    },
  }));
}

async function readHistory(studio, auth, orderId, limit) {
  const response = await callStore(studio, '/portal/email-history-v82', { ...auth, orderId, limit });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function retrieveProviderSnapshots(apiKey, items) {
  const candidates = (items || [])
    .filter((item) => item.emailId && !['bounced', 'complained', 'suppressed', 'failed'].includes(item.status))
    .slice(0, 20);
  const snapshots = [];
  for (const item of candidates) {
    try {
      const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(item.emailId)}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'Neptune-Media-Worker/5.0.0',
        },
      });
      if (!response.ok) continue;
      const data = await response.json().catch(() => ({}));
      snapshots.push({
        emailId: data.id || item.emailId,
        lastEvent: data.last_event || data.lastEvent || '',
        subject: data.subject || item.subject || '',
        to: data.to || item.toEmail || '',
        createdAt: data.created_at || data.createdAt || item.sentAt || '',
      });
    } catch (error) {
      console.warn('resend_email_status_refresh_failed', {
        emailId: item.emailId,
        message: String(error?.message || error || 'unknown').slice(0, 240),
      });
    }
  }
  return snapshots;
}

async function resendWebhookResponse(request, env, studio) {
  const config = emailConfiguration(env);
  const webhookSecret = String(env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!config.configured || !webhookSecret) {
    return secure(json({ error: 'resend_webhook_not_configured' }, 503));
  }

  const payload = await request.text();
  const svixId = request.headers.get('svix-id') || '';
  const svixTimestamp = request.headers.get('svix-timestamp') || '';
  const svixSignature = request.headers.get('svix-signature') || '';
  if (!svixId || !svixTimestamp || !svixSignature) {
    return secure(json({ error: 'resend_webhook_headers_missing' }, 400));
  }

  let event;
  try {
    const resend = new Resend(config.apiKey);
    event = await resend.webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret,
    });
  } catch (error) {
    console.warn('resend_webhook_verification_failed', {
      message: String(error?.message || error || 'invalid_signature').slice(0, 300),
    });
    return secure(json({ error: 'resend_webhook_invalid_signature' }, 400));
  }

  const response = await callStore(studio, '/portal/resend-event-v82', { svixId, event });
  const result = await response.json().catch(() => ({}));
  return secure(json(result, response.status));
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioEmailActivity: RELEASE,
    studioEmailSendAnimation: 'provider-confirmed-envelope-animation-v82',
    studioEmailHistory: 'sent-delivered-opened-clicked-failed-v82',
    studioEmailProviderSync: 'resend-api-plus-verified-webhook-v82',
    studioEmailOpenSemantics: 'indicative-open-signal-not-proof-of-reading',
  }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function injectEmailActivity(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/email-activity-v82\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/email-activity-v82\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${EMAIL_ACTIVITY_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${EMAIL_ACTIVITY_JS}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('X-Neptune-Studio-Email-Activity', RELEASE);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients'
    || pathname === '/studio/clients/'
    || pathname === '/studio/clients.html';
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
  headers.set('X-Neptune-Studio-Email-Activity', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/api/admin')) {
    headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
