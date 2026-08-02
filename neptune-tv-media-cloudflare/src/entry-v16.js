import base from './entry-v13.js';
import { StudioStore } from './store-v13.js';
import { handleVideoAiLocalRoute } from './video-ai-local-routes-v1.js';
import { handleOpenAiVideoRoute } from './video-ai-openai-routes-v1.js';
import { isOpenAiConfigured, openAiModel } from './openai-video-analysis-v1.js';

export { StudioStore };

const RELEASE = 'neptune-video-engine-20260802-v73';
const OPENAI_RELEASE = 'neptune-openai-video-analysis-20260731-v1';
const STUDIO_IA_CSS = '/studio/studio-information-architecture-v65.css?v=1';
const STUDIO_IA_JS = '/studio/studio-information-architecture-v65-1.js?v=1';
const OPENAI_UI_CSS = '/studio/video-ai-openai-v1.css?v=1';
const OPENAI_UI_JS = '/studio/video-ai-openai-v1.js?v=1';
const PERMANENT_ENGINE_UI_JS = '/studio/video-ai-engine-v73.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (url.pathname === '/api/admin/video-ai/bootstrap' && request.method === 'GET') {
      await retireLegacyCloudJobs(studio);
    }

    if (isOpenAiRoute(url.pathname, request.method)) {
      const openAiRequest = isOpenAiAssistRoute(url.pathname, request.method) ? request.clone() : request;
      const openAiVideo = await handleOpenAiVideoRoute(openAiRequest, env, ctx, studio);
      if (openAiVideo) return withHeaders(openAiVideo, url.pathname);
    }

    const localVideo = await handleVideoAiLocalRoute(request, env, ctx, studio);
    if (localVideo) return withHeaders(localVideo, url.pathname);

    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      return withHeaders(await augmentRelease(response, env), url.pathname);
    }
    if (request.method === 'GET' && response.ok && isStudioWorkspacePath(url.pathname) && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectStudioInformationArchitecture(response, url.pathname);
    }
    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') await base.scheduled(controller, env, ctx);
  },
};

async function retireLegacyCloudJobs(studio) {
  try {
    const response = await studio.fetch('https://store/portal/video-ai-retire-cloud-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: true }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error('video_ai_legacy_retirement_failed', { status: response.status, error: data.error || 'unknown' });
    }
  } catch (error) {
    console.error('video_ai_legacy_retirement_failed', {
      name: String(error?.name || 'Error').slice(0, 120),
      message: String(error?.message || error || 'unknown').slice(0, 500),
    });
  }
}

