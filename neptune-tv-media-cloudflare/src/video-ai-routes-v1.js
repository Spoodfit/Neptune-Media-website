import { getContainer } from '@cloudflare/containers';
import { adminAuth, safeFilename } from './portal-http-utils.js';
import { isSameOrigin, json, securityHeaders } from './security.js';
import { analyzeVideoForClips } from './video-ai-analysis-v1.js';
import { signVideoAiUrl, verifyVideoAiRequest } from './video-ai-security-v1.js';
import { sendEmail } from './email-service.js';

const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
const PART_SIZE = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 80 * 1024 * 1024 * 1024;
const ADMIN_ROUTES = new Set([
  '/api/admin/video-ai/bootstrap',
  '/api/admin/video-ai/upload/init',
  '/api/admin/video-ai/upload/part',
  '/api/admin/video-ai/upload/complete',
  '/api/admin/video-ai/upload/abort',
]);

export async function handleVideoAiRoute(request, env, ctx, studio) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/video-ai/') && !url.pathname.startsWith('/api/internal/video-ai/')) return null;
  try {
    if (url.pathname.startsWith('/api/internal/video-ai/')) return secure(await handleInternal(request, env, ctx, studio));
    if (!isSameOrigin(request)) return secure(json({ error: 'origin_forbidden' }, 403));
    if (request.method !== 'GET' && request.method !== 'HEAD' && !request.headers.get('X-CSRF-Token')) {
      return secure(json({ error: 'csrf_failed' }, 403));
    }
    return secure(await handleAdmin(request, env, ctx, studio));
  } catch (error) {
    console.error('video_ai_route_failed', safeError(error));
    return secure(json({ error: normalizeRouteError(error) }, routeErrorStatus(error)));
  }
}

export async function reconcileVideoAiJobs(env, ctx, studio, origin) {
  const response = await callStore(studio, '/portal/video-ai-pending', { system: true });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `video_ai_pending_http_${response.status}`);
  for (const job of result.jobs || []) {
    if (!job.sourceKey || Number(job.attempts || 0) >= 3) continue;
    ctx.waitUntil(dispatchVideoAiJob(env, studio, {
      id: job.id,
      sourceKey: job.sourceKey,
      attempts: job.attempts,
    }, origin).catch((error) => markDispatchFailure(studio, job.id, error)));
  }
  return result.jobs?.length || 0;
}

async function handleAdmin(request, env, ctx, studio) {
  const url = new URL(request.url);
  const auth = adminAuth(request);

  if (url.pathname === '/api/admin/video-ai/bootstrap' && request.method === 'GET') {
    return callStore(studio, '/portal/video-ai-bootstrap', auth);
  }

  const jobMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)$/u);
  if (jobMatch && request.method === 'GET') {
    return callStore(studio, '/portal/video-ai-job-get', { ...auth, jobId: decodeURIComponent(jobMatch[1]) });
  }

  const retryMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)\/retry$/u);
  if (retryMatch && request.method === 'POST') {
    const jobResponse = await callStore(studio, '/portal/video-ai-job-get', { ...auth, jobId: decodeURIComponent(retryMatch[1]) });
    const data = await jobResponse.json().catch(() => ({}));
    if (!jobResponse.ok) return json(data, jobResponse.status);
    if (!data.job?.sourceKey) return json({ error: 'video_source_missing' }, 409);
    await callStore(studio, '/portal/video-ai-job-update', {
      system: true,
      jobId: data.job.id,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      errorCode: '',
      errorDetail: '',
    });
    ctx.waitUntil(dispatchVideoAiJob(env, studio, data.job, url.origin).catch((error) => markDispatchFailure(studio, data.job.id, error)));
    return json({ ok: true, jobId: data.job.id, status: 'queued' });
  }

  const clipActionMatch = url.pathname.match(/^\/api\/admin\/video-ai\/clips\/([^/]+)\/action$/u);
  if (clipActionMatch && request.method === 'POST') {
    const payload = await request.json().catch(() => ({}));
    return callStore(studio, '/portal/video-ai-clip-action', {
      ...auth,
      payload: { ...payload, clipId: decodeURIComponent(clipActionMatch[1]) },
    });
  }

  const clipExportMatch = url.pathname.match(/^\/api\/admin\/video-ai\/clips\/([^/]+)\/export$/u);
  if (clipExportMatch && request.method === 'POST') {
    return exportClipToDrive(env, studio, auth, decodeURIComponent(clipExportMatch[1]));
  }

  const mediaMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)\/clips\/([^/]+)\/media$/u);
  if (mediaMatch && ['GET', 'HEAD'].includes(request.method)) {
    return serveAdminClipMedia(request, env, studio, auth, decodeURIComponent(mediaMatch[1]), decodeURIComponent(mediaMatch[2]));
  }

  if (ADMIN_ROUTES.has(url.pathname)) {
    if (url.pathname === '/api/admin/video-ai/upload/init' && request.method === 'POST') return initUpload(request, env, studio, auth);
    if (url.pathname === '/api/admin/video-ai/upload/part' && request.method === 'PUT') return uploadPart(request, env, studio, auth);
    if (url.pathname === '/api/admin/video-ai/upload/complete' && request.method === 'POST') return completeUpload(request, env, ctx, studio, auth);
    if (url.pathname === '/api/admin/video-ai/upload/abort' && request.method === 'POST') return abortUpload(request, env, studio, auth);
  }

  return json({ error: 'not_found' }, 404);
}

