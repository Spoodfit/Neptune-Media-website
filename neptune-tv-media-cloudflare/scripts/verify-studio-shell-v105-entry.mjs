import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageRoot = fs.existsSync(path.join(root, 'src/entry-v41.js')) && fs.existsSync(path.join(root, 'public/studio/studio-information-architecture-v65-1.js'));
const prefix = packageRoot ? '' : 'neptune-tv-media-cloudflare/';
const wranglerPath = path.join(root, 'wrangler.jsonc');
const wrangler = fs.readFileSync(wranglerPath, 'utf8');
const mainMatch = wrangler.match(/"main"\s*:\s*"([^"]+)"/u);
if (!mainMatch) throw new Error('wrangler.jsonc: main entry is missing');

const activeEntry = mainMatch[1];
const entry41Path = packageRoot ? 'src/entry-v41.js' : 'neptune-tv-media-cloudflare/src/entry-v41.js';
const activeChain = traceEntryChain(activeEntry);
if (!activeChain.includes(entry41Path)) {
  throw new Error(`Studio active Worker must preserve v41 in its runtime chain: ${activeChain.join(' -> ')}`);
}

const entry41 = fs.readFileSync(path.join(root, entry41Path), 'utf8');
if (!entry41.includes("from './entry-v40.js'")) {
  throw new Error('Preserved v41 entry must preserve the complete v40 runtime');
}
if (!entry41.includes("from './drive-upload-resilience-v137.js'")) {
  throw new Error('Preserved v41 entry must activate Drive upload resilience v137');
}

const entry40Path = path.join(root, `${prefix}src/entry-v40.js`);
const entry40 = fs.readFileSync(entry40Path, 'utf8');
if (!entry40.includes("from './entry-v39.js'")) {
  throw new Error('Preserved v40 entry must preserve the complete v39 WebTV and client runtime');
}
if (!entry40.includes('neptune-webtv-playback-20260815-v119.5') || !entry40.includes('worker-src') || !entry40.includes('blob:')) {
  throw new Error('Preserved v40 entry must keep the Hls.js Web Worker CSP playback fix');
}

const entry39Path = path.join(root, `${prefix}src/entry-v39.js`);
const entry39 = fs.readFileSync(entry39Path, 'utf8');
if (!entry39.includes("from './entry-v38.js'")) {
  throw new Error('Preserved v39 entry must preserve the complete v38 client experience and Studio runtime');
}

const entry38Path = path.join(root, `${prefix}src/entry-v38.js`);
const entry38 = fs.readFileSync(entry38Path, 'utf8');
if (!entry38.includes("from './entry-v37.js'")) {
  throw new Error('Preserved v38 entry must preserve the complete v37 Studio runtime');
}
if (!entry38.includes('neptune-client-experience-20260814-v118.2')) {
  throw new Error('Active Worker chain must preserve the v118.2 client experience from v38');
}

const entry37Path = path.join(root, `${prefix}src/entry-v37.js`);
const entry37 = fs.readFileSync(entry37Path, 'utf8');
if (!entry37.includes("from './entry-v36.js'")) {
  throw new Error('Preserved v37 entry must preserve the complete v36 Studio shell runtime');
}

const entry36Path = path.join(root, `${prefix}src/entry-v36.js`);
const entry = fs.readFileSync(entry36Path, 'utf8');
const required = [
  "const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=107';",
  "const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=3';",
  "const STUDIO_PRIMARY_NAVIGATION=['Parcours clients','Diffusion','Réglages'];",
  "const STUDIO_UI_RELEASE='neptune-studio-ui-20260812-v105-three-tab-canonical-shell';",
  'data-neptune-studio-shell-boot="v105"',
  'injectStudioNavigation(response)',
  'studioPrimaryNavigation:STUDIO_PRIMARY_NAVIGATION',
];
for (const marker of required) {
  if (!entry.includes(marker)) throw new Error(`Preserved v36 Studio shell is missing historical v105 marker: ${marker}`);
}

