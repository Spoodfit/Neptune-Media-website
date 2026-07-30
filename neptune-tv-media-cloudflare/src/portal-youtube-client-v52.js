import { clientToken } from './portal-http-utils.js';
import { json, securityHeaders } from './security.js';

const PATH = '/api/client/youtube-publications';
const DEFAULT_HANDLE = '@neptunebusiness';
const CACHE_TTL_SECONDS = 600;
const LONG_TYPES = new Set(['final', 'emission', 'full', 'master', 'episode', 'long']);
const STOPWORDS = new Set([
  'avec','dans','des','une','pour','sur','les','le','la','un','du','de','et','a','au','aux','ce','ces','cette','mon','ma','mes','notre','nos','votre','vos',
  'neptune','media','business','video','videos','format','passage','episode','emission','chaine','youtube','comment','plus','tout','tous','toutes','chez','qui','que','quoi',
]);

export async function handleClientYoutubeRoute(request, env, studio) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== PATH) return null;

  const sessionResponse = await callStore(studio, '/portal/session-media', { token: clientToken(request) });
  const session = await sessionResponse.json().catch(() => ({}));
  if (!sessionResponse.ok) return secure(json(session, sessionResponse.status));

  const handle = normalizeHandle(env.YOUTUBE_CHANNEL_HANDLE || DEFAULT_HANDLE);
  const channelUrl = `https://www.youtube.com/${handle}`;
  const longFiles = (session.orders || [])
    .flatMap((order) => (order.files || []).map((file) => ({ ...file, order })))
    .filter((file) => LONG_TYPES.has(String(file.fileType || '').toLowerCase()));

  try {
    const discovery = await discoverYoutubeVideos(handle, longFiles);
    const evaluated = scoreCandidates(discovery.videos, longFiles, session);
    const matched = evaluated.filter((item) => item.match).slice(0, 8).map(publicVideo);
    const validation = url.searchParams.has('validation');

    return secure(json({
      ok: true,
      channelUrl,
      matched,
      checkedAt: new Date().toISOString(),
      matching: 'channel-feed-and-exact-long-title-search-v2',
      ...(validation ? {
        diagnostics: {
          channelId: discovery.channelId || null,
          discovered: discovery.videos.length,
          longFiles: longFiles.map((file) => cleanName(file.name)).slice(0, 6),
          candidates: evaluated.slice(0, 12).map((item) => ({
            videoId: item.videoId,
            title: item.title,
            owner: item.owner || null,
            score: item.score,
            coverage: item.coverage,
            source: item.source,
            match: item.match,
            matchedFile: item.matchedFile || null,
          })),
        },
      } : {}),
    }));
  } catch (error) {
    console.error('youtube_publication_v52_failed', {
      handle,
      name: error?.name || 'Error',
      message: String(error?.message || error).slice(0, 500),
    });
    return secure(json({ ok: true, channelUrl, matched: [], warning: 'youtube_temporarily_unavailable' }));
  }
}

async function discoverYoutubeVideos(handle, longFiles) {
  const pageUrl = `https://www.youtube.com/${handle}/videos`;
  const page = await fetchTextCached(pageUrl);
  const channelId = channelIdFrom(page);
  const videos = parseYoutubePage(page, 'channel-page', true);

  if (channelId) {
    try {
      const feed = await fetchTextCached(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
      videos.push(...parseYoutubeFeed(feed));
    } catch (error) {
      console.warn('youtube_feed_unavailable', { channelId, message: String(error?.message || error).slice(0, 250) });
    }
  }

  for (const file of longFiles.slice(0, 6)) {
    const query = cleanName(file.name);
    if (!query) continue;
    try {
      const searchPage = await fetchTextCached(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
      videos.push(...parseYoutubePage(searchPage, 'title-search', false));
    } catch (error) {
      console.warn('youtube_title_search_unavailable', { query: query.slice(0, 140), message: String(error?.message || error).slice(0, 250) });
    }
  }

  return { channelId, videos: dedupeVideos(videos) };
}

async function fetchTextCached(url) {
  const cache = caches.default;
  const cacheKey = new Request(url, { headers: { 'X-Neptune-Cache': 'youtube-v52' } });
  const cached = await cache.match(cacheKey);
  if (cached) return cached.text();

  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7',
      'User-Agent': 'Mozilla/5.0 (compatible; NeptuneMediaBot/2.0; +https://tv.neptunebusiness.com)',
    },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`youtube_http_${response.status}`);
  const text = await response.text();
  await cache.put(cacheKey, new Response(text, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'text/plain; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
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
    return buildVideo({ videoId, title, publishedAt, thumbnailUrl, description, owner: 'Neptune Business', source: 'channel-feed', trustedChannel: true });
  }).filter(validVideo);
}

