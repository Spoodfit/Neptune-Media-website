import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8080);
const LOCAL_UDP_PORT = Number(process.env.WEBTV_LOCAL_UDP_PORT || 23000);
const LOCAL_INPUT = `udp://127.0.0.1:${LOCAL_UDP_PORT}?fifo_size=1000000&overrun_nonfatal=1`;
const LOCAL_OUTPUT = `udp://127.0.0.1:${LOCAL_UDP_PORT}?pkt_size=1316`;
const RELAY_RESTART_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
const startedAt = Date.now();

let config = null;
let relay = null;
let playout = null;
let playoutToken = 0;
let relayToken = 0;
let relayRestartTimer = null;
let relayRestartAttempt = 0;
const audioProbeCache = new Map();
const audioProbePending = new Map();

let state = {
  status: 'idle',
  heartbeatAt: new Date().toISOString(),
  lastError: null,
  currentItem: null,
  revision: null,
  ffmpegPid: null,
  relayPid: null,
  playoutPid: null,
  relayRestarts: 0,
  lastOutputProgressAt: null,
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, snapshot());
    if (req.method === 'POST' && req.url === '/control/apply') {
      const next = validateConfig(await readJson(req));
      const previous = config;
      const revisionChanged = !previous || previous.revision !== next.revision;
      const transportChanged = !previous || relayFingerprint(previous) !== relayFingerprint(next);
      const hardRestart = next.forceRestart === true || transportChanged;

      config = next;
      state.revision = next.revision;
      state.lastError = null;
      touch();

      if (hardRestart) restartAll(next.forceRestart ? 'manual_or_forced_restart' : 'transport_changed');
      else if (revisionChanged) restartPlayout('playlist_changed');
      else {
        ensureRelay(relayToken);
        ensurePlayout(playoutToken);
      }
      return send(res, 200, snapshot());
    }
    if (req.method === 'POST' && req.url === '/control/stop') {
      config = null;
      stopAll('control_stop');
      state.status = 'stopped';
      state.currentItem = null;
      state.lastError = null;
      touch();
      return send(res, 200, snapshot());
    }
    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    state.lastError = safeError(error);
    state.status = config?.enabled ? 'error' : state.status;
    touch();
    return send(res, 400, { error: state.lastError });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`webtv_encoder_listening:${PORT}`);
});

setInterval(() => {
  touch();
  if (!config?.enabled) return;
  ensureRelay(relayToken);
  ensurePlayout(playoutToken);
}, 5000).unref();

function restartAll(reason) {
  relayToken += 1;
  playoutToken += 1;
  stopPlayout(reason);
  stopRelay(reason);
  state.status = 'starting';
  state.currentItem = null;
  state.lastOutputProgressAt = null;
  relayRestartAttempt = 0;
  touch();
  ensureRelay(relayToken);
  ensurePlayout(playoutToken);
}

function restartPlayout(reason) {
  playoutToken += 1;
  stopPlayout(reason);
  state.currentItem = null;
  state.status = relay ? 'starting' : 'reconnecting';
  touch();
  ensureRelay(relayToken);
  ensurePlayout(playoutToken);
}

function stopAll(reason) {
  relayToken += 1;
  playoutToken += 1;
  stopPlayout(reason);
  stopRelay(reason);
}

function ensureRelay(token) {
  if (relay || !config?.enabled || token !== relayToken) return;
  clearRelayRestartTimer();
  const child = spawn('ffmpeg', buildRelayArgs(config), { stdio: ['ignore', 'pipe', 'pipe'] });
  relay = child;
  state.relayPid = child.pid || null;
  state.ffmpegPid = child.pid || null;
  state.status = 'starting';
  touch();

  let stderr = '';
  let progressBuffer = '';
  child.stdout.on('data', (chunk) => {
    progressBuffer += chunk.toString('utf8');
    const lines = progressBuffer.split(/\r?\n/u);
    progressBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('out_time_') && line !== 'progress=continue' && line !== 'progress=end') continue;
      if (line.startsWith('out_time_')) {
        state.lastOutputProgressAt = new Date().toISOString();
        state.status = playout ? 'streaming' : 'starting';
        state.lastError = null;
        relayRestartAttempt = 0;
        touch();
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-4000);
  });
  child.once('error', (error) => relayExited(child, token, sanitizeFfmpegError(error.message)));
  child.once('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL' || token !== relayToken || !config?.enabled) {
      if (relay === child) clearRelayProcess(child);
      return;
    }
    relayExited(child, token, sanitizeFfmpegError(stderr || `relay_exit_${code}`));
  });
}

