import { adminAuth, safeFilename } from './portal-http-utils.js';
import { isSameOrigin, json, securityHeaders } from './security.js';
import { analyzeVideoForClips } from './video-ai-analysis-v1.js';
import { sendEmail } from './email-service.js';

const MAX_LOCAL_CLIP_BYTES = 96 * 1024 * 1024;
const LOCAL_RELEASE = 'neptune-video-local-engine-20260730-v1';
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']);

export async function handleVideoAiLocalRoute(request, env, ctx, studio) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/video-ai/')) return null;

  try {
    if (!isSameOrigin(request)) return secure(json({ error: 'origin_forbidden' }, 403));
    if (!['GET', 'HEAD'].includes(request.method) && !request.headers.get('X-CSRF-Token')) {
      return secure(json({ error: 'csrf_failed' }, 403));
    }

    const auth = adminAuth(request);

    if (url.pathname === '/api/admin/video-ai/bootstrap' && request.method === 'GET') {
      const response = await callStore(studio, '/portal/video-ai-bootstrap', auth);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return secure(json(data, response.status));
      return secure(json({
        ...data,
        policy: {
          ...(data.policy || {}),
          engineMode: 'browser-local',
          sourceUploadRequired: false,
          cloudContainerRequired: false,
          workersAiAssistAvailable: Boolean(env.AI),
          localModel: 'onnx-community/whisper-base_timestamped',
          localStorage: 'indexeddb-generated-clips-only',
        },
      }));
    }

    const jobMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)$/u);
    if (jobMatch && request.method === 'GET') {
      return secure(await callStore(studio, '/portal/video-ai-job-get', {
        ...auth,
        jobId: decodeURIComponent(jobMatch[1]),
      }));
    }

    if (url.pathname === '/api/admin/video-ai/local/jobs' && request.method === 'POST') {
      return secure(await createLocalJob(request, studio, auth));
    }

    const progressMatch = url.pathname.match(/^\/api\/admin\/video-ai\/local\/jobs\/([^/]+)\/progress$/u);
    if (progressMatch && request.method === 'POST') {
      const jobId = decodeURIComponent(progressMatch[1]);
      const authorized = await readAuthorizedJob(studio, auth, jobId);
      if (!authorized.ok) return secure(authorized.response);
      const payload = await request.json().catch(() => ({}));
      return secure(await callStore(studio, '/portal/video-ai-job-update', {
        system: true,
        jobId,
        status: allowedJobStatus(payload.status),
        stage: clean(payload.stage, 80) || 'local_processing',
        progress: clampInt(payload.progress, 0, 99),
        errorCode: clean(payload.errorCode, 120),
        errorDetail: cleanMultiline(payload.errorDetail, 1200),
      }));
    }

    const assistMatch = url.pathname.match(/^\/api\/admin\/video-ai\/local\/jobs\/([^/]+)\/assist$/u);
    if (assistMatch && request.method === 'POST') {
      const jobId = decodeURIComponent(assistMatch[1]);
      const authorized = await readAuthorizedJob(studio, auth, jobId);
      if (!authorized.ok) return secure(authorized.response);
      const payload = await request.json().catch(() => ({}));
      const job = authorized.data.job || {};
      const result = await analyzeVideoForClips(env, {
        transcript: cleanMultiline(payload.transcript, 180000),
        segments: Array.isArray(payload.segments) ? payload.segments.slice(0, 12000) : [],
        durationSeconds: positive(payload.durationSeconds),
        width: clampInt(payload.width, 0, 20000),
        height: clampInt(payload.height, 0, 20000),
        visualProfile: safeObject(payload.visualProfile),
        objective: job.objective || payload.objective,
        company: job.company || payload.company,
        clientName: job.clientName || payload.clientName,
        orderTitle: job.orderTitle || payload.orderTitle,
      });
      return secure(json({
        ok: true,
        assistMode: result.generationStatus === 'generated' ? 'workers-ai-free-assist' : 'deterministic-fallback',
        ...result,
      }));
    }

    const completeMatch = url.pathname.match(/^\/api\/admin\/video-ai\/local\/jobs\/([^/]+)\/complete$/u);
    if (completeMatch && request.method === 'POST') {
      const jobId = decodeURIComponent(completeMatch[1]);
      const authorized = await readAuthorizedJob(studio, auth, jobId);
      if (!authorized.ok) return secure(authorized.response);
      const payload = await request.json().catch(() => ({}));
      const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      const candidates = rawCandidates
        .filter((item) => Number(item?.score || 0) >= 60)
        .slice(0, 48)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
          outputKey: `local://browser/${safePath(jobId)}/${safePath(item.id || `clip-${index + 1}`)}`,
          outputSizeBytes: clampInt(item.outputSizeBytes, 0, MAX_LOCAL_CLIP_BYTES),
        }));
      if (!candidates.length) return secure(json({ error: 'no_candidate_above_minimum_score' }, 409));
      const saveResponse = await callStore(studio, '/portal/video-ai-analysis-save', {
        system: true,
        jobId,
        result: {
          transcript: cleanMultiline(payload.transcript, 180000),
          promptVersion: clean(payload.promptVersion, 140) || 'neptune-local-heuristics-v1',
          aiModel: clean(payload.aiModel, 140) || 'local-whisper-base-plus-rules',
          generationStatus: clean(payload.generationStatus, 60) || 'local',
          candidates,
        },
        durationSeconds: positive(payload.durationSeconds),
        width: clampInt(payload.width, 0, 20000),
        height: clampInt(payload.height, 0, 20000),
        transcript: cleanMultiline(payload.transcript, 180000),
        transcriptVtt: cleanMultiline(payload.transcriptVtt, 240000),
        visualProfile: safeObject(payload.visualProfile),
      });
      const saved = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) return secure(json(saved, saveResponse.status));
      ctx.waitUntil(notifyReviewReady(env, authorized.data.job, saved.clipCount, jobId).catch((error) => {
        console.error('video_local_review_email_failed', safeError(error));
      }));
      return secure(json({ ok: true, jobId, clipCount: saved.clipCount, status: 'review_ready' }));
    }

    const failMatch = url.pathname.match(/^\/api\/admin\/video-ai\/local\/jobs\/([^/]+)\/fail$/u);
    if (failMatch && request.method === 'POST') {
      const jobId = decodeURIComponent(failMatch[1]);
      const authorized = await readAuthorizedJob(studio, auth, jobId);
      if (!authorized.ok) return secure(authorized.response);
      const payload = await request.json().catch(() => ({}));
      return secure(await callStore(studio, '/portal/video-ai-job-update', {
        system: true,
        jobId,
        status: 'failed',
        stage: clean(payload.stage, 80) || 'local_processing',
        progress: clampInt(payload.progress, 0, 99),
        errorCode: clean(payload.errorCode, 120) || 'local_video_processing_failed',
        errorDetail: cleanMultiline(payload.errorDetail, 1200),
      }));
    }

    const clipActionMatch = url.pathname.match(/^\/api\/admin\/video-ai\/clips\/([^/]+)\/action$/u);
    if (clipActionMatch && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      return secure(await callStore(studio, '/portal/video-ai-clip-action', {
        ...auth,
        payload: { ...payload, clipId: decodeURIComponent(clipActionMatch[1]) },
      }));
    }

    const mediaMatch = url.pathname.match(/^\/api\/admin\/video-ai\/jobs\/([^/]+)\/clips\/([^/]+)\/media$/u);
    if (mediaMatch && ['GET', 'HEAD'].includes(request.method)) {
      return secure(json({
        error: 'local_media_only',
        message: 'Le rendu reste dans le stockage local du navigateur qui l’a généré.',
      }, 409));
    }

    const exportMatch = url.pathname.match(/^\/api\/admin\/video-ai\/clips\/([^/]+)\/export$/u);
    if (exportMatch && request.method === 'POST') {
      return secure(await exportLocalClipToDrive(request, env, studio, auth, decodeURIComponent(exportMatch[1])));
    }

    return secure(json({ error: 'not_found' }, 404));
  } catch (error) {
    console.error('video_local_route_failed', safeError(error));
    return secure(json({ error: normalizeError(error) }, errorStatus(error)));
  }
}

