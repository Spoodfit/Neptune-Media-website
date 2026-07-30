import base from './entry-v13.js';
import { StudioStore } from './store-v12.js';
import { handleVideoAiLocalRoute } from './video-ai-local-routes-v1.js';

export { StudioStore };

const RELEASE = 'neptune-video-local-engine-20260730-v1';
const DEPLOYMENT_TRIGGER = 'local-engine-free-20260730-r1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && ['/studio/video-ai', '/studio/video-ai/'].includes(url.pathname)) {
      return withHeaders(Response.redirect(new URL('/studio/video-ai.html', url.origin), 302), url.pathname);
    }

    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    const localVideo = await handleVideoAiLocalRoute(request, env, ctx, studio);
    if (localVideo) return withHeaders(localVideo, url.pathname);

    const response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      return withHeaders(await augmentRelease(response, env), url.pathname);
    }
    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') await base.scheduled(controller, env, ctx);
  },
};

async function augmentRelease(response, env) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    videoAiStudio: RELEASE,
    videoAiDeploymentTrigger: DEPLOYMENT_TRIGGER,
    videoAiEntry: '/studio/video-ai.html',
    videoAiPipeline: 'browser-local-whisper-selection-render-indexeddb-review-direct-drive',
    videoAiEngineMode: 'browser-local',
    videoAiMinimumScore: 60,
    videoAiFunnels: ['TOFU', 'MOFU', 'BOFU'],
    videoAiEditorialProposals: 3,
    videoAiReviewPolicy: 'internal-validation-required-before-drive-export',
    videoAiSourcePrivacy: 'source-never-uploaded',
    videoAiRendering: 'browser-mediabunny-webcodecs-vertical-1080x1920-adaptive-subtitles',
    videoAiTranscription: 'onnx-community/whisper-base_timestamped-webgpu-wasm',
    videoAiStorage: 'indexeddb-generated-clips-durable-object-metadata-only',
    videoAiWorkersAiRole: 'free-assist-only-when-local-selection-insufficient',
    videoAiWorkersAiBindingPresent: Boolean(env.AI),
    videoAiContainerRequired: false,
    videoAiContainerBindingPresent: false,
    videoAiInternalSecretRequired: false,
    videoAiR2SourceUploadRequired: false,
    videoAiCrossOriginIsolation: 'scoped-to-studio-video-ai-only',
    videoAiDriveTransport: 'approved-local-blob-streamed-directly-through-worker-to-drive',
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Video-AI', RELEASE);
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
  return pathname === '/studio/video-ai'
    || pathname === '/studio/video-ai/'
    || pathname === '/studio/video-ai.html'
    || pathname.startsWith('/studio/local-engine/');
}
