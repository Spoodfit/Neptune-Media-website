import base, { StudioStore } from './entry-v17.js';
import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json, securityHeaders } from './security.js';

export { StudioStore };

const RELEASE = 'neptune-studio-content-command-center-20260805-v79';
const CLIENT_DASHBOARD_CSS = '/espace-client/client-dashboard-clean-v78.css?v=1';
const COMMAND_CENTER_CSS = '/studio/content-command-center-v79.css?v=1';
const COMMAND_CENTER_JS = '/studio/content-command-center-v79.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if (request.method === 'GET' && url.pathname === '/api/admin/content-calendar') {
      return withHeaders(secure(await callStore(studio, '/portal/admin-content-calendar', {
        ...adminAuth(request),
        payload: { orderId: url.searchParams.get('orderId') || '' },
      })), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/content-schedule') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      return withHeaders(secure(await callStore(studio, '/portal/admin-content-schedule-upsert', {
        ...adminAuth(request), payload,
      })), url.pathname);
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/content-schedule-delete') {
      if (!isSameOrigin(request)) return withHeaders(json({ error: 'origin_forbidden' }, 403), url.pathname);
      const payload = await request.json().catch(() => ({}));
      return withHeaders(secure(await callStore(studio, '/portal/admin-content-schedule-delete', {
        ...adminAuth(request), payload,
      })), url.pathname);
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/content-thumbnail') {
      return withHeaders(secure(await serveAdminThumbnail(request, studio)), url.pathname);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/api/admin/content-media') {
      return withHeaders(secure(await serveAdminMedia(request, env, studio)), url.pathname);
    }

    let response = await base.fetch(request, env, ctx);

    if (request.method === 'GET' && url.pathname === '/api/public/release' && response.ok) {
      response = await augmentRelease(response);
    }

    if (request.method === 'GET' && response.ok && isClientDashboardPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectClientDashboardCleanup(response);
    }

    if (request.method === 'GET' && response.ok && isStudioClientsPath(url.pathname)
      && (response.headers.get('Content-Type') || '').includes('text/html')) {
      response = await injectStudioCommandCenter(response);
    }

    return withHeaders(response, url.pathname);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function serveAdminThumbnail(request, studio) {
  const url = new URL(request.url);
  const source = await getFileSource(request, studio, url.searchParams.get('fileId') || '');
  if (!source.ok) return source.response;
  const file = source.file;

  if (file.driveFileId) {
    const credential = await loadDriveCredential(studio);
    if (credential?.accessToken) {
      try {
        const id = encodeURIComponent(file.driveFileId);
        const metadata = await fetch(
          `https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink&supportsAllDrives=true`,
          {
            headers: {
              Authorization: `Bearer ${credential.accessToken}`,
              Accept: 'application/json',
              'User-Agent': 'Neptune-Media-Studio/1.0',
            },
          },
        );
        if (metadata.ok) {
          const result = await metadata.json().catch(() => ({}));
          if (result.thumbnailLink) {
            const thumbnail = await fetch(result.thumbnailLink, {
              headers: {
                Authorization: `Bearer ${credential.accessToken}`,
                Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
                'User-Agent': 'Neptune-Media-Studio/1.0',
              },
              redirect: 'follow',
            });
            const type = thumbnail.headers.get('Content-Type') || '';
            if (thumbnail.ok && type.startsWith('image/')) return imageResponse(thumbnail, type);
          }
        }
      } catch (error) {
        console.warn('studio_private_thumbnail_failed', String(error?.message || error).slice(0, 300));
      }
    }
  }

  const candidates = [];
  if (file.driveFileId) candidates.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(file.driveFileId)}&sz=w1280`);
  if (String(file.mimeType || '').startsWith('image/')) candidates.push(file.driveDownloadUrl || file.externalUrl);

  for (const candidate of candidates.filter(Boolean)) {
    try {
      const response = await fetch(candidate, {
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
          'User-Agent': 'Neptune-Media-Studio/1.0',
        },
      });
      const type = response.headers.get('Content-Type') || '';
      if (response.ok && type.startsWith('image/')) return imageResponse(response, type);
    } catch (error) {
      console.warn('studio_public_thumbnail_failed', String(error?.message || error).slice(0, 300));
    }
  }

  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function imageResponse(upstream, contentType) {
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=900',
    'X-Content-Type-Options': 'nosniff',
  });
  const length = upstream.headers.get('Content-Length');
  const etag = upstream.headers.get('ETag');
  if (length) headers.set('Content-Length', length);
  if (etag) headers.set('ETag', etag);
  return new Response(upstream.body, { status: 200, headers });
}

async function serveAdminMedia(request, env, studio) {
  const url = new URL(request.url);
  const source = await getFileSource(request, studio, url.searchParams.get('fileId') || '');
  if (!source.ok) return source.response;
  const file = source.file;
  const rangeHeader = request.headers.get('Range') || '';

  if (file.storageKey && env.MEDIA) return serveR2Media(request, env.MEDIA, file, rangeHeader);
  if (file.driveFileId) return serveDriveMedia(request, studio, file, rangeHeader);

  if (file.externalUrl && /^https?:\/\//iu.test(file.externalUrl)) {
    return proxyMediaCandidate(request, {
      url: file.externalUrl,
      headers: mediaRequestHeaders(rangeHeader),
      authenticated: false,
    }, file);
  }

  return json({ error: 'media_not_found' }, 404);
}

async function serveR2Media(request, bucket, file, rangeHeader) {
  const range = parseRange(rangeHeader);
  const object = await bucket.get(file.storageKey, range ? { range } : undefined);
  if (!object) return json({ error: 'media_not_found' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set('Content-Type', headers.get('Content-Type') || file.mimeType || 'application/octet-stream');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, max-age=300');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  if (object.range) {
    const offset = Number(object.range.offset || 0);
    const length = Number(object.range.length || object.size || 0);
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
  }
  if (object.size) headers.set('Content-Length', String(object.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

async function serveDriveMedia(request, studio, file, rangeHeader) {
  const id = encodeURIComponent(file.driveFileId);
  const credential = await loadDriveCredential(studio);
  const candidates = [];

  if (credential?.accessToken) {
    const headers = mediaRequestHeaders(rangeHeader);
    headers.set('Authorization', `Bearer ${credential.accessToken}`);
    candidates.push({
      url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
      headers,
      authenticated: true,
    });
  }

  if (file.driveDownloadUrl && /^https?:\/\//iu.test(file.driveDownloadUrl)) {
    candidates.push({ url: file.driveDownloadUrl, headers: mediaRequestHeaders(rangeHeader), authenticated: false });
  }
  candidates.push(
    {
      url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
      headers: mediaRequestHeaders(rangeHeader),
      authenticated: false,
    },
    {
      url: `https://drive.google.com/uc?export=download&id=${id}&confirm=t`,
      headers: mediaRequestHeaders(rangeHeader),
      authenticated: false,
    },
  );

  let lastStatus = 0;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        method: request.method,
        headers: candidate.headers,
        redirect: 'follow',
      });
      const type = String(response.headers.get('Content-Type') || '').toLowerCase();
      lastStatus = response.status;
      if ((response.ok || response.status === 206) && !type.includes('text/html')) {
        return buildMediaResponse(request, response, file);
      }
    } catch (error) {
      console.warn('studio_drive_media_candidate_failed', {
        authenticated: candidate.authenticated,
        message: String(error?.message || error).slice(0, 300),
      });
    }
  }

  console.error('studio_drive_media_unavailable', {
    driveFileId: file.driveFileId,
    tokenAvailable: Boolean(credential?.accessToken),
    tokenExpiresAt: credential?.expiresAt || null,
    lastStatus,
  });
  return json({
    error: credential?.accessToken ? 'drive_file_unavailable' : 'drive_access_token_missing',
    message: credential?.accessToken
      ? 'Google Drive a refusé ce fichier. Relancez la synchronisation Drive puis réessayez.'
      : 'Le jeton Drive privé n’est pas disponible. Exécutez publierJetonDriveNeptune() dans Apps Script.',
  }, 502);
}

