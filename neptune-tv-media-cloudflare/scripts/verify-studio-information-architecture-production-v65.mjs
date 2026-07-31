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

const reports = [];
for (const base of bases) {
  reports.push(await verifyWithRetry(base));
}

console.log(JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), reports }, null, 2));
console.log('Studio v65 production verification passed on workers.dev and the custom domain.');

async function verifyWithRetry(base) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const report = await verifyBase(base, attempt);
      console.log(`${base}: Studio v65 verified on attempt ${attempt}.`);
      return report;
    } catch (error) {
      lastError = error;
      console.error(`${base}: attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error(`${base}: Studio v65 production verification failed after ${attempts} attempts. Last error: ${lastError?.message || 'unknown'}`);
}

async function verifyBase(base, attempt) {
  const nonce = `${Date.now()}-${process.pid}-${attempt}`;
  const release = await fetchJson(`${base}/api/public/release?studio_v65=${nonce}`);
  assert(release.studioInformationArchitecture === 'four-primary-destinations-v65', `release marker missing: ${JSON.stringify(release)}`);
  assert(JSON.stringify(release.studioPrimaryNavigation) === JSON.stringify(expectedNavigation), `primary navigation release marker incorrect: ${JSON.stringify(release.studioPrimaryNavigation)}`);
  assert(release.studioAdvancedZone === 'removed-from-visible-navigation-v65', `advanced-zone release marker incorrect: ${release.studioAdvancedZone}`);
  assert(release.studioReadability === 'shared-shell-contrast-spacing-and-responsive-type-v65', `readability release marker incorrect: ${release.studioReadability}`);
  assert(release.studioNavigationRuntime === 'stable-no-observer-loop-v65.1', `stable runtime release marker incorrect: ${release.studioNavigationRuntime}`);

  const css = await fetchText(`${base}/studio/studio-information-architecture-v65.css?v=1&studio_v65=${nonce}`);
  assert(css.body.includes('--studio-v65-sidebar: 236px'), 'shared sidebar width token missing from production CSS');
  assert(css.body.includes('.studio-context-nav-v65'), 'context navigation styles missing from production CSS');
  assert(css.body.includes('prefers-reduced-motion'), 'reduced-motion support missing from production CSS');

  const runtime = await fetchText(`${base}/studio/studio-information-architecture-v65-1.js?v=1&studio_v65=${nonce}`);
  assert(runtime.body.includes('primaryNavigation()'), 'canonical navigation function missing from production runtime');
  for (const label of expectedNavigation) assert(runtime.body.includes(label), `production runtime missing navigation label ${label}`);
  assert(runtime.body.includes("location.replace('/studio/clients')"), 'legacy dashboard redirect missing from production runtime');
  assert(runtime.body.includes("location.replace('/studio/video-ai.html')"), 'legacy Video AI redirect missing from production runtime');

  const compatibility = await fetchText(`${base}/studio/studio-information-architecture-v65.js?v=1&studio_v65=${nonce}`);
  assert(compatibility.body.includes("import './studio-information-architecture-v65-1.js?v=1'"), 'compatibility runtime does not point to the stable implementation');

  const pages = [
    ['/studio/clients.html', 'clients'],
    ['/studio/video-ai.html', 'production'],
    ['/studio/advanced.html', 'advanced'],
  ];
  const pageReports = [];
  for (const [pathname, id] of pages) {
    const page = await fetchText(`${base}${pathname}?studio_v65=${nonce}`);
    assert(page.body.includes('/studio/studio-information-architecture-v65.css?v=1'), `${id}: v65 stylesheet is not injected`);
    assert(page.body.includes('/studio/studio-information-architecture-v65-1.js?v=1'), `${id}: stable v65 runtime is not injected`);
    assert(page.headers.get('x-neptune-studio-ia') === 'four-primary-destinations-v65', `${id}: Studio architecture response header missing`);
    assert(!page.body.includes('/studio/studio-sidebar-authority-v64.js'), `${id}: retired v64 sidebar runtime is still injected`);
    pageReports.push({ id, pathname, status: page.status, bytes: page.body.length });
  }

  return {
    base,
    attempt,
    release: {
      studioInformationArchitecture: release.studioInformationArchitecture,
      studioPrimaryNavigation: release.studioPrimaryNavigation,
      studioAdvancedZone: release.studioAdvancedZone,
      studioReadability: release.studioReadability,
      studioNavigationRuntime: release.studioNavigationRuntime,
    },
    assets: {
      cssBytes: css.body.length,
      runtimeBytes: runtime.body.length,
      compatibilityBytes: compatibility.body.length,
    },
    pages: pageReports,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, requestOptions());
  const body = await response.text();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${url} did not return JSON: ${body.slice(0, 500)}`);
  }
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
      'User-Agent': 'Neptune-Studio-V65-Production-Verification/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
