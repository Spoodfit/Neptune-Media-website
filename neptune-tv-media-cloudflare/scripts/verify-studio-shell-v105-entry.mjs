import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageRoot = fs.existsSync(path.join(root, 'src/entry-v37.js')) && fs.existsSync(path.join(root, 'public/studio/studio-information-architecture-v65-1.js'));
const prefix = packageRoot ? '' : 'neptune-tv-media-cloudflare/';
const wranglerPath = path.join(root, 'wrangler.jsonc');
const wrangler = fs.readFileSync(wranglerPath, 'utf8');
const mainMatch = wrangler.match(/"main"\s*:\s*"([^"]+)"/u);
if (!mainMatch) throw new Error('wrangler.jsonc: main entry is missing');

const expectedEntry = packageRoot ? 'src/entry-v37.js' : 'neptune-tv-media-cloudflare/src/entry-v37.js';
const activeEntry = mainMatch[1];
if (activeEntry !== expectedEntry) {
  throw new Error(`Studio v115 is not active: wrangler main is ${activeEntry}, expected ${expectedEntry}`);
}

const entry37Path = path.join(root, activeEntry);
const entry37 = fs.readFileSync(entry37Path, 'utf8');
if (!entry37.includes("from './entry-v36.js'")) {
  throw new Error('Active v37 entry must preserve the complete v36 Studio shell runtime');
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
  if (!entry.includes(marker)) throw new Error(`Preserved v36 Studio shell is missing v105 marker: ${marker}`);
}

const shellPath = path.join(root, `${prefix}public/studio/studio-information-architecture-v65-1.js`);
const shell = fs.readFileSync(shellPath, 'utf8');
const visibleRoutes = [...shell.matchAll(/\$\{link\('([^']+)'/gu)].map((match) => match[1]);
if (JSON.stringify(visibleRoutes) !== JSON.stringify(['clients', 'diffusion', 'settings'])) {
  throw new Error(`Canonical sidebar must expose exactly 3 routes; got ${JSON.stringify(visibleRoutes)}`);
}
if (shell.includes("link('production'")) throw new Error('Production vidéo must not be a primary sidebar item');
if (!shell.includes('id="neptuneStudioLogout"')) throw new Error('Canonical Studio logout block is missing');
if (!shell.includes("document.documentElement.dataset.neptuneStudioShellReady = 'v105'")) throw new Error('Canonical Studio shell never marks itself ready');
if (!shell.includes('settleAdvancedSession(markReady)')) throw new Error('Réglages must wait for session resolution before first reveal');
if (shell.includes('installWebTvContext')) throw new Error('Diffusion must not inject the obsolete Antenne/Programme/Publicités/Audience context row');

const css = fs.readFileSync(path.join(root, `${prefix}public/studio/studio-shell-v105.css`), 'utf8');
if (!css.includes('#auth.login')) throw new Error('The legacy login screen is not hidden by the pre-paint guard');

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

console.log('Studio v115 active entry verified: v37 preserves v36 canonical 3-tab shell, Réglages auth gate, Catalogue v108 bootstrap and v115 runtime recovery.');
