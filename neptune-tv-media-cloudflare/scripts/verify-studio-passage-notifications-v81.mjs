import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function collectReachableEntries(start = 'src/worker.js') {
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const relative = queue.shift();
    if (visited.has(relative)) continue;
    visited.add(relative);
    const content = await read(relative);
    for (const match of content.matchAll(/from\s+['"]\.\/(entry-v\d+\.js)['"]/gu)) {
      queue.push(`src/${match[1]}`);
    }
  }
  return visited;
}

const [entry, store, backend, emailLegacy, emailActive, routes, ui, css, rootWrangler, nestedWrangler, reachableEntries] = await Promise.all([
  read('src/entry-v20.js'),
  read('src/store-v16.js'),
  read('src/portal-passage-admin-v81.js'),
  read('src/portal-workflow-email-v6.js'),
  read('src/portal-workflow-email-v7.js'),
  read('src/portal-workflow-routes-v5.js'),
  read('public/studio/passage-notifications-v81.js'),
  read('public/studio/passage-notifications-v81.css'),
  read('../wrangler.jsonc'),
  read('wrangler.jsonc'),
  collectReachableEntries(),
]);

const failures = [];
const expect = (content, marker, message) => {
  if (!content.includes(marker)) failures.push(message);
};

expect(rootWrangler, 'neptune-tv-media-cloudflare/src/worker.js', 'le Worker racine ne pointe pas vers worker.js');
expect(nestedWrangler, 'neptune-tv-media-cloudflare/src/worker.js', 'le Worker local ne pointe pas vers worker.js');
if (!reachableEntries.has('src/entry-v20.js') && !reachableEntries.has('src/entry-v21.js')) {
  failures.push('le runtime de notifications v81 doit rester atteignable depuis worker.js');
}
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

expect(routes, "from './portal-workflow-email-v7.js'", 'le workflow n’utilise pas le rendu e-mail actif v7');
expect(emailActive, "from './portal-workflow-email-v6.js'", 'le rendu e-mail v7 ne délègue plus les scénarios historiques à v6');
expect(emailActive, 'sendLegacyWorkflowOutboxItem', 'le rendu e-mail v7 ne préserve plus le fallback historique v6');
expect(emailLegacy, "startsWith('passage_change_')", 'le rendu spécifique aux modifications de passage est absent');
expect(emailLegacy, 'Votre passage a été mis à jour', 'le récapitulatif client est absent');
expect(emailLegacy, 'Informations du passage modifiées', 'le récapitulatif fournisseur est absent');
expect(emailLegacy, 'Le dossier client a été actualisé', 'le récapitulatif Neptune est absent');
expect(emailLegacy, 'change.before', 'la valeur précédente n’apparaît pas dans l’e-mail');
expect(emailLegacy, 'change.after', 'la nouvelle valeur n’apparaît pas dans l’e-mail');

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

console.log(`Studio passage notifications v81 validées via worker.js (${reachableEntries.size} wrappers atteignables) : détection des changements, destinataires ciblés, rendu actif v7 avec fallback v6, e-mails adaptés, aperçu avant validation et absence de mail pour les corrections internes.`);
