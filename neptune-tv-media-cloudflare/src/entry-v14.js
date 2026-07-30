import base from './entry-v13.js';
import { StudioStore } from './store-v12.js';
import { VideoProcessor } from './video-ai-container-v1.js';
import { handleVideoAiRoute, reconcileVideoAiJobs } from './video-ai-routes-v2.js';

export { StudioStore, VideoProcessor };

const RELEASE = 'neptune-video-ai-20260730-v1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && ['/studio/video-ai', '/studio/video-ai/'].includes(url.pathname)) {
      return withHeaders(Response.redirect(new URL('/studio/video-ai.html', url.origin), 302));
    }

    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    const videoAi = await handleVideoAiRoute(request, env, ctx, studio);
    if (videoAi) return withHeaders(videoAi);

    const response = await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      return withHeaders(await augmentRelease(response, env));
    }
    return withHeaders(response);
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
  return new Response(JSON.stringify({
    ...current,
    videoAiStudio: RELEASE,
    videoAiEntry: '/studio/video-ai.html',
    videoAiPipeline: 'multipart-r2-whisper-semantic-scoring-container-render-review-drive',
    videoAiMinimumScore: 60,
    videoAiFunnels: ['TOFU', 'MOFU', 'BOFU'],
    videoAiEditorialProposals: 3,
    videoAiReviewPolicy: 'internal-validation-required-before-drive-export',
    videoAiRendering: 'cloudflare-container-ffmpeg-adaptive-ass-subtitles',
    videoAiTranscription: '@cf/openai/whisper-large-v3-turbo',
    videoAiStorage: 'r2-source-and-output-durable-object-metadata',
    videoAiSecuritySecretPresent: Boolean(env.VIDEO_AI_INTERNAL_SECRET || env.DRIVE_WEBHOOK_SECRET || env.CONVERSION_WEBHOOK_SECRET),
    videoAiContainerBindingPresent: Boolean(env.VIDEO_PROCESSOR),
    videoAiStorageBindingPresent: Boolean(env.MEDIA),
    videoAiWorkersAiBindingPresent: Boolean(env.AI),
  }), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Video-AI', RELEASE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
