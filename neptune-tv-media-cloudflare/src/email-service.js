import { Resend } from 'resend';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const USER_AGENT = 'Neptune-Media-Worker/5.0.0';
const MAX_SEND_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [350, 900];

export const EMAIL_FROM = 'Neptune Media <contact@neptunebusiness.com>';
export const EMAIL_REPLY_TO = 'contact@neptunebusiness.com';

export function emailConfiguration(env) {
  const apiKey = normalizeApiKey(env?.RESEND_API_KEY);
  const from = normalizeSender(env?.RESEND_FROM_EMAIL || env?.AUTH_FROM_EMAIL || EMAIL_FROM) || EMAIL_FROM;
  const replyTo = normalizeAddress(env?.RESEND_REPLY_TO_EMAIL || env?.AUTH_REPLY_TO_EMAIL || extractAddress(from) || EMAIL_REPLY_TO)
    || EMAIL_REPLY_TO;
  return {
    configured: Boolean(apiKey),
    apiKey,
    from,
    replyTo,
  };
}

export async function sendEmail(env, message) {
  const config = emailConfiguration(env);
  if (!config.configured) {
    return failure('email_service_not_configured', 0, 'missing_api_key', 'RESEND_API_KEY is not configured on the Worker.', false, 0);
  }

  const to = normalizeRecipients(message?.to);
  const subject = String(message?.subject || '').trim();
  const html = String(message?.html || '');
  const text = String(message?.text || '');
  const idempotencyKey = normalizeIdempotencyKey(message?.idempotencyKey);

  if (!to.length || !subject || (!html && !text)) {
    return failure('email_payload_invalid', 0, 'invalid_payload', 'Email recipient, subject and content are required.', false, 0);
  }

  const payload = {
    from: config.from,
    to,
    subject,
    replyTo: config.replyTo,
  };
  if (html) payload.html = html;
  if (text) payload.text = text;

  const provider = await sendWithResend(config.apiKey, payload, { idempotencyKey });
  if (!provider.ok) return provider;
  if (!provider.data?.id) {
    return failure('email_send_unconfirmed', provider.status, 'missing_email_id', 'Resend did not return an email id.', false, provider.attempts);
  }

  console.log('email_sent', {
    provider: 'resend',
    transport: 'resend-node',
    emailId: provider.data.id,
    from: config.from,
    to,
    subject,
    attempts: provider.attempts,
    idempotencyKey: idempotencyKey || null,
  });

  return {
    ok: true,
    id: provider.data.id,
    providerStatus: provider.status,
    attempts: provider.attempts,
    idempotencyKey: idempotencyKey || null,
  };
}

export async function emailHealthResponse(env) {
  const config = emailConfiguration(env);
  const base = {
    configured: config.configured,
    sender: config.from,
    senderDomain: extractAddress(config.from).split('@')[1] || '',
    replyTo: config.replyTo,
    transport: 'resend-node-6.18.0',
    retryPolicy: `${MAX_SEND_ATTEMPTS}-attempts-idempotent`,
  };

  if (!config.configured) {
    return jsonResponse({
      ...base,
      apiAuthenticated: false,
      providerKeyAccepted: false,
      error: 'email_service_not_configured',
    }, 503);
  }

  const probe = await requestResendProbe(config.apiKey);
  const providerStatus = Number(probe.status ?? probe.providerStatus ?? 0);
  const authenticated = probe.ok || [400, 422].includes(providerStatus);
  return jsonResponse({
    ...base,
    apiAuthenticated: authenticated,
    providerKeyAccepted: authenticated,
    providerStatus,
    providerCode: probe.providerCode || '',
    providerMessage: probe.providerMessage || '',
    error: authenticated ? undefined : probe.error,
  }, authenticated ? 200 : 503);
}

async function sendWithResend(apiKey, payload, options = {}) {
  const client = new Resend(apiKey);
  let lastFailure = null;

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await client.emails.send(
        payload,
        options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
      );

      if (!error) return { ok: true, status: 200, data, attempts: attempt };

      lastFailure = normalizeProviderFailure(error, attempt);
    } catch (error) {
      lastFailure = failure(
        'email_provider_unreachable',
        0,
        error?.name || 'network_error',
        error?.message || 'Resend is unreachable.',
        true,
        attempt,
      );
    }

    console.error('email_provider_attempt_failed', {
      attempt,
      maxAttempts: MAX_SEND_ATTEMPTS,
      status: lastFailure.providerStatus,
      code: lastFailure.providerCode,
      error: lastFailure.error,
      message: lastFailure.providerMessage,
      retryable: lastFailure.retryable,
      idempotencyKey: options.idempotencyKey || null,
    });

    if (!lastFailure.retryable || attempt >= MAX_SEND_ATTEMPTS) return lastFailure;
    await sleep(RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS.at(-1));
  }

  return lastFailure || failure('email_send_failed', 0, 'unknown_error', 'Resend failed without a response.', false, MAX_SEND_ATTEMPTS);
}

