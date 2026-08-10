import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [entryV24, entryCurrent, store, governor, rootWrangler, nestedWrangler] = await Promise.all([
  read('src/entry-v24.js'),
  read('src/entry-v25.js'),
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
expect(entryCurrent, "from './entry-v24.js'", 'entry-v25 ne prolonge pas le gouverneur e-mail v84');
expect(entryCurrent, "from './store-v21.js'", 'entry-v25 ne réexporte pas le store courant');
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

expect(rootWrangler, 'neptune-tv-media-cloudflare/src/entry-v25.js', 'le Worker racine ne cible pas le point d’entrée courant entry-v25');
expect(nestedWrangler, 'src/entry-v25.js', 'le Worker local ne cible pas le point d’entrée courant entry-v25');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Smart email governor v84 validé à travers entry-v25 : compte test protégé, cadence de 45 minutes, priorité selon état et suppression des messages obsolètes.');
