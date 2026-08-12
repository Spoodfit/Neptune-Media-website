const VERIFIER_RELEASE = 'studio-production-verifier-v105';
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
const expectedNavigation = ['Parcours clients', 'Diffusion', 'Réglages'];
const expectedRelease = 'neptune-studio-ui-20260812-v105-three-tab-canonical-shell';

const reports = [];
for (const base of bases) reports.push(await verifyWithRetry(base));

console.log(JSON.stringify({ ok: true, verifier: VERIFIER_RELEASE, checkedAt: new Date().toISOString(), reports }, null, 2));
console.log('Studio v105 production verification passed on workers.dev and the custom domain.');

async function verifyWithRetry(base) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const report = await verifyBase(base, attempt);
      console.log(`${base}: Studio v105 verified on attempt ${attempt}.`);
      return report;
    } catch (error) {
      lastError = error;
      console.error(`${base}: attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error(`${base}: Studio v105 production verification failed after ${attempts} attempts. Last error: ${lastError?.message || 'unknown'}`);
}

async function verifyBase(base, attempt) {
  const nonce = `${Date.now()}-${process.pid}-${attempt}`;
  const release = await fetchJson(`${base}/api/public/release?studio_v105=${nonce}`);
  assert(release.studioUi === expectedRelease, `v105 release marker missing: ${JSON.stringify(release)}`);
  assert(release.studioShell === expectedRelease, `Studio shell marker incorrect: ${release.studioShell}`);
  assert(JSON.stringify(release.studioPrimaryNavigation) === JSON.stringify(expectedNavigation), `primary navigation release marker incorrect: ${JSON.stringify(release.studioPrimaryNavigation)}`);

  const layoutCss = await fetchText(`${base}/studio/studio-information-architecture-v65.css?v=1&studio_v105=${nonce}`);
  assert(layoutCss.body.includes('--studio-v65-sidebar: 236px'), 'shared sidebar width token missing from production CSS');
  assert(layoutCss.body.includes('prefers-reduced-motion'), 'reduced-motion support missing from production layout CSS');

  const shellCss = await fetchText(`${base}/studio/studio-shell-v105.css?v=2&studio_v105=${nonce}`);
  assert(shellCss.body.includes('data-neptune-studio-shell-boot="v105"'), 'anti-flash boot guard missing from production shell CSS');
  assert(shellCss.body.includes('data-neptune-studio-shell-ready="v105"'), 'canonical ready state missing from production shell CSS');
  assert(shellCss.body.includes('body.studio-shell-v105 .neptune-studio-account'), 'canonical account block styles missing');

  const runtime = await fetchText(`${base}/studio/studio-information-architecture-v65-1.js?v=106&studio_v105=${nonce}`);
  assert(runtime.body.includes("const KEY = '__neptuneStudioCanonicalShellV105'"), 'v105 canonical navigation runtime missing');
  assert(runtime.body.includes('installCanonicalSidebar'), 'canonical sidebar installer missing from production runtime');
  for (const label of expectedNavigation) assert(runtime.body.includes(label), `production runtime missing navigation label ${label}`);
  assert(!runtime.body.includes("link('production'"), 'Production vidéo is still a primary navigation item');
  assert(runtime.body.includes("link('settings', '/studio/advanced.html#programs'"), 'Réglages does not target Catalogue Media');
  assert(runtime.body.includes("settings: [['programs', 'Catalogue Media']"), 'Catalogue Media is not first in Settings');
  assert(runtime.body.includes("document.documentElement.dataset.neptuneStudioShellReady = 'v105'"), 'canonical runtime does not mark the shell ready');
  assert(runtime.body.includes('revealLegacyFallback'), 'canonical boot fallback is missing');
  assert(!runtime.body.includes('installWebTvContext'), 'Diffusion still injects the obsolete Antenne / Programme / Publicités / Audience row');
  assert(!runtime.body.includes("['Antenne', '/studio/webtv.html'"), 'obsolete Diffusion context row is still constructed');

  const webTvRuntime = await fetchText(`${base}/studio/webtv-workspace-v1.js?studio_v105=${nonce}`);
  assert(webTvRuntime.body.includes("['antenna','Antenne','Direct et état']"), 'Web TV Antenne section missing');
  assert(webTvRuntime.body.includes("['program','Programme','Grille de diffusion']"), 'Web TV Programme section missing');
  assert(webTvRuntime.body.includes("['settings','Configuration','YouTube et sécurité']"), 'Web TV Configuration section missing');

  const app = await fetchText(`${base}/studio/app.html?studio_v105=${nonce}`);
  assert(!app.body.includes('<iframe'), 'compatibility Studio entry still contains an iframe');
  assert(app.body.includes('/studio/studio-app-router-v104.js?v=1'), 'compatibility Studio entry does not use the top-level router');

  const pages = [
    ['/studio/clients', 'clients'],
    ['/studio/webtv.html', 'diffusion'],
    ['/studio/advanced.html', 'settings'],
  ];
  const pageReports = [];
  for (const [pathname, id] of pages) {
    const page = await fetchText(`${base}${pathname}?studio_v105=${nonce}`);
    assert(page.status === 200, `${id}: expected final HTTP 200, received ${page.status}`);
    assert(page.body.includes('data-neptune-studio-shell-boot="v105"'), `${id}: pre-paint boot marker is missing`);
    assert(page.body.includes('/studio/studio-shell-v105.css?v=2'), `${id}: canonical anti-flash stylesheet is not present`);
    assert(page.body.includes('/studio/studio-information-architecture-v65-1.js?v=106'), `${id}: canonical v105 runtime is not injected`);
    assert(page.headers.get('x-neptune-studio-ui') === expectedRelease, `${id}: v105 Studio response header missing`);
    assert(page.headers.get('x-frame-options') === 'DENY', `${id}: top-level page must reject iframe embedding`);
    assert(!page.body.includes('studio_embed='), `${id}: legacy iframe mode leaked into production HTML`);
    pageReports.push({ id, finalUrl: page.url, status: page.status, bytes: page.body.length });
  }

  const preview = await fetchText(`${base}/reserver?catalog_preview=studio&studio_v105=${nonce}`);
  assert(preview.headers.get('x-frame-options') === 'SAMEORIGIN', 'sales tunnel Studio preview must remain same-origin embeddable');
  assert(preview.headers.get('x-neptune-studio-preview') === expectedRelease, 'sales tunnel Studio preview marker missing');

  return {
    base,
    attempt,
    release: {
      studioUi: release.studioUi,
      studioShell: release.studioShell,
      studioPrimaryNavigation: release.studioPrimaryNavigation,
    },
    assets: {
      layoutCssBytes: layoutCss.body.length,
      shellCssBytes: shellCss.body.length,
      runtimeBytes: runtime.body.length,
      webTvRuntimeBytes: webTvRuntime.body.length,
      appBytes: app.body.length,
    },
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
  return { status: response.status, headers: response.headers, body, url: response.url };
}

function requestOptions() {
  return {
    headers: {
      'Cache-Control': 'no-cache, no-store',
      Pragma: 'no-cache',
      'User-Agent': 'Neptune-Studio-V105-Production-Verification/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
