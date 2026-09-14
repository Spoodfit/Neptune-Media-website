import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'neptune-tv-media-cloudflare/react/hors-norme');
const publicRoot = path.join(root, 'neptune-tv-media-cloudflare/public/hors-norme');
const assetRoot = path.join(root, 'neptune-tv-media-cloudflare/public');
const deployWorkflow = path.join(root, '.github/workflows/deploy-cloudflare.yml');
const canonicalBookingUrl = 'https://neptune-media-webtv.neptunebusinessclub.workers.dev/reserver';
const canonicalEpisodeUrl = 'https://neptune-media-webtv.neptunebusinessclub.workers.dev/media/emissions/hors-norme.mp4';
const failures = [];
const fail = message => failures.push(message);
const read = file => fs.readFileSync(file, 'utf8');

for (const relative of [
  'src/app/page.tsx',
  'src/app/layout.tsx',
  'src/app/globals.css',
  'src/components/hero-section.tsx',
  'src/components/hero-media-composite.tsx',
  'src/components/visibility-showcase.tsx',
  'src/components/proof-section.tsx',
  'src/components/vip-journey.tsx',
  'src/components/value-stack.tsx',
  'src/components/price-value-section.tsx',
  'src/components/contact-form.tsx',
  'src/components/site-header.tsx',
  'src/components/site-footer.tsx',
  'src/lib/constants.ts',
  'next.config.ts',
]) {
  if (!fs.existsSync(path.join(sourceRoot, relative))) fail(`Missing HORS NORME React source: ${relative}`);
}

const page = read(path.join(sourceRoot, 'src/app/page.tsx'));
const hero = read(path.join(sourceRoot, 'src/components/hero-section.tsx'));
const heroMedia = read(path.join(sourceRoot, 'src/components/hero-media-composite.tsx'));
const showcase = read(path.join(sourceRoot, 'src/components/visibility-showcase.tsx'));
const valueStack = read(path.join(sourceRoot, 'src/components/value-stack.tsx'));
const header = read(path.join(sourceRoot, 'src/components/site-header.tsx'));
const footer = read(path.join(sourceRoot, 'src/components/site-footer.tsx'));
const layout = read(path.join(sourceRoot, 'src/app/layout.tsx'));
const contact = read(path.join(sourceRoot, 'src/components/contact-form.tsx'));
const constants = read(path.join(sourceRoot, 'src/lib/constants.ts'));
const config = read(path.join(sourceRoot, 'next.config.ts'));
const deploy = read(deployWorkflow);

for (const component of ['<HeroSection />','<ProofSection />','<SeenOnStrip />','<VipJourney />','<ValueStack />','<PriceValueSection />','<ContactForm />']) {
  if (!page.includes(component)) fail(`Cursor landing composition missing: ${component}`);
}
if (!hero.includes('Une demi-journée.') || !hero.includes('3 mois de contenus.')) fail('Cursor hero copy is not preserved.');
if (!constants.includes(canonicalBookingUrl)) fail('HORS NORME React source does not use canonical Worker booking URL.');
if (constants.includes('https://media.neptunebusiness.com/reserver')) fail('Deprecated media-domain booking URL remains in React source.');
if (contact.includes('/api/leads')) fail('Demo-only Next lead endpoint remains active.');
if (!contact.includes('neptune_hors_norme_contact')) fail('HORS NORME contact context is not preserved before booking handoff.');
if (!config.includes('output: "export"') || !config.includes('basePath: "/hors-norme"') || !config.includes('images: { unoptimized: true }')) fail('HORS NORME is not configured as a deployable static React export under /hors-norme.');
if (!heroMedia.includes(canonicalEpisodeUrl)) fail('Hero does not use the canonical HORS NORME episode media endpoint.');
if (!deploy.includes("neptune-tv-media-cloudflare/react/**")) fail('Cloudflare deploy workflow does not watch React source changes.');

const forbiddenMissingAssetPrefixes = ['/assets/media/showcase/', '/assets/posters/showcase/', '/assets/logo_neptune_blanc.png', '/assets/logo_neptune_le_N.png', '/assets/posters/connexio-concept.webp', '/assets/posters/hors-norme-episode.webp'];
for (const token of forbiddenMissingAssetPrefixes) {
  for (const [name, source] of Object.entries({ heroMedia, showcase, valueStack, header, footer, layout })) {
    if (source.includes(token)) fail(`HORS NORME ${name} still references unavailable Cursor-only asset: ${token}`);
  }
}

for (const relative of [
  'assets/logo-neptune.svg',
  'assets/posters/hors-norme-wide.webp',
  'assets/posters/studio-wide.webp',
  'assets/posters/poster-neptune-media.webp',
  'assets/posters/poster-accident.webp',
  'assets/posters/poster-video-pro.webp',
  'assets/posters/poster-storytelling.webp',
  'assets/posters/poster-humain.webp',
  'assets/media/neptune-media-mis-en-lumiere.mp4',
  'assets/media/accident-moto-entreprise.mp4',
  'assets/media/solution-video-pro.mp4',
  'assets/media/storytelling-efficace.mp4',
  'assets/media/humain-avant-business.mp4',
]) {
  if (!fs.existsSync(path.join(assetRoot, relative))) fail(`Required HORS NORME runtime asset is missing: /${relative}`);
}

const generatedIndex = path.join(publicRoot, 'index.html');
if (!fs.existsSync(generatedIndex)) {
  fail('Generated HORS NORME React index is missing.');
} else {
  const html = read(generatedIndex);
  if (!html.includes('/hors-norme/_next/')) fail('Generated HORS NORME page is not a Next/React client surface.');
  if (!html.includes('Une demi-journée.')) fail('Generated HORS NORME page does not match Cursor hero copy.');
}

if (fs.existsSync(path.join(publicRoot, 'release-v182.txt'))) fail('Obsolete HORS NORME release marker is present.');

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log('HORS NORME React surface verified: Cursor composition, canonical booking/media handoff, existing runtime assets, deploy trigger and static export are aligned.');
