import { getContainer } from '@cloudflare/containers';
import { signVideoAiUrl } from './video-ai-security-v1.js';

const POOL_SIZE = 2;
const MAX_DELIVERY_ATTEMPTS = 5;
const QUEUED_RECOVERY_AFTER_MS = 4 * 60 * 1000;
const RELEASE = 'neptune-video-orchestrator-20260801-v71';

export function videoProcessorPoolId(jobId) {
  const value = String(jobId || 'neptune-video');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `neptune-video-pool-${Math.abs(hash >>> 0) % POOL_SIZE}`;
}

export async function enqueueVideoJob(env, job, origin, reason = 'production') {
  if (!env.VIDEO_JOBS) throw new Error('video_job_queue_missing');
  const jobId = String(job?.id || job?.jobId || '').trim();
  const sourceKey = String(job?.sourceKey || '').trim();
  if (!jobId || !sourceKey.startsWith('video-ai/sources/')) throw new Error('video_job_queue_invalid');
  await env.VIDEO_JOBS.send({
    type: 'process',
    release: RELEASE,
    jobId,
    sourceKey,
    sourceName: String(job?.sourceName || 'source.mp4').slice(0, 240),
    origin: String(origin || env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com'),
    reason: String(reason || 'production').slice(0, 80),
    queuedAt: new Date().toISOString(),
  });
  return { ok: true, queued: true, jobId };
}

export async function enqueueWarmup(env, reason = 'studio_open') {
  if (!env.VIDEO_JOBS) return { ok: false, queued: false };
  await env.VIDEO_JOBS.send({
    type: 'warmup',
    release: RELEASE,
    reason: String(reason || 'studio_open').slice(0, 80),
    queuedAt: new Date().toISOString(),
  });
  return { ok: true, queued: true };
}

export async function consumeVideoQueue(batch, env) {
  const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  for (const message of batch.messages) {
    const payload = message.body && typeof message.body === 'object' ? message.body : {};
    try {
      if (payload.type === 'warmup') {
        await warmPool(env);
        message.ack();
        continue;
      }
      if (payload.type !== 'process') {
        message.ack();
        continue;
      }
      await dispatchVideoJobNow(env, studio, payload, payload.origin, payload.reason || 'queue');
      message.ack();
    } catch (error) {
      const deliveryAttempt = Number(message.attempts || 1);
      const jobId = String(payload.jobId || '').trim();
      const detail = dispatchErrorDetail(error);
      console.error('video_queue_consumer_failed', {
        jobId,
        deliveryAttempt,
        ...safeError(error),
      });
      if (jobId) {
        await updateJob(studio, {
          jobId,
          status: deliveryAttempt >= MAX_DELIVERY_ATTEMPTS ? 'failed' : 'processing',
          stage: deliveryAttempt >= MAX_DELIVERY_ATTEMPTS ? 'startup_failed' : 'restarting',
          progress: deliveryAttempt >= MAX_DELIVERY_ATTEMPTS ? 5 : 6,
          errorCode: deliveryAttempt >= MAX_DELIVERY_ATTEMPTS
            ? 'video_processor_startup_failed'
            : 'video_processor_retrying',
          errorDetail: detail,
        }).catch(() => {});
      }
      if (deliveryAttempt >= MAX_DELIVERY_ATTEMPTS) message.ack();
      else message.retry({ delaySeconds: Math.min(75, 10 * deliveryAttempt) });
    }
  }
}

export async function reconcileVideoJobsThroughQueue(env, studio) {
  if (!env.VIDEO_JOBS) throw new Error('video_job_queue_missing');
  const response = await callStore(studio, '/portal/video-ai-pending', { system: true });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `video_ai_pending_http_${response.status}`);
  let queued = 0;
  for (const job of result.jobs || []) {
    if (!job.sourceKey) continue;
    const updatedAt = Date.parse(job.updatedAt || '');
    const age = Number.isFinite(updatedAt) ? Date.now() - updatedAt : Infinity;
    if (job.status === 'queued' && age < QUEUED_RECOVERY_AFTER_MS) continue;
    if (await isJobAlive(env, job.id)) continue;

    const attempts = Number(job.attempts || 0);
    const isLegacyLoop = job.stage === 'restarting' && !job.errorCode;
    if (attempts >= MAX_DELIVERY_ATTEMPTS && !isLegacyLoop) {
      await updateJob(studio, {
        jobId: job.id,
        status: 'failed',
        stage: 'startup_failed',
        progress: 5,
        errorCode: job.errorCode || 'video_processor_startup_failed',
        errorDetail: job.errorDetail || 'Le moteur vidéo n’a pas accepté le traitement après cinq tentatives.',
      });
      continue;
    }
    if (isLegacyLoop) {
      const resetResponse = await callStore(studio, '/portal/video-ai-job-reset', {
        system: true,
        jobId: job.id,
      });
      if (!resetResponse.ok) {
        const resetResult = await resetResponse.json().catch(() => ({}));
        throw new Error(resetResult.error || `video_ai_job_reset_http_${resetResponse.status}`);
      }
    }
    await enqueueVideoJob(env, job, env.PUBLIC_ORIGIN, isLegacyLoop ? 'v71_legacy_recovery' : 'scheduled_recovery');
    queued += 1;
  }
  return queued;
}

