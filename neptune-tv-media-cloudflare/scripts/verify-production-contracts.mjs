import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://tv.neptunebusiness.com').replace(/\/$/, '');
const WORKERS_URL = (process.env.WORKERS_URL || 'https://neptune-media-webtv.neptunebusinessclub.workers.dev').replace(/\/$/, '');
const MEDIA_URL = (process.env.MEDIA_URL || 'https://media.neptunebusiness.com').replace(/\/$/, '');
const DEPLOY_SHA = process.env.DEPLOY_SHA || process.env.GITHUB_SHA || 'manual';
const bases = [...new Set([WORKERS_URL, PUBLIC_URL])];
const report = { checkedAt: new Date().toISOString(), deploySha: DEPLOY_SHA, bases, checks: [], failures: [] };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mark = (name, ok, details = '') => {
  report.checks.push({ name, ok, details });
  if (!ok) report.failures.push({ name, details });
};
const must = (condition, name, details = '') => {
  mark(name, Boolean(condition), details);
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
};

async function request(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      redirect: init.redirect || 'follow',
      ...init,
      headers: { 'Cache-Control': 'no-cache, no-store', ...(init.headers || {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function retry(label, fn, attempts = 12, waitMs = 5000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(waitMs);
    }
  }
  throw new Error(`${label}: ${lastError?.message || lastError}`);
}

async function text(url, expected = 200, init = {}) {
  const response = await request(url, init);
  if (response.status !== expected) throw new Error(`${url} -> HTTP ${response.status}, expected ${expected}`);
  return { response, body: await response.text() };
}

async function json(url, expected = 200, init = {}) {
  const response = await request(url, init);
  if (response.status !== expected) throw new Error(`${url} -> HTTP ${response.status}, expected ${expected}`);
  return { response, body: await response.json() };
}

function parseConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  if (!match) throw new Error(`Unable to resolve ${name} from source`);
  return match[1];
}

const entrySource = await readFile(new URL('../src/entry-v48.js', import.meta.url), 'utf8');
const clientClickRelease = parseConst(entrySource, 'CLIENT_CATALOG_CLICK_RELEASE');
const clientVisualAsset = parseConst(entrySource, 'CLIENT_VISUAL_ASSET');
const clientInteractionAsset = parseConst(entrySource, 'CLIENT_INTERACTION_ASSET');
const visualSource = await readFile(new URL(`../public${clientVisualAsset.split('?')[0]}`, import.meta.url), 'utf8');
const interactionSource = await readFile(new URL(`../public${clientInteractionAsset.split('?')[0]}`, import.meta.url), 'utf8');
const visualRelease = parseConst(visualSource, 'RELEASE');
const interactionRelease = parseConst(interactionSource, 'RELEASE');

const reservationSource = await readFile(new URL('../public/reserver/index.html', import.meta.url), 'utf8');
const reservationRelease = reservationSource.match(/name="neptune-reservation-release"\s+content="([^"]+)"/)?.[1];
const reservationAsset = reservationSource.match(/src="(\/reserver\/assets\/scroll-stability-v181\.js\?[^\"]+)"/)?.[1];
if (!reservationRelease || !reservationAsset) throw new Error('Unable to resolve reservation production contract from source');
const reservationAssetSource = await readFile(new URL(`../public${reservationAsset.split('?')[0]}`, import.meta.url), 'utf8');