function parseYoutubePage(html, source, trustedChannel) {
  const text = String(html || '');
  const output = [];
  const seen = new Set();
  for (const match of text.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/gu)) {
    const videoId = match[1];
    if (seen.has(videoId)) continue;
    const start = Math.max(0, Number(match.index || 0) - 1200);
    const segment = text.slice(start, Number(match.index || 0) + 9000);
    const title = decodeJsonText(firstMatch(segment, [
      /"title":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/u,
      /"title":\{"simpleText":"((?:\\.|[^"])*)"/u,
      /"headline":\{"simpleText":"((?:\\.|[^"])*)"/u,
    ]));
    if (!title || title.length < 3) continue;
    const owner = decodeJsonText(firstMatch(segment, [
      /"ownerText":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/u,
      /"shortBylineText":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/u,
      /"longBylineText":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/u,
    ]));
    const thumbnailUrl = decodeJsonText(firstMatch(segment, [
      /"thumbnail":\{"thumbnails":\[\{"url":"((?:\\.|[^"])*)"/u,
      /"thumbnails":\[\{"url":"((?:\\.|[^"])*)"/u,
    ]));
    const publishedAt = decodeJsonText(firstMatch(segment, [
      /"publishedTimeText":\{"simpleText":"((?:\\.|[^"])*)"/u,
    ]));
    seen.add(videoId);
    output.push(buildVideo({ videoId, title, publishedAt, thumbnailUrl, owner, source, trustedChannel }));
  }
  return output.filter(validVideo);
}

function scoreCandidates(videos, longFiles, session) {
  const fallbackParts = [session.client?.fullName, session.client?.company];
  for (const order of session.orders || []) fallbackParts.push(order.title, order.format);
  const fallbackTokens = tokenSet(fallbackParts.join(' '));

  return videos.map((video) => {
    let best = { score: 0, coverage: 0, matchedFile: '' };
    for (const file of longFiles) {
      const comparison = compareTitles(video.title, cleanName(file.name));
      if (comparison.score > best.score) best = { ...comparison, matchedFile: cleanName(file.name) };
    }

    const videoTokens = tokenSet(`${video.title} ${video.description || ''}`);
    const fallbackOverlap = [...videoTokens].filter((token) => fallbackTokens.has(token)).length;
    const ownerTrusted = /neptune/iu.test(String(video.owner || ''));
    const trusted = Boolean(video.trustedChannel || ownerTrusted);
    const exactEnough = best.coverage >= 0.66 && best.overlap >= 3;
    const strongEnough = best.coverage >= 0.48 && best.overlap >= 4 && trusted;
    const score = Number((best.score + (trusted ? 0.25 : 0) + Math.min(fallbackOverlap, 3) * 0.03).toFixed(3));
    return {
      ...video,
      score,
      coverage: Number(best.coverage.toFixed(3)),
      overlap: best.overlap || 0,
      matchedFile: best.matchedFile,
      match: exactEnough || strongEnough,
    };
  }).sort((a, b) => Number(b.match) - Number(a.match) || b.score - a.score || dateValue(b.publishedAt) - dateValue(a.publishedAt));
}

function compareTitles(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return { score: 0, coverage: 0, overlap: 0 };
  const overlap = [...a].filter((token) => b.has(token)).length;
  const coverage = overlap / Math.min(a.size, b.size);
  const union = new Set([...a, ...b]).size;
  const jaccard = union ? overlap / union : 0;
  const normalizedA = normalizedTitle(left);
  const normalizedB = normalizedTitle(right);
  const containment = normalizedA.length > 18 && normalizedB.length > 18 && (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA));
  return {
    overlap,
    coverage: containment ? Math.max(coverage, 0.98) : coverage,
    score: containment ? 1.2 : coverage * 0.78 + jaccard * 0.22,
  };
}

function publicVideo(video) {
  return {
    videoId: video.videoId,
    title: video.title,
    publishedAt: video.publishedAt || '',
    thumbnailUrl: video.thumbnailUrl,
    description: video.description || '',
    owner: video.owner || '',
    watchUrl: video.watchUrl,
    embedUrl: video.embedUrl,
    score: video.score,
    matchedFile: video.matchedFile,
  };
}

function buildVideo({ videoId, title, publishedAt = '', thumbnailUrl = '', description = '', owner = '', source = '', trustedChannel = false }) {
  return {
    videoId: String(videoId || ''),
    title: String(title || '').trim(),
    publishedAt: String(publishedAt || ''),
    thumbnailUrl: thumbnailUrl || (videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : ''),
    description: String(description || '').trim(),
    owner: String(owner || '').trim(),
    source,
    trustedChannel,
    watchUrl: videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '',
    embedUrl: videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0` : '',
  };
}

function dedupeVideos(videos) {
  const map = new Map();
  for (const video of videos) {
    if (!validVideo(video)) continue;
    const current = map.get(video.videoId);
    if (!current || sourceRank(video.source) > sourceRank(current.source)) map.set(video.videoId, video);
  }
  return [...map.values()];
}

function sourceRank(source) {
  return ({ 'channel-feed': 3, 'channel-page': 2, 'title-search': 1 })[source] || 0;
}

function validVideo(video) {
  return /^[A-Za-z0-9_-]{11}$/u.test(String(video?.videoId || '')) && String(video?.title || '').length >= 3;
}

function channelIdFrom(html) {
  return firstMatch(html, [
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/u,
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/u,
    /"browseId":"(UC[A-Za-z0-9_-]{22})"/u,
    /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/u,
  ]);
}

function tokenSet(value) {
  return new Set(normalizedTitle(value).split(/\s+/u).filter((token) => token.length >= 3 && !STOPWORDS.has(token)));
}

function normalizedTitle(value) {
  return String(value || '')
    .replace(/\.[a-z0-9]{2,5}$/iu, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function cleanName(value) {
  return String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
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

function dateValue(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
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
