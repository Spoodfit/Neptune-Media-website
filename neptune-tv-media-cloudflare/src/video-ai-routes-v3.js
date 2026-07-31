import { getContainer } from '@cloudflare/containers';
import {
  handleVideoAiRoute as coreHandle,
  reconcileVideoAiJobs,
} from './video-ai-routes-v3-core.js';
import { handleVideoAiRoute as legacyHandle } from './video-ai-routes-v1.js';
import { json, securityHeaders } from './security.js';

export { reconcileVideoAiJobs };

const RELEASE = 'neptune-video-live-monitor-20260801-v69';
const LIVE_TIMEOUT_MS = 6500;

export async function handleVideoAiRoute(request, env, ctx, studio) {
  const url = new URL(request.url);
  const adminJobMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)$/u);
  if (!adminJobMatch || request.method !== 'GET') {
    return coreHandle(request, env, ctx, studio);
  }

  const response = await legacyHandle(request, env, ctx, studio);
  if (!response?.ok) return response;
  const result = await response.json().catch(() => ({}));
  const jobId = decodeURIComponent(adminJobMatch[1]);
  const active = ['queued', 'processing'].includes(result.job?.status);

  if (active && env.VIDEO_PROCESSOR) {
    try {
      const live = await readLiveState(env, jobId);
      if (live) {
        result.job = {
          ...result.job,
          progress: Number(live.progress ?? result.job.progress ?? 0),
          stage: String(live.stage || result.job.stage || 'processing'),
          ...sanitizeLiveTelemetry(live),
        };
      } else {
        result.job = {
          ...result.job,
          liveTelemetryAvailable: false,
          liveTelemetryReason: 'container_warming_up',
        };
      }
    } catch (error) {
      console.warn('video_ai_live_telemetry_unavailable', safeError(error));
      result.job = {
        ...result.job,
        liveTelemetryAvailable: false,
        liveTelemetryReason: classifyLiveError(error),
      };
    }
  }

  return secure(json(result));
}

async function readLiveState(env, jobId) {
  const instance = getContainer(env.VIDEO_PROCESSOR, jobId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('live_telemetry_timeout'), LIVE_TIMEOUT_MS);
  try {
    const request = new Request(`http://container/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const response = await instance.fetch(request);
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
    ? live.events.slice(-12).map((event) => ({
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
    'downloadedBytes',
    'totalBytes',
    'bytesPerSecond',
    'remainingSeconds',
    'processedVideoSeconds',
    'videoDurationSeconds',
    'transcribedChunks',
    'totalChunks',
    'transcribedSeconds',
    'visualSamples',
    'totalVisualSamples',
    'faceCount',
    'renderedClipSeconds',
    'currentClipDurationSeconds',
  ];
  const output = {};
  for (const key of allowed) {
    if (Number.isFinite(Number(value[key]))) output[key] = Number(value[key]);
  }
  return output;
}

function classifyLiveError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('timeout') || message.includes('abort')) return 'container_warming_up';
  if (message.includes('404')) return 'job_not_loaded_in_container';
  return 'live_signal_temporarily_unavailable';
}

function safeString(value, maximum) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/gu, ' ').trim().slice(0, maximum);
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function safeError(error) {
  return {
    name: safeString(error?.name || 'Error', 120),
    message: safeString(error?.message || error || 'unknown', 500),
  };
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  headers.set('X-Neptune-Video-Live', RELEASE);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
