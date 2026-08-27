import { sendCode } from './portal-email.js';
import { isSameOrigin, json } from './security.js';

const STORE_NAME = 'neptune-media-main';
const PUBLIC_RESPONSE_FLOOR_MS = 180;

export async function handleClientCodeRequest(request, env, ctx) {
  if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);

  const startedAt = Date.now();
  const payload = await request.json().catch(() => ({}));
  const email = String(payload.email || '').trim().toLowerCase();
  const studio = env.STUDIO.get(env.STUDIO.idFromName(STORE_NAME));

  const storeResponse = await callStore(studio, '/portal/request-code', { email });
  const result = await storeResponse.json().catch(() => ({}));

  if (!storeResponse.ok) {
    console.error('client_login_code_store_failed', { status: storeResponse.status });
    return json({ error: 'request_unavailable' }, 503);
  }

  if (result.reason === 'invalid_email') return json({ error: 'invalid_email' }, 400);

  if (result.deliver && result.code) {
    const delivery = deliverCode(studio, env, request.url, email, result.code);
    if (ctx?.waitUntil) ctx.waitUntil(delivery);
    else await delivery;
  }

  // Every syntactically valid email gets exactly the same public response.
  // Account existence, provider delivery ids and server-side throttling remain private.
  await equalizePublicResponse(startedAt);
  return genericAcknowledgement();
}

async function deliverCode(studio, env, requestUrl, email, code) {
  const sent = await sendCode(env, requestUrl, email, code);
  if (!sent.ok) {
    await revokeCode(studio, email);
    console.error('client_login_email_failed', {
      error: sent.error,
      providerStatus: sent.providerStatus,
      providerCode: sent.providerCode,
      providerMessage: sent.providerMessage,
    });
    return;
  }
  console.log('client_login_email_sent', { emailId: sent.id });
}

function genericAcknowledgement() {
  return json({
    ok: true,
    delivered: true,
    codeExpected: true,
  });
}

async function equalizePublicResponse(startedAt) {
  const jitter = crypto.getRandomValues(new Uint32Array(1))[0] % 80;
  const remaining = PUBLIC_RESPONSE_FLOOR_MS + jitter - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

async function revokeCode(studio, email) {
  try {
    const response = await callStore(studio, '/portal/invalidate-code', { email });
    if (!response.ok) console.error('client_login_code_revoke_failed', { status: response.status });
  } catch (error) {
    console.error('client_login_code_revoke_failed', {
      message: String(error?.message || error || 'unknown').slice(0, 200),
    });
  }
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}
