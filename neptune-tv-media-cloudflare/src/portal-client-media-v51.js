import { clientToken, safeFilename } from './portal-http-utils.js';
import { json, securityHeaders, timingSafeEqual } from './security.js';

const SESSION_PATH = '/api/client/session';
const YOUTUBE_PATH = '/api/client/youtube-publications';
const FILE_PREFIX = '/api/client/files/';
const DRIVE_TOKEN_PATH = '/api/webhooks/drive/access-token';
const YOUTUBE_HANDLE_DEFAULT = '@neptunebusiness';
const CACHE_TTL_SECONDS = 600;
const TOKEN_STOPWORDS = new Set([
  'avec','dans','des','une','pour','sur','les','le','la','un','du','de','et','a','au','aux','ce','ces','cette','mon','ma','mes','notre','nos','votre','vos',
  'neptune','media','business','video','videos','format','passage','episode','emission','short','reel','chaine','youtube','comment','plus','tout','tous','toutes',
]);

export async function handleClientMediaRoute(request, env, studio) {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === DRIVE_TOKEN_PATH) {
    return secure(await receiveDriveAccessToken(request, env, studio));
  }

  if (request.method === 'GET' && url.pathname === SESSION_PATH) {
    return secure(await callStore(studio, '/portal/session-media', { token: clientToken(request) }));
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith(FILE_PREFIX)) {
    return secure(await serveAuthorizedFile(request, env, studio));
  }

  if (request.method === 'GET' && url.pathname === YOUTUBE_PATH) {
    return secure(await clientYoutubePublications(request, env, studio));
  }

  return null;
}

async function serveAuthorizedFile(request, env, studio) {
  const url = new URL(request.url);
  const fileId = decodeURIComponent(url.pathname.slice(FILE_PREFIX.length));
  const authorization = await callStore(studio, '/portal/file-authorize-media', {
    token: clientToken(request),
    fileId,
  });
  const result = await authorization.json().catch(() => ({}));
  if (!authorization.ok) return json(result, authorization.status);

  const file = result.file || {};
  const mode = url.searchParams.has('thumbnail')
    ? 'thumbnail'
    : url.searchParams.has('inline') || url.searchParams.has('preview')
      ? 'inline'
      : 'download';

  if (file.storageKey) return serveR2(request, env.MEDIA, file, mode);

  if (file.driveFileId) {
    if (mode === 'thumbnail') return proxyDriveThumbnail(file, studio);
    return proxyDrive(request, file, mode, studio);
  }

  if (file.externalUrl) return redirect(file.externalUrl);
  return json({ error: 'file_not_found' }, 404);
}

async function serveR2(request, bucket, file, mode) {
  if (!bucket) return json({ error: 'storage_not_configured' }, 503);
  const rangeHeader = request.headers.get('Range');
  const object = await bucket.get(file.storageKey, rangeHeader ? { range: request.headers } : undefined);
  if (!object) return json({ error: 'file_not_found' }, 404);

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Disposition', `${mode === 'inline' ? 'inline' : 'attachment'}; filename="${safeFilename(file.name)}"`);
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  let status = 200;
  if (rangeHeader && object.range && Number.isFinite(object.range.offset) && Number.isFinite(object.range.length)) {
    const start = object.range.offset;
    const end = start + object.range.length - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
    headers.set('Content-Length', String(object.range.length));
    status = 206;
  } else if (Number.isFinite(object.size)) {
    headers.set('Content-Length', String(object.size));
  }

  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
}

async function receiveDriveAccessToken(request, env, studio) {
  const supplied = request.headers.get('X-Neptune-Drive-Secret') || '';
  if (!env.DRIVE_WEBHOOK_SECRET || !timingSafeEqual(supplied, env.DRIVE_WEBHOOK_SECRET)) {
    return json({ error: 'unauthorized' }, 401);
  }
  const payload = await request.json().catch(() => ({}));
  const accessToken = String(payload.accessToken || payload.token || '').trim();
  if (accessToken.length < 40 || accessToken.length > 4096) return json({ error: 'invalid_drive_access_token' }, 400);
  const expiresAt = safeFutureIso(payload.expiresAt, 50 * 60 * 1000);
  return callStore(studio, '/portal/drive-token-set', { accessToken, expiresAt });
}

