const encoder = new TextEncoder();

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toBase64Url(data);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return toHex(new Uint8Array(digest));
}

// The Workers Free plan allows 10 ms of CPU per request. The stored iteration
// count keeps each password record independently upgradeable.
export async function hashPassword(password, salt = randomToken(16), iterations = 30000) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
  return { salt, iterations, hash: toHex(new Uint8Array(bits)) };
}

export async function verifyPassword(password, record) {
  const result = await hashPassword(password, record.salt, Number(record.iterations));
  return timingSafeEqual(result.hash, record.hash);
}

export function timingSafeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookie(token, requestUrl, maxAge = 43200) {
  const url = new URL(requestUrl);
  const secure = !['localhost', '127.0.0.1'].includes(url.hostname);
  return [
    `__Host-neptune_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join('; ');
}

export function clearSessionCookie(requestUrl) {
  return sessionCookie('', requestUrl, 0);
}

export function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function sanitizeText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function sanitizeUrl(value, max = 1500) {
  const text = sanitizeText(value, max);
  if (!text) return '';
  if (text.startsWith('/')) return text;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString().slice(0, max);
  } catch {
    return '';
  }
}

export function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export function securityHeaders(headers = {}) {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=() ',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://static.cloudflareinsights.com",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "media-src 'self' https: blob:",
      "connect-src 'self' https://cloudflareinsights.com https://huggingface.co https://cdn-lfs.huggingface.co https://*.hf.co https://*.r2.cloudflarestorage.com",
      "font-src 'self' data:",
      "object-src 'none'",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://media.neptunebusiness.com",
      "upgrade-insecure-requests",
    ].join('; '),
    ...headers,
  };
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
