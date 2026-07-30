import { timingSafeEqual } from './security.js';

const encoder = new TextEncoder();

export async function signVideoAiUrl(env, origin, pathname, jobId, purpose, ttlSeconds = 3600) {
  const expires = Math.floor(Date.now() / 1000) + Math.max(60, Number(ttlSeconds || 3600));
  const signature = await signatureFor(env, pathname, jobId, purpose, expires);
  const url = new URL(pathname, origin);
  url.searchParams.set('job', jobId);
  url.searchParams.set('purpose', purpose);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('signature', signature);
  return url.toString();
}

export async function verifyVideoAiRequest(request, env, expectedPurpose, expectedJobId = '') {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get('job') || '').trim();
  const purpose = String(url.searchParams.get('purpose') || '').trim();
  const expires = Number(url.searchParams.get('expires') || 0);
  const supplied = String(url.searchParams.get('signature') || '').trim();
  if (!jobId || purpose !== expectedPurpose || (expectedJobId && jobId !== expectedJobId)) return null;
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) - 30) return null;
  if (expires > Math.floor(Date.now() / 1000) + 24 * 60 * 60) return null;
  const expected = await signatureFor(env, url.pathname, jobId, purpose, expires);
  return supplied && timingSafeEqual(supplied, expected) ? { jobId, purpose, expires } : null;
}

async function signatureFor(env, pathname, jobId, purpose, expires) {
  const secret = internalSecret(env);
  if (!secret) throw new Error('video_ai_internal_secret_missing');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const payload = [pathname, jobId, purpose, String(expires)].join('\n');
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(digest));
}

function internalSecret(env) {
  return String(env?.VIDEO_AI_INTERNAL_SECRET || env?.DRIVE_WEBHOOK_SECRET || env?.CONVERSION_WEBHOOK_SECRET || '').trim();
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
