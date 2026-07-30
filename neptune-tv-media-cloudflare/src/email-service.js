const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const USER_AGENT = 'Neptune-Media-Worker/4.1.0';

export const EMAIL_FROM = 'Neptune Media <contact@neptunebusiness.com>';
export const EMAIL_REPLY_TO = 'contact@neptunebusiness.com';

export function emailConfiguration(env) {
  const apiKey = normalizeApiKey(env?.RESEND_API_KEY);
  return {
    configured: Boolean(apiKey),
    apiKey,
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
  };
}

export async function sendEmail(env, message) {
  const config = emailConfiguration(env);
  if (!config.configured) {
    return failure('email_service_not_configured', 0, 'missing_api_key', 'RESEND_API_KEY is not configured on the Worker.');
  }

  const to = normalizeRecipients(message?.to);
  const subject = String(message?.subject || '').trim();
  const html = String(message?.html || '');
  const text = String(message?.text || '');
  const idempotencyKey = normalizeIdempotencyKey(message?.idempotencyKey);

  if (!to.length || !subject || (!html && !text)) {
    return failure('email_payload_invalid', 0, 'invalid_payload', 'Email recipient, subject and content are required.');
  }

  const payload = {
    from: config.from,
    to,
    subject,
    reply_to: config.replyTo,
  };
  if (html) payload.html = html;
  if (text) payload.text = text;

  const provider = await requestResend(config.apiKey, payload, { idempotencyKey });
  if (!provider.ok) return provider;
  if (!provider.data?.id) {
    return failure('email_send_unconfirmed', provider.status, 'missing_email_id', 'Resend did not return an email id.');
  }

  console.log('email_sent', {
    provider: 'resend',
    emailId: provider.data.id,
    to,
    subject,
    idempotencyKey: idempotencyKey || null,
  });

  return {
    ok: true,
    id: provider.data.id,
    providerStatus: provider.status,
    idempotencyKey: idempotencyKey || null,
  };
}

export async function emailHealthResponse(env) {
  const config = emailConfiguration(env);
  const base = {
    configured: config.configured,
    sender: config.from,
    senderDomain: config.from.match(/@([^>\s]+)/u)?.[1] || '',
    transport: 'resend-rest-v1',
  };

  if (!config.configured) {
    return jsonResponse({
      ...base,
      apiAuthenticated: false,
      providerKeyAccepted: false,
      error: 'email_service_not_configured',
    }, 503);
  }

  const probe = await requestResend(config.apiKey, {});
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

async function requestResend(apiKey, payload, options = {}) {
  let response;
  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('email_provider_unreachable', safeError(error));
    return failure('email_provider_unreachable', 0, 'network_error', 'Resend is unreachable.');
  }

  const raw = await response.text();
  const data = parseJson(raw);
  if (response.ok) return { ok: true, status: response.status, data };

  const providerCode = String(data.name || data.code || 'resend_error').slice(0, 80);
  const providerMessage = String(data.message || raw || 'Resend rejected the request.').slice(0, 240);
  const error = classifyProviderError(response.status, providerMessage);

  console.error('email_provider_rejected', {
    status: response.status,
    code: providerCode,
    message: providerMessage,
    idempotencyKey: options.idempotencyKey || null,
  });

  return failure(error, response.status, providerCode, providerMessage);
}

function classifyProviderError(status, message) {
  if ([401, 403].includes(status)) return 'email_provider_auth_failed';
  if (status === 429) return 'email_provider_rate_limited';
  if (/domain|sender|from address|verify/iu.test(message)) return 'email_sender_not_verified';
  return 'email_send_failed';
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
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item, index, array) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(item) && array.indexOf(item) === index);
}

function normalizeIdempotencyKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_./:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 256);
}

function failure(error, providerStatus, providerCode, providerMessage) {
  return {
    ok: false,
    error,
    providerStatus: Number(providerStatus || 0),
    providerCode: String(providerCode || '').slice(0, 80),
    providerMessage: String(providerMessage || '').slice(0, 240),
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

function safeError(error) {
  return {
    name: error?.name || 'Error',
    message: String(error?.message || error || 'unknown').slice(0, 300),
  };
}
