import { Container, getContainer } from '@cloudflare/containers';
import { isSameOrigin, json } from './security.js';

const WEBTV_STATE_KEY = 'webtv/control/state-v1.json';
const WEBTV_RUNTIME_KEY = 'webtv/runtime/status-v1.json';
const WEBTV_STATE_PATH = '/api/admin/webtv/state';
const WEBTV_ENCODER_PATH = '/api/admin/webtv/encoder';
const ENCODER_INSTANCE_NAME = 'neptune-webtv-primary';
const ALLOWED_ROLES = new Set(['admin', 'editor']);
const DEFAULT_YOUTUBE_LIVE_URL = 'https://youtube.com/live/-k3rG7R8gtc';
export const WEBTV_RELEASE = 'neptune-webtv-control-room-20260811-v5';

export class WebTvEncoder extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = '5m';
  enableInternet = true;

  onStart() { console.log('webtv_encoder_started'); }
  onStop({ exitCode, reason }) { console.log('webtv_encoder_stopped', { exitCode, reason }); }
  onError(error) {
    console.error('webtv_encoder_error', String(error?.message || error));
    throw error;
  }

  async onActivityExpired() {
    try {
      const response = await this.containerFetch('http://localhost/health');
      const runtime = await response.json().catch(() => ({}));
      if (response.ok && ['starting', 'streaming', 'running', 'live'].includes(String(runtime.status || ''))) {
        this.renewActivityTimeout();
        return;
      }
    } catch {}
    await this.stop();
  }
}

export async function handleWebTvRequest(request, env, ctx, delegateFetch) {
  const url = new URL(request.url);
  if (url.pathname !== WEBTV_STATE_PATH && url.pathname !== WEBTV_ENCODER_PATH) return null;

  const auth = await verifyStudioSession(request, env, ctx, delegateFetch);
  if (!auth.ok) return auth.response;

  if (url.pathname === WEBTV_STATE_PATH) {
    if (request.method === 'GET') return secureApi(json(await readWebTvState(env)));
    if (request.method !== 'PUT') return secureApi(json({ error: 'method_not_allowed' }, 405));
    if (!isSameOrigin(request)) return secureApi(json({ error: 'origin_forbidden' }, 403));

    const payload = await request.json().catch(() => ({}));
    const previous = await readWebTvState(env);
    const state = normalizeWebTvState(payload, auth.user, env);

    if (state.enabled && !youtubeConfigured(env)) {
      return secureApi(json({ error: 'youtube_not_configured', requiredSecrets: ['YOUTUBE_RTMPS_URL', 'YOUTUBE_STREAM_KEY'] }, 409));
    }
    if (state.enabled && !state.playlist.some((item) => item.enabled !== false)) {
      return secureApi(json({ error: 'webtv_playlist_empty' }, 409));
    }

    await env.MEDIA.put(WEBTV_STATE_KEY, JSON.stringify(stripRuntime(state)), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: { release: WEBTV_RELEASE },
    });

    if (state.enabled) ctx.waitUntil(maintainWebTv(env, { forceRestart: previous.updatedAt !== state.updatedAt }));
    else if (previous.enabled) ctx.waitUntil(stopEncoder(env, 'disabled_from_studio'));
    return secureApi(json(await readWebTvState(env)));
  }

  if (request.method !== 'POST') return secureApi(json({ error: 'method_not_allowed' }, 405));
  if (!isSameOrigin(request)) return secureApi(json({ error: 'origin_forbidden' }, 403));

  const payload = await request.json().catch(() => ({}));
  const action = String(payload.action || 'refresh').trim().toLowerCase();
  const state = await readWebTvState(env);

  if (action === 'stop') {
    const runtime = await stopEncoder(env, 'manual_stop');
    return secureApi(json({ ok: true, encoder: runtime }));
  }
  if (!state.enabled) return secureApi(json({ error: 'webtv_disabled' }, 409));
  if (!youtubeConfigured(env)) return secureApi(json({ error: 'youtube_not_configured' }, 409));
  if (!state.playlist.some((item) => item.enabled !== false)) return secureApi(json({ error: 'webtv_playlist_empty' }, 409));
  if (!['refresh', 'restart'].includes(action)) return secureApi(json({ error: 'invalid_encoder_action' }, 400));

  const runtime = await syncEncoder(env, state, { forceRestart: action === 'restart' });
  return secureApi(json({ ok: true, encoder: runtime }));
}

export async function maintainWebTv(env, options = {}) {
  const state = await readWebTvState(env);
  if (!state.enabled) return null;
  if (!youtubeConfigured(env)) return writeRuntime(env, runtimeError('youtube_not_configured'));
  if (!state.playlist.some((item) => item.enabled !== false)) return writeRuntime(env, runtimeError('webtv_playlist_empty'));

  try {
    return await syncEncoder(env, state, options);
  } catch (error) {
    console.error('webtv_maintain_failed', String(error?.message || error));
    return writeRuntime(env, runtimeError(clean(error?.message || error, 500) || 'encoder_unreachable'));
  }
}

