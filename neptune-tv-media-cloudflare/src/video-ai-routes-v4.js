import { getContainer } from '@cloudflare/containers';
import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json, securityHeaders } from './security.js';
import { handleVideoAiRoute as previousHandle } from './video-ai-routes-v3.js';
import { handleVideoAiRoute as legacyHandle } from './video-ai-routes-v1.js';
import {
  enqueueVideoJob,
  enqueueWarmup,
  reconcileVideoJobsThroughQueue,
  videoProcessorPoolId,
} from './video-ai-queue-v70.js';

const RELEASE = 'neptune-video-fast-reliable-20260801-v70';
const LIVE_TIMEOUT_MS = 3000;
const STUCK_STARTUP_MS = 2 * 60 * 1000;

export { reconcileVideoJobsThroughQueue as reconcileVideoAiJobs };

export async function handleVideoAiRoute(request, env, ctx, studio) {
  const url = new URL(request.url);
  const jobMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)$/u);
  const retryMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)\/retry$/u);

  if (jobMatch && request.method === 'GET') {
    return readAdminJob(request, env, studio, decodeURIComponent(jobMatch[1]));
  }
  if (retryMatch && request.method === 'POST') {
    return secure(await retryAdminJob(request, env, studio, decodeURIComponent(retryMatch[1]), url.origin));
  }
  if (url.pathname === '/api/admin/video-ai/upload/complete' && request.method === 'POST') {
    return secure(await completeQueuedUpload(request, env, studio, url.origin));
  }
  if (url.pathname === '/api/admin/video-ai/warmup' && request.method === 'POST') {
    return secure(await warmupFromStudio(request, env, studio));
  }

  return previousHandle(request, env, ctx, studio);
}

async function readAdminJob(request, env, studio, jobId) {
  const response = await legacyHandle(request, env, {}, studio);
  if (!response?.ok) return response;
  const result = await response.json().catch(() => ({}));
  const job = result.job || {};
  const active = ['queued', 'processing'].includes(job.status);

  if (active && env.VIDEO_PROCESSOR) {
    try {
      const live = await readLiveState(env, jobId);
      if (live) {
        result.job = {
          ...job,
          progress: Number(live.progress ?? job.progress ?? 0),
          stage: String(live.stage || job.stage || 'processing'),
          ...sanitizeLiveTelemetry(live),
        };
      } else {
        result.job = {
          ...job,
          liveTelemetryAvailable: false,
          liveTelemetryReason: 'preparing_video',
        };
        await recoverStuckStartup(env, studio, result.job);
      }
    } catch (error) {
      result.job = {
        ...job,
        liveTelemetryAvailable: false,
        liveTelemetryReason: classifyLiveError(error),
      };
      await recoverStuckStartup(env, studio, result.job);
    }
  }

  return secure(json(result));
}

async function completeQueuedUpload(request, env, studio, origin) {
  const security = await requireAdminRequest(request, studio);
  if (!security.ok) return security.response;
  if (!env.MEDIA) return json({ error: 'media_storage_unavailable' }, 503);
  if (!env.VIDEO_JOBS) return json({ error: 'video_job_queue_missing' }, 503);

  const payload = await request.json().catch(() => ({}));
  const jobId = String(payload.jobId || '').trim();
  const key = String(payload.key || '').trim();
  const uploadId = String(payload.uploadId || '').trim();
  const parts = Array.isArray(payload.parts)
    ? payload.parts.map((part) => ({
      partNumber: Number(part.partNumber),
      etag: String(part.etag || ''),
    })).filter((part) => part.partNumber > 0 && part.etag)
    : [];
  const authorized = await readAuthorizedJob(studio, security.auth, jobId);
  if (!authorized.ok) return authorized.response;
  if (authorized.job.sourceKey !== key || !uploadId || !parts.length || !validSourceKey(key)) {
    return json({ error: 'invalid_upload_completion' }, 400);
  }

  const upload = env.MEDIA.resumeMultipartUpload(key, uploadId);
  const object = await upload.complete(parts);
  const updateResponse = await updateJob(studio, {
    jobId,
    status: 'queued',
    stage: 'queued',
    progress: 5,
    errorCode: '',
    errorDetail: '',
  });
  if (!updateResponse.ok) return updateResponse;

  const job = { ...authorized.job, sourceKey: key, etag: object.httpEtag };
  await enqueueVideoJob(env, job, origin, 'upload_complete');
  return json({
    ok: true,
    jobId,
    status: 'queued',
    stage: 'queued',
    progress: 5,
    etag: object.httpEtag,
    reliableQueue: true,
  });
}

async function retryAdminJob(request, env, studio, jobId, origin) {
  const security = await requireAdminRequest(request, studio);
  if (!security.ok) return security.response;
  const authorized = await readAuthorizedJob(studio, security.auth, jobId);
  if (!authorized.ok) return authorized.response;
  if (!authorized.job?.sourceKey) return json({ error: 'video_source_missing' }, 409);

  const updateResponse = await updateJob(studio, {
    jobId,
    status: 'queued',
    stage: 'queued',
    progress: 5,
    errorCode: '',
    errorDetail: '',
  });
  if (!updateResponse.ok) return updateResponse;
  await enqueueVideoJob(env, authorized.job, origin, 'manual_retry');
  return json({ ok: true, jobId, status: 'queued', reliableQueue: true });
}

