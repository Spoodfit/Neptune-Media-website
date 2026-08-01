import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json, securityHeaders } from './security.js';
import { handleVideoAiRoute as previousHandle } from './video-ai-routes-v4.js';
import { handleVideoAiRoute as legacyHandle } from './video-ai-routes-v1.js';
import { verifyVideoAiRequest } from './video-ai-security-v1.js';
import {
  dispatchVideoJobNow,
  enqueueVideoJob,
  enqueueWarmup,
  readProcessorJobState,
  reconcileVideoJobsThroughQueue,
} from './video-ai-queue-v71.js';

const RELEASE = 'neptune-video-orchestrator-20260801-v71';
const MAX_ATTEMPTS = 5;
const SAFETY_QUEUE_DELAY_SECONDS = 300;
const HEARTBEAT_STAGES = new Set([
  'starting', 'download', 'probe', 'transcription', 'visual_analysis',
  'selection', 'rendering', 'finalization',
]);

export { reconcileVideoJobsThroughQueue as reconcileVideoAiJobs };

export async function handleVideoAiRoute(request, env, ctx, studio) {
  const url = new URL(request.url);
  const jobMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)$/u);
  const retryMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)\/retry$/u);
  const heartbeatMatch = url.pathname.match(/^\/api\/internal\/video-ai\/heartbeat\/([^/]+)$/u);

  if (heartbeatMatch && request.method === 'POST') {
    return secure(await persistProcessorHeartbeat(request, env, studio, decodeURIComponent(heartbeatMatch[1])));
  }
  if (jobMatch && request.method === 'GET') {
    return readAdminJob(request, env, studio, decodeURIComponent(jobMatch[1]));
  }
  if (retryMatch && request.method === 'POST') {
    return secure(await retryAdminJob(request, env, studio, decodeURIComponent(retryMatch[1]), url.origin));
  }
  if (url.pathname === '/api/admin/video-ai/upload/complete' && request.method === 'POST') {
    return secure(await completeAndDispatchUpload(request, env, studio, url.origin));
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
    const processor = await readProcessorJobState(env, jobId);
    if (processor?.found && processor.job) {
      result.job = {
        ...job,
        progress: Number(processor.job.progress ?? job.progress ?? 0),
        stage: String(processor.job.stage || job.stage || 'processing'),
        containerState: String(processor.containerState || 'healthy'),
        ...sanitizeLiveTelemetry(processor.job),
      };
    } else {
      const attempts = Number(job.attempts || 0);
      result.job = {
        ...job,
        containerState: String(processor?.containerState || 'unavailable'),
        containerExitCode: processor?.exitCode ?? null,
        liveTelemetryAvailable: false,
        liveTelemetryReason: processorReason(processor),
        automaticRecovery: job.errorCode === 'video_processor_retrying' && attempts < MAX_ATTEMPTS,
        recoveryAttempt: Math.min(MAX_ATTEMPTS, Math.max(1, attempts || 1)),
        maximumRecoveryAttempts: MAX_ATTEMPTS,
        attemptStartedAt: ['queued', 'starting', 'restarting'].includes(String(job.stage || ''))
          ? job.updatedAt
          : job.startedAt,
      };
    }
  }

  return secure(json(result));
}

async function completeAndDispatchUpload(request, env, studio, origin) {
  const security = await requireAdminRequest(request, studio);
  if (!security.ok) return security.response;
  if (!env.MEDIA) return json({ error: 'media_storage_unavailable' }, 503);

  const payload = await request.json().catch(() => ({}));
  const jobId = String(payload.jobId || '').trim();
  const key = String(payload.key || '').trim();
  const uploadId = String(payload.uploadId || '').trim();
  const parts = Array.isArray(payload.parts)
    ? payload.parts.map((part) => ({ partNumber: Number(part.partNumber), etag: String(part.etag || '') }))
      .filter((part) => part.partNumber > 0 && part.etag)
    : [];
  const authorized = await readAuthorizedJob(studio, security.auth, jobId);
  if (!authorized.ok) return authorized.response;
  if (authorized.job.sourceKey !== key || !uploadId || !parts.length || !validSourceKey(key)) {
    return json({ error: 'invalid_upload_completion' }, 400);
  }

  const upload = env.MEDIA.resumeMultipartUpload(key, uploadId);
  const object = await upload.complete(parts);
  await updateJob(studio, {
    jobId,
    status: 'queued',
    stage: 'queued',
    progress: 5,
    errorCode: '',
    errorDetail: '',
  });
  const job = { ...authorized.job, sourceKey: key, etag: object.httpEtag };
  return startWithQueueFallback(env, studio, job, origin, 'upload_complete', object.httpEtag);
}