async function syncEncoder(env, state, { forceRestart = false } = {}) {
  const container = getContainer(env.WEBTV_ENCODER, ENCODER_INSTANCE_NAME);
  const response = await container.fetch('http://encoder/control/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encoderConfiguration(env, state, forceRestart)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `encoder_http_${response.status}`);
  return writeRuntime(env, runtimeFromContainer(data));
}

async function stopEncoder(env, reason) {
  const container = getContainer(env.WEBTV_ENCODER, ENCODER_INSTANCE_NAME);
  let runtime = {
    status: 'stopped', lastHeartbeatAt: new Date().toISOString(), lastError: null, currentItem: null,
  };
  try {
    const response = await container.fetch('http://encoder/control/stop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    const data = await response.json().catch(() => ({}));
    runtime = runtimeFromContainer({ ...data, status: 'stopped', lastError: null });
  } catch {}
  try { await container.stop(); } catch {}
  return writeRuntime(env, runtime);
}

function encoderConfiguration(env, state, forceRestart) {
  return {
    release: WEBTV_RELEASE,
    revision: state.updatedAt || new Date().toISOString(),
    enabled: state.enabled === true,
    forceRestart: forceRestart === true,
    mode: 'loop',
    playlist: state.playlist.filter((item) => item.enabled !== false).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      mediaUrl: absoluteMediaUrl(item.mediaUrl, env),
      durationSeconds: item.durationSeconds || 0,
    })),
    fallback: {
      title: state.fallback?.title || 'Neptune Media',
      mediaUrl: absoluteMediaUrl(state.fallback?.mediaUrl, env),
    },
    output: {
      provider: 'youtube',
      protocol: 'rtmps',
      ingestUrl: youtubeRtmpsUrl(env),
      streamKey: String(env.YOUTUBE_STREAM_KEY || '').trim(),
    },
    encoding: {
      width: intEnv(env.WEBTV_WIDTH, 1280, 640, 1920),
      height: intEnv(env.WEBTV_HEIGHT, 720, 360, 1080),
      fps: intEnv(env.WEBTV_FPS, 30, 24, 60),
      videoBitrateKbps: intEnv(env.WEBTV_VIDEO_BITRATE_KBPS, 4000, 1500, 12000),
      audioBitrateKbps: intEnv(env.WEBTV_AUDIO_BITRATE_KBPS, 128, 96, 320),
      preset: allowedPreset(env.WEBTV_X264_PRESET),
    },
  };
}

async function verifyStudioSession(request, env, ctx, delegateFetch) {
  const url = new URL(request.url);
  url.pathname = '/api/auth/status';
  url.search = '';
  const probe = new Request(url.toString(), { method: 'GET', headers: request.headers });
  const response = await delegateFetch(probe, env, ctx);
  if (!response.ok) return forbidden(response.status === 401 ? 401 : 403);
  const data = await response.json().catch(() => ({}));
  const user = data.user || {};
  if (data.authenticated === false || !ALLOWED_ROLES.has(String(user.role || ''))) return forbidden(403);
  return { ok: true, user };
}

function forbidden(status) {
  return { ok: false, response: secureApi(json({ error: 'studio_forbidden' }, status)) };
}

async function readWebTvState(env) {
  const baseState = defaultWebTvState(env);
  const [object, runtime] = await Promise.all([env.MEDIA.get(WEBTV_STATE_KEY), readRuntime(env)]);
  if (!object) return { ...baseState, encoder: runtime };
  const parsed = await object.json().catch(() => null);
  if (!parsed || typeof parsed !== 'object') return { ...baseState, encoder: runtime };
  return {
    ...baseState,
    ...parsed,
    output: { ...baseState.output, ...(parsed.output || {}), configured: youtubeConfigured(env) },
    encoder: runtime,
    release: WEBTV_RELEASE,
  };
}

async function readRuntime(env) {
  const object = await env.MEDIA.get(WEBTV_RUNTIME_KEY);
  if (!object) return defaultRuntime();
  const parsed = await object.json().catch(() => null);
  if (!parsed || typeof parsed !== 'object') return defaultRuntime();
  return { ...defaultRuntime(), ...parsed, currentItem: parsed.currentItem && typeof parsed.currentItem === 'object' ? parsed.currentItem : null };
}

async function writeRuntime(env, runtime) {
  const value = {
    ...defaultRuntime(), ...runtime,
    lastHeartbeatAt: validIso(runtime.lastHeartbeatAt) || new Date().toISOString(),
    lastError: clean(runtime.lastError, 500) || null,
    currentItem: runtime.currentItem && typeof runtime.currentItem === 'object' ? {
      id: clean(runtime.currentItem.id, 100),
      title: clean(runtime.currentItem.title, 180),
      type: clean(runtime.currentItem.type, 30),
      startedAt: validIso(runtime.currentItem.startedAt),
    } : null,
  };
  await env.MEDIA.put(WEBTV_RUNTIME_KEY, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' }, customMetadata: { release: WEBTV_RELEASE },
  });
  return value;
}

