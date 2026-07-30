import { isSameOrigin, json, sanitizeText, securityHeaders } from './security.js';

const VIDEO_EVENTS = new Set([
  'impression', 'view', 'play', 'watch', 'pause',
  'progress_25', 'progress_50', 'progress_75', 'complete',
  'share', 'booking_click',
]);
const IGNORED_VIDEO_EVENTS = new Set(['impression', 'play', 'pause']);
const AD_EVENTS = new Set(['impression', 'play', 'complete', 'click']);
const DIRECT_PATHS = new Map([
  ['/api/track', 'video'],
  ['/api/ad-track', 'ad'],
]);
const BATCH_PATH = '/api/analytics/batch';
const MAX_BATCH_EVENTS = 120;
const MAX_BATCH_BYTES = 64 * 1024;
const MAX_SINGLE_BYTES = 16 * 1024;

export async function handleEdgeAnalytics(request, env, ctx) {
  const url = new URL(request.url);
  const directKind = DIRECT_PATHS.get(url.pathname);
  if (!directKind && url.pathname !== BATCH_PATH) return null;
  if (request.method !== 'POST') return secure(json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' }));
  if (!isSameOrigin(request)) return secure(json({ error: 'origin_forbidden' }, 403));

  if (directKind) {
    const payload = await readJsonLimited(request, MAX_SINGLE_BYTES);
    if (!payload.ok) return secure(json({ error: payload.error }, payload.status));
    const event = normalizeEvent(directKind, payload.value, request);
    if (!event) return secure(json({ error: 'invalid_event' }, 400));
    if (event.kind === 'video' && IGNORED_VIDEO_EVENTS.has(event.event)) {
      return secure(json({ ok: true, accepted: 0, ignored: true }, 202));
    }

    const analyticsAvailable = writeAnalytics(env, event);
    if (isOperationalEvent(event, true, new Set())) {
      ctx.waitUntil(persistEvents(env, [event]).catch(logPersistenceFailure));
    }
    return secure(json({
      ok: true,
      accepted: 1,
      storage: analyticsAvailable ? 'analytics-engine' : 'operational-sqlite-only',
    }, 202));
  }

  const payload = await readJsonLimited(request, MAX_BATCH_BYTES);
  if (!payload.ok) return secure(json({ error: payload.error }, payload.status));
  const source = Array.isArray(payload.value?.events) ? payload.value.events.slice(0, MAX_BATCH_EVENTS) : [];
  const events = source
    .map((item) => normalizeEvent(item?.kind, item, request))
    .filter((item) => item && !(item.kind === 'video' && IGNORED_VIDEO_EVENTS.has(item.event)));
  if (!events.length) return secure(json({ ok: true, accepted: 0 }, 202));

  let analyticsAvailable = Boolean(env.MEDIA_ANALYTICS?.writeDataPoint);
  for (const event of events) analyticsAvailable = writeAnalytics(env, event) && analyticsAvailable;

  const closingEpisodes = new Set(
    events
      .filter((item) => item.kind === 'video' && item.event === 'complete')
      .map((item) => item.episodeId),
  );
  const finalBatch = payload.value?.final === true;
  const operational = events.filter((item) => isOperationalEvent(item, finalBatch, closingEpisodes));
  if (operational.length) ctx.waitUntil(persistEvents(env, operational).catch(logPersistenceFailure));

  return secure(json({
    ok: true,
    accepted: events.length,
    operational: operational.length,
    storage: analyticsAvailable ? 'analytics-engine' : 'operational-sqlite-only',
  }, 202));
}

function normalizeEvent(kindValue, raw = {}, request) {
  const kind = kindValue === 'ad' ? 'ad' : kindValue === 'video' ? 'video' : '';
  const event = sanitizeText(raw.event, 40);
  const sessionId = sanitizeText(raw.sessionId, 100);
  const episodeId = sanitizeText(raw.episodeId, 100);
  const adId = sanitizeText(raw.adId, 100);
  if (!kind || !sessionId) return null;
  if (kind === 'video' && (!episodeId || !VIDEO_EVENTS.has(event))) return null;
  if (kind === 'ad' && (!adId || !AD_EVENTS.has(event))) return null;
  const device = raw.device && typeof raw.device === 'object' ? raw.device : {};
  return {
    kind,
    event,
    sessionId,
    episodeId,
    adId,
    position: clamp(raw.position, 0, 86400),
    delta: clamp(raw.delta, 0, 3600),
    referrer: safeReferrer(raw.referrer || request.headers.get('Referer') || ''),
    language: sanitizeText(device.language || '', 40),
    width: clamp(device.width, 0, 10000),
    touch: device.touch === true,
    path: sanitizeText(new URL(request.url).pathname, 160),
  };
}

function writeAnalytics(env, item) {
  if (!env.MEDIA_ANALYTICS?.writeDataPoint) return false;
  try {
    const identity = item.kind === 'ad' ? item.adId : item.episodeId;
    env.MEDIA_ANALYTICS.writeDataPoint({
      indexes: [`${item.kind}:${identity}`.slice(0, 96)],
      blobs: [
        item.kind,
        item.event,
        item.episodeId || '',
        item.adId || '',
        item.sessionId,
        item.referrer,
        item.language,
        item.path,
      ],
      doubles: [item.position, item.delta, item.width, item.touch ? 1 : 0, 1],
    });
    return true;
  } catch (error) {
    console.error('analytics_engine_write_failed', safeError(error));
    return false;
  }
}

function isOperationalEvent(item, finalBatch, closingEpisodes) {
  if (item.kind === 'ad') return true;
  if ([
    'view',
    'progress_25',
    'progress_50',
    'progress_75',
    'complete',
    'share',
    'booking_click',
  ].includes(item.event)) return true;
  if (item.event !== 'watch') return false;
  return finalBatch || closingEpisodes.has(item.episodeId);
}

async function persistEvents(env, items) {
  const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const unique = deduplicateOperational(items);
  const results = await Promise.allSettled(unique.map((item) => studio.fetch(
    item.kind === 'ad' ? 'https://store/public/ad-track' : 'https://store/public/track',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: item.event,
        sessionId: item.sessionId,
        episodeId: item.episodeId,
        adId: item.adId,
        position: item.position,
        delta: item.delta,
        referrer: item.referrer,
        device: { width: item.width, touch: item.touch, language: item.language },
      }),
    },
  )));
  const failed = results.filter((result) => result.status === 'rejected' || !result.value?.ok);
  if (failed.length) throw new Error(`operational_analytics_failed:${failed.length}`);
}

function deduplicateOperational(items) {
  const map = new Map();
  for (const item of items) {
    const key = [item.kind, item.event, item.sessionId, item.episodeId, item.adId].join(':');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item });
      continue;
    }
    if (item.event === 'watch') {
      existing.delta = Math.min(3600, Number(existing.delta || 0) + Number(item.delta || 0));
      existing.position = Math.max(Number(existing.position || 0), Number(item.position || 0));
    }
  }
  return [...map.values()];
}

async function readJsonLimited(request, maxBytes) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, error: 'payload_too_large', status: 413 };
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) return { ok: false, error: 'payload_too_large', status: 413 };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(buffer) || '{}') };
  } catch {
    return { ok: false, error: 'invalid_json', status: 400 };
  }
}

function safeReferrer(value) {
  try {
    const url = new URL(String(value || ''));
    return sanitizeText(`${url.origin}${url.pathname}`, 800);
  } catch {
    return '';
  }
}

function clamp(value, min, max) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

function logPersistenceFailure(error) {
  console.error('operational_analytics_persistence_failed', safeError(error));
}

function safeError(error) {
  return { name: error?.name || 'Error', message: String(error?.message || error || 'unknown').slice(0, 500) };
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