const shellPath = path.join(root, `${prefix}public/studio/studio-information-architecture-v65-1.js`);
const shell = fs.readFileSync(shellPath, 'utf8');
const visibleRoutes = [...shell.matchAll(/\$\{link\('([^']+)'/gu)].map((match) => match[1]);
if (JSON.stringify(visibleRoutes) !== JSON.stringify(['clients', 'production', 'diffusion', 'settings'])) {
  throw new Error(`Canonical sidebar must expose exactly 4 routes; got ${JSON.stringify(visibleRoutes)}`);
}
if (!shell.includes("link('production', '/studio/video-ai.html'")) throw new Error('Production vidéo must be a primary sidebar item');
if (!shell.includes("if (kind === 'production') return 'production';")) throw new Error('Production vidéo must mark itself as the active primary route');
if (!shell.includes('id="neptuneStudioLogout"')) throw new Error('Canonical Studio logout block is missing');
if (!shell.includes("document.documentElement.dataset.neptuneStudioShellReady = 'v105'")) throw new Error('Canonical Studio shell never marks itself ready');
if (!shell.includes('settleAdvancedSession(markReady)')) throw new Error('Réglages must wait for session resolution before first reveal');
if (shell.includes('installWebTvContext')) throw new Error('Diffusion must not inject the obsolete Antenne/Programme/Publicités/Audience context row');

const css = fs.readFileSync(path.join(root, `${prefix}public/studio/studio-shell-v105.css`), 'utf8');
if (!css.includes('#auth.login')) throw new Error('The legacy login screen is not hidden by the pre-paint guard');
if (css.includes('[data-studio-route="production"]')) throw new Error('Canonical shell CSS still hides Production vidéo');

const advanced = fs.readFileSync(path.join(root, `${prefix}public/studio/advanced.html`), 'utf8');
if (!advanced.includes('<main id="auth" class="login" hidden>')) throw new Error('advanced.html must keep the login screen hidden until auth actually fails');
if (!advanced.includes('/studio/media-catalog-loader-v104.js?v=3')) throw new Error('Réglages must load the Catalogue v108 bootstrap');
if (!advanced.includes('/studio/media-catalog-runtime-fix-v115.js?v=1')) throw new Error('Réglages must load the Catalogue runtime recovery v115');

const catalogueLoader = fs.readFileSync(path.join(root, `${prefix}public/studio/media-catalog-loader-v104.js`), 'utf8');
for (const marker of [
  'ADMIN_TIMEOUT_MS=10000',
  'PUBLIC_PREVIEW_TIMEOUT_MS=3500',
  'MANAGER_SETTLE_TIMEOUT_MS=12000',
  'waitForManagerState()',
  'installCatalogFetchGuard()',
  "headers.set('X-CSRF-Token',csrf)",
  'refreshStudioCsrf',
  "document.documentElement.dataset.neptuneMediaCatalog='v108'",
]) {
  if (!catalogueLoader.includes(marker)) throw new Error(`Catalogue bootstrap safety is missing: ${marker}`);
}

const zeroFlash = fs.readFileSync(path.join(root, `${prefix}src/studio-zero-flash-v136.js`), 'utf8');
if (!zeroFlash.includes("const CANONICAL_SHELL='/studio/studio-information-architecture-v65-1.js?v=109';")) throw new Error('Active zero-flash layer must cache-bust the v138 canonical navigation');
if (!zeroFlash.includes("const CANONICAL_CSS='/studio/studio-shell-v105.css?v=4';")) throw new Error('Active zero-flash layer must cache-bust the v138 canonical shell CSS');

console.log(`Studio shell verified through active entry chain: ${activeChain.join(' -> ')}.`);

function traceEntryChain(start) {
  const chain = [];
  const seen = new Set();
  let current = start;
  for (let depth = 0; depth < 20; depth += 1) {
    if (seen.has(current)) throw new Error(`Studio entry chain contains a cycle at ${current}`);
    seen.add(current);
    chain.push(current);
    if (current === entry41Path) return chain;
    const sourcePath = path.join(root, current);
    if (!fs.existsSync(sourcePath)) throw new Error(`Studio entry chain file is missing: ${current}`);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const parent = source.match(/from\s+['"]\.\/(entry-v\d+\.js)['"]/u)?.[1];
    if (!parent) throw new Error(`Studio entry chain from ${current} does not reach v41`);
    current = path.posix.join(path.posix.dirname(current), parent);
  }
  throw new Error(`Studio entry chain is unexpectedly deep: ${chain.join(' -> ')}`);
}