async function initUpload(request, env, studio, auth) {
  if (!env.MEDIA) return json({ error: 'media_storage_unavailable' }, 503);
  const payload = await request.json().catch(() => ({}));
  const sizeBytes = Math.round(Number(payload.sizeBytes || 0));
  if (sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES) return json({ error: 'video_file_too_large' }, 413);
  const createResponse = await callStore(studio, '/portal/video-ai-job-create', { ...auth, payload });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) return json(created, createResponse.status);
  if (created.deduplicated && created.job?.sourceKey && created.job?.uploadId) {
    return json({ ok: true, deduplicated: true, job: created.job, partSize: PART_SIZE });
  }
  const job = created.job;
  const key = `video-ai/sources/${safePath(payload.orderId)}/${safePath(job.id)}/${safeFilename(payload.sourceName || 'source.mp4')}`;
  const upload = await env.MEDIA.createMultipartUpload(key, {
    httpMetadata: { contentType: String(payload.mimeType || 'video/mp4') },
    customMetadata: {
      origin: 'neptune_studio_video_ai',
      jobId: job.id,
      orderId: String(payload.orderId || ''),
      sourceFingerprint: String(payload.sourceFingerprint || '').slice(0, 160),
    },
  });
  const stateResponse = await callStore(studio, '/portal/video-ai-job-set-upload', {
    ...auth,
    jobId: job.id,
    sourceKey: key,
    uploadId: upload.uploadId,
  });
  const state = await stateResponse.json().catch(() => ({}));
  if (!stateResponse.ok) {
    await upload.abort().catch(() => {});
    return json(state, stateResponse.status);
  }
  return json({
    ok: true,
    deduplicated: false,
    job: { ...job, sourceKey: key, uploadId: upload.uploadId },
    partSize: PART_SIZE,
    maximumBytes: MAX_SOURCE_BYTES,
  });
}

async function uploadPart(request, env, studio, auth) {
  if (!env.MEDIA || !request.body) return json({ error: 'invalid_upload_part' }, 400);
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId') || '';
  const uploadId = url.searchParams.get('uploadId') || '';
  const key = url.searchParams.get('key') || '';
  const partNumber = Number(url.searchParams.get('partNumber') || 0);
  if (!jobId || !uploadId || !validR2Key(key) || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    return json({ error: 'invalid_upload_part' }, 400);
  }
  const authorized = await authorizedJob(studio, auth, jobId);
  if (!authorized.ok) return authorized.response;
  if (authorized.job.sourceKey !== key) return json({ error: 'upload_key_mismatch' }, 403);
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > PART_SIZE + 1024) return json({ error: 'upload_part_too_large' }, 413);
  const upload = env.MEDIA.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);
  return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
}

