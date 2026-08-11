const VERIFIER_RELEASE = 'studio-production-verifier-v104';
const DEFAULT_BASES = [
  'https://neptune-media-webtv.neptunebusinessclub.workers.dev',
  'https://tv.neptunebusiness.com',
];
const bases = (process.env.STUDIO_PRODUCTION_BASE_URLS || DEFAULT_BASES.join(','))
  .split(',')
  .map((value) => value.trim().replace(/\/+$/u, ''))
  .filter(Boolean);
const attempts = Number.parseInt(process.env.STUDIO_PRODUCTION_ATTEMPTS || '15', 10);
const delayMs = Number.parseInt(process.env.STUDIO_PRODUCTION_DELAY_MS || '10000', 10);
const expectedNavigation = ['Parcours clients', 'Production vidéo', 'Diffusion', 'Réglages'];
const expectedRelease = 'neptune-studio-ui-20260811-v104-no-iframe';

const reports = [];
for (const base of bases) reports.push(await verifyWithRetry(base));

console.log(JSON.stringify({ ok: true, verifier: VERIFIER_RELEASE, checkedAt: new Date().toISOString(), reports }, null, 2));
console.log('Studio v104 production verification passed on workers.dev and the custom domain.');

async function verifyWithRetry(base) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const report = await verifyBase(base, attempt);
      console.log(`${base}: Studio v104 verified on attempt ${attempt}.`);
      return report;
    } catch (error) {
      lastError = error;
      console.error(`${base}: attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error(`${base}: Studio v104 production verification failed after ${attempts} attempts. Last error: ${lastError?.message || 'unknown'}`);
}

async function verifyBase(base, attempt) {
  const nonce = `${Date.now()}-${process.pid}-${attempt}`;
  const release = await fetchJson(`${base}/api/public/release?studio_v104=${nonce}`);
  assert(release.studioUi === expectedRelease, `v104 release marker missing: ${JSON.stringify(release)}`);
  assert(release.studioShell === expectedRelease, `legacy shell diagnostic must point to v104: ${release.studioShell}`);
  assert(JSON.stringify(release.studioPrimaryNavigation) === JSON.stringify(expectedNavigation), `primary navigation release marker incorrect: ${JSON.stringify(release.studioPrimaryNavigation)}`);
  assert(release.studioVideoProductionWorkspace === 'active-local-engine-workspace-v77.1', `Production workspace marker incorrect: ${release.studioVideoProductionWorkspace}`);
  assert(release.studioCanonicalVideoPath === '/studio/video-ai.html', `Production canonical path incorrect: ${release.studioCanonicalVideoPath}`);

  const css = await fetchText(`${base}/studio/studio-information-architecture-v65.css?v=1&studio_v104=${nonce}`);
  assert(css.body.includes('--studio-v65-sidebar: 236px'), 'shared sidebar width token missing from production CSS');
  assert(css.body.includes('.studio-context-nav-v65'), 'context navigation styles missing from production CSS');
  assert(css.body.includes('prefers-reduced-motion'), 'reduced-motion support missing from production CSS');

  const runtime = await fetchText(`${base}/studio/studio-information-architecture-v65-1.js?v=104&studio_v104=${nonce}`);
  assert(runtime.body.includes("const KEY = '__neptuneStudioInformationArchitectureV104'"), 'v104 navigation runtime missing');
  assert(runtime.body.includes('primaryNavigation()'), 'canonical navigation function missing from production runtime');
  for (const label of expectedNavigation) assert(runtime.body.includes(label), `production runtime missing navigation label ${label}`);
  assert(runtime.body.includes("link('settings', '/studio/advanced.html#programs'"), 'Réglages does not target Catalogue Media');
  assert(runtime.body.includes("settings: [['programs', 'Catalogue Media']"), 'Catalogue Media is not first in Settings');

  const app = await fetchText(`${base}/studio/app.html?studio_v104=${nonce}`);
  assert(!app.body.includes('<iframe'), 'compatibility Studio entry still contains an iframe');
  assert(app.body.includes('/studio/studio-app-router-v104.js?v=1'), 'compatibility Studio entry does not use the v104 router');

  const pages = [
    ['/studio/clients.html', 'clients'],
    ['/studio/video-ai.html', 'production'],
    ['/studio/webtv.html', 'diffusion'],
    ['/studio/advanced.html#programs', 'catalogue'],
  ];
  const pageReports = [];
  for (const [pathAndHash, id] of pages) {
    const [pathname] = pathAndHash.split('#');
    const page = await fetchText(`${base}${pathname}?studio_v104=${nonce}`);
    assert(page.status === 200, `${id}: expected HTTP 200, received ${page.status}`);
    assert(page.body.includes('/studio/studio-information-architecture-v65.css?v=1'), `${id}: shared stylesheet is not present`);
    assert(page.body.includes('/studio/studio-information-architecture-v65-1.js?v=104'), `${id}: shared v104 runtime is not injected`);
    assert(page.headers.get('x-neptune-studio-ui') === expectedRelease, `${id}: v104 Studio response header missing`);
    assert(page.headers.get('x-frame-options') === 'DENY', `${id}: top-level page must reject iframe embedding`);
    assert(!page.body.includes('studio_embed='), `${id}: legacy iframe mode leaked into production HTML`);
    pageReports.push({ id, pathname, status: page.status, bytes: page.body.length });
  }

  const preview = await fetchText(`${base}/reserver?catalog_preview=studio&studio_v104=${nonce}`);
  assert(preview.headers.get('x-frame-options') === 'SAMEORIGIN', 'sales tunnel Studio preview must remain same-origin embeddable');
  assert(preview.headers.get('x-neptune-studio-preview') === expectedRelease, 'sales tunnel Studio preview marker missing');

  return {
    base,
    attempt,
    release: {
      studioUi: release.studioUi,
      studioPrimaryNavigation: release.studioPrimaryNavigation,
      studioVideoProductionWorkspace: release.studioVideoProductionWorkspace,
      studioCanonicalVideoPath: release.studioCanonicalVideoPath,
    },
    assets: { cssBytes: css.body.length, runtimeBytes: runtime.body.length, appBytes: app.body.length },
    pages: pageReports,
    preview: { status: preview.status, frameOptions: preview.headers.get('x-frame-options') },
  };
}

async function fetchJson(url) {
  const response = await fetch(url, requestOptions());
  const body = await response.text();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  try { return JSON.parse(body); }
  catch { throw new Error(`${url} did not return JSON: ${body.slice(0, 500)}`); }
}

async function fetchText(url) {
  const response = await fetch(url, requestOptions());
  const body = await response.text();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  return { status: response.status, headers: response.headers, body };
}

function requestOptions() {
  return {
    headers: {
      'Cache-Control': 'no-cache, no-store',
      Pragma: 'no-cache',
      'User-Agent': 'Neptune-Studio-V104-Production-Verification/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
