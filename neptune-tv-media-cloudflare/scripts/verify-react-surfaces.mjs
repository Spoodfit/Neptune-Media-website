import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'neptune-tv-media-cloudflare/react/hors-norme');
const publicRoot = path.join(root, 'neptune-tv-media-cloudflare/public/hors-norme');
const sharedPublicRoot = path.join(root, 'neptune-tv-media-cloudflare/public');
const canonicalBookingUrl = 'https://neptune-media-webtv.neptunebusinessclub.workers.dev/reserver';
const failures = [];
const fail = message => failures.push(message);
const read = file => fs.readFileSync(file, 'utf8');

for (const relative of [
  'package.json',
  'source-assets.tar.gz',
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
  'src/lib/constants.ts',
  'next.config.ts',
]) {
  if (!fs.existsSync(path.join(sourceRoot, relative))) fail(`Missing HORS NORME React source: ${relative}`);
}

const page = read(path.join(sourceRoot, 'src/app/page.tsx'));
const hero = read(path.join(sourceRoot, 'src/components/hero-section.tsx'));
const heroMedia = read(path.join(sourceRoot, 'src/components/hero-media-composite.tsx'));
const showcase = read(path.join(sourceRoot, 'src/components/visibility-showcase.tsx'));
const contact = read(path.join(sourceRoot, 'src/components/contact-form.tsx'));
const constants = read(path.join(sourceRoot, 'src/lib/constants.ts'));
const config = read(path.join(sourceRoot, 'next.config.ts'));

for (const component of ['<HeroSection />','<ProofSection />','<SeenOnStrip />','<VipJourney />','<ValueStack />','<PriceValueSection />','<ContactForm />']) {
  if (!page.includes(component)) fail(`Cursor landing composition missing: ${component}`);
}
if (!hero.includes('Une demi-journée.') || !hero.includes('3 mois de contenus.')) fail('Cursor hero copy is not preserved.');
if (!heroMedia.includes('/assets/media/showcase/hors-norme-hero.mp4') || !heroMedia.includes('/assets/posters/hors-norme-episode.webp')) fail('Cursor hero media references are not preserved.');
for (let index = 1; index <= 16; index += 1) {
  const number = String(index).padStart(2, '0');
  if (!showcase.includes(`/assets/media/showcase/short-${number}.mp4`)) fail(`Cursor showcase video reference missing: short-${number}.mp4`);
  if (!showcase.includes(`/assets/posters/showcase/short-${number}.webp`)) fail(`Cursor showcase poster reference missing: short-${number}.webp`);
}
if (!constants.includes(canonicalBookingUrl)) fail('HORS NORME React source does not use canonical Worker booking URL.');
if (constants.includes('https://media.neptunebusiness.com/reserver')) fail('Deprecated media-domain booking URL remains in React source.');
if (contact.includes('/api/leads')) fail('Demo-only Next lead endpoint remains active.');
if (!contact.includes('neptune_hors_norme_contact')) fail('HORS NORME contact context is not preserved before booking handoff.');
if (!config.includes('output: "export"') || !config.includes('basePath: "/hors-norme"')) fail('HORS NORME is not configured as a static React export under /hors-norme.');

for (const relative of [
  'assets/logo_neptune_blanc.png',
  'assets/logo_neptune_le_N.png',
  'assets/media/showcase/hors-norme-hero.mp4',
  'assets/posters/hors-norme-episode.webp',
  'assets/posters/connexio-concept.webp',
  ...Array.from({ length: 16 }, (_, index) => `assets/media/showcase/short-${String(index + 1).padStart(2, '0')}.mp4`),
  ...Array.from({ length: 16 }, (_, index) => `assets/posters/showcase/short-${String(index + 1).padStart(2, '0')}.webp`),
]) {
  const absolute = path.join(sharedPublicRoot, relative);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size === 0) fail(`Generated Cursor media asset is missing or empty: ${relative}`);
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
console.log('HORS NORME React surface verified: Cursor composition/media, canonical booking handoff, static export and generated runtime are aligned.');