async function createLocalJob(request, studio, auth) {
  const payload = await request.json().catch(() => ({}));
  const sourceFingerprint = `local:${clean(payload.sourceFingerprint, 150)}`;
  const createResponse = await callStore(studio, '/portal/video-ai-job-create', {
    ...auth,
    payload: {
      ...payload,
      sourceFingerprint,
      sizeBytes: clampInt(payload.sizeBytes, 1, 80 * 1024 * 1024 * 1024),
    },
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) return json(created, createResponse.status);
  if (created.deduplicated) return json({ ok: true, deduplicated: true, job: created.job });
  const jobId = created.job?.id;
  if (!jobId) return json({ error: 'invalid_video_ai_job' }, 500);
  await callStore(studio, '/portal/video-ai-job-set-upload', {
    ...auth,
    jobId,
    sourceKey: `local://browser/${safePath(jobId)}/${safeFilename(payload.sourceName || 'source.mp4')}`,
    uploadId: 'browser-session',
  });
  await callStore(studio, '/portal/video-ai-job-update', {
    system: true,
    jobId,
    status: 'processing',
    stage: 'local_prepare',
    progress: 1,
    incrementAttempt: true,
  });
  return json({
    ok: true,
    deduplicated: false,
    job: { ...created.job, status: 'processing', stage: 'local_prepare', progress: 1, engineMode: 'browser-local' },
  });
}

async function exportLocalClipToDrive(request, env, studio, auth, clipId) {
  if (!request.body) return json({ error: 'local_clip_body_missing' }, 400);
  const declaredSize = clampInt(request.headers.get('X-Clip-Size') || request.headers.get('Content-Length'), 0, MAX_LOCAL_CLIP_BYTES + 1);
  if (!declaredSize || declaredSize > MAX_LOCAL_CLIP_BYTES) return json({ error: 'local_clip_too_large' }, 413);
  const mimeType = clean(request.headers.get('Content-Type'), 120).toLowerCase();
  if (!VIDEO_TYPES.has(mimeType)) return json({ error: 'local_clip_type_invalid' }, 415);

  const contextResponse = await callStore(studio, '/portal/video-ai-export-context', { ...auth, clipId });
  const context = await contextResponse.json().catch(() => ({}));
  if (!contextResponse.ok) return json(context, contextResponse.status);
  const clip = context.clip;
  if (clip.status === 'delivered' && clip.driveFileId) return json({ ok: true, alreadyDelivered: true, clip });
  if (!clip.shortsFolderId) return json({ error: 'drive_short_folder_missing' }, 409);

  const tokenResponse = await callStore(studio, '/portal/drive-token-get', { system: true });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.accessToken) return json({ error: tokenData.error || 'drive_access_token_missing' }, 503);
  await callStore(studio, '/portal/video-ai-export-mark', { system: true, clipId, status: 'exporting' });

  try {
    const fileName = driveFilename(clip, mimeType);
    const metadata = {
      name: fileName,
      parents: [clip.shortsFolderId],
      appProperties: {
        origin: 'neptune_ai_generated',
        engine: 'neptune_video_local',
        source_video_id: String(clip.jobId || '').slice(0, 120),
        generation_id: String(clip.id || '').slice(0, 120),
        funnel: String(clip.funnel || '').slice(0, 20),
        score: String(clip.score || 0),
      },
    };
    const session = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(declaredSize),
      },
      body: JSON.stringify(metadata),
    });
    if (!session.ok) throw new Error(`drive_resumable_session_failed:${session.status}`);
    const location = session.headers.get('Location');
    if (!location) throw new Error('drive_resumable_session_missing');

    const uploaded = await fetch(location, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(declaredSize),
      },
      body: request.body,
    });
    const uploadedData = await uploaded.json().catch(() => ({}));
    if (!uploaded.ok || !uploadedData.id) throw new Error(`drive_video_upload_failed:${uploaded.status}`);
    const webViewLink = uploadedData.webViewLink || `https://drive.google.com/file/d/${uploadedData.id}/view`;
    await callStore(studio, '/portal/video-ai-export-mark', {
      system: true,
      clipId,
      status: 'delivered',
      driveFileId: uploadedData.id,
      driveWebViewUrl: webViewLink,
    });
    return json({ ok: true, driveFileId: uploadedData.id, driveWebViewUrl: webViewLink, fileName });
  } catch (error) {
    await callStore(studio, '/portal/video-ai-export-mark', { system: true, clipId, status: 'failed' }).catch(() => {});
    throw error;
  }
}