async function verifyBase(base) {
  const q = encodeURIComponent(`${DEPLOY_SHA}-${Date.now()}`);

  await retry(`${base} health`, async () => {
    const { body } = await json(`${base}/api/health?verify=${q}`);
    must(body?.ok === true, `${base}: health`, JSON.stringify(body).slice(0, 240));
  });

  for (const route of ['/', '/direct/', '/emissions/', '/reserver', '/espace-client/', '/studio/', '/hors-norme']) {
    const response = await request(`${base}${route}?verify=${q}`);
    must(response.ok, `${base}: route ${route}`, `HTTP ${response.status}`);
  }

  const home = await text(`${base}/?verify=${q}`);
  must(home.body.includes('Aller au contenu principal'), `${base}: accessibility skip link`);
  const accessibilityJs = await text(`${base}/accessibility.js?verify=${q}`);
  must(accessibilityJs.body.includes('trapFocus'), `${base}: accessibility focus trap`);
  const accessibilityCss = await text(`${base}/styles/accessibility.css?verify=${q}`);
  must(accessibilityCss.body.includes('skip-link') && accessibilityCss.body.includes(':focus-visible'), `${base}: accessibility CSS`);

  const catalog = (await json(`${base}/api/public/catalog?verify=${q}`)).body;
  must(Array.isArray(catalog?.programs), `${base}: catalog programs array`);
  must(Array.isArray(catalog?.episodes), `${base}: catalog episodes array`);
  const programIds = new Set();
  for (const program of catalog.programs) {
    must(Boolean(program?.id && program?.slug), `${base}: public program identity`, JSON.stringify(program).slice(0, 240));
    must(program.active !== false && Number(program.active ?? 1) !== 0, `${base}: inactive program hidden`, String(program.id));
    programIds.add(program.id);
  }
  for (const episode of catalog.episodes) {
    must(Boolean(episode?.id && episode?.slug), `${base}: public episode identity`, JSON.stringify(episode).slice(0, 240));
    must(programIds.has(episode.programId), `${base}: public episode relation`, String(episode.id));
    must(episode.status === 'published', `${base}: unpublished episode hidden`, String(episode.id));
    must(Boolean(episode.videoUrl && episode.posterUrl), `${base}: episode media completeness`, String(episode.id));
  }

  for (const endpoint of ['/api/admin/clients', '/api/admin/control-room', '/api/client/session']) {
    const response = await request(`${base}${endpoint}?verify=${q}`);
    must([401, 403].includes(response.status), `${base}: protected ${endpoint}`, `HTTP ${response.status}`);
  }
  const webhook = await request(`${base}/api/webhooks/conversion?verify=${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  must([401, 403].includes(webhook.status), `${base}: protected conversion webhook`, `HTTP ${webhook.status}`);

  const clientResponse = await request(`${base}/espace-client/?verify=${q}`);
  const clientHtml = await clientResponse.text();
  must(/no-store/i.test(clientResponse.headers.get('cache-control') || ''), `${base}: client no-store`);
  must(/noindex/i.test(clientResponse.headers.get('x-robots-tag') || ''), `${base}: client noindex`);

  await retry(`${base} client runtime`, async (attempt) => {
    const suffix = `verify=${q}&attempt=${attempt}`;
    const html = (await text(`${base}/espace-client/?${suffix}`)).body;
    const release = (await json(`${base}/api/public/release?${suffix}`)).body;
    const visual = (await text(`${base}${clientVisualAsset}&${suffix}`)).body;
    const interaction = (await text(`${base}${clientInteractionAsset}&${suffix}`)).body;
    if (!html.includes(clientVisualAsset) || !html.includes(clientInteractionAsset)) throw new Error('client assets not pinned yet');
    if (release?.clientCatalogClick !== clientClickRelease) throw new Error(`client click release ${release?.clientCatalogClick || 'missing'}`);
    if (!visual.includes(visualRelease)) throw new Error('visual release mismatch');
    if (!interaction.includes(interactionRelease)) throw new Error('interaction release mismatch');
    if (!interaction.includes("clientCatalogNavigationOwner='native-anchor'")) throw new Error('native anchor owner missing');
    mark(`${base}: current client runtime`, true, `${clientClickRelease} / ${visualRelease} / ${interactionRelease}`);
  }, 24, 5000);

  await retry(`${base} reservation runtime`, async (attempt) => {
    const suffix = `verify=${q}&attempt=${attempt}`;
    const html = (await text(`${base}/reserver?${suffix}`)).body;
    const asset = (await text(`${base}${reservationAsset}&${suffix}`)).body;
    if (!html.includes(reservationRelease) || !html.includes(reservationAsset)) throw new Error('reservation HTML release not current yet');
    for (const marker of ['unexpectedReset', 'restoreStablePosition']) {
      if (!reservationAssetSource.includes(marker) || !asset.includes(marker)) throw new Error(`reservation marker missing: ${marker}`);
    }
    mark(`${base}: current reservation runtime`, true, reservationRelease);
  }, 24, 5000);

  const horsNorme = (await text(`${base}/hors-norme?verify=${q}`)).body;
  for (const marker of ['30 contenus minimum garantis', '3 mois de communication', 'Le parcours VIP clé en main', 'Vérifier mon éligibilité']) {
    must(horsNorme.includes(marker), `${base}: HORS NORME marker`, marker);
  }

  const direct = await request(`${base}/direct/?verify=${q}`);
  must((direct.headers.get('x-frame-options') || '').toUpperCase() === 'SAMEORIGIN', `${base}: direct frame policy`);
  const embed = await request(`${base}/direct/?embed=1&verify=${q}`);
  must(!embed.headers.get('x-frame-options'), `${base}: embed has no X-Frame-Options`);
  must(/frame-ancestors[^;]*https:/i.test(embed.headers.get('content-security-policy') || ''), `${base}: embed frame-ancestors policy`, embed.headers.get('content-security-policy') || 'missing');

  const legacyStudio = await request(`${base}/studio/webtv.html?verify=${q}`, { redirect: 'manual' });
  must([301, 302, 307, 308].includes(legacyStudio.status), `${base}: legacy Studio WebTV redirect`, `HTTP ${legacyStudio.status}`);
  must((legacyStudio.headers.get('location') || '').includes('/studio/webtv'), `${base}: legacy Studio WebTV redirect target`, legacyStudio.headers.get('location') || 'missing');

  for (const [asset, marker] of [
    ['/robots.txt', 'Disallow: /studio/'],
    ['/sitemap.xml', '<urlset'],
    ['/video-sitemap.xml', '<video:video>'],
    ['/llms.txt', 'Neptune Media'],
  ]) {
    const body = (await text(`${base}${asset}?verify=${q}`)).body;
    must(body.includes(marker), `${base}: ${asset}`, marker);
  }

  const stateResponse = await request(`${base}/api/public/webtv/state?verify=${q}`);
  must(stateResponse.ok, `${base}: WebTV state`, `HTTP ${stateResponse.status}`);
  const state = await stateResponse.json();
  if (state?.enabled && state?.stream?.manifestUrl) {
    must(state.stream.protocol === 'hls', `${base}: WebTV HLS protocol`, String(state.stream.protocol));
    const manifest = await request(new URL(state.stream.manifestUrl, `${base}/`).toString());
    must(manifest.ok, `${base}: HLS manifest`, `HTTP ${manifest.status}`);
    const manifestBody = await manifest.text();
    must(manifestBody.startsWith('#EXTM3U'), `${base}: HLS manifest format`);
  } else {
    mark(`${base}: WebTV disabled/idle state accepted`, true, String(state?.release || 'no release'));
  }
}

try {
  for (const base of bases) await verifyBase(base);
  const mediaResponse = await request(`${MEDIA_URL}/reserver?verify=${encodeURIComponent(DEPLOY_SHA)}`);
  must(mediaResponse.ok, 'Media ingress reservation reachable', `HTTP ${mediaResponse.status}`);
} catch (error) {
  report.failures.push({ name: 'fatal', details: error?.stack || String(error) });
}

report.ok = report.failures.length === 0;
await mkdir(path.resolve('artifacts'), { recursive: true });
await writeFile(path.resolve('artifacts/production-contracts.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (!report.ok) {
  console.error(JSON.stringify(report.failures, null, 2));
  process.exit(1);
}
console.log(`Production contracts passed: ${report.checks.length} checks across ${bases.length} ingress points.`);