function relayExited(child, token, error) {
  if (relay !== child) return;
  clearRelayProcess(child);
  if (token !== relayToken || !config?.enabled) return;
  state.status = 'reconnecting';
  state.lastError = error || 'youtube_relay_disconnected';
  state.relayRestarts += 1;
  touch();
  const delay = RELAY_RESTART_DELAYS_MS[Math.min(relayRestartAttempt, RELAY_RESTART_DELAYS_MS.length - 1)];
  relayRestartAttempt += 1;
  clearRelayRestartTimer();
  relayRestartTimer = setTimeout(() => {
    relayRestartTimer = null;
    ensureRelay(token);
  }, delay);
  relayRestartTimer.unref?.();
}

function clearRelayProcess(child) {
  if (relay === child) relay = null;
  state.relayPid = null;
  state.ffmpegPid = null;
  touch();
}

function ensurePlayout(token) {
  if (playout || !config?.enabled || token !== playoutToken) return;
  queueMicrotask(() => playoutLoop(token));
}

async function playoutLoop(token) {
  if (playout || token !== playoutToken || !config?.enabled) return;
  let consecutiveFailures = 0;
  while (token === playoutToken && config?.enabled) {
    const items = config.playlist.filter((item) => item.mediaUrl);
    if (!items.length) {
      state.status = 'error';
      state.lastError = 'playlist_empty';
      touch();
      await sleep(5000);
      continue;
    }

    for (let index = 0; index < items.length; index += 1) {
      if (token !== playoutToken || !config?.enabled) return;
      const item = items[index];
      const nextItem = items[(index + 1) % items.length];
      if (nextItem?.mediaUrl) void probeHasAudio(nextItem.mediaUrl);

      state.status = relay ? 'starting' : 'reconnecting';
      state.currentItem = {
        id: item.id,
        title: item.title,
        type: item.type,
        startedAt: new Date().toISOString(),
      };
      state.lastError = null;
      touch();

      const result = await playItem(item, token);
      if (token !== playoutToken || !config?.enabled) return;

      if (result.ok) {
        consecutiveFailures = 0;
        continue;
      }

      consecutiveFailures += 1;
      state.status = relay ? 'starting' : 'reconnecting';
      state.lastError = result.error;
      touch();
      await playFallback(token, consecutiveFailures);
      await sleep(Math.min(5000, 500 * consecutiveFailures));
    }
  }
}

async function playItem(item, token) {
  const hasAudio = await probeHasAudio(item.mediaUrl);
  if (token !== playoutToken || !config?.enabled) return { ok: false, error: 'superseded' };
  return runPlayout(buildPlayoutArgs(item.mediaUrl, hasAudio, config), token);
}

async function playFallback(token, failureCount) {
  if (token !== playoutToken || !config?.enabled) return;
  const fallbackUrl = config.fallback?.mediaUrl || '';
  if (fallbackUrl) {
    state.currentItem = {
      id: 'fallback',
      title: config.fallback.title || 'Neptune Media',
      type: 'fallback',
      startedAt: new Date().toISOString(),
    };
    touch();
    const result = await runPlayout(buildPlayoutArgs(fallbackUrl, await probeHasAudio(fallbackUrl), config), token);
    if (result.ok) return;
  }

  const seconds = Math.min(20, Math.max(5, failureCount * 5));
  state.currentItem = {
    id: 'technical-slate',
    title: 'Neptune Media — reprise de la diffusion',
    type: 'fallback',
    startedAt: new Date().toISOString(),
  };
  touch();
  await runPlayout(buildSlateArgs(seconds, config), token);
}

