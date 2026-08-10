import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [entryV24, entryV25, entryV26, entryV27, entryV28, entryV29, entryV30, entryV31, store, governor, rootWrangler, nestedWrangler] = await Promise.all([
  read('src/entry-v24.js'),
  read('src/entry-v25.js'),
  read('src/entry-v26.js'),
  read('src/entry-v27.js'),
  read('src/entry-v28.js'),
  read('src/entry-v29.js'),
  read('src/entry-v30.js'),
  read('src/entry-v31.js'),
  read('src/store-v20.js'),
  read('src/portal-notification-governor-v84.js'),
  read('../wrangler.jsonc'),
  read('wrangler.jsonc'),
]);

const failures = [];
const expect = (content, marker, message) => {
  if (!content.includes(marker)) failures.push(message);
};

expect(entryV24, "from './entry-v21.js'", 'entry-v24 ne prolonge pas le suivi e-mail v82');
expect(entryV24, "from './store-v20.js'", 'entry-v24 ne réexporte pas le store v84');
expect(entryV24, 'supplier-emails-rerouted-to-contact-neptunebusiness-com-v84', 'la protection du compte test n’est pas déclarée');
expect(entryV24, 'one-useful-email-per-recipient-context-every-45-minutes-v84', 'la cadence intelligente n’est pas déclarée');
expect(entryV25, "from './entry-v24.js'", 'entry-v25 ne prolonge pas le gouverneur e-mail v84');
expect(entryV25, "from './store-v21.js'", 'entry-v25 ne réexporte pas le store v85');
expect(entryV26, "from './entry-v25.js'", 'entry-v26 ne prolonge pas la chaîne v85/v84');
expect(entryV27, "from './entry-v26.js'", 'entry-v27 ne prolonge pas le CRM v86');
expect(entryV28, "from './entry-v27.js'", 'entry-v28 ne prolonge pas la chaîne complète v86');
expect(entryV29, "from './entry-v28.js'", 'entry-v29 ne prolonge pas Stripe v90');
expect(entryV30, "from './entry-v29.js'", 'entry-v30 ne prolonge pas la chaîne v90 sans casser v84');
expect(entryV31, "from './entry-v30.js'", 'entry-v31 ne prolonge pas la chaîne v91/v90 sans casser v84');
expect(store, "url.pathname === '/portal/workflow-email-due'", 'le gouverneur n’intercepte pas la file d’envoi');
expect(store, 'smartWorkflowEmailDue', 'le sélecteur intelligent n’est pas appelé');

for (const marker of [
  "TEST_CLIENT_EMAIL = 'contact@neptunebusiness.com'",
  'NOTIFICATION_COOLDOWN_MINUTES = 45',
  "row.recipientType === 'supplier'",
  "return `test-client:${TEST_CLIENT_EMAIL}`",
  'classify(row)',
  'isRelevant(row, intent)',
  'markSuperseded',
  'recipient_cooldown',
  'waiting_for_previous_message',
  "status='superseded'",
]) expect(governor, marker, `contrat du gouverneur absent : ${marker}`);

expect(rootWrangler, 'neptune-tv-media-cloudflare/src/entry-v31.js', 'le Worker racine ne cible pas entry-v31');
expect(nestedWrangler, 'src/entry-v31.js', 'le Worker local ne cible pas entry-v31');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Smart email governor v84 préservé à travers entry-v31 : compte test protégé, cadence de 45 minutes, priorité selon état et suppression des messages obsolètes.');
