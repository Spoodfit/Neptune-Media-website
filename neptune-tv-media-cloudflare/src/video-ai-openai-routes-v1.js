import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json, securityHeaders } from './security.js';
import {
  analyzeVideoWithOpenAI,
  isOpenAiConfigured,
  openAiPublicConfiguration,
  testOpenAiConnection,
} from './openai-video-analysis-v1.js';

const BOOTSTRAP_PATH = '/api/admin/video-ai/bootstrap';
const STATUS_PATH = '/api/admin/video-ai/openai/status';
const TEST_PATH = '/api/admin/video-ai/openai/test';
const ASSIST_PATTERN = /^\/api\/admin\/video-ai\/local\/jobs\/([^/]+)\/assist$/u;
const RELEASE = 'neptune-openai-video-analysis-20260731-v1';

export async function handleOpenAiVideoRoute(request, env, ctx, studio) {
  const url = new URL(request.url);
  const isBootstrap = url.pathname === BOOTSTRAP_PATH && request.method === 'GET';
  const isStatus = url.pathname === STATUS_PATH && request.method === 'GET';
  const isTest = url.pathname === TEST_PATH && request.method === 'POST';
  const assistMatch = url.pathname.match(ASSIST_PATTERN);
  const isAssist = Boolean(assistMatch && request.method === 'POST');
  if (!isBootstrap && !isStatus && !isTest && !isAssist) return null;

  if (!isSameOrigin(request)) return secure(json({ error: 'origin_forbidden' }, 403));
  if ((isTest || isAssist) && !request.headers.get('X-CSRF-Token')) {
    return secure(json({ error: 'csrf_failed' }, 403));
  }

  const auth = adminAuth(request);
  if (isBootstrap) {
    const response = await callStore(studio, '/portal/video-ai-bootstrap', auth);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return secure(json(data, response.status));
    const configured = isOpenAiConfigured(env);
    return secure(json({
      ...data,
      policy: {
        ...(data.policy || {}),
        engineMode: 'browser-local',
        sourceUploadRequired: false,
        cloudContainerRequired: false,
        openAiAnalysisAvailable: configured,
        openAiAnalysisMode: configured ? 'always-before-render' : 'disabled',
        openAiModel: openAiPublicConfiguration(env).model,
        semanticAnalysisAvailable: configured || Boolean(env.AI),
        semanticProviderPriority: configured ? 'openai-then-workers-ai-then-local' : 'workers-ai-then-local',
        workersAiAssistAvailable: Boolean(env.AI),
        localModel: 'onnx-community/whisper-base_timestamped',
        localStorage: 'indexeddb-generated-clips-only',
        sourceVideoSentToOpenAi: false,
        openAiDataStorage: 'store-false',
      },
    }));
  }

  if (isStatus) {
    const actor = await authorize(studio, auth);
    if (!actor.ok) return secure(actor.response);
    return secure(json({
      ok: true,
      release: RELEASE,
      ...openAiPublicConfiguration(env),
      priority: isOpenAiConfigured(env) ? 'openai-then-workers-ai-then-local' : 'workers-ai-then-local',
      status: isOpenAiConfigured(env) ? 'configured' : 'secret_missing',
      requiredSecret: 'OPENAI_API_KEY',
      optionalVariables: ['OPENAI_MODEL', 'OPENAI_BASE_URL', 'OPENAI_ORGANIZATION', 'OPENAI_PROJECT'],
    }));
  }

  if (isTest) {
    const actor = await authorize(studio, auth);
    if (!actor.ok) return secure(actor.response);
    try {
      return secure(json({ release: RELEASE, ...(await testOpenAiConnection(env)) }));
    } catch (error) {
      console.error('openai_video_connection_test_failed', safeError(error));
      return secure(json({
        error: error?.code || 'openai_connection_test_failed',
        detail: String(error?.detail || '').slice(0, 500),
        requestId: String(error?.requestId || ''),
      }, normalizeStatus(error)));
    }
  }

  if (!isOpenAiConfigured(env)) return null;
  const jobId = decodeURIComponent(assistMatch[1]);
  const authorized = await readAuthorizedJob(studio, auth, jobId);
  if (!authorized.ok) return secure(authorized.response);
  const payload = await request.json().catch(() => ({}));
  const job = authorized.data.job || {};

  try {
    const result = await analyzeVideoWithOpenAI(env, {
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
      release: RELEASE,
      assistMode: 'openai-structured-analysis',
      fallbackAvailable: true,
      ...result,
    }));
  } catch (error) {
    console.error('openai_video_analysis_failed_falling_back', {
      ...safeError(error),
      jobId,
      fallback: 'workers-ai-then-local',
    });
    if (ctx?.waitUntil) ctx.waitUntil(Promise.resolve());
    return null;
  }
}

async function authorize(studio, auth) {
  const response = await callStore(studio, '/portal/video-ai-bootstrap', auth);
  const data = await response.json().catch(() => ({}));
  return response.ok
    ? { ok: true, data }
    : { ok: false, response: json(data, response.status) };
}

async function readAuthorizedJob(studio, auth, jobId) {
  const response = await callStore(studio, '/portal/video-ai-job-get', { ...auth, jobId });
  const data = await response.json().catch(() => ({}));
  return response.ok
    ? { ok: true, data }
    : { ok: false, response: json(data, response.status) };
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  headers.set('X-Neptune-OpenAI-Video', RELEASE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizeStatus(error) {
  const status = Number(error?.status || 0);
  return status >= 400 && status <= 599 ? status : 502;
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 120),
    code: String(error?.code || error?.message || 'unknown').slice(0, 160),
    detail: String(error?.detail || '').slice(0, 500),
    requestId: String(error?.requestId || '').slice(0, 160),
    status: Number(error?.status || 0),
  };
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanMultiline(value, max = 5000) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').replace(/[\t ]+/gu, ' ').replace(/\n{3,}/gu, '\n\n').trim().slice(0, max);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value || 0))));
}