async function completeUpload(request, env, ctx, studio, auth) {
  if (!env.MEDIA) return json({ error: 'media_storage_unavailable' }, 503);
  const payload = await request.json().catch(() => ({}));
  const jobId = String(payload.jobId || '').trim();
  const key = String(payload.key || '').trim();
  const uploadId = String(payload.uploadId || '').trim();
  const parts = Array.isArray(payload.parts) ? payload.parts.map((part) => ({ partNumber: Number(part.partNumber), etag: String(part.etag || '') })).filter((part) => part.partNumber > 0 && part.etag) : [];
  const authorized = await authorizedJob(studio, auth, jobId);
  if (!authorized.ok) return authorized.response;
  if (authorized.job.sourceKey !== key || !uploadId || !parts.length) return json({ error: 'invalid_upload_completion' }, 400);
  const upload = env.MEDIA.resumeMultipartUpload(key, uploadId);
  const object = await upload.complete(parts);
  const updateResponse = await callStore(studio, '/portal/video-ai-job-update', {
    system: true,
    jobId,
    status: 'queued',
    stage: 'queued',
    progress: 5,
    errorCode: '',
    errorDetail: '',
  });
  if (!updateResponse.ok) return updateResponse;
  const job = { ...authorized.job, sourceKey: key, etag: object.httpEtag };
  ctx.waitUntil(dispatchVideoAiJob(env, studio, job, new URL(request.url).origin).catch((error) => markDispatchFailure(studio, jobId, error)));
  return json({ ok: true, jobId, status: 'queued', stage: 'queued', progress: 5, etag: object.httpEtag });
}

async function abortUpload(request, env, studio, auth) {
  const payload = await request.json().catch(() => ({}));
  const authorized = await authorizedJob(studio, auth, String(payload.jobId || ''));
  if (!authorized.ok) return authorized.response;
  const key = String(payload.key || authorized.job.sourceKey || '');
  const uploadId = String(payload.uploadId || '');
  if (env.MEDIA && key && uploadId) await env.MEDIA.resumeMultipartUpload(key, uploadId).abort().catch(() => {});
  await callStore(studio, '/portal/video-ai-job-update', {
    system: true,
    jobId: authorized.job.id,
    status: 'cancelled',
    stage: 'cancelled',
    progress: 0,
  });
  return json({ ok: true, jobId: authorized.job.id, status: 'cancelled' });
}

