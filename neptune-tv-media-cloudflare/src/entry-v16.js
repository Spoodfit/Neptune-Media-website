import base from './entry-v13.js';
import { StudioStore } from './store-v12.js';
import { VideoProcessorV2 } from './video-ai-container-v2.js';
import { handleVideoAiRoute, reconcileVideoAiJobs } from './video-ai-routes-v3.js';
import { handleOpenAiVideoRoute } from './video-ai-openai-routes-v1.js';
import { isOpenAiConfigured, openAiModel } from './openai-video-analysis-v1.js';

export { StudioStore, VideoProcessorV2 };

const RELEASE = 'neptune-video-cloud-engine-20260731-v67';
const OPENAI_RELEASE = 'neptune-openai-video-analysis-20260731-v1';
const STUDIO_IA_CSS = '/studio/studio-information-architecture-v65.css?v=1';
const STUDIO_IA_JS = '/studio/studio-information-architecture-v65-1.js?v=1';
const OPENAI_UI_CSS = '/studio/video-ai-openai-v1.css?v=1';
const OPENAI_UI_JS = '/studio/video-ai-openai-v1.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    if (isOpenAiControlRoute(url.pathname, request.method)) {
      const openAiResponse = await handleOpenAiVideoRoute(request, env, ctx, studio);
      if (openAiResponse) return withHeaders(openAiResponse, url.pathname);
    }

    const videoAiResponse = await handleVideoAiRoute(request, env, ctx, studio);
    if (videoAiResponse) return withHeaders(videoAiResponse, url.pathname);

    let response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response, env);
    }
    if (request.method === 'GET' && response.ok && isStudioWorkspacePath(url.pathname) && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectStudioInformationArchitecture(response, url.pathname);
    }
    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') await base.scheduled(controller, env, ctx);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    ctx.waitUntil(reconcileVideoAiJobs(
      env,
      ctx,
      studio,
      env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com',
    ).catch((error) => {
      console.error('video_ai_reconciliation_failed', {
        name: error?.name || 'Error',
        message: String(error?.message || error || 'unknown').slice(0, 500),
      });
    }));
  },
};

async function augmentRelease(response, env) {
  const current = await response.json().catch(() => ({}));
  const openAiConfigured = isOpenAiConfigured(env);
  return new Response(JSON.stringify({
    ...current,
    videoAiStudio: RELEASE,
    videoAiOpenAiIntegration: OPENAI_RELEASE,
    videoAiEntry: '/studio/video-ai',
    videoAiPipeline: 'resumable-multipart-r2-container-ffmpeg-openai-transcription-semantic-selection-review-drive',
    videoAiEngineMode: 'cloud-asynchronous-with-local-fallback',
    videoAiMinimumScore: 60,
    videoAiFunnels: ['TOFU', 'MOFU', 'BOFU'],
    videoAiEditorialProposals: 3,
    videoAiReviewPolicy: 'internal-validation-required-before-drive-export',
    videoAiSourcePrivacy: 'encrypted-cloud-temporary-source-storage',
    videoAiRendering: 'cloudflare-container-ffmpeg-adaptive-ass-subtitles',
    videoAiTranscription: openAiConfigured ? 'openai-whisper-1-then-workers-ai-fallback' : 'workers-ai-whisper-large-v3-turbo',
    videoAiStorage: 'r2-source-and-output-durable-object-metadata',
    videoAiSemanticProvider: openAiConfigured ? 'openai-responses-api' : 'workers-ai',
    videoAiSemanticPriority: 'openai-then-workers-ai',
    videoAiOpenAiConfigured: openAiConfigured,
    videoAiOpenAiModel: openAiModel(env),
    videoAiOpenAiMode: 'server-analysis-before-render-when-configured',
    videoAiOpenAiStructuredOutputs: true,
    videoAiOpenAiDataPolicy: 'store-false-for-responses-api-no-source-video',
    videoAiOpenAiStatusEndpoint: '/api/admin/video-ai/openai/status',
    videoAiOpenAiTestEndpoint: '/api/admin/video-ai/openai/test',
    videoAiWorkersAiRole: 'fallback-when-openai-is-not-configured-or-unavailable',
    videoAiContainerRequired: true,
    videoAiContainerBindingPresent: Boolean(env.VIDEO_PROCESSOR),
    videoAiStorageBindingPresent: Boolean(env.MEDIA),
    videoAiWorkersAiBindingPresent: Boolean(env.AI),
    videoAiInternalSecretRequired: true,
    videoAiR2SourceUploadRequired: true,
    videoAiUpload: 'r2-multipart-16mb-three-way-parallel-retry',
    videoAiBackgroundProcessing: true,
    videoAiSafeToCloseAfterUpload: true,
    videoAiSourceRetention: 'deleted-after-successful-generation',
    videoAiLocalFallback: 'browser-engine-retained-not-primary',
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
  const retiredSidebarCssPattern = /<link\b[^>]*href=["'][^"']*\/studio\/studio-sidebar-authority-v64\.css[^"']*["'][^>]*>\s*/giu;
  const retiredSidebarJsPattern = /<script\b[^>]*src=["'][^"']*\/studio\/studio-sidebar-authority-v64\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu;
  body = body.replace(cssPattern, '');
  body = body.replace(jsPattern, '');
  body = body.replace(openAiCssPattern, '');
  body = body.replace(openAiJsPattern, '');
  body = body.replace(retiredSidebarCssPattern, '');
  body = body.replace(retiredSidebarJsPattern, '');

  const styles = isVideoAiPage(pathname)
    ? `<link rel="stylesheet" href="${STUDIO_IA_CSS}"><link rel="stylesheet" href="${OPENAI_UI_CSS}">`
    : `<link rel="stylesheet" href="${STUDIO_IA_CSS}">`;
  body = body.replace('</head>', `${styles}</head>`);

  if (isVideoAiPage(pathname)) {
    const firstCloudScript = '<script src="/studio/video-ai-cloud-resilience-v67.js?v=1"></script>';
    const studioScripts = `<script type="module" src="${STUDIO_IA_JS}"></script><script type="module" src="${OPENAI_UI_JS}"></script>`;
    body = body.includes(firstCloudScript)
      ? body.replace(firstCloudScript, `${studioScripts}${firstCloudScript}`)
      : body.replace('</body>', `${studioScripts}</body>`);
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

function isOpenAiControlRoute(pathname, method) {
  return (pathname === '/api/admin/video-ai/openai/status' && method === 'GET')
    || (pathname === '/api/admin/video-ai/openai/test' && method === 'POST');
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

function isLocalEngineAsset(pathname) {
  return pathname.startsWith('/studio/local-engine/');
}