async function retryAdminJob(request, env, studio, jobId, origin) {
  const security = await requireAdminRequest(request, studio);
  if (!security.ok) return security.response;
  const authorized = await readAuthorizedJob(studio, security.auth, jobId);
  if (!authorized.ok) return authorized.response;
  if (!authorized.job?.sourceKey) return json({ error: 'video_source_missing' }, 409);

  const reset = await callStore(studio, '/portal/video-ai-job-reset', { system: true, jobId });
  if (!reset.ok) {
    await updateJob(studio, {
      jobId,
      status: 'queued',
      stage: 'queued',
      progress: 5,
      errorCode: '',
      errorDetail: '',
    });
  }
  return startWithQueueFallback(env, studio, authorized.job, origin, 'manual_retry');
}

async function startWithQueueFallback(env, studio, job, origin, reason, etag = '') {
  let durableSafetyQueued = false;
  if (env.VIDEO_JOBS) {
    try {
      await enqueueSafetyDispatch(env, job, origin, reason);
      durableSafetyQueued = true;
    } catch (error) {
      console.error('video_safety_queue_publish_failed', {
        jobId: job.id,
        message: safeErrorDetail(error),
      });
    }
  }

  try {
    const dispatch = await dispatchVideoJobNow(env, studio, job, origin, reason);
    return json({
      ok: true,
      jobId: job.id,
      status: 'processing',
      stage: dispatch.stage || 'starting',
      progress: Math.max(8, Number(dispatch.progress || 8)),
      directDispatchAccepted: true,
      reliableQueueFallback: Boolean(env.VIDEO_JOBS),
      durableSafetyQueued,
      etag,
    });
  } catch (error) {
    const detail = safeErrorDetail(error);
    await updateJob(studio, {
      jobId: job.id,
      status: 'processing',
      stage: 'restarting',
      progress: 6,
      errorCode: 'video_processor_retrying',
      errorDetail: detail,
    });
    if (!env.VIDEO_JOBS) {
      await updateJob(studio, {
        jobId: job.id,
        status: 'failed',
        stage: 'startup_failed',
        progress: 5,
        errorCode: 'video_job_queue_missing',
        errorDetail: detail,
      });
      return json({ error: 'video_processor_unavailable', detail }, 503);
    }

    try {
      await enqueueVideoJob(env, job, origin, `${reason}_fallback`);
    } catch (queueError) {
      const queueDetail = `${detail} | queue: ${safeErrorDetail(queueError)}`.slice(0, 1200);
      await updateJob(studio, {
        jobId: job.id,
        status: 'failed',
        stage: 'startup_failed',
        progress: 5,
        errorCode: 'video_job_queue_publish_failed',
        errorDetail: queueDetail,
      });
      return json({ error: 'video_job_queue_publish_failed', detail: queueDetail }, 503);
    }

    return json({
      ok: true,
      jobId: job.id,
      status: 'processing',
      stage: 'restarting',
      progress: 6,
      directDispatchAccepted: false,
      reliableQueueFallback: true,
      durableSafetyQueued,
      automaticRecovery: true,
      etag,
    }, 202);
  }
}

async function enqueueSafetyDispatch(env, job, origin, reason) {
  const jobId = String(job?.id || job?.jobId || '').trim();
  const sourceKey = String(job?.sourceKey || '').trim();
  if (!jobId || !validSourceKey(sourceKey)) throw new Error('video_safety_queue_invalid');
  await env.VIDEO_JOBS.send({
    type: 'process',
    release: RELEASE,
    jobId,
    sourceKey,
    sourceName: String(job?.sourceName || 'source.mp4').slice(0, 240),
    origin: String(origin || env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com'),
    reason: `${String(reason || 'production').slice(0, 65)}_safety`,
    queuedAt: new Date().toISOString(),
  }, { delaySeconds: SAFETY_QUEUE_DELAY_SECONDS });
}

async function persistProcessorHeartbeat(request, env, studio, jobId) {
  const authorized = await verifyVideoAiRequest(request, env, 'heartbeat', jobId);
  if (!authorized) return json({ error: 'invalid_internal_signature' }, 401);
  const payload = await request.json().catch(() => ({}));
  const stage = HEARTBEAT_STAGES.has(String(payload.stage || '')) ? String(payload.stage) : 'starting';
  const progress = Math.max(8, Math.min(99, Math.round(Number(payload.progress || 8))));
  const response = await updateJob(studio, {
    jobId,
    status: 'processing',
    stage,
    progress,
    errorCode: '',
    errorDetail: '',
  });
  if (!response.ok) return response;
  return json({ ok: true, jobId, stage, progress, receivedAt: new Date().toISOString() });
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
    attemptStartedAt: safeString(live?.startedAt || live?.stageStartedAt, 80),
    automaticRecovery: false,
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

function processorReason(processor) {
  const state = String(processor?.containerState || '');
  if (state === 'stopped_with_code') return 'processor_exited';
  if (state === 'running') return 'processor_starting';
  if (state === 'stopped') return 'processor_stopped';
  return processor?.error ? 'processor_unavailable' : 'awaiting_dispatch';
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

function safeErrorDetail(error) {
  return String(error?.message || error || 'unknown').replace(/[\u0000-\u001F\u007F]/gu, ' ').trim().slice(0, 1200);
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