async function handleInternal(request, env, ctx, studio) {
  const url = new URL(request.url);
  const sourceMatch = url.pathname.match(/^\/api\/internal\/video-ai\/source\/([^/]+)$/u);
  if (sourceMatch && ['GET', 'HEAD'].includes(request.method)) {
    const jobId = decodeURIComponent(sourceMatch[1]);
    const auth = await verifyVideoAiRequest(request, env, 'source', jobId);
    if (!auth) return json({ error: 'invalid_internal_signature' }, 401);
    const key = String(url.searchParams.get('key') || '');
    if (!validR2Key(key)) return json({ error: 'invalid_source_key' }, 400);
    return serveR2Object(request, env.MEDIA, key, 'inline');
  }

  const transcribeMatch = url.pathname.match(/^\/api\/internal\/video-ai\/transcribe\/([^/]+)$/u);
  if (transcribeMatch && request.method === 'POST') {
    const jobId = decodeURIComponent(transcribeMatch[1]);
    const auth = await verifyVideoAiRequest(request, env, 'transcribe', jobId);
    if (!auth) return json({ error: 'invalid_internal_signature' }, 401);
    return transcribeAudio(request, env);
  }

  const analyzeMatch = url.pathname.match(/^\/api\/internal\/video-ai\/analyze\/([^/]+)$/u);
  if (analyzeMatch && request.method === 'POST') {
    const jobId = decodeURIComponent(analyzeMatch[1]);
    const auth = await verifyVideoAiRequest(request, env, 'analyze', jobId);
    if (!auth) return json({ error: 'invalid_internal_signature' }, 401);
    return analyzeContainerPayload(request, env, jobId, url.origin);
  }

  const outputMatch = url.pathname.match(/^\/api\/internal\/video-ai\/output\/([^/]+)\/([^/]+)$/u);
  if (outputMatch && request.method === 'PUT') {
    const jobId = decodeURIComponent(outputMatch[1]);
    const clipId = decodeURIComponent(outputMatch[2]);
    const auth = await verifyVideoAiRequest(request, env, `output:${clipId}`, jobId);
    if (!auth || !request.body) return json({ error: 'invalid_internal_signature' }, 401);
    const key = String(url.searchParams.get('key') || '');
    if (!validR2Key(key) || !key.startsWith(`video-ai/outputs/${safePath(jobId)}/`)) return json({ error: 'invalid_output_key' }, 400);
    const object = await env.MEDIA.put(key, request.body, {
      httpMetadata: { contentType: 'video/mp4', contentDisposition: `inline; filename="${safeFilename(clipId)}.mp4"` },
      customMetadata: { origin: 'neptune_ai_generated', jobId, clipId },
    });
    return json({ ok: true, key, sizeBytes: Number(object.size || request.headers.get('Content-Length') || 0), etag: object.httpEtag });
  }

  const completeMatch = url.pathname.match(/^\/api\/internal\/video-ai\/complete\/([^/]+)$/u);
  if (completeMatch && request.method === 'POST') {
    const jobId = decodeURIComponent(completeMatch[1]);
    const auth = await verifyVideoAiRequest(request, env, 'complete', jobId);
    if (!auth) return json({ error: 'invalid_internal_signature' }, 401);
    const payload = await request.json().catch(() => ({}));
    const candidates = Array.isArray(payload.analysis?.candidates) ? payload.analysis.candidates : [];
    const outputs = new Map((Array.isArray(payload.outputs) ? payload.outputs : []).map((item) => [String(item.clipId || ''), item]));
    const enriched = candidates.map((candidate) => {
      const output = outputs.get(String(candidate.id || '')) || {};
      return { ...candidate, outputKey: output.key || candidate.outputKey || '', outputSizeBytes: Number(output.sizeBytes || 0) };
    }).filter((candidate) => candidate.outputKey);
    const saveResponse = await callStore(studio, '/portal/video-ai-analysis-save', {
      system: true,
      jobId,
      result: { ...(payload.analysis || {}), candidates: enriched },
      durationSeconds: payload.media?.durationSeconds,
      width: payload.media?.width,
      height: payload.media?.height,
      transcript: payload.analysis?.transcript,
      transcriptVtt: payload.transcriptVtt,
      visualProfile: payload.visualProfile,
    });
    const saved = await saveResponse.json().catch(() => ({}));
    if (!saveResponse.ok) return json(saved, saveResponse.status);
    ctx.waitUntil(notifyReviewReady(env, studio, jobId, saved.clipCount).catch((error) => console.error('video_ai_review_email_failed', safeError(error))));
    return json({ ok: true, jobId, clipCount: saved.clipCount, status: 'review_ready' });
  }

  const failMatch = url.pathname.match(/^\/api\/internal\/video-ai\/fail\/([^/]+)$/u);
  if (failMatch && request.method === 'POST') {
    const jobId = decodeURIComponent(failMatch[1]);
    const auth = await verifyVideoAiRequest(request, env, 'fail', jobId);
    if (!auth) return json({ error: 'invalid_internal_signature' }, 401);
    const payload = await request.json().catch(() => ({}));
    return callStore(studio, '/portal/video-ai-job-update', {
      system: true,
      jobId,
      status: 'failed',
      stage: sanitizeStage(payload.stage),
      progress: Number(payload.progress || 0),
      errorCode: String(payload.errorCode || 'video_processing_failed'),
      errorDetail: String(payload.errorDetail || '').slice(0, 1200),
    });
  }

  return json({ error: 'not_found' }, 404);
}