async function readAuthorizedJob(studio, auth, jobId) {
  const response = await callStore(studio, '/portal/video-ai-job-get', { ...auth, jobId });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, data } : { ok: false, response: json(data, response.status) };
}

async function notifyReviewReady(env, job, clipCount, jobId) {
  const subject = `${clipCount} short${clipCount > 1 ? 's' : ''} Neptune prêt${clipCount > 1 ? 's' : ''} à valider`;
  const client = [job?.company, job?.clientName].filter(Boolean).join(' · ') || 'Client Neptune Media';
  const url = `${env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com'}/studio/video-ai.html?job=${encodeURIComponent(jobId)}`;
  return sendEmail(env, {
    to: ['contact@neptunebusiness.com'],
    subject,
    idempotencyKey: `video-local-review:${jobId}:${clipCount}`,
    text: `${client}\n${clipCount} contenu(s) généré(s) localement sont prêts à être validés.\n${url}`,
    html: `<p><strong>${escapeHtml(client)}</strong></p><p>${clipCount} contenu(s) généré(s) localement sont prêts à être validés.</p><p><a href="${escapeHtml(url)}">Ouvrir la validation Neptune</a></p>`,
  });
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function driveFilename(clip, mimeType) {
  const extension = mimeType === 'video/webm' ? 'webm' : mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const funnel = String(clip.funnel || 'SHORT').toUpperCase();
  const score = clampInt(clip.score, 0, 100);
  return `${safeFilename(`${funnel}-${score}-${clip.title || clip.id}`)}.${extension}`;
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  headers.set('X-Neptune-Video-AI', LOCAL_RELEASE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function allowedJobStatus(value) {
  return ['processing', 'failed', 'cancelled'].includes(String(value || '')) ? String(value) : 'processing';
}
function safePath(value) { return String(value || '').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 180) || 'item'; }
function clean(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function cleanMultiline(value, max = 5000) { return String(value ?? '').replace(/\r\n?/gu, '\n').trim().slice(0, max); }
function positive(value) { const number = Number(value || 0); return Number.isFinite(number) && number > 0 ? number : 0; }
function clampInt(value, min, max) { const number = Math.round(Number(value || 0)); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min; }
function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function safeError(error) { return { name: error?.name || 'Error', message: String(error?.message || error || 'unknown').slice(0, 800) }; }
function normalizeError(error) {
  const message = String(error?.message || error || 'video_local_operation_failed');
  if (message.startsWith('drive_resumable_session_failed')) return 'drive_resumable_session_failed';
  if (message.startsWith('drive_video_upload_failed')) return 'drive_video_upload_failed';
  if (message.includes('memory')) return 'local_engine_memory_limit';
  return /^[a-z0-9_:-]+$/iu.test(message) ? message.split(':')[0] : 'video_local_operation_failed';
}
function errorStatus(error) {
  const message = String(error?.message || error || '');
  if (message.includes('too_large')) return 413;
  if (message.includes('unauthorized')) return 401;
  if (message.includes('not_found')) return 404;
  if (message.includes('drive_')) return 502;
  return 500;
}
