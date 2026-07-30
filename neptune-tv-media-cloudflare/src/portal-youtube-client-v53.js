import { handleClientYoutubeRoute as handleV52 } from './portal-youtube-client-v52.js';

const THUMBNAIL_ID_PATTERN = /\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})(?:\/|$)/u;

export async function handleClientYoutubeRoute(request, env, studio) {
  const response = await handleV52(request, env, studio);
  if (!response) return null;

  const contentType = String(response.headers.get('Content-Type') || '');
  if (!response.ok || !contentType.includes('application/json')) return response;

  const payload = await response.json().catch(() => null);
  if (!payload || !Array.isArray(payload.matched)) return rebuild(response, payload || {});

  const rejected = [];
  const seen = new Set();
  const matched = payload.matched.filter((video) => {
    const videoId = String(video?.videoId || '');
    if (!videoId || seen.has(videoId)) return false;
    seen.add(videoId);

    const thumbnailId = thumbnailVideoId(video?.thumbnailUrl);
    if (thumbnailId && thumbnailId !== videoId) {
      rejected.push({ videoId, thumbnailId, title: String(video?.title || '').slice(0, 180) });
      return false;
    }
    return true;
  });

  return rebuild(response, {
    ...payload,
    matched,
    integrityFilter: 'thumbnail-video-id-consistency-v1',
    ...(payload.diagnostics ? {
      diagnostics: {
        ...payload.diagnostics,
        integrityRejected: rejected,
      },
    } : {}),
  });
}

function thumbnailVideoId(value) {
  const match = String(value || '').match(THUMBNAIL_ID_PATTERN);
  return match?.[1] || '';
}

function rebuild(response, payload) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