async function proxyDrive(request, file, mode, studio) {
  const id = encodeURIComponent(file.driveFileId);
  const range = request.headers.get('Range');
  const baseHeaders = new Headers({
    Accept: '*/*',
    'Accept-Encoding': 'identity',
    'User-Agent': 'Neptune-Media-Drive-Proxy/2.0',
  });
  if (range) baseHeaders.set('Range', range);

  const credential = await loadDriveCredential(studio);
  const candidates = [];
  if (credential?.accessToken) {
    const authenticatedHeaders = new Headers(baseHeaders);
    authenticatedHeaders.set('Authorization', `Bearer ${credential.accessToken}`);
    candidates.push({
      url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
      headers: authenticatedHeaders,
      authenticated: true,
    });
  }
  candidates.push(
    { url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, headers: baseHeaders, authenticated: false },
    { url: `https://drive.google.com/uc?export=download&id=${id}&confirm=t`, headers: baseHeaders, authenticated: false },
  );

  let upstream = null;
  let authenticatedFailure = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { method: 'GET', headers: candidate.headers, redirect: 'follow' });
      const type = String(response.headers.get('Content-Type') || '').toLowerCase();
      if (response.ok && !type.includes('text/html')) {
        upstream = response;
        break;
      }
      if (candidate.authenticated) authenticatedFailure = { status: response.status, contentType: type };
      if (!upstream || response.status > upstream.status) upstream = response;
    } catch (error) {
      console.warn('drive_proxy_candidate_failed', { id: file.driveFileId, authenticated: candidate.authenticated, message: String(error?.message || error).slice(0, 300) });
    }
  }

  if (!upstream || !upstream.ok || String(upstream.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) {
    console.error('drive_proxy_unavailable', {
      driveFileId: file.driveFileId,
      status: upstream?.status || 0,
      contentType: upstream?.headers.get('Content-Type') || '',
      tokenAvailable: Boolean(credential?.accessToken),
      tokenExpiresAt: credential?.expiresAt || null,
      authenticatedFailure,
    });
    const error = credential?.accessToken ? 'drive_file_unavailable' : 'drive_access_token_missing';
    return json({
      error,
      message: credential?.accessToken
        ? 'Google Drive a refusé ce fichier malgré l’authentification Neptune. Relancez la synchronisation puis réessayez.'
        : 'Le jeton Drive privé de Neptune n’est pas disponible. Exécutez publierJetonDriveNeptune() dans Apps Script.',
    }, 502);
  }

  const responseHeaders = new Headers();
  for (const key of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set('Cache-Control', 'private, no-store');
  responseHeaders.set('Accept-Ranges', responseHeaders.get('Accept-Ranges') || 'bytes');
  responseHeaders.set('Content-Disposition', `${mode === 'inline' ? 'inline' : 'attachment'}; filename="${safeFilename(file.name)}"`);

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function proxyDriveThumbnail(file, studio) {
  const credential = await loadDriveCredential(studio);
  if (!credential?.accessToken) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  const id = encodeURIComponent(file.driveFileId);
  const metadata = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${credential.accessToken}`, Accept: 'application/json' },
  });
  if (!metadata.ok) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  const result = await metadata.json().catch(() => ({}));
  if (!result.thumbnailLink) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  const thumbnail = await fetch(result.thumbnailLink, {
    headers: { Authorization: `Bearer ${credential.accessToken}`, Accept: 'image/*' },
    redirect: 'follow',
  });
  if (!thumbnail.ok) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  const headers = new Headers({ 'Cache-Control': 'private, max-age=300' });
  const type = thumbnail.headers.get('Content-Type');
  const length = thumbnail.headers.get('Content-Length');
  if (type) headers.set('Content-Type', type);
  if (length) headers.set('Content-Length', length);
  return new Response(thumbnail.body, { status: 200, headers });
}

async function loadDriveCredential(studio) {
  const response = await callStore(studio, '/portal/drive-token-get', {});
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function safeFutureIso(value, fallbackMs) {
  const parsed = new Date(value || '');
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now() + 60_000) return parsed.toISOString();
  return new Date(Date.now() + fallbackMs).toISOString();
}

async function clientYoutubePublications(request, env, studio) {
  const sessionResponse = await callStore(studio, '/portal/session-media', { token: clientToken(request) });
  const session = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok) return json(session, sessionResponse.status);

  const handle = normalizeHandle(env.YOUTUBE_CHANNEL_HANDLE || YOUTUBE_HANDLE_DEFAULT);
  const channelUrl = `https://www.youtube.com/${handle}`;

  try {
    const videos = await loadYoutubeVideos(handle);
    const matches = matchVideos(videos, session).slice(0, 8);
    return json({
      ok: true,
      channelUrl,
      matched: matches,
      checkedAt: new Date().toISOString(),
      matching: 'client-files-and-passage-title-token-overlap-v1',
    });
  } catch (error) {
    console.error('youtube_publication_sync_failed', {
      handle,
      name: error?.name || 'Error',
      message: String(error?.message || error).slice(0, 500),
    });
    return json({ ok: true, channelUrl, matched: [], warning: 'youtube_temporarily_unavailable' });
  }
}

async function loadYoutubeVideos(handle) {
  const pageUrl = `https://www.youtube.com/${handle}/videos`;
  const page = await fetchTextCached(pageUrl, CACHE_TTL_SECONDS);
  const channelId = firstMatch(page, [
    /"channelId":"(UC[^"]+)"/u,
    /"externalId":"(UC[^"]+)"/u,
    /itemprop="channelId" content="([^"]+)"/u,
  ]);

  if (channelId) {
    const feed = await fetchTextCached(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, CACHE_TTL_SECONDS);
    const parsed = parseYoutubeFeed(feed);
    if (parsed.length) return parsed;
  }

  return parseYoutubePage(page);
}

