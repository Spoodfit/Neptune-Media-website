import { getContainer } from '@cloudflare/containers';
import { signVideoAiUrl } from './video-ai-security-v1.js';

const POOL_SIZE = 2;
const STARTUP_TIMEOUT_MS = 90_000;
const RELEASE = 'neptune-video-queue-pool-20260801-v70';

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
    try {
      const payload = message.body && typeof message.body === 'object' ? message.body : {};
      if (payload.type === 'warmup') {
        await warmPool(env);
        message.ack();
        continue;
      }
      if (payload.type !== 'process') {
        message.ack();
        continue;
      }
      await dispatchQueuedJob(env, studio, payload);
      message.ack();
    } catch (error) {
      const attempt = Number(message.attempts || 1);
      console.error('video_queue_consumer_failed', {
        attempt,
        name: String(error?.name || 'Error').slice(0, 120),
        message: String(error?.message || error || 'unknown').slice(0, 500),
      });
      const jobId = String(message.body?.jobId || '').trim();
      if (jobId) {
        await updateJob(studio, {
          jobId,
          status: attempt >= 5 ? 'failed' : 'queued',
          stage: attempt >= 5 ? 'startup_failed' : 'restarting',
          progress: attempt >= 5 ? 5 : 6,
          errorCode: attempt >= 5 ? 'video_processor_startup_failed' : '',
          errorDetail: attempt >= 5 ? String(error?.message || error || 'unknown').slice(0, 1200) : '',
        }).catch(() => {});
      }
      if (attempt >= 5) message.ack();
      else message.retry({ delaySeconds: Math.min(60, 8 * attempt) });
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
    await enqueueVideoJob(env, job, env.PUBLIC_ORIGIN, 'automatic_recovery');
    queued += 1;
  }
  return queued;
}

async function warmPool(env) {
  if (!env.VIDEO_PROCESSOR) throw new Error('video_processor_binding_missing');
  await Promise.all(Array.from({ length: POOL_SIZE }, async (_, index) => {
    const instance = getContainer(env.VIDEO_PROCESSOR, `neptune-video-pool-${index}`);
    await instance.startAndWaitForPorts({
      ports: [8080],
      startOptions: { enableInternet: true },
      cancellationOptions: {
        instanceGetTimeoutMS: 20_000,
        portReadyTimeoutMS: STARTUP_TIMEOUT_MS,
        waitInterval: 500,
      },
    });
  }));
}

async function dispatchQueuedJob(env, studio, payload) {
  if (!env.VIDEO_PROCESSOR) throw new Error('video_processor_binding_missing');
  const jobId = String(payload.jobId || '').trim();
  const contextResponse = await callStore(studio, '/portal/video-ai-job-system-get', { system: true, jobId });
  const context = await contextResponse.json().catch(() => ({}));
  if (!contextResponse.ok) throw new Error(context.error || `video_ai_job_http_${contextResponse.status}`);
  const job = context.job || {};
  if (['review_ready', 'approved', 'delivered', 'cancelled'].includes(job.status)) return { skipped: true };
  const sourceKey = String(job.sourceKey || payload.sourceKey || '').trim();
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

  const origin = String(payload.origin || env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com');
  const sourcePath = `/api/internal/video-ai/source/${encodeURIComponent(jobId)}`;
  const sourceUrl = new URL(await signVideoAiUrl(env, origin, sourcePath, jobId, 'source', 8 * 3600));
  sourceUrl.searchParams.set('key', sourceKey);
  const requestPayload = {
    jobId,
    sourceName: job.sourceName || payload.sourceName || 'source.mp4',
    sourceUrl: sourceUrl.toString(),
    transcribeUrl: await signVideoAiUrl(env, origin, `/api/internal/video-ai/transcribe/${encodeURIComponent(jobId)}`, jobId, 'transcribe', 8 * 3600),
    analyzeUrl: await signVideoAiUrl(env, origin, `/api/internal/video-ai/analyze/${encodeURIComponent(jobId)}`, jobId, 'analyze', 8 * 3600),
    completeUrl: await signVideoAiUrl(env, origin, `/api/internal/video-ai/complete/${encodeURIComponent(jobId)}`, jobId, 'complete', 10 * 3600),
    failUrl: await signVideoAiUrl(env, origin, `/api/internal/video-ai/fail/${encodeURIComponent(jobId)}`, jobId, 'fail', 10 * 3600),
    company: job.company || '',
    clientName: job.clientName || '',
    orderTitle: job.orderTitle || '',
    objective: job.objective || '',
  };

  const instance = getContainer(env.VIDEO_PROCESSOR, videoProcessorPoolId(jobId));
  await instance.startAndWaitForPorts({
    ports: [8080],
    startOptions: { enableInternet: true },
    cancellationOptions: {
      instanceGetTimeoutMS: 20_000,
      portReadyTimeoutMS: STARTUP_TIMEOUT_MS,
      waitInterval: 500,
    },
  });
  const response = await instance.fetch(new Request('http://container/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload),
  }));
  if (!response.ok) throw new Error(`video_container_dispatch_http_${response.status}:${(await response.text()).slice(0, 300)}`);
  return { ok: true, jobId, poolId: videoProcessorPoolId(jobId) };
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