async function dispatchVideoAiJob(env, studio, job, origin) {
  if (!env.VIDEO_PROCESSOR) throw new Error('video_processor_binding_missing');
  const jobId = String(job.id || '').trim();
  const sourceKey = String(job.sourceKey || '').trim();
  if (!jobId || !validR2Key(sourceKey)) throw new Error('video_job_dispatch_invalid');
  await callStore(studio, '/portal/video-ai-job-update', {
    system: true,
    jobId,
    status: 'processing',
    stage: 'starting',
    progress: 8,
    incrementAttempt: true,
  });
  const baseOrigin = env.PUBLIC_ORIGIN || origin || 'https://tv.neptunebusiness.com';
  const sourcePath = `/api/internal/video-ai/source/${encodeURIComponent(jobId)}`;
  const sourceUrl = new URL(await signVideoAiUrl(env, baseOrigin, sourcePath, jobId, 'source', 8 * 3600));
  sourceUrl.searchParams.set('key', sourceKey);
  const payload = {
    jobId,
    sourceName: job.sourceName || 'source.mp4',
    sourceUrl: sourceUrl.toString(),
    transcribeUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/transcribe/${encodeURIComponent(jobId)}`, jobId, 'transcribe', 8 * 3600),
    analyzeUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/analyze/${encodeURIComponent(jobId)}`, jobId, 'analyze', 8 * 3600),
    completeUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/complete/${encodeURIComponent(jobId)}`, jobId, 'complete', 10 * 3600),
    failUrl: await signVideoAiUrl(env, baseOrigin, `/api/internal/video-ai/fail/${encodeURIComponent(jobId)}`, jobId, 'fail', 10 * 3600),
  };
  const instance = getContainer(env.VIDEO_PROCESSOR, jobId);
  const response = await instance.fetch(new Request('http://container/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  if (!response.ok) throw new Error(`video_container_dispatch_http_${response.status}:${(await response.text()).slice(0, 300)}`);
  return response;
}

async function transcribeAudio(request, env) {
  if (!env.AI || !request.body) return json({ error: 'transcription_unavailable' }, 503);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 24 * 1024 * 1024) return json({ error: 'invalid_audio_chunk' }, 413);
  const url = new URL(request.url);
  const initialPrompt = String(url.searchParams.get('context') || 'Neptune Media, interview professionnelle en français.').slice(0, 500);
  const result = await env.AI.run(WHISPER_MODEL, {
    audio: bytesToBase64(bytes),
    task: 'transcribe',
    language: 'fr',
    vad_filter: true,
    initial_prompt: initialPrompt,
    condition_on_previous_text: false,
    no_speech_threshold: 0.62,
    compression_ratio_threshold: 2.4,
    log_prob_threshold: -1,
  });
  return json({
    ok: true,
    model: WHISPER_MODEL,
    text: String(result?.text || '').trim(),
    wordCount: Number(result?.word_count || result?.wordCount || 0),
    segments: Array.isArray(result?.segments) ? result.segments : [],
    vtt: String(result?.vtt || ''),
  });
}

async function analyzeContainerPayload(request, env, jobId, origin) {
  const payload = await request.json().catch(() => ({}));
  const result = await analyzeVideoForClips(env, {
    transcript: payload.transcript,
    segments: payload.segments,
    durationSeconds: payload.media?.durationSeconds,
    width: payload.media?.width,
    height: payload.media?.height,
    visualProfile: payload.visualProfile,
    objective: payload.objective,
    company: payload.company,
    clientName: payload.clientName,
    orderTitle: payload.orderTitle,
  });
  const candidates = [];
  for (const candidate of result.candidates || []) {
    const key = `video-ai/outputs/${safePath(jobId)}/${String(candidate.rank || 0).padStart(2, '0')}-${safePath(candidate.id)}.mp4`;
    const path = `/api/internal/video-ai/output/${encodeURIComponent(jobId)}/${encodeURIComponent(candidate.id)}`;
    const outputUrl = new URL(await signVideoAiUrl(env, origin, path, jobId, `output:${candidate.id}`, 9 * 3600));
    outputUrl.searchParams.set('key', key);
    candidates.push({ ...candidate, outputKey: key, outputUrl: outputUrl.toString() });
  }
  return json({ ok: true, ...result, candidates });
}

async function serveAdminClipMedia(request, env, studio, auth, jobId, clipId) {
  const response = await callStore(studio, '/portal/video-ai-job-get', { ...auth, jobId });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return json(result, response.status);
  const clip = (result.clips || []).find((item) => item.id === clipId);
  if (!clip?.outputKey) return json({ error: 'video_ai_clip_media_missing' }, 404);
  return serveR2Object(request, env.MEDIA, clip.outputKey, `inline; filename="${safeFilename(clip.title || clip.id)}.mp4"`);
}

async function exportClipToDrive(env, studio, auth, clipId) {
  const contextResponse = await callStore(studio, '/portal/video-ai-export-context', { ...auth, clipId });
  const context = await contextResponse.json().catch(() => ({}));
  if (!contextResponse.ok) return json(context, contextResponse.status);
  const clip = context.clip;
  if (clip.status === 'delivered' && clip.driveFileId) return json({ ok: true, alreadyDelivered: true, clip });
  if (!clip.shortsFolderId) return json({ error: 'drive_short_folder_missing' }, 409);
  const object = await env.MEDIA.get(clip.outputKey);
  if (!object?.body) return json({ error: 'video_ai_clip_media_missing' }, 404);
  const tokenResponse = await callStore(studio, '/portal/drive-token-get', { system: true });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.accessToken) return json({ error: tokenData.error || 'drive_access_token_missing' }, 503);
  await callStore(studio, '/portal/video-ai-export-mark', { system: true, clipId, status: 'exporting' });
  try {
    const name = driveFilename(clip);
    const session = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(object.size),
      },
      body: JSON.stringify({
        name,
        mimeType: 'video/mp4',
        parents: [clip.shortsFolderId],
        description: `Short Neptune IA · ${clip.funnel} · score ${clip.score}/100`,
        appProperties: {
          origin: 'neptune_ai_generated',
          jobId: clip.jobId,
          clipId: clip.id,
          funnel: clip.funnel,
          score: String(clip.score),
        },
      }),
    });
    const location = session.headers.get('Location');
    if (!session.ok || !location) throw new Error(`drive_resumable_session_http_${session.status}:${(await session.text()).slice(0, 300)}`);
    const uploaded = await fetch(location, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(object.size) },
      body: object.body,
    });
    const driveFile = await uploaded.json().catch(() => ({}));
    if (!uploaded.ok || !driveFile.id) throw new Error(`drive_video_upload_http_${uploaded.status}:${JSON.stringify(driveFile).slice(0, 300)}`);
    const webViewUrl = driveFile.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(driveFile.id)}/view`;
    await callStore(studio, '/portal/video-ai-export-mark', {
      system: true,
      clipId,
      status: 'delivered',
      driveFileId: driveFile.id,
      driveWebViewUrl: webViewUrl,
    });
    return json({ ok: true, clipId, driveFileId: driveFile.id, driveWebViewUrl: webViewUrl, synchronizedByExistingDriveFlow: true });
  } catch (error) {
    await callStore(studio, '/portal/video-ai-export-mark', { system: true, clipId, status: 'approved' }).catch(() => {});
    throw error;
  }
}

