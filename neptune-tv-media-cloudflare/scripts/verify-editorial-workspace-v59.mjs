import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { generateEditorialProposals } from '../src/portal-editorial-ai-v2.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [wrangler, entry, routes, store, ui, css, workflow] = await Promise.all([
  read('../wrangler.jsonc'),
  read('src/entry-v12.js'),
  read('src/portal-editorial-routes-v2.js'),
  read('src/store-v8.js'),
  read('public/assets/neptune-editorial-workspace-v59.js'),
  read('public/assets/neptune-editorial-workspace-v59.css'),
  read('../.github/workflows/deploy-cloudflare.yml'),
]);

assert.match(wrangler, /"main"\s*:\s*"neptune-tv-media-cloudflare\/src\/entry-v(?:13|14|15|16|17)\.js"/u);
assert.match(wrangler, /"AI_MODEL"\s*:\s*"@cf\/openai\/gpt-oss-120b"/u);

assert.match(entry, /neptune-editorial-workspace-20260730-v2/u);
assert.match(entry, /editorialProposals:\s*3/u);
assert.match(entry, /single-draft-upsert-no-write-on-navigation/u);
assert.match(entry, /neptune-editorial-workspace-v59\.css/u);
assert.match(entry, /neptune-editorial-workspace-v59\.js/u);

for (const route of [
  '/api/client/editorial/context',
  '/api/client/editorial/generate',
  '/api/client/editorial/select',
  '/api/client/editorial/publish',
  '/api/client/content-calendar/reuse',
]) assert.ok(routes.includes(route), `Route manquante : ${route}`);
assert.match(routes, /cached\s*&&\s*payload\.force\s*!==\s*true/u);
assert.match(routes, /generateEditorialProposals/u);

assert.match(store, /CREATE TABLE IF NOT EXISTS portal_editorial_drafts/u);
assert.match(store, /PRIMARY KEY\(scope_type,scope_id\)/u);
assert.match(store, /ON CONFLICT\(scope_type,scope_id\) DO UPDATE/u);
assert.match(store, /new Set\(\['instagram', 'linkedin', 'tiktok', 'youtube'\]\)/u);
assert.match(store, /hashtags\.length < 3/u);
assert.match(store, /status='ready'/u);

for (const marker of [
  'NEPTUNE IA · PUBLICATION EXPRESS',
  'Préparer le post',
  'Choisissez l’angle le plus juste.',
  'Enregistrer la version retenue',
  'Copier le post',
  'Télécharger la vidéo',
  'publishExpress',
  'Créer la nouvelle utilisation',
]) assert.ok(ui.includes(marker), `Marqueur UI manquant : ${marker}`);
assert.match(ui, /document\.addEventListener\('click', interceptEditorialOpen, true\)/u);
assert.match(ui, /navigator\.clipboard/u);
assert.match(ui, /triggerDownload/u);
assert.match(ui, /window\.open\('about:blank', '_blank'\)/u);

assert.match(css, /\.neptune-editorial-panel/u);
assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/u);
assert.match(css, /@media \(max-width:680px\)/u);
assert.match(css, /prefers-reduced-motion/u);

assert.match(workflow, /EDITORIAL_RELEASE: neptune-editorial-workspace-20260730-v2/u);
assert.match(workflow, /neptune-editorial-workspace-v59\.js/u);
assert.match(workflow, /publishExpress/u);

const generated = await generateEditorialProposals({}, {
  filename: 'Arretez de trop reflechir, passez a action.mp4',
  company: 'Entreprise test',
  orderTitle: 'Passage Neptune Media',
});

assert.equal(generated.proposals.length, 3);
assert.deepEqual(generated.proposals.map((item) => item.angle), [
  'direct',
  'humoristique',
  'professionnel_conversationnel',
]);
for (const proposal of generated.proposals) {
  assert.ok(proposal.hook);
  assert.ok(proposal.description);
  assert.match(proposal.cta, /\?$/u);
  assert.ok(proposal.hashtags.length >= 3 && proposal.hashtags.length <= 6);
  assert.ok(proposal.fullPost.includes(proposal.hook));
}

console.log('Editorial workspace v59 verified: 3 proposals, selection, persistence, copy, download, express publishing and reuse.');