async function augmentRelease(response, env) {
  const current = await response.json().catch(() => ({}));
  const openAiConfigured = isOpenAiConfigured(env);
  return new Response(JSON.stringify({
    ...current,
    videoAiStudio: RELEASE,
    videoAiOpenAiIntegration: OPENAI_RELEASE,
    videoAiEntry: '/studio/video-ai',
    videoAiPipeline: 'persistent-local-service-faster-whisper-openai-ollama-opencv-ffmpeg-studio-sync-browser-fallback',
    videoAiEngineMode: 'persistent-local-service-with-browser-fallback',
    videoAiDispatchMode: 'localhost-persistent-sqlite-queue',
    videoAiMinimumScore: 60,
    videoAiFunnels: ['TOFU', 'MOFU', 'BOFU'],
    videoAiEditorialProposals: 3,
    videoAiReviewPolicy: 'internal-validation-required-before-drive-export',
    videoAiSourcePrivacy: 'source-kept-on-neptune-machine-transcript-only-optional-ai',
    videoAiRendering: 'local-ffmpeg-opencv-smart-crop-vertical-1080x1920-ass-subtitles',
    videoAiTranscription: 'faster-whisper-local-primary-browser-whisper-fallback',
    videoAiStorage: 'local-sqlite-persistent-volume-plus-indexeddb-review-sync',
    videoAiSemanticProvider: 'local-openai-then-ollama-then-rules-with-browser-cloud-assist-fallback',
    videoAiSemanticPriority: 'openai-then-ollama-then-neptune-rules-then-browser-workers-ai',
    videoAiOpenAiConfigured: openAiConfigured,
    videoAiOpenAiModel: openAiModel(env),
    videoAiOpenAiMode: 'server-side-browser-fallback-and-optional-local-engine-key',
    videoAiOpenAiStructuredOutputs: true,
    videoAiOpenAiDataPolicy: 'store-false-timestamped-transcript-only-no-source-video',
    videoAiOpenAiStatusEndpoint: '/api/admin/video-ai/openai/status',
    videoAiOpenAiTestEndpoint: '/api/admin/video-ai/openai/test',
    videoAiWorkersAiRole: 'browser-fallback-when-openai-and-local-ollama-are-unavailable',
    videoAiWorkersAiBindingPresent: Boolean(env.AI),
    videoAiPermanentEngineEndpoint: 'http://127.0.0.1:4318',
    videoAiPermanentEngineInstaller: '/studio/install-neptune-video-engine.ps1',
    videoAiPermanentEngineVersion: RELEASE,
    videoAiPersistentQueue: 'local-sqlite-restart-resume',
    videoAiContainerRequired: false,
    videoAiContainerBindingPresent: false,
    videoAiQueueBindingPresent: false,
    videoAiInternalSecretRequired: false,
    videoAiR2SourceUploadRequired: false,
    videoAiBackgroundProcessing: true,
    videoAiSafeToCloseAfterUpload: true,
    videoAiBrowserFallbackPresent: true,
    videoAiReady: true,
    videoAiLegacyCloudRecovery: 'retired-reselect-source-into-permanent-local-engine',
    videoAiCrossOriginIsolation: 'scoped-to-studio-video-ai-and-browser-fallback-assets',
    videoAiDriveTransport: 'approved-local-blob-streamed-directly-through-worker-to-drive',
    videoAiStudioExperience: 'autonomous-production-story-with-permanent-engine-and-browser-fallback',
    studioInformationArchitecture: 'four-primary-destinations-v65',
    studioPrimaryNavigation: ['Parcours clients', 'Production vidéo', 'Diffusion', 'Réglages'],
    studioContextNavigation: 'diffusion-and-settings-secondary-tabs-v65',
    studioAdvancedZone: 'removed-from-visible-navigation-v65',
    studioContextualFunctions: 'content-calendar-and-billing-inside-client-dossiers',
    studioReadability: 'shared-shell-contrast-spacing-and-responsive-type-v65',
    studioNavigationRuntime: 'stable-no-observer-loop-v65.1',
    studioCanonicalVideoPath: '/studio/video-ai',
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function injectStudioInformationArchitecture(response, pathname) {
  let body = await response.text();
  const cssPattern = /<link\b[^>]*href=["'][^"']*\/studio\/studio-information-architecture-v65\.css[^"']*["'][^>]*>\s*/giu;
  const jsPattern = /<script\b[^>]*src=["'][^"']*\/studio\/studio-information-architecture-v65(?:-1)?\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu;
  const openAiCssPattern = /<link\b[^>]*href=["'][^"']*\/studio\/video-ai-openai-v1\.css[^"']*["'][^>]*>\s*/giu;
  const openAiJsPattern = /<script\b[^>]*src=["'][^"']*\/studio\/video-ai-openai-v1\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu;
  const permanentEngineJsPattern = /<script\b[^>]*src=["'][^"']*\/studio\/video-ai-engine-v73\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu;
  const retiredSidebarCssPattern = /<link\b[^>]*href=["'][^"']*\/studio\/studio-sidebar-authority-v64\.css[^"']*["'][^>]*>\s*/giu;
  const retiredSidebarJsPattern = /<script\b[^>]*src=["'][^"']*\/studio\/studio-sidebar-authority-v64\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu;
  body = body.replace(cssPattern, '');
  body = body.replace(jsPattern, '');
  body = body.replace(openAiCssPattern, '');
  body = body.replace(openAiJsPattern, '');
  body = body.replace(permanentEngineJsPattern, '');
  body = body.replace(retiredSidebarCssPattern, '');
  body = body.replace(retiredSidebarJsPattern, '');

  const styles = isVideoAiPage(pathname)
    ? `<link rel="stylesheet" href="${STUDIO_IA_CSS}"><link rel="stylesheet" href="${OPENAI_UI_CSS}">`
    : `<link rel="stylesheet" href="${STUDIO_IA_CSS}">`;
  body = body.replace('</head>', `${styles}</head>`);

  if (isVideoAiPage(pathname)) {
    const firstEngineScript = '<script type="module" src="/studio/local-engine/neptune-video-local-engine-v1.js?v=73"></script>';
    const studioScripts = `<script type="module" src="${STUDIO_IA_JS}"></script><script type="module" src="${OPENAI_UI_JS}"></script><script type="module" src="${PERMANENT_ENGINE_UI_JS}"></script>`;
    body = body.includes(firstEngineScript)
      ? body.replace(firstEngineScript, `${studioScripts}${firstEngineScript}`)
      : body.replace('</body>', `${studioScripts}${firstEngineScript}</body>`);
  } else {
    body = body.replace('</body>', `<script type="module" src="${STUDIO_IA_JS}"></script></body>`);
  }

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isOpenAiRoute(pathname, method) {
  return (pathname === '/api/admin/video-ai/bootstrap' && method === 'GET')
    || (pathname === '/api/admin/video-ai/openai/status' && method === 'GET')
    || (pathname === '/api/admin/video-ai/openai/test' && method === 'POST')
    || isOpenAiAssistRoute(pathname, method);
}

function isOpenAiAssistRoute(pathname, method) {
  return method === 'POST' && /^\/api\/admin\/video-ai\/local\/jobs\/[^/]+\/assist$/u.test(pathname);
}

function isStudioWorkspacePath(pathname) {
  return pathname === '/studio/clients'
    || pathname === '/studio/clients/'
    || pathname === '/studio/clients.html'
    || isVideoAiPage(pathname)
    || pathname === '/studio/advanced.html'
    || pathname === '/studio/advanced'
    || pathname === '/studio/advanced/';
}

function isVideoAiPage(pathname) {
  return pathname === '/studio/video-ai'
    || pathname === '/studio/video-ai/'
    || pathname === '/studio/video-ai.html';
}

function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Video-AI', RELEASE);
  headers.set('X-Neptune-OpenAI-Video', OPENAI_RELEASE);
  headers.set('X-Neptune-Studio-IA', 'four-primary-destinations-v65');
  if (isLocalEngineAsset(pathname)) {
    headers.set('Content-Security-Policy', allowLoopbackEngine(headers.get('Content-Security-Policy') || ''));
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function allowLoopbackEngine(csp) {
  const directives = String(csp || '')
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean)
    .filter((directive) => !/^upgrade-insecure-requests$/iu.test(directive));
  const loopbackSources = ['http://127.0.0.1:4318', 'http://localhost:4318', 'http://[::1]:4318'];
  const connectIndex = directives.findIndex((directive) => /^connect-src(?:\s|$)/iu.test(directive));
  if (connectIndex >= 0) {
    const current = directives[connectIndex].split(/\s+/u);
    for (const source of loopbackSources) if (!current.includes(source)) current.push(source);
    directives[connectIndex] = current.join(' ');
  } else {
    directives.push(`connect-src 'self' ${loopbackSources.join(' ')}`);
  }
  return directives.join('; ');
}

function isLocalEngineAsset(pathname) {
  return isVideoAiPage(pathname) || pathname.startsWith('/studio/local-engine/');
}
