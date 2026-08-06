import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [entry, store, backend, email, routes, ui, css, rootWrangler, nestedWrangler] = await Promise.all([
  read('src/entry-v20.js'),
  read('src/store-v16.js'),
  read('src/portal-passage-admin-v81.js'),
  read('src/portal-workflow-email-v6.js'),
  read('src/portal-workflow-routes-v5.js'),
  read('public/studio/passage-notifications-v81.js'),
  read('public/studio/passage-notifications-v81.css'),
  read('../wrangler.jsonc'),
  read('wrangler.jsonc'),
]);

const failures = [];
const expect = (content, marker, message) => {
  if (!content.includes(marker)) failures.push(message);
};
const expectAny = (content, markers, message) => {
  if (!markers.some((marker) => content.includes(marker))) failures.push(message);
};

expectAny(rootWrangler, [
  'neptune-tv-media-cloudflare/src/entry-v20.js',
  'neptune-tv-media-cloudflare/src/entry-v21.js',
], 'le Worker racine ne prolonge pas le runtime de notifications v81');
expectAny(nestedWrangler, [
  'src/entry-v20.js',
  'src/entry-v21.js',
], 'le Worker local ne prolonge pas le runtime de notifications v81');
expect(entry, '/portal/admin-passage-update-v81', 'la route v81 du passage est absente');
expect(entry, 'flushWorkflowOutbox', 'les notifications ne sont pas envoyées immédiatement');
expect(entry, 'automatic-by-changed-field-v81', 'le mode de notification intelligent n’est pas déclaré');
expect(entry, 'passage-notifications-v81.js', 'l’aperçu des destinataires n’est pas injecté');
expect(store, 'requireOperator', 'la mutation v81 n’est pas protégée par un rôle opérateur');
expect(store, 'adminPassageUpdateV81', 'le store ne délègue pas au moteur v81');

for (const marker of [
  'detectChanges',
  'buildNotificationPlan',
  "change.field === 'appointmentAt'",
  "['filmingAt', 'format']",
  "change.field === 'paymentStatus'",
  'queueEmail',
  'notificationsQueued',
  'internalOnly',
  'Studio fournisseur',
  'Neptune / organisateur',
]) expect(backend, marker, `contrat backend absent : ${marker}`);

expect(routes, "from './portal-workflow-email-v6.js'", 'le workflow n’utilise pas le rendu e-mail v6');
expect(email, "startsWith('passage_change_')", 'le rendu spécifique aux modifications de passage est absent');
expect(email, 'Votre passage a été mis à jour', 'le récapitulatif client est absent');
expect(email, 'Informations du passage modifiées', 'le récapitulatif fournisseur est absent');
expect(email, 'Le dossier client a été actualisé', 'le récapitulatif Neptune est absent');
expect(email, 'change.before', 'la valeur précédente n’apparaît pas dans l’e-mail');
expect(email, 'change.after', 'la nouvelle valeur n’apparaît pas dans l’e-mail');

for (const marker of [
  'Notifications envoyées automatiquement après l’enregistrement',
  'Correction interne',
  'Studio fournisseur',
  'Neptune / organisateur',
  'patchFetch',
  'emailDelivery',
]) expect(ui, marker, `fonction UI de notification absente : ${marker}`);

expect(css, '.passage-v81-notification-preview', 'le panneau de notification n’est pas stylé');
expect(css, '.passage-v81-recipient-chips', 'les destinataires ne sont pas lisibles');
expect(css, 'prefers-reduced-motion', 'la préférence de réduction des animations est ignorée');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Studio passage notifications v81 validées : détection des changements, destinataires ciblés, e-mails adaptés, aperçu avant validation et absence de mail pour les corrections internes.');
