import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const notes = [];
const canonicalWorker = 'neptune-tv-media-cloudflare/src/worker.js';
const canonicalBookingUrl = 'https://neptune-media-webtv.neptunebusinessclub.workers.dev/reserver';
const forbiddenBookingUrl = 'https://media.neptunebusiness.com/reserver';
const horsNormeReactRoot = 'neptune-tv-media-cloudflare/react/hors-norme';

const exists = relativePath => fs.existsSync(path.join(root, relativePath));
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const fail = message => failures.push(message);
const note = message => notes.push(message);

function walk(directory, output = []) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return output;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) walk(relative, output);
    else output.push(relative);
  }
  return output;
}

function isTracked(relativePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relativePath], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

for (const stalePath of [
  'scripts','src','styles','docs','visual-audit','neptune-tv-media-cloudflare/notes','neptune-tv-media-cloudflare/CATALOG_V109_AUDIT.md','neptune-tv-media-cloudflare/CI_V110.md','neptune-tv-media-cloudflare/deploy-trigger-manual-scheduling-v85-20260810.txt','neptune-tv-media-cloudflare/deploy-trigger-v27.txt','neptune-tv-media-cloudflare/src/entry-v48.js','neptune-tv-media-cloudflare/containers/video-ai/app_v69.py','neptune-tv-media-cloudflare/containers/video-ai/app_v71.py','neptune-tv-media-cloudflare/containers/webtv/encoder-v118.mjs','neptune-tv-media-cloudflare/containers/webtv/encoder-smoothness-v124.mjs',
]) if (exists(stalePath)) fail(`Stale repository path must not exist: ${stalePath}`);

for (const requiredPath of [
  canonicalWorker,
  'neptune-tv-media-cloudflare/containers/video-ai/app.py',
  'neptune-tv-media-cloudflare/containers/video-ai/processor.py',
  'neptune-tv-media-cloudflare/containers/video-ai/entry.py',
  'neptune-tv-media-cloudflare/containers/webtv/encoder.mjs',
  'neptune-tv-media-cloudflare/containers/webtv/apply-smoothness-patch.mjs',
  `${horsNormeReactRoot}/package.json`,
  `${horsNormeReactRoot}/next.config.ts`,
  `${horsNormeReactRoot}/source-assets.tar.gz`,
  `${horsNormeReactRoot}/src/app/page.tsx`,
  `${horsNormeReactRoot}/src/components/hero-section.tsx`,
  `${horsNormeReactRoot}/src/components/contact-form.tsx`,
  `${horsNormeReactRoot}/src/lib/constants.ts`,
  'neptune-tv-media-cloudflare/scripts/build-react-surfaces.mjs',
  'neptune-tv-media-cloudflare/scripts/verify-react-surfaces.mjs',
  'migration/REACT_SURFACE_ARCHITECTURE.md',
]) if (!exists(requiredPath)) fail(`Canonical repository path is missing: ${requiredPath}`);

for (const wranglerFile of ['wrangler.jsonc', 'neptune-tv-media-cloudflare/wrangler.jsonc']) {
  if (!exists(wranglerFile)) { fail(`Missing Wrangler configuration: ${wranglerFile}`); continue; }
  let config;
  try { config = JSON.parse(read(wranglerFile)); } catch (error) { fail(`${wranglerFile} is not valid JSON: ${error.message}`); continue; }
  if (config.main !== canonicalWorker) fail(`${wranglerFile} main must be ${canonicalWorker}; got ${config.main || '(missing)'}`);
  if (config.vars?.BOOKING_URL !== canonicalBookingUrl) fail(`${wranglerFile} BOOKING_URL must be ${canonicalBookingUrl}`);
  const legacyVars = Object.keys(config.vars || {}).filter(name => name.startsWith('LEGACY_'));
  if (legacyVars.length) fail(`${wranglerFile} contains obsolete LEGACY_* vars: ${legacyVars.join(', ')}`);
}

const runtimeTextFiles = [
  'wrangler.jsonc',
  'neptune-tv-media-cloudflare/wrangler.jsonc',
  ...walk('neptune-tv-media-cloudflare/public').filter(file => /\.(?:html?|js|mjs|json|css|txt|xml)$/iu.test(file)),
  ...walk('neptune-tv-media-cloudflare/src').filter(file => /\.(?:js|mjs|json)$/iu.test(file)),
  ...walk('neptune-tv-media-cloudflare/react').filter(file => /\.(?:tsx?|jsx?|json|css|mjs)$/iu.test(file)),
];
const forbiddenBookingRefs = runtimeTextFiles.filter(file => { try { return read(file).includes(forbiddenBookingUrl); } catch { return false; } });
if (forbiddenBookingRefs.length) fail(`Deprecated booking URL remains in active runtime/source files: ${forbiddenBookingRefs.join(', ')}`);

const hnConstants = `${horsNormeReactRoot}/src/lib/constants.ts`;
if (exists(hnConstants) && !read(hnConstants).includes(canonicalBookingUrl)) fail('HORS NORME React source does not reference the canonical booking URL.');
const hnPage = `${horsNormeReactRoot}/src/app/page.tsx`;
if (exists(hnPage)) {
  const page = read(hnPage);
  for (const marker of ['HeroSection','ProofSection','SeenOnStrip','VipJourney','ValueStack','PriceValueSection','ContactForm']) if (!page.includes(marker)) fail(`HORS NORME React source is missing Cursor component: ${marker}`);
}

if (isTracked('neptune-tv-media-cloudflare/public/hors-norme/index.html')) fail('Generated HORS NORME index.html is tracked. Source of truth must remain react/hors-norme.');

const applicationRootFiles = fs.readdirSync(path.join(root, 'neptune-tv-media-cloudflare'), { withFileTypes: true });
const oneShotMarkers = applicationRootFiles.filter(entry => entry.isFile()).map(entry => entry.name).filter(name => /(?:deploy[-_]?trigger|diagnostic|production[-_]?status|verification).*\.(?:txt|json)$/iu.test(name));
if (oneShotMarkers.length) fail(`One-shot application artifacts remain: ${oneShotMarkers.join(', ')}`);

if (!failures.length) {
  note('Repository root contains no obsolete mutation-script, generated-audit or duplicate source directories.');
  note('Cloudflare runtime has one canonical Worker entry: worker.js.');
  note('Container sources use canonical filenames without historical version aliases.');
  note(`Canonical booking URL is ${canonicalBookingUrl}.`);
  note('HORS NORME source of truth is React; public/hors-norme is generated only.');
  note('HORS NORME Cursor media is source-controlled as a build-time bundle, not as generated public output.');
}

console.log('\nNeptune Media repository cleanliness\n');
for (const message of notes) console.log(`INFO  ${message}`);
for (const message of failures) console.error(`FAIL  ${message}`);
console.log(`\nSummary: ${failures.length} failure(s), ${notes.length} information item(s).`);
if (failures.length) process.exit(1);