function runtimeError(lastError) {
  return { status: 'error', lastHeartbeatAt: new Date().toISOString(), lastError, currentItem: null };
}

function runtimeFromContainer(data) {
  return {
    status: clean(data.status, 40) || 'starting',
    lastHeartbeatAt: validIso(data.heartbeatAt) || new Date().toISOString(),
    lastError: clean(data.lastError, 500) || null,
    currentItem: data.currentItem || null,
    revision: clean(data.revision, 120) || null,
    ffmpegPid: Number.isFinite(Number(data.ffmpegPid)) ? Number(data.ffmpegPid) : null,
    uptimeSeconds: Number.isFinite(Number(data.uptimeSeconds)) ? Number(data.uptimeSeconds) : 0,
  };
}

function defaultWebTvState(env) {
  const viewer = youtubeViewer(DEFAULT_YOUTUBE_LIVE_URL);
  return {
    release: WEBTV_RELEASE,
    enabled: false,
    mode: 'loop',
    output: { provider: 'youtube', protocol: 'rtmps', configured: youtubeConfigured(env), ...viewer },
    playlist: [],
    fallback: { title: 'Neptune Media — La suite arrive dans un instant', mediaUrl: '' },
    encoder: defaultRuntime(),
    updatedAt: null,
    updatedBy: null,
  };
}

function defaultRuntime() {
  return { status: 'not_connected', lastHeartbeatAt: null, lastError: null, currentItem: null, revision: null, ffmpegPid: null, uptimeSeconds: 0 };
}

function normalizeWebTvState(raw, user, env) {
  const playlist = Array.isArray(raw.playlist) ? raw.playlist.slice(0, 250).map((item, index) => ({
    id: clean(item.id, 100) || `item-${index + 1}`,
    title: clean(item.title, 180) || `Programme ${index + 1}`,
    mediaUrl: safeMediaUrl(item.mediaUrl, env),
    durationSeconds: clampNumber(item.durationSeconds, 0, 12 * 60 * 60),
    type: ['episode', 'jingle', 'ad', 'fallback'].includes(item.type) ? item.type : 'episode',
    enabled: item.enabled !== false,
  })).filter((item) => item.mediaUrl) : [];
  const viewer = youtubeViewer(raw.output?.watchUrl);

  return {
    release: WEBTV_RELEASE,
    enabled: raw.enabled === true,
    mode: 'loop',
    output: { provider: 'youtube', protocol: 'rtmps', configured: youtubeConfigured(env), ...viewer },
    playlist,
    fallback: {
      title: clean(raw.fallback?.title, 180) || 'Neptune Media — La suite arrive dans un instant',
      mediaUrl: safeMediaUrl(raw.fallback?.mediaUrl, env),
    },
    encoder: defaultRuntime(),
    updatedAt: new Date().toISOString(),
    updatedBy: clean(user.fullName || user.email, 180) || 'Studio Admin',
  };
}

function stripRuntime(state) {
  const { encoder, ...control } = state;
  return control;
}

function youtubeConfigured(env) {
  return Boolean(youtubeRtmpsUrl(env) && String(env.YOUTUBE_STREAM_KEY || '').trim());
}

function youtubeRtmpsUrl(env) {
  const raw = String(env.YOUTUBE_RTMPS_URL || '').trim().replace(/\/$/u, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'rtmps:' ? raw : '';
  } catch { return ''; }
}

function youtubeViewer(value) {
  const raw = clean(value, 500);
  if (!raw) return { watchUrl: '', videoId: '' };
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    let videoId = '';
    if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (url.pathname.startsWith('/live/')) videoId = url.pathname.split('/').filter(Boolean)[1] || '';
      else if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
      else if (url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/').filter(Boolean)[1] || '';
    }
    videoId = clean(videoId, 32);
    if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId)) return { watchUrl: '', videoId: '' };
    return { watchUrl: `https://youtube.com/live/${videoId}`, videoId };
  } catch { return { watchUrl: '', videoId: '' }; }
}

function safeMediaUrl(value, env) {
  const raw = clean(value, 2000);
  if (!raw) return '';
  const origin = String(env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com').replace(/\/$/u, '');
  try {
    const base = new URL(origin);
    const url = new URL(raw, base);
    if (url.protocol !== 'https:' || isPrivateHost(url.hostname)) return '';
    if (url.origin === base.origin) return `${url.pathname}${url.search}`;
    return url.toString();
  } catch { return ''; }
}

function absoluteMediaUrl(value, env) {
  const safe = safeMediaUrl(value, env);
  if (!safe) return '';
  if (safe.startsWith('https://')) return safe;
  return `${String(env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com').replace(/\/$/u, '')}${safe}`;
}

function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/gu, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((n) => n < 0 || n > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function intEnv(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function allowedPreset(value) {
  const preset = String(value || 'superfast').trim();
  return ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast'].includes(preset) ? preset : 'superfast';
}

function clean(value, max) { return String(value ?? '').trim().slice(0, max); }
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
  headers.set('X-Neptune-WebTV', WEBTV_RELEASE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
