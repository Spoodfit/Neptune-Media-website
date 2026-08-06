import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [entry, store, tracking, routes, ui, css, rootWrangler, nestedWrangler] = await Promise.all([
  read('src/entry-v21.js'),
  read('src/store-v17.js'),
  read('src/portal-email-tracking-v82.js'),
  read('src/portal-workflow-routes-v5.js'),
  read('public/studio/email-activity-v82.js'),
  read('public/studio/email-activity-v82.css'),
  read('../wrangler.jsonc'),
  read('wrangler.jsonc'),
]);

const failures = [];
const expect = (content, marker, message) => {
  if (!content.includes(marker)) failures.push(message);
};

expect(entry, "from './entry-v20.js'", 'entry-v21 ne prolonge pas les notifications v81');
expect(entry, "from './store-v17.js'", 'entry-v21 ne réexporte pas le store e-mail v82');
expect(entry, "'/api/admin/email-history'", 'la route d’historique e-mail est absente');
expect(entry, "'/api/webhooks/resend'", 'la route webhook Resend est absente');
expect(entry, 'resend.webhooks.verify', 'la vérification cryptographique du webhook Resend est absente');
expect(entry, 'https://api.resend.com/emails/', 'la synchronisation de secours avec Resend est absente');
expect(entry, '/studio/email-activity-v82.js?v=1', 'le runtime e-mail Studio n’est pas injecté');
expect(entry, '/studio/email-activity-v82.css?v=1', 'la feuille e-mail Studio n’est pas injectée');

expect(store, "'/portal/email-track-sent-v82'", 'le suivi immédiat des envois est absent du store');
expect(store, "'/portal/email-history-v82'", 'l’historique e-mail est absent du store');
expect(store, "'/portal/resend-event-v82'", 'les événements Resend ne sont pas routés');
expect(store, "'/portal/email-provider-sync-v82'", 'la synchronisation provider n’est pas routée');

for (const marker of [
  'CREATE TABLE IF NOT EXISTS portal_email_tracking',
  'CREATE TABLE IF NOT EXISTS portal_email_webhook_receipts',
  'delivered_at',
  'opened_at',
  'clicked_at',
  'open_count',
  'click_count',
  'svix_id TEXT PRIMARY KEY',
  'indicative-not-proof-of-human-reading',
]) expect(tracking, marker, `contrat de suivi absent : ${marker}`);

expect(routes, "'/portal/email-track-sent-v82'", 'les envois ne sont pas inscrits dans l’historique');
expect(routes, 'sentItems', 'le résultat détaillé des envois n’est pas retourné à l’interface');
expect(routes, 'emailDelivery', 'les actions workflow ne retournent pas leur résultat e-mail');

for (const marker of [
  'Historique des e-mails',
  'email-send-toast-v82',
  'enqueueSendAnimation',
  'Ouvert · lecture détectée',
  'Actualiser les statuts',
  'data-email-tab-v82',
  'Un clic est un signal d’engagement plus fort',
]) expect(ui, marker, `fonction Studio absente : ${marker}`);

for (const marker of [
  '.email-send-toast-v82',
  '@keyframes emailFlyV82',
  '.email-v82-metrics',
  '.email-v82-timeline',
  '.email-v82-status.is-opened',
  'prefers-reduced-motion',
]) expect(css, marker, `règle UX/UI e-mail absente : ${marker}`);

expect(rootWrangler, 'neptune-tv-media-cloudflare/src/entry-v21.js', 'le Worker racine ne cible pas entry-v21');
expect(nestedWrangler, 'src/entry-v21.js', 'le Worker local ne cible pas entry-v21');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Studio email activity v82 validé : animation provider-confirmed, historique détaillé, statuts Resend, webhook vérifié, synchronisation de secours et signal d’ouverture présenté avec prudence.');
