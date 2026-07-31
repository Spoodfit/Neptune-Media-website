import { getContainer } from '@cloudflare/containers';
import { handleVideoAiRoute as legacyHandle, reconcileVideoAiJobs } from './video-ai-routes-v1.js';
import { json, securityHeaders } from './security.js';
import { analyzeVideoForClips } from './video-ai-analysis-v1.js';
import {
  analyzeVideoWithOpenAI,
  isOpenAiConfigured,
  openAiBaseUrl,
} from './openai-video-analysis-v1.js';
import { signVideoAiUrl, verifyVideoAiRequest } from './video-ai-security-v1.js';

export { reconcileVideoAiJobs };

const OPENAI_TRANSCRIPTION_MODEL = 'whisper-1';
const RELEASE = 'neptune-video-cloud-engine-20260731-v67';

export async function handleVideoAiRoute(request, env, ctx, studio) {
  const url = new URL(request.url);

  const adminJobMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)$/u);
  if (adminJobMatch && request.method === 'GET') {
    const response = await legacyHandle(request, env, ctx, studio);
    if (!response?.ok) return response;
    const result = await response.json().catch(() => ({}));
    if (['queued', 'processing'].includes(result.job?.status) && env.VIDEO_PROCESSOR) {
      try {
        const jobId = decodeURIComponent(adminJobMatch[1]);
        const instance = getContainer(env.VIDEO_PROCESSOR, jobId);
        const liveResponse = await instance.fetch(new Request(`http://container/jobs/${encodeURIComponent(jobId)}`));
        if (liveResponse.ok) {
          const live = await liveResponse.json();
          result.job = {
            ...result.job,
            progress: Number(live.progress ?? result.job.progress ?? 0),
            stage: String(live.stage || result.job.stage || 'processing'),
            liveProcessorState: String(live.state || 'processing'),
          };
        }
      } catch (error) {
        console.warn('video_ai_live_progress_unavailable', safeError(error));
      }
    }
    return secure(json(result));
  }

  const sourceMatch = url.pathname.match(/^\/api\/internal\/video-ai\/source\/([^/]+)$/u);
  if (sourceMatch) {
    const jobId = decodeURIComponent(sourceMatch[1]);
    const key = String(url.searchParams.get('key') || '');
    const safeJobId = safePath(jobId);
    if (!key.startsWith('video-ai/sources/') || !safeJobId || !key.includes(`/${safeJobId}/`)) {
      return secure(json({ error: 'source_job_mismatch' }, 403));
    }
  }

  const transcribeMatch = url.pathname.match(/^\/api\/internal\/video-ai\/transcribe\/([^/]+)$/u);
  if (transcribeMatch && request.method === 'POST' && isOpenAiConfigured(env)) {
    const jobId = decodeURIComponent(transcribeMatch[1]);
    const authorized = await verifyVideoAiRequest(request, env, 'transcribe', jobId);
    if (!authorized) return secure(json({ error: 'invalid_internal_signature' }, 401));
    const fallbackRequest = request.clone();
    try {
      return secure(await transcribeWithOpenAI(request, env));
    } catch (error) {
      console.error('openai_transcription_failed_falling_back', { jobId, ...safeError(error) });
      return legacyHandle(fallbackRequest, env, ctx, studio);
    }
  }

  const analyzeMatch = url.pathname.match(/^\/api\/internal\/video-ai\/analyze\/([^/]+)$/u);
  if (analyzeMatch && request.method === 'POST') {
    const jobId = decodeURIComponent(analyzeMatch[1]);
    const auth = await verifyVideoAiRequest(request, env, 'analyze', jobId);
    if (!auth) return secure(json({ error: 'invalid_internal_signature' }, 401));
    const payload = await request.json().catch(() => ({}));
    const contextResponse = await callStore(studio, '/portal/video-ai-job-system-get', { system: true, jobId });
    const context = await contextResponse.json().catch(() => ({}));
    if (!contextResponse.ok) return secure(json(context, contextResponse.status));
    const job = context.job || {};
    const input = {
      transcript: payload.transcript,
      segments: payload.segments,
      durationSeconds: payload.media?.durationSeconds,
      width: payload.media?.width,
      height: payload.media?.height,
      visualProfile: payload.visualProfile,
      objective: job.objective || payload.objective,
      company: job.company || payload.company,
      clientName: job.clientName || payload.clientName,
      orderTitle: job.orderTitle || payload.orderTitle,
    };

    let result;
    if (isOpenAiConfigured(env)) {
      try {
        result = await analyzeVideoWithOpenAI(env, input);
      } catch (error) {
        console.error('openai_cloud_video_analysis_failed_falling_back', { jobId, ...safeError(error) });
      }
    }
    if (!result) result = await analyzeVideoForClips(env, input);

    const candidates = [];
    for (const candidate of result.candidates || []) {
      const key = `video-ai/outputs/${safePath(jobId)}/${String(candidate.rank || 0).padStart(2, '0')}-${safePath(candidate.id)}.mp4`;
      const path = `/api/internal/video-ai/output/${encodeURIComponent(jobId)}/${encodeURIComponent(candidate.id)}`;
      const outputUrl = new URL(await signVideoAiUrl(env, url.origin, path, jobId, `output:${candidate.id}`, 9 * 3600));
      outputUrl.searchParams.set('key', key);
      candidates.push({ ...candidate, outputKey: key, outputUrl: outputUrl.toString() });
    }
    return secure(json({ ok: true, ...result, candidates }));
  }

  const completeMatch = url.pathname.match(/^\/api\/internal\/video-ai\/complete\/([^/]+)$/u);
  if (completeMatch && request.method === 'POST') {
    const jobId = decodeURIComponent(completeMatch[1]);
    const response = await legacyHandle(request, env, ctx, studio);
    if (response?.ok && env.MEDIA) {
      ctx.waitUntil(deleteCompletedSource(env, studio, jobId).catch((error) => {
        console.error('video_ai_source_cleanup_failed', { jobId, ...safeError(error) });
      }));
    }
    return response ? secure(response) : response;
  }

  const response = await legacyHandle(request, env, ctx, studio);
  return response ? secure(response) : response;
}