async function notifyReviewReady(env, studio, jobId, clipCount) {
  const contextResponse = await callStore(studio, '/portal/video-ai-job-system-get', { system: true, jobId });
  const context = await contextResponse.json().catch(() => ({}));
  const job = context.job || {};
  const origin = env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com';
  const subject = `${clipCount || 0} short(s) Neptune IA à valider · ${job.company || job.clientName || job.orderTitle || 'Projet'}`;
  const link = `${origin}/studio/video-ai.html?job=${encodeURIComponent(jobId)}`;
  const result = await sendEmail(env, {
    to: 'contact@neptunebusiness.com',
    subject,
    text: [
      'Le traitement Neptune Studio Vidéo est terminé.',
      '',
      `Projet : ${job.orderTitle || 'Passage Neptune Media'}`,
      `Client : ${job.company || job.clientName || 'Client Neptune Media'}`,
      `Shorts retenus avec un score minimum de 60/100 : ${clipCount || 0}`,
      '',
      'Les contenus doivent être validés avant leur envoi dans le dossier Google Drive du client.',
      link,
    ].join('\n'),
    html: `<h1>Shorts prêts à valider</h1><p><strong>${escapeHtml(job.company || job.clientName || 'Client Neptune Media')}</strong> · ${escapeHtml(job.orderTitle || 'Passage Neptune Media')}</p><p>${Number(clipCount || 0)} contenu(s) ont été retenus avec un score minimum de 60/100.</p><p>Vérifiez le montage, les sous-titres, le score TOFU/MOFU/BOFU et les trois propositions éditoriales avant l’envoi Drive.</p><p><a href="${escapeHtml(link)}">Ouvrir la validation Neptune Studio</a></p>`,
    idempotencyKey: `video-ai-review-ready/${jobId}`,
  });
  if (!result.ok) throw new Error(result.error || 'video_ai_review_email_failed');
  return result;
}