export async function dispatchVideoJobNow(env, studio, rawJob, origin, reason = 'direct') {
  if (!env.VIDEO_PROCESSOR) throw new Error('video_processor_binding_missing');
  const jobId = String(rawJob?.id || rawJob?.jobId || '').trim();
  if (!jobId) throw new Error('video_job_dispatch_invalid');

  const contextResponse = await callStore(studio, '/portal/video-ai-job-system-get', { system: true, jobId });
  const context = await contextResponse.json().catch(() => ({}));
  if (!contextResponse.ok) throw new Error(context.error || `video_ai_job_http_${contextResponse.status}`);
  const job = context.job || {};
  if (['review_ready', 'approved', 'delivered', 'cancelled'].includes(job.status)) return { skipped: true, terminal: true };
  if (await isJobAlive(env, jobId)) return { skipped: true, alive: true };

  const sourceKey = String(job.sourceKey || rawJob.sourceKey || '').trim();
  if (!sourceKey.startsWith('video-ai/sources/')) throw new Error('video_source_missing');
  await updateJob(studio, {
    jobId,
    status: 'processing',
    stage: 'starting',
    progress: 7,
    incrementAttempt: true,
    errorCode: '',
    errorDetail: '',
  });

  const baseOrigin = String(origin || env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com');
  const sourcePath = `/api/internal/video-ai/source/${encodeURIComponent(jobId)}`;
  const sourceUrl = new URL(await signVideoAiUrl(env, baseOrigin, sourcePath, jobId, 'source', 8 * 3600));
  sourceUrl.searchParams.set('key', sourceKey);
  const requestPayload = {
    jobId,
    sourceName: job.sourceName || rawJob.sourceName || 'source.mp4',
    sourceUrl: sourceUrl.toString(),
    transcribeUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/transcribe/${encodeURIComponent(jobId)}`, jobId, 'transcribe', 8 * 3600),
    analyzeUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/analyze/${encodeURIComponent(jobId)}`, jobId, 'analyze', 8 * 3600),
    heartbeatUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/heartbeat/${encodeURIComponent(jobId)}`, jobId, 'heartbeat', 12 * 3600),
    completeUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/complete/${encodeURIComponent(jobId)}`, jobId, 'complete', 12 * 3600),
    failUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/fail/${encodeURIComponent(jobId)}`, jobId, 'fail', 12 * 3600),
    company: job.company || '',
    clientName: job.clientName || '',
    orderTitle: job.orderTitle || '',
    objective: job.objective || '',
  };

  const poolId = videoProcessorPoolId(jobId);
  const instance = getContainer(env.VIDEO_PROCESSOR, poolId);
  const accepted = await instance.dispatchJob(requestPayload);
  if (!accepted?.ok) {
    throw new Error(`video_container_dispatch_failed:${accepted?.containerState || 'unknown'}:${accepted?.error || 'not_accepted'}`);
  }
  await updateJob(studio, {
    jobId,
    status: 'processing',
    stage: accepted.deduplicated ? String(accepted.stage || 'starting') : 'starting',
    progress: Math.max(8, Number(accepted.progress || 8)),
    errorCode: '',
    errorDetail: '',
  });
  return { ok: true, jobId, poolId, reason, ...accepted };
}

export async function readProcessorJobState(env, jobId) {
  if (!env.VIDEO_PROCESSOR || !jobId) return { ok: false, found: false, containerState: 'binding_missing' };
  const instance = getContainer(env.VIDEO_PROCESSOR, videoProcessorPoolId(jobId));
  try {
    return await instance.readJob(String(jobId));
  } catch (error) {
    return { ok: false, found: false, containerState: 'unavailable', error: dispatchErrorDetail(error) };
  }
}

async function isJobAlive(env, jobId) {
  const result = await readProcessorJobState(env, jobId);
  const state = result?.job || {};
  const heartbeat = Date.parse(state.heartbeatAt || state.updatedAt || '');
  return Boolean(result?.found)
    && ['queued', 'processing'].includes(state.state)
    && Number.isFinite(heartbeat)
    && Date.now() - heartbeat < 60_000;
}

async function warmPool(env) {
  if (!env.VIDEO_PROCESSOR) throw new Error('video_processor_binding_missing');
  const states = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    const instance = getContainer(env.VIDEO_PROCESSOR, `neptune-video-pool-${index}`);
    states.push(await instance.warm());
  }
  return states;
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

function dispatchErrorDetail(error) {
  const message = String(error?.message || error || 'unknown').replace(/[\u0000-\u001F\u007F]/gu, ' ').trim();
  return message.slice(0, 1200) || 'video_processor_unknown_error';
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 120),
    message: dispatchErrorDetail(error).slice(0, 500),
  };
}
