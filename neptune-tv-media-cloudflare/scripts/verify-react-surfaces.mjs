import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'neptune-tv-media-cloudflare/react/hors-norme');
const publicRoot = path.join(root, 'neptune-tv-media-cloudflare/public/hors-norme');
const canonicalBookingUrl = 'https://neptune-media-webtv.neptunebusinessclub.workers.dev/reserver';
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
  'src/lib/constants.ts',
  'next.config.ts',
]) {
  if (!fs.existsSync(path.join(sourceRoot, relative))) fail(`Missing HORS NORME React source: ${relative}`);
}

const page = read(path.join(sourceRoot, 'src/app/page.tsx'));
const hero = read(path.join(sourceRoot, 'src/components/hero-section.tsx'));
const contact = read(path.join(sourceRoot, 'src/components/contact-form.tsx'));
const constants = read(path.join(sourceRoot, 'src/lib/constants.ts'));
const config = read(path.join(sourceRoot, 'next.config.ts'));

for (const component of ['<HeroSection />','<ProofSection />','<SeenOnStrip />','<VipJourney />','<ValueStack />','<PriceValueSection />','<ContactForm />']) {
  if (!page.includes(component)) fail(`Cursor landing composition missing: ${component}`);
}
if (!hero.includes('Une demi-journée.') || !hero.includes('3 mois de contenus.')) fail('Cursor hero copy is not preserved.');
if (!constants.includes(canonicalBookingUrl)) fail('HORS NORME React source does not use canonical Worker booking URL.');
if (constants.includes('https://media.neptunebusiness.com/reserver')) fail('Deprecated media-domain booking URL remains in React source.');
if (contact.includes('/api/leads')) fail('Demo-only Next lead endpoint remains active.');
if (!contact.includes('neptune_hors_norme_contact')) fail('HORS NORME contact context is not preserved before booking handoff.');
if (!config.includes('output: "export"') || !config.includes('basePath: "/hors-norme"')) fail('HORS NORME is not configured as a static React export under /hors-norme.');

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
console.log('HORS NORME React surface verified: Cursor composition, canonical booking handoff, static export and generated runtime are aligned.');