function buildPlayoutArgs(mediaUrl, hasAudio, cfg) {
  const e = cfg.encoding;
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-re', '-i', mediaUrl,
  ];
  if (!hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  args.push(
    '-map', '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0?'] : ['-map', '1:a:0']),
    '-vf', `scale=${e.width}:${e.height}:force_original_aspect_ratio=decrease,pad=${e.width}:${e.height}:(ow-iw)/2:(oh-ih)/2,fps=${e.fps},format=yuv420p,setpts=PTS-STARTPTS`,
    '-c:v', 'libx264', '-preset', e.preset, '-tune', 'zerolatency',
    '-b:v', `${e.videoBitrateKbps}k`, '-maxrate', `${e.videoBitrateKbps}k`, '-bufsize', `${e.videoBitrateKbps * 2}k`,
    '-g', String(e.fps * 2), '-keyint_min', String(e.fps * 2), '-sc_threshold', '0',
    '-x264-params', 'repeat-headers=1',
    '-c:a', 'aac', '-b:a', `${e.audioBitrateKbps}k`, '-ar', '48000', '-ac', '2',
    '-af', 'aresample=async=1:first_pts=0,apad',
    '-shortest',
    '-muxdelay', '0', '-muxpreload', '0',
    '-mpegts_flags', '+resend_headers+initial_discontinuity',
    '-f', 'mpegts', LOCAL_OUTPUT,
  );
  return args;
}

function buildSlateArgs(seconds, cfg) {
  const e = cfg.encoding;
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-re', '-f', 'lavfi', '-i', `color=c=0x06183f:s=${e.width}x${e.height}:r=${e.fps}:d=${seconds}`,
    '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=48000:d=${seconds}`,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', e.preset, '-tune', 'zerolatency',
    '-b:v', `${e.videoBitrateKbps}k`, '-maxrate', `${e.videoBitrateKbps}k`, '-bufsize', `${e.videoBitrateKbps * 2}k`,
    '-g', String(e.fps * 2), '-keyint_min', String(e.fps * 2), '-sc_threshold', '0',
    '-x264-params', 'repeat-headers=1', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', `${e.audioBitrateKbps}k`, '-ar', '48000', '-ac', '2',
    '-shortest', '-muxdelay', '0', '-muxpreload', '0',
    '-mpegts_flags', '+resend_headers+initial_discontinuity',
    '-f', 'mpegts', LOCAL_OUTPUT,
  ];
}

function buildRelayArgs(cfg) {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-fflags', '+genpts+discardcorrupt',
    '-use_wallclock_as_timestamps', '1',
    '-i', LOCAL_INPUT,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'copy', '-c:a', 'copy',
    '-flvflags', 'no_duration_filesize',
    '-progress', 'pipe:1', '-stats_period', '1',
    '-f', 'flv', streamTarget(cfg),
  ];
}

function runPlayout(args, token) {
  return new Promise((resolve) => {
    if (token !== playoutToken) return resolve({ ok: false, error: 'superseded' });
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    playout = child;
    state.playoutPid = child.pid || null;
    state.status = relay ? 'streaming' : 'reconnecting';
    touch();
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (playout === child) playout = null;
      state.playoutPid = null;
      touch();
      resolve(result);
    };
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-4000);
    });
    child.once('error', (error) => finish({ ok: false, error: sanitizeFfmpegError(error.message) }));
    child.once('exit', (code, signal) => {
      if (token !== playoutToken || signal === 'SIGTERM' || signal === 'SIGKILL') return finish({ ok: false, error: 'stopped' });
      if (code === 0) return finish({ ok: true });
      return finish({ ok: false, error: sanitizeFfmpegError(stderr || `playout_exit_${code}`) });
    });
  });
}

function stopPlayout(reason) {
  const child = playout;
  playout = null;
  state.playoutPid = null;
  terminate(child);
  if (reason) console.log(`webtv_playout_stop:${reason}`);
}

function stopRelay(reason) {
  clearRelayRestartTimer();
  const child = relay;
  relay = null;
  state.relayPid = null;
  state.ffmpegPid = null;
  terminate(child);
  if (reason) console.log(`webtv_relay_stop:${reason}`);
}

function terminate(child) {
  if (!child || child.killed) return;
  try { child.kill('SIGTERM'); } catch {}
  const timer = setTimeout(() => {
    try { if (!child.killed) child.kill('SIGKILL'); } catch {}
  }, 3000);
  timer.unref?.();
}