async function transcribeWithOpenAI(request, env) {
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 24 * 1024 * 1024) {
    return json({ error: 'invalid_audio_chunk' }, 413);
  }
  const url = new URL(request.url);
  const context = String(url.searchParams.get('context') || 'Neptune Media, interview professionnelle en français.').slice(0, 500);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: request.headers.get('Content-Type') || 'audio/mpeg' }), 'audio.mp3');
  form.set('model', String(env.OPENAI_TRANSCRIPTION_MODEL || OPENAI_TRANSCRIPTION_MODEL));
  form.set('language', 'fr');
  form.set('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.set('prompt', context);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('openai_transcription_timeout'), 180000);
  try {
    const response = await fetch(`${openAiBaseUrl(env)}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${String(env.OPENAI_API_KEY || '')}` },
      body: form,
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.code || result?.error?.message || `openai_transcription_http_${response.status}`);
    const segments = (Array.isArray(result.segments) ? result.segments : [])
      .map((item) => ({
        start: Number(item.start || 0),
        end: Number(item.end || 0),
        text: String(item.text || '').trim(),
        confidence: null,
      }))
      .filter((item) => item.text && item.end > item.start);
    return json({
      ok: true,
      model: String(result.model || env.OPENAI_TRANSCRIPTION_MODEL || OPENAI_TRANSCRIPTION_MODEL),
      provider: 'openai',
      text: String(result.text || '').trim(),
      wordCount: String(result.text || '').trim().split(/\s+/u).filter(Boolean).length,
      segments,
      vtt: segmentsToVtt(segments),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function deleteCompletedSource(env, studio, jobId) {
  const response = await callStore(studio, '/portal/video-ai-job-system-get', { system: true, jobId });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `video_ai_cleanup_job_http_${response.status}`);
  const sourceKey = String(data.job?.sourceKey || '');
  if (!sourceKey.startsWith('video-ai/sources/')) return false;
  await env.MEDIA.delete(sourceKey);
  return true;
}

function segmentsToVtt(segments) {
  const rows = ['WEBVTT', ''];
  segments.forEach((segment, index) => {
    rows.push(String(index + 1));
    rows.push(`${vttTime(segment.start)} --> ${vttTime(segment.end)}`);
    rows.push(segment.text);
    rows.push('');
  });
  return rows.join('\n');
}

function vttTime(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const whole = Math.floor(value % 60);
  const milliseconds = Math.round((value - Math.floor(value)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function safePath(value) {
  return String(value || '').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 180) || 'item';
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 120),
    message: String(error?.message || error || 'unknown').slice(0, 500),
    code: String(error?.code || '').slice(0, 160),
  };
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  headers.set('X-Neptune-Video-AI', RELEASE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
