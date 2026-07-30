import { getContainer } from '@cloudflare/containers';
import { handleVideoAiRoute as legacyHandle, reconcileVideoAiJobs } from './video-ai-routes-v1.js';
import { json, securityHeaders } from './security.js';
import { analyzeVideoForClips } from './video-ai-analysis-v1.js';
import { signVideoAiUrl, verifyVideoAiRequest } from './video-ai-security-v1.js';

export { reconcileVideoAiJobs };

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
        console.warn('video_ai_live_progress_unavailable', {
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 300),
        });
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
    const result = await analyzeVideoForClips(env, {
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
    });
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

  return legacyHandle(request, env, ctx, studio);
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

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  headers.set('X-Neptune-Video-AI', 'neptune-video-ai-20260730-v1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
