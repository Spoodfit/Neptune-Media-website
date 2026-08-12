import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const wranglerPath = path.join(root, 'wrangler.jsonc');
const wrangler = fs.readFileSync(wranglerPath, 'utf8');
const mainMatch = wrangler.match(/"main"\s*:\s*"([^"]+)"/u);
if (!mainMatch) throw new Error('wrangler.jsonc: main entry is missing');

const expectedEntry = 'neptune-tv-media-cloudflare/src/entry-v36.js';
const activeEntry = mainMatch[1];
if (activeEntry !== expectedEntry) {
  throw new Error(`Studio v105 is not active: wrangler main is ${activeEntry}, expected ${expectedEntry}`);
}

const entryPath = path.join(root, activeEntry);
const entry = fs.readFileSync(entryPath, 'utf8');
const required = [
  "const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=106';",
  "const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=2';",
  "const STUDIO_PRIMARY_NAVIGATION=['Parcours clients','Diffusion','Réglages'];",
  "const STUDIO_UI_RELEASE='neptune-studio-ui-20260812-v105-three-tab-canonical-shell';",
  'data-neptune-studio-shell-boot="v105"',
  'injectStudioNavigation(response)',
  'studioPrimaryNavigation:STUDIO_PRIMARY_NAVIGATION',
];
for (const marker of required) {
  if (!entry.includes(marker)) throw new Error(`Active Studio entry is missing v105 marker: ${marker}`);
}

const shellPath = path.join(root, 'neptune-tv-media-cloudflare/public/studio/studio-information-architecture-v65-1.js');
const shell = fs.readFileSync(shellPath, 'utf8');
const visibleRoutes = [...shell.matchAll(/\$\{link\('([^']+)'/gu)].map((match) => match[1]);
if (JSON.stringify(visibleRoutes) !== JSON.stringify(['clients', 'diffusion', 'settings'])) {
  throw new Error(`Canonical sidebar must expose exactly 3 routes; got ${JSON.stringify(visibleRoutes)}`);
}
if (shell.includes("link('production'")) throw new Error('Production vidéo must not be a primary sidebar item');
if (!shell.includes('id="neptuneStudioLogout"')) throw new Error('Canonical Studio logout block is missing');
if (!shell.includes("document.documentElement.dataset.neptuneStudioShellReady = 'v105'")) throw new Error('Canonical Studio shell never marks itself ready');
if (shell.includes('installWebTvContext')) throw new Error('Diffusion must not inject the obsolete Antenne/Programme/Publicités/Audience context row');

console.log('Studio v105 active entry verified: entry-v36 + anti-flash boot + 3-tab canonical shell.');