async function authorizedJob(studio, auth, jobId) {
  const response = await callStore(studio, '/portal/video-ai-job-get', { ...auth, jobId });
  const result = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, job: result.job, clips: result.clips || [] } : { ok: false, response: json(result, response.status) };
}

async function serveR2Object(request, bucket, key, disposition) {
  if (!bucket) return json({ error: 'media_storage_unavailable' }, 503);
  const rangeHeader = request.headers.get('Range');
  const object = await bucket.get(key, rangeHeader ? { range: request.headers } : undefined);
  if (!object) return json({ error: 'media_not_found' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('Content-Disposition', disposition || 'inline');
  const body = request.method === 'HEAD' ? null : object.body;
  if (object.range) {
    const offset = Number(object.range.offset || 0);
    const length = Number(object.range.length || 0);
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(body, { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size));
  return new Response(body, { status: 200, headers });
}

async function markDispatchFailure(studio, jobId, error) {
  console.error('video_ai_dispatch_failed', { jobId, ...safeError(error) });
  await callStore(studio, '/portal/video-ai-job-update', {
    system: true,
    jobId,
    status: 'failed',
    stage: 'dispatch',
    progress: 5,
    errorCode: 'video_processor_dispatch_failed',
    errorDetail: String(error?.message || error || 'unknown').slice(0, 1200),
  });
}

function driveFilename(clip) {
  const base = `${clip.company || clip.clientName || 'Client'} - ${clip.title || `Short ${clip.id}`}`
    .normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9 _.-]+/gu, ' ')
    .replace(/\s+/gu, ' ').trim().slice(0, 180);
  return `${base || `Short-${clip.id}`}.mp4`;
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) binary += String.fromCharCode(...bytes.subarray(index, index + size));
  return btoa(binary);
}

function safePath(value) {
  return String(value || '').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 180) || 'item';
}

function validR2Key(value) {
  const key = String(value || '');
  return key.startsWith('video-ai/') && key.length < 1000 && !key.includes('..') && !/[\r\n]/u.test(key);
}

function sanitizeStage(value) {
  return String(value || 'processing').replace(/[^a-z0-9_-]+/giu, '').slice(0, 80) || 'processing';
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  headers.set('X-Neptune-Video-AI', 'neptune-video-ai-20260730-v1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function safeError(error) {
  return { name: error?.name || 'Error', message: String(error?.message || error || 'unknown').slice(0, 500) };
}

function normalizeRouteError(error) {
  const message = String(error?.message || error || 'unknown');
  if (message.includes('video_ai_internal_secret_missing')) return 'video_ai_internal_secret_missing';
  if (message.includes('drive_video_upload')) return 'drive_video_upload_failed';
  if (message.includes('drive_resumable_session')) return 'drive_resumable_session_failed';
  if (message.includes('container') || message.includes('processor')) return 'video_processor_unavailable';
  return 'video_ai_operation_failed';
}

function routeErrorStatus(error) {
  const message = String(error?.message || error || '');
  if (message.includes('missing')) return 503;
  if (message.includes('drive_')) return 502;
  return 500;
}