function clearRelayRestartTimer() {
  if (relayRestartTimer) clearTimeout(relayRestartTimer);
  relayRestartTimer = null;
}

function probeHasAudio(mediaUrl) {
  if (audioProbeCache.has(mediaUrl)) return Promise.resolve(audioProbeCache.get(mediaUrl));
  if (audioProbePending.has(mediaUrl)) return audioProbePending.get(mediaUrl);
  const pending = new Promise((resolve) => {
    const child = spawn('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', mediaUrl,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const hasAudio = value !== false;
      audioProbeCache.set(mediaUrl, hasAudio);
      audioProbePending.delete(mediaUrl);
      resolve(hasAudio);
    };
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString('utf8')).slice(-1024); });
    child.once('error', () => finish(true));
    child.once('exit', (code) => finish(code === 0 ? stdout.includes('audio') : true));
    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish(true);
    }, 15000);
    timeout.unref?.();
  });
  audioProbePending.set(mediaUrl, pending);
  return pending;
}

function relayFingerprint(cfg) {
  return JSON.stringify({
    ingestUrl: cfg.output.ingestUrl,
    streamKey: cfg.output.streamKey,
    encoding: cfg.encoding,
  });
}

function streamTarget(cfg) {
  const base = String(cfg.output.ingestUrl || '').replace(/\/+$/u, '');
  const key = String(cfg.output.streamKey || '').trim();
  if (!base.startsWith('rtmps://') || !key) throw new Error('youtube_output_invalid');
  return `${base}/${encodeURIComponent(key)}`;
}

function validateConfig(raw) {
  if (!raw || raw.enabled !== true) throw new Error('webtv_disabled');
  if (!Array.isArray(raw.playlist) || !raw.playlist.length) throw new Error('playlist_empty');
  if (!raw.output?.ingestUrl || !raw.output?.streamKey) throw new Error('youtube_not_configured');
  const e = raw.encoding || {};
  return {
    enabled: true,
    revision: String(raw.revision || Date.now()),
    forceRestart: raw.forceRestart === true,
    playlist: raw.playlist.slice(0, 250).map((item) => ({
      id: String(item.id || '').slice(0, 100),
      title: String(item.title || 'Programme Neptune').slice(0, 180),
      type: String(item.type || 'episode').slice(0, 30),
      mediaUrl: requireHttps(item.mediaUrl),
    })).filter((item) => item.mediaUrl),
    fallback: {
      title: String(raw.fallback?.title || 'Neptune Media').slice(0, 180),
      mediaUrl: optionalHttps(raw.fallback?.mediaUrl),
    },
    output: {
      ingestUrl: String(raw.output.ingestUrl).trim(),
      streamKey: String(raw.output.streamKey).trim(),
    },
    encoding: {
      width: bounded(e.width, 1280, 640, 1920),
      height: bounded(e.height, 720, 360, 1080),
      fps: bounded(e.fps, 30, 24, 60),
      videoBitrateKbps: bounded(e.videoBitrateKbps, 4000, 1500, 12000),
      audioBitrateKbps: bounded(e.audioBitrateKbps, 128, 96, 320),
      preset: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast'].includes(e.preset) ? e.preset : 'superfast',
    },
  };
}

function requireHttps(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('media_url_forbidden');
  return url.toString();
}

function optionalHttps(value) {
  try { return requireHttps(value); } catch { return ''; }
}

function bounded(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function snapshot() {
  return {
    ...state,
    heartbeatAt: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    relayConnected: Boolean(relay && state.lastOutputProgressAt),
  };
}

function touch() {
  state.heartbeatAt = new Date().toISOString();
}

function sanitizeFfmpegError(value) {
  let text = String(value || 'ffmpeg_error');
  if (config?.output?.streamKey) text = text.split(config.output.streamKey).join('[stream-key]');
  text = text.replace(/rtmps:\/\/[^\s]+/giu, 'rtmps://[youtube]');
  return text.replace(/[\r\n]+/gu, ' ').trim().slice(-500) || 'ffmpeg_error';
}

function safeError(error) {
  return String(error?.message || error || 'error').replace(/[\r\n]+/gu, ' ').slice(0, 500);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('payload_too_large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on('SIGTERM', () => {
  config = null;
  stopAll('sigterm');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
});
