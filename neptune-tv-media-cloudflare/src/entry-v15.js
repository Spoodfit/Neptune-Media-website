import base from './entry-v13.js';
import { StudioStore } from './store-v12.js';
import { handleVideoAiLocalRoute } from './video-ai-local-routes-v1.js';
import { handleOpenAiVideoRoute } from './video-ai-openai-routes-v1.js';
import { isOpenAiConfigured, openAiModel } from './openai-video-analysis-v1.js';

export { StudioStore };

const RELEASE = 'neptune-video-local-engine-20260730-v1';
const OPENAI_RELEASE = 'neptune-openai-video-analysis-20260731-v1';
const DEPLOYMENT_TRIGGER = 'openai-semantic-video-analysis-20260731-r1';
const STUDIO_IA_CSS = '/studio/studio-information-architecture-v65.css?v=1';
const STUDIO_IA_JS = '/studio/studio-information-architecture-v65-1.js?v=1';
const OPENAI_UI_CSS = '/studio/video-ai-openai-v1.css?v=1';
const OPENAI_UI_JS = '/studio/video-ai-openai-v1.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    const openAiVideo = await handleOpenAiVideoRoute(request.clone(), env, ctx, studio);
    if (openAiVideo) return withHeaders(openAiVideo, url.pathname);
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

async function augmentRelease(response, env) {
  const current = await response.json().catch(() => ({}));
  const openAiConfigured = isOpenAiConfigured(env);
  return new Response(JSON.stringify({
    ...current,
    videoAiStudio: RELEASE,
    videoAiOpenAiIntegration: OPENAI_RELEASE,
    videoAiDeploymentTrigger: DEPLOYMENT_TRIGGER,
    videoAiEntry: '/studio/video-ai',
    videoAiPipeline: 'browser-local-whisper-openai-semantic-selection-render-indexeddb-review-direct-drive',
    videoAiEngineMode: 'browser-local',
    videoAiSemanticLayer: 'optional-openai-responses-api-before-local-render',
    videoAiMinimumScore: 60,
    videoAiFunnels: ['TOFU', 'MOFU', 'BOFU'],
    videoAiEditorialProposals: 3,
    videoAiReviewPolicy: 'internal-validation-required-before-drive-export',
    videoAiSourcePrivacy: 'source-never-uploaded',
    videoAiRendering: 'browser-mediabunny-webcodecs-vertical-1080x1920-adaptive-subtitles',
    videoAiTranscription: 'onnx-community/whisper-base_timestamped-webgpu-wasm',
    videoAiStorage: 'indexeddb-generated-clips-durable-object-metadata-only',
    videoAiSemanticProvider: openAiConfigured ? 'openai-responses-api' : 'workers-ai-then-local',
    videoAiSemanticPriority: 'openai-then-workers-ai-then-deterministic-local',
    videoAiOpenAiConfigured: openAiConfigured,
    videoAiOpenAiModel: openAiModel(env),
    videoAiOpenAiMode: 'always-before-render-when-configured',
    videoAiOpenAiStructuredOutputs: true,
    videoAiOpenAiDataPolicy: 'store-false-timestamped-transcript-and-metrics-only-no-source-video',
    videoAiOpenAiStatusEndpoint: '/api/admin/video-ai/openai/status',
    videoAiOpenAiTestEndpoint: '/api/admin/video-ai/openai/test',
    videoAiWorkersAiRole: 'fallback-when-openai-is-not-configured-or-unavailable',
    videoAiWorkersAiBindingPresent: Boolean(env.AI),
    videoAiContainerRequired: false,
    videoAiContainerBindingPresent: false,
    videoAiInternalSecretRequired: false,
    videoAiR2SourceUploadRequired: false,
    videoAiCrossOriginIsolation: 'scoped-to-studio-video-ai-only',
    videoAiDriveTransport: 'approved-local-blob-streamed-directly-through-worker-to-drive',
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
    const firstEngineScript = '<script type="module" src="/studio/local-engine/neptune-video-local-engine-v1.js?v=1"></script>';
    const studioScripts = `<script type="module" src="${STUDIO_IA_JS}"></script><script type="module" src="${OPENAI_UI_JS}"></script>`;
    body = body.includes(firstEngineScript)
      ? body.replace(firstEngineScript, `${studioScripts}${firstEngineScript}`)
      : body.replace('</head>', `${studioScripts}</head>`);
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
  return isVideoAiPage(pathname) || pathname.startsWith('/studio/local-engine/');
}