async function warmupFromStudio(request, env, studio) {
  const security = await requireAdminRequest(request, studio);
  if (!security.ok) return security.response;
  const queued = await enqueueWarmup(env, 'studio_open');
  return json({ ok: true, ...queued });
}

async function requireAdminRequest(request, studio) {
  if (!isSameOrigin(request)) return { ok: false, response: json({ error: 'origin_forbidden' }, 403) };
  if (!request.headers.get('X-CSRF-Token')) return { ok: false, response: json({ error: 'csrf_failed' }, 403) };
  const auth = adminAuth(request);
  const response = await callStore(studio, '/portal/video-ai-bootstrap', auth);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return { ok: false, response: json(data, response.status) };
  }
  return { ok: true, auth };
}

async function readAuthorizedJob(studio, auth, jobId) {
  const response = await callStore(studio, '/portal/video-ai-job-get', { ...auth, jobId });
  const data = await response.json().catch(() => ({}));
  return response.ok
    ? { ok: true, job: data.job, clips: data.clips || [] }
    : { ok: false, response: json(data, response.status) };
}

async function recoverStuckStartup(env, studio, job) {
  const stage = String(job.stage || '');
  if (!['queued', 'starting', 'restarting'].includes(stage)) return false;
  const updatedAt = Date.parse(job.updatedAt || job.createdAt || '');
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt < STUCK_STARTUP_MS) return false;
  if (!job.sourceKey || !env.VIDEO_JOBS) return false;

  await updateJob(studio, {
    jobId: job.id,
    status: 'queued',
    stage: 'restarting',
    progress: 6,
    errorCode: '',
    errorDetail: '',
  });
  await enqueueVideoJob(env, job, env.PUBLIC_ORIGIN, 'startup_watchdog');
  job.status = 'queued';
  job.stage = 'restarting';
  job.progress = 6;
  job.automaticRecovery = true;
  return true;
}

async function readLiveState(env, jobId) {
  const instance = getContainer(env.VIDEO_PROCESSOR, videoProcessorPoolId(jobId));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('live_telemetry_timeout'), LIVE_TIMEOUT_MS);
  try {
    const response = await instance.fetch(new Request(`http://container/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    }));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`live_telemetry_http_${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeLiveTelemetry(live) {
  const preview = String(live?.previewDataUrl || '');
  const metrics = sanitizeMetrics(live?.metrics);
  const events = Array.isArray(live?.events)
    ? live.events.slice(-8).map((event) => ({
      at: safeString(event?.at, 80),
      stage: safeString(event?.stage, 80),
      label: safeString(event?.label, 180),
      detail: safeString(event?.detail, 260),
    }))
    : [];
  const currentClip = live?.currentClip && typeof live.currentClip === 'object'
    ? {
      index: safeNumber(live.currentClip.index),
      total: safeNumber(live.currentClip.total),
      id: safeString(live.currentClip.id, 120),
      title: safeString(live.currentClip.title, 240),
    }
    : null;

  return {
    liveTelemetryAvailable: true,
    liveProcessorState: safeString(live?.state || 'processing', 60),
    liveActivity: safeString(live?.activity || live?.stage || 'Traitement en cours', 240),
    liveDetail: safeString(live?.detail, 500),
    liveUpdatedAt: safeString(live?.updatedAt || live?.heartbeatAt, 80),
    liveHeartbeatAt: safeString(live?.heartbeatAt || live?.updatedAt, 80),
    liveStartedAt: safeString(live?.startedAt, 80),
    liveStageStartedAt: safeString(live?.stageStartedAt, 80),
    liveElapsedSeconds: safeNumber(live?.elapsedSeconds),
    liveStageProgress: Math.max(0, Math.min(1, Number(live?.stageProgress || 0))),
    liveMetrics: metrics,
    liveEvents: events,
    liveCurrentClip: currentClip,
    liveRenderedCount: safeNumber(live?.rendered),
    liveCandidateCount: safeNumber(live?.candidateCount),
    livePreviewDataUrl: preview.startsWith('data:image/jpeg;base64,') && preview.length < 250000 ? preview : '',
    livePreviewLabel: safeString(live?.previewLabel, 260),
  };
}

function sanitizeMetrics(value) {
  if (!value || typeof value !== 'object') return {};
  const allowed = [
    'downloadedBytes', 'totalBytes', 'bytesPerSecond', 'remainingSeconds',
    'processedVideoSeconds', 'videoDurationSeconds', 'transcribedChunks',
    'totalChunks', 'transcribedSeconds', 'visualSamples', 'totalVisualSamples',
    'faceCount', 'renderedClipSeconds', 'currentClipDurationSeconds',
  ];
  const output = {};
  for (const key of allowed) {
    if (Number.isFinite(Number(value[key]))) output[key] = Number(value[key]);
  }
  return output;
}

function classifyLiveError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('timeout') || message.includes('abort')) return 'preparing_video';
  if (message.includes('404')) return 'preparing_video';
  return 'signal_temporarily_unavailable';
}

function updateJob(studio, payload) {
  return callStore(studio, '/portal/video-ai-job-update', { system: true, ...payload });
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function validSourceKey(value) {
  const key = String(value || '');
  return key.startsWith('video-ai/sources/') && key.length < 1000 && !key.includes('..') && !/[\r\n]/u.test(key);
}

function safeString(value, maximum) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/gu, ' ').trim().slice(0, maximum);
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  headers.set('X-Neptune-Video-Reliability', RELEASE);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