async function proxyMediaCandidate(request, candidate, file) {
  try {
    const response = await fetch(candidate.url, {
      method: request.method,
      headers: candidate.headers,
      redirect: 'follow',
    });
    const type = String(response.headers.get('Content-Type') || '').toLowerCase();
    if ((!response.ok && response.status !== 206) || type.includes('text/html')) {
      return json({ error: 'media_upstream_failed' }, 502);
    }
    return buildMediaResponse(request, response, file);
  } catch (error) {
    console.error('studio_media_proxy_failed', String(error?.message || error).slice(0, 400));
    return json({ error: 'media_upstream_failed' }, 502);
  }
}

function mediaRequestHeaders(rangeHeader) {
  const headers = new Headers({
    Accept: '*/*',
    'Accept-Encoding': 'identity',
    'User-Agent': 'Neptune-Media-Studio/1.0',
  });
  if (rangeHeader) headers.set('Range', rangeHeader);
  return headers;
}

function buildMediaResponse(request, upstream, file) {
  const headers = new Headers();
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Content-Type', headers.get('Content-Type') || file.mimeType || 'video/mp4');
  headers.set('Accept-Ranges', headers.get('Accept-Ranges') || 'bytes');
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function getFileSource(request, studio, fileId) {
  if (!fileId) return { ok: false, response: json({ error: 'invalid_file' }, 400) };
  const response = await callStore(studio, '/portal/admin-content-file-source', {
    ...adminAuth(request), payload: { fileId },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, response: json(result, response.status) };
  return { ok: true, file: result.file };
}

async function loadDriveCredential(studio) {
  const response = await callStore(studio, '/portal/drive-token-get', {});
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function parseRange(value) {
  const match = /^bytes=(\d+)-(\d*)$/u.exec(String(value || '').trim());
  if (!match) return null;
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : offset + 2_097_151;
  if (!Number.isFinite(offset) || !Number.isFinite(end) || end < offset) return null;
  return { offset, length: Math.min(end - offset + 1, 8_388_608) };
}

async function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

async function augmentRelease(response) {
  const current = await response.json().catch(() => ({}));
  return new Response(JSON.stringify({
    ...current,
    studioContentCommandCenter: RELEASE,
    studioContentUx: 'no-code-saas-progressive-disclosure-v79',
    studioNativeRatioThumbnails: 'private-drive-token-thumbnail-link-plus-video-frame-fallback-v79',
    studioContentCards: 'equal-height-native-ratio-media-wells-v79',
    studioCalendarControl: 'two-pane-direct-schedule-reschedule-drag-drop-v79',
    studioFastActions: ['preview', 'schedule', 'reschedule', 'remove-from-calendar'],
    clientDashboardCleanup: 'neptune-client-dashboard-clean-20260805-v78',
    clientDashboardFirstViewport: 'quick-actions-visible-without-duplicate-summary-v78',
    clientPreparationTheme: 'light-editorial-cards-and-dialog-v78',
  }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function injectClientDashboardCleanup(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/espace-client\/client-dashboard-clean-v78\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${CLIENT_DASHBOARD_CSS}"></head>`);
  return rebuiltHtmlResponse(response, body, 'X-Neptune-Client-Dashboard', 'neptune-client-dashboard-clean-20260805-v78');
}

async function injectStudioCommandCenter(response) {
  let body = await response.text();
  body = body.replace(/<link\b[^>]*href=["'][^"']*\/studio\/content-command-center-v79\.css[^"']*["'][^>]*>\s*/giu, '');
  body = body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/content-command-center-v79\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu, '');
  body = body.replace('</head>', `<link rel="stylesheet" href="${COMMAND_CENTER_CSS}"></head>`);
  body = body.replace('</body>', `<script type="module" src="${COMMAND_CENTER_JS}"></script></body>`);
  return rebuiltHtmlResponse(response, body, 'X-Neptune-Studio-Content', RELEASE);
}

function rebuiltHtmlResponse(response, body, header, value) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set(header, value);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function isClientDashboardPath(pathname) {
  return pathname === '/espace-client' || pathname === '/espace-client/' || pathname === '/espace-client/index.html';
}
function isStudioClientsPath(pathname) {
  return pathname === '/studio/clients' || pathname === '/studio/clients/' || pathname === '/studio/clients.html';
}
function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function withHeaders(response, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Studio-Content', RELEASE);
  if (pathname.startsWith('/studio') || pathname.startsWith('/api/admin') || pathname.startsWith('/espace-client')) {
    headers.set('Cache-Control', pathname.includes('content-thumbnail') || pathname.includes('content-media')
      ? (headers.get('Cache-Control') || 'private, max-age=300')
      : 'private, no-store, max-age=0');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
