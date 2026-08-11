import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

const PORT = Number(process.env.PORT || 8080);
const startedAt = Date.now();
let config = null;
let ffmpeg = null;
let runToken = 0;
let state = {
  status: 'idle',
  heartbeatAt: new Date().toISOString(),
  lastError: null,
  currentItem: null,
  revision: null,
  ffmpegPid: null,
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, snapshot());
    if (req.method === 'POST' && req.url === '/control/apply') {
      const next = validateConfig(await readJson(req));
      const changed = !config || config.revision !== next.revision || next.forceRestart === true;
      config = next;
      state.revision = next.revision;
      state.lastError = null;
      touch();
      if (changed) restartLoop();
      return send(res, 200, snapshot());
    }
    if (req.method === 'POST' && req.url === '/control/stop') {
      config = null;
      stopCurrent('control_stop');
      state.status = 'stopped';
      state.currentItem = null;
      state.lastError = null;
      touch();
      return send(res, 200, snapshot());
    }
    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    state.lastError = safeError(error);
    touch();
    return send(res, 400, { error: state.lastError });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`webtv_encoder_listening:${PORT}`);
});

setInterval(touch, 15000).unref();

function restartLoop() {
  runToken += 1;
  stopCurrent('configuration_changed');
  const token = runToken;
  state.status = 'starting';
  state.currentItem = null;
  touch();
  queueMicrotask(() => playoutLoop(token));
}

async function playoutLoop(token) {
  let consecutiveFailures = 0;
  while (token === runToken && config?.enabled) {
    const items = config.playlist.filter((item) => item.mediaUrl);
    if (!items.length) {
      state.status = 'error';
      state.lastError = 'playlist_empty';
      touch();
      await sleep(5000);
      continue;
    }

    for (const item of items) {
      if (token !== runToken || !config?.enabled) return;
      state.status = 'starting';
      state.currentItem = {
        id: item.id,
        title: item.title,
        type: item.type,
        startedAt: new Date().toISOString(),
      };
      state.lastError = null;
      touch();

      const result = await playItem(item, token);
      if (token !== runToken || !config?.enabled) return;

      if (result.ok) {
        consecutiveFailures = 0;
        continue;
      }

      consecutiveFailures += 1;
      state.status = 'error';
      state.lastError = result.error;
      touch();
      await playFallback(token, consecutiveFailures);
      await sleep(Math.min(10000, 1000 * consecutiveFailures));
    }
  }
}

async function playItem(item, token) {
  const hasAudio = probeHasAudio(item.mediaUrl);
  const args = buildFfmpegArgs(item.mediaUrl, hasAudio, config);
  return runFfmpeg(args, token);
}

async function playFallback(token, failureCount) {
  if (token !== runToken || !config?.enabled) return;
  const fallbackUrl = config.fallback?.mediaUrl || '';
  if (fallbackUrl) {
    state.currentItem = {
      id: 'fallback',
      title: config.fallback.title || 'Neptune Media',
      type: 'fallback',
      startedAt: new Date().toISOString(),
    };
    touch();
    const result = await runFfmpeg(buildFfmpegArgs(fallbackUrl, probeHasAudio(fallbackUrl), config), token);
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
  await runFfmpeg(buildSlateArgs(seconds, config), token);
}

function buildFfmpegArgs(mediaUrl, hasAudio, cfg) {
  const e = cfg.encoding;
  const output = streamTarget(cfg);
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-re', '-i', mediaUrl,
  ];
  if (!hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  args.push(
    '-map', '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0?'] : ['-map', '1:a:0']),
    '-vf', `scale=${e.width}:${e.height}:force_original_aspect_ratio=decrease,pad=${e.width}:${e.height}:(ow-iw)/2:(oh-ih)/2,fps=${e.fps},format=yuv420p`,
    '-c:v', 'libx264', '-preset', e.preset, '-tune', 'zerolatency',
    '-b:v', `${e.videoBitrateKbps}k`, '-maxrate', `${e.videoBitrateKbps}k`, '-bufsize', `${e.videoBitrateKbps * 2}k`,
    '-g', String(e.fps * 2), '-keyint_min', String(e.fps * 2), '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', `${e.audioBitrateKbps}k`, '-ar', '48000', '-ac', '2',
    '-af', 'aresample=async=1:first_pts=0',
    '-f', 'flv', output,
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
    '-g', String(e.fps * 2), '-keyint_min', String(e.fps * 2), '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', `${e.audioBitrateKbps}k`, '-ar', '48000', '-ac', '2',
    '-shortest', '-f', 'flv', streamTarget(cfg),
  ];
}

function runFfmpeg(args, token) {
  return new Promise((resolve) => {
    if (token !== runToken) return resolve({ ok: false, error: 'superseded' });
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    ffmpeg = child;
    state.ffmpegPid = child.pid || null;
    state.status = 'streaming';
    touch();
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-4000);
    });
    child.once('error', (error) => {
      if (ffmpeg === child) ffmpeg = null;
      state.ffmpegPid = null;
      resolve({ ok: false, error: sanitizeFfmpegError(error.message) });
    });
    child.once('exit', (code, signal) => {
      if (ffmpeg === child) ffmpeg = null;
      state.ffmpegPid = null;
      touch();
      if (token !== runToken || signal === 'SIGTERM' || signal === 'SIGKILL') return resolve({ ok: false, error: 'stopped' });
      if (code === 0) return resolve({ ok: true });
      return resolve({ ok: false, error: sanitizeFfmpegError(stderr || `ffmpeg_exit_${code}`) });
    });
  });
}

function stopCurrent(reason) {
  const child = ffmpeg;
  ffmpeg = null;
  state.ffmpegPid = null;
  if (child && !child.killed) {
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { if (!child.killed) child.kill('SIGKILL'); } catch {} }, 3000).unref();
  }
  if (reason) console.log(`webtv_encoder_stop:${reason}`);
}

function probeHasAudio(mediaUrl) {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', mediaUrl,
    ], { encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024 });
    return result.status === 0 && String(result.stdout || '').includes('audio');
  } catch {
    return true;
  }
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
  runToken += 1;
  stopCurrent('sigterm');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
});