async function requestResendProbe(apiKey) {
  let response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: '{}',
    });
  } catch (error) {
    console.error('email_health_provider_unreachable', safeError(error));
    return failure('email_provider_unreachable', 0, 'network_error', 'Resend is unreachable.', true, 1);
  }

  const raw = await response.text();
  const data = parseJson(raw);
  if (response.ok) return { ok: true, status: response.status, data };

  const providerCode = String(data.name || data.code || 'resend_error').slice(0, 80);
  const providerMessage = String(data.message || raw || 'Resend rejected the request.').slice(0, 500);
  return failure(
    classifyProviderError(response.status, providerCode, providerMessage),
    response.status,
    providerCode,
    providerMessage,
    isRetryable(response.status, providerCode, providerMessage),
    1,
  );
}

function normalizeProviderFailure(error, attempt) {
  const providerStatus = Number(error?.statusCode || error?.status || error?.httpStatus || 0);
  const providerCode = String(error?.name || error?.code || 'resend_error').slice(0, 80);
  const providerMessage = String(error?.message || error?.error || 'Resend rejected the request.').slice(0, 500);
  return failure(
    classifyProviderError(providerStatus, providerCode, providerMessage),
    providerStatus,
    providerCode,
    providerMessage,
    isRetryable(providerStatus, providerCode, providerMessage),
    attempt,
  );
}

function classifyProviderError(status, code, message) {
  const detail = `${code} ${message}`;
  if (/domain|sender|from address|not verified|verify your domain/iu.test(detail)) return 'email_sender_not_verified';
  if (/testing emails|own email address|recipient restriction/iu.test(detail)) return 'email_recipient_restricted';
  if (/suppression|suppressed|bounce|complaint/iu.test(detail)) return 'email_recipient_suppressed';
  if (/daily_quota|monthly_quota|quota exceeded/iu.test(detail)) return 'email_provider_quota_exceeded';
  if (/invalid_idempotent_request/iu.test(detail)) return 'email_idempotency_conflict';
  if (/concurrent_idempotent_requests/iu.test(detail)) return 'email_provider_busy';
  if ([401, 403].includes(status)) return 'email_provider_auth_failed';
  if (status === 429) return 'email_provider_rate_limited';
  if (status >= 500) return 'email_provider_unavailable';
  if (/invalid.*recipient|recipient.*invalid/iu.test(detail)) return 'email_recipient_invalid';
  if (/validation|invalid_from_address|missing_required_field/iu.test(detail)) return 'email_payload_rejected';
  return 'email_send_failed';
}

function isRetryable(status, code, message) {
  const detail = `${code} ${message}`;
  if (/concurrent_idempotent_requests/iu.test(detail)) return true;
  if (/daily_quota|monthly_quota|invalid_idempotent_request/iu.test(detail)) return false;
  return status === 0 || status === 429 || status >= 500;
}

function normalizeApiKey(value) {
  return String(value || '')
    .trim()
    .replace(/^Bearer\s+/iu, '')
    .replace(/^(?:"([^"]+)"|'([^']+)')$/u, '$1$2')
    .replace(/[\r\n]/gu, '')
    .trim();
}

function normalizeRecipients(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => normalizeAddress(item))
    .filter((item, index, array) => item && array.indexOf(item) === index);
}

function normalizeAddress(value) {
  const address = extractAddress(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(address) ? address : '';
}

function normalizeSender(value) {
  const text = String(value || '').trim().replace(/[\r\n]/gu, ' ');
  return normalizeAddress(text) ? text.slice(0, 320) : '';
}

function extractAddress(value) {
  const text = String(value || '').trim();
  const match = text.match(/<([^<>]+)>/u);
  return String(match?.[1] || text).trim();
}

function normalizeIdempotencyKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_./:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 256);
}

function failure(error, providerStatus, providerCode, providerMessage, retryable = false, attempts = 0) {
  return {
    ok: false,
    error,
    providerStatus: Number(providerStatus || 0),
    providerCode: String(providerCode || '').slice(0, 80),
    providerMessage: String(providerMessage || '').slice(0, 500),
    retryable: Boolean(retryable),
    attempts: Number(attempts || 0),
  };
}

function jsonResponse(payload, status) {
  const clean = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  return new Response(JSON.stringify(clean), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function parseJson(value) {
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return {};
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(milliseconds || 0))));
}

function safeError(error) {
  return {
    name: error?.name || 'Error',
    message: String(error?.message || error || 'unknown').slice(0, 300),
  };
}
