import base, { StudioStore } from './entry-v32.js';
import { isSameOrigin, json } from './security.js';

export { StudioStore };

const WEBTV_STATE_KEY = 'webtv/control/state-v1.json';
const WEBTV_STATE_PATH = '/api/admin/webtv/state';
const RELEASE = 'neptune-webtv-control-room-20260811-v1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === WEBTV_STATE_PATH) {
      const auth = await verifyStudioSession(request, env, ctx);
      if (!auth.ok) return auth.response;

      if (request.method === 'GET') {
        return secureApi(json(await readWebTvState(env)));
      }

      if (request.method === 'PUT') {
        if (!isSameOrigin(request)) return secureApi(json({ error: 'origin_forbidden' }, 403));
        const payload = await request.json().catch(() => ({}));
        const state = normalizeWebTvState(payload, auth.user);
        await env.MEDIA.put(WEBTV_STATE_KEY, JSON.stringify(state), {
          httpMetadata: { contentType: 'application/json; charset=utf-8' },
          customMetadata: { release: RELEASE },
        });
        return secureApi(json(state));
      }

      return secureApi(json({ error: 'method_not_allowed' }, 405));
    }

    return base.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function verifyStudioSession(request, env, ctx) {
  const url = new URL(request.url);
  url.pathname = '/api/v1/media/studio/state';
  url.search = '';
  const probe = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await base.fetch(probe, env, ctx);
  if (!response.ok) return { ok: false, response: secureApi(json({ error: 'studio_forbidden' }, response.status === 401 ? 401 : 403)) };
  const data = await response.json().catch(() => ({}));
  return { ok: true, user: data.user || {} };
}

async function readWebTvState(env) {
  const object = await env.MEDIA.get(WEBTV_STATE_KEY);
  if (!object) return defaultWebTvState();
  const parsed = await object.json().catch(() => null);
  return parsed && typeof parsed === 'object' ? { ...defaultWebTvState(), ...parsed, release: RELEASE } : defaultWebTvState();
}

function defaultWebTvState() {
  return {
    release: RELEASE,
    enabled: false,
    mode: 'loop',
    output: {
      provider: 'youtube',
      protocol: 'rtmps',
      configured: false,
    },
    playlist: [],
    fallback: {
      title: 'Neptune Media — La suite arrive dans un instant',
      mediaUrl: '',
    },
    encoder: {
      status: 'not_connected',
      lastHeartbeatAt: null,
      lastError: null,
    },
    updatedAt: null,
    updatedBy: null,
  };
}

function normalizeWebTvState(raw, user) {
  const playlist = Array.isArray(raw.playlist) ? raw.playlist.slice(0, 250).map((item, index) => ({
    id: clean(item.id, 100) || `item-${index + 1}`,
    title: clean(item.title, 180) || `Programme ${index + 1}`,
    mediaUrl: safeMediaUrl(item.mediaUrl),
    durationSeconds: clampNumber(item.durationSeconds, 0, 12 * 60 * 60),
    type: ['episode', 'jingle', 'ad', 'fallback'].includes(item.type) ? item.type : 'episode',
    enabled: item.enabled !== false,
  })).filter((item) => item.mediaUrl) : [];

  return {
    release: RELEASE,
    enabled: raw.enabled === true,
    mode: raw.mode === 'schedule' ? 'schedule' : 'loop',
    output: {
      provider: 'youtube',
      protocol: 'rtmps',
      configured: raw.output?.configured === true,
    },
    playlist,
    fallback: {
      title: clean(raw.fallback?.title, 180) || 'Neptune Media — La suite arrive dans un instant',
      mediaUrl: safeMediaUrl(raw.fallback?.mediaUrl),
    },
    encoder: {
      status: clean(raw.encoder?.status, 40) || 'not_connected',
      lastHeartbeatAt: validIso(raw.encoder?.lastHeartbeatAt),
      lastError: clean(raw.encoder?.lastError, 500) || null,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: clean(user.fullName || user.email, 180) || 'Studio Admin',
  };
}

function safeMediaUrl(value) {
  const raw = clean(value, 2000);
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://tv.neptunebusiness.com');
    if (url.protocol !== 'https:' || url.hostname !== 'tv.neptunebusiness.com') return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function clampNumber(value, min, max) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : 0;
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function secureApi(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
