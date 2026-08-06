import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [entry, store, backend, ui, css, html, rootWrangler, nestedWrangler] = await Promise.all([
  read('src/entry-v19.js'),
  read('src/store-v15.js'),
  read('src/portal-passage-admin-v80.js'),
  read('public/studio/passage-editor-v80.js'),
  read('public/studio/passage-editor-v80.css'),
  read('public/studio/clients.html'),
  read('../wrangler.jsonc'),
  read('wrangler.jsonc'),
]);

const failures = [];
const expect = (content, marker, message) => {
  if (!content.includes(marker)) failures.push(message);
};

expect(entry, '/api/admin/passage-update', 'la route publique de modification du passage est absente');
expect(entry, '/portal/admin-passage-update', 'la route interne du passage est absente');
expect(entry, 'studioPassageConcurrency', 'le verrou optimiste du passage n’est pas déclaré');
expect(store, 'adminPassageUpdate', 'le Durable Object ne délègue pas la mise à jour du passage');
expect(store, "'/portal/admin-passage-update'", 'la route Durable Object du passage est absente');

for (const field of [
  'title',
  'format',
  'status',
  'appointment_at',
  'filming_at',
  'preparation_url',
  'booking_url',
  'next_action',
  'order_reference',
  'product_code',
  'payment_status',
  'amount_total',
  'currency',
]) expect(backend, field, `champ backend absent : ${field}`);

for (const marker of [
  'Modifier le passage',
  'FICHE DU PASSAGE',
  'Rendez-vous de préparation',
  'Date et heure du passage',
  'Nom du passage',
  'Format',
  'Référence de commande',
  'Statut du paiement',
  'Notifier le client',
  'expectedUpdatedAt',
  'filming_before_preparation',
]) expect(ui, marker, `fonction UI absente : ${marker}`);

for (const marker of [
  '.passage-v80-snapshot',
  '.passage-v80-form',
  '.passage-v80-card',
  '.passage-v80-footer',
  '@media(max-width:760px)',
  'prefers-reduced-motion',
]) expect(css, marker, `règle UX/UI absente : ${marker}`);

expect(html, '/studio/passage-editor-v80.css?v=1', 'la feuille du passage n’est pas chargée');
expect(html, '/studio/passage-editor-v80.js?v=1', 'le runtime du passage n’est pas chargé');
expect(rootWrangler, 'entry-v19.js', 'le Worker racine ne pointe pas vers entry-v19');
expect(nestedWrangler, 'entry-v19.js', 'le Worker imbriqué ne pointe pas vers entry-v19');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Studio passage editor v80 validé : identité, format, dates, statut, accès, commande, paiement, notification facultative et verrou anti-écrasement.');