async function fetchTextCached(url, ttlSeconds) {
  const cache = caches.default;
  const cacheKey = new Request(url, { headers: { 'X-Neptune-Cache': 'youtube-v1' } });
  const cached = await cache.match(cacheKey);
  if (cached) return cached.text();

  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7',
      'User-Agent': 'Mozilla/5.0 (compatible; NeptuneMediaBot/1.0; +https://tv.neptunebusiness.com)',
    },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`youtube_http_${response.status}`);
  const text = await response.text();
  await cache.put(cacheKey, new Response(text, {
    headers: { 'Content-Type': response.headers.get('Content-Type') || 'text/plain; charset=utf-8', 'Cache-Control': `public, max-age=${ttlSeconds}` },
  })).catch(() => {});
  return text;
}

function parseYoutubeFeed(xml) {
  return [...String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/gu)].map((match) => {
    const entry = match[1];
    const videoId = firstMatch(entry, [/<yt:videoId>([^<]+)<\/yt:videoId>/u]);
    const title = decodeEntities(firstMatch(entry, [/<title>([\s\S]*?)<\/title>/u]));
    const publishedAt = firstMatch(entry, [/<published>([^<]+)<\/published>/u]);
    const thumbnailUrl = decodeEntities(firstMatch(entry, [/<media:thumbnail[^>]+url="([^"]+)"/u]));
    const description = decodeEntities(firstMatch(entry, [/<media:description>([\s\S]*?)<\/media:description>/u]));
    return youtubeVideo(videoId, title, publishedAt, thumbnailUrl, description);
  }).filter((video) => video.videoId && video.title);
}

function parseYoutubePage(html) {
  const results = [];
  const seen = new Set();
  const blocks = String(html || '').match(/"videoRenderer":\{[\s\S]*?\}\}\}/gu) || [];
  for (const block of blocks.slice(0, 40)) {
    const videoId = firstMatch(block, [/"videoId":"([^"]+)"/u]);
    const title = decodeJsonText(firstMatch(block, [/"title":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/u]));
    const thumbnailUrl = decodeJsonText(firstMatch(block, [/"thumbnails":\[\{"url":"((?:\\.|[^"])*)"/u]));
    if (!videoId || !title || seen.has(videoId)) continue;
    seen.add(videoId);
    results.push(youtubeVideo(videoId, title, '', thumbnailUrl, ''));
  }
  return results;
}

function youtubeVideo(videoId, title, publishedAt, thumbnailUrl, description) {
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '';
  return {
    videoId,
    title: String(title || '').trim(),
    publishedAt: String(publishedAt || ''),
    thumbnailUrl: thumbnailUrl || (videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : ''),
    description: String(description || '').trim(),
    watchUrl,
    embedUrl: videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0` : '',
  };
}

function matchVideos(videos, session) {
  const orders = Array.isArray(session.orders) ? session.orders : [];
  const corpusParts = [session.client?.fullName, session.client?.company];
  let earliest = Infinity;
  for (const order of orders) {
    corpusParts.push(order.title, order.format, order.orderReference);
    const orderTime = new Date(order.filmingAt || order.createdAt || '').getTime();
    if (Number.isFinite(orderTime)) earliest = Math.min(earliest, orderTime);
    for (const file of order.files || []) corpusParts.push(file.name);
  }
  const corpus = tokenSet(corpusParts.join(' '));

  return videos.map((video) => {
    const titleTokens = tokenSet(`${video.title} ${video.description || ''}`);
    const overlap = [...titleTokens].filter((token) => corpus.has(token));
    const published = new Date(video.publishedAt || '').getTime();
    const temporallyRelevant = !Number.isFinite(earliest) || !Number.isFinite(published) || published >= earliest - 45 * 86_400_000;
    const score = overlap.length + (temporallyRelevant ? 0.5 : 0);
    return { ...video, score, matchedTokens: overlap.slice(0, 8) };
  }).filter((video) => video.score >= 2.5)
    .sort((a, b) => {
      const dateDelta = new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
      return dateDelta || b.score - a.score;
    });
}

function tokenSet(value) {
  return new Set(String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length >= 3 && !TOKEN_STOPWORDS.has(token)));
}

function firstMatch(value, patterns) {
  for (const pattern of patterns) {
    const match = String(value || '').match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>');
}

function decodeJsonText(value) {
  if (!value) return '';
  try { return JSON.parse(`"${value}"`); } catch { return String(value).replace(/\\u0026/gu, '&').replace(/\\\//gu, '/'); }
}

function normalizeHandle(value) {
  const handle = String(value || '').trim().replace(/^https?:\/\/(?:www\.)?youtube\.com\//iu, '').replace(/\/+$/u, '');
  return handle.startsWith('@') ? handle : `@${handle.replace(/^@/u, '')}`;
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'private, no-store' } });
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
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
