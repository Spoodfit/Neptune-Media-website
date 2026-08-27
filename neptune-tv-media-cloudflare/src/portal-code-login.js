import { sendCode } from './portal-email.js';
import { isSameOrigin, json } from './security.js';

const STORE_NAME = 'neptune-media-main';

export async function handleClientCodeRequest(request, env) {
  if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);

  const payload = await request.json().catch(() => ({}));
  const email = String(payload.email || '').trim().toLowerCase();
  const studio = env.STUDIO.get(env.STUDIO.idFromName(STORE_NAME));

  const storeResponse = await callStore(studio, '/portal/request-code', { email });
  const result = await storeResponse.json().catch(() => ({}));

  if (!storeResponse.ok) return json(result, storeResponse.status);

  if (!result.deliver || !result.code) {
    if (result.retryAfter || result.throttled) {
      return json({
        ok: true,
        delivered: false,
        codeExpected: true,
        retryAfter: Number(result.retryAfter || 0),
        throttled: Boolean(result.throttled),
      });
    }

    if (result.reason === 'invalid_email') {
      return json({ error: 'invalid_email' }, 400);
    }

    // Keep account existence private. Unknown addresses receive the same public
    // acknowledgement as a valid OTP request, without generating or sending mail.
    return json({
      ok: true,
      delivered: true,
      codeExpected: true,
      retryAfter: 0,
      throttled: false,
    });
  }

  const sent = await sendCode(env, request.url, email, result.code);
  if (!sent.ok) {
    await revokeCode(studio, email);
    console.error('client_login_email_failed', {
      to: email,
      error: sent.error,
      providerStatus: sent.providerStatus,
      providerCode: sent.providerCode,
      providerMessage: sent.providerMessage,
    });

    return json({
      error: 'email_send_failed',
      reason: sent.error || 'email_send_failed',
      providerStatus: sent.providerStatus,
      providerCode: sent.providerCode,
    }, 503);
  }

  console.log('client_login_email_sent', { to: email, emailId: sent.id });
  return json({
    ok: true,
    delivered: true,
    codeExpected: true,
    emailId: sent.id,
    retryAfter: 0,
    throttled: false,
  });
}

async function revokeCode(studio, email) {
  try {
    const response = await callStore(studio, '/portal/invalidate-code', { email });
    if (!response.ok) console.error('client_login_code_revoke_failed', { to: email, status: response.status });
  } catch (error) {
    console.error('client_login_code_revoke_failed', {
      to: email,
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
