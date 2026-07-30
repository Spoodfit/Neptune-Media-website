import { readFile } from 'node:fs/promises';

const files = {
  driveStore: await read('src/portal-drive.js'),
  driveRoutes: await read('src/portal-drive-routes.js'),
  driveEmail: await read('src/portal-drive-email.js'),
  store: await read('src/store-v5.js'),
  entry: await read('src/entry-v8.js'),
  release: await read('src/entry-v9.js'),
  clientUi: await read('public/espace-client/workflow-v45.js'),
  studioUi: await read('public/studio/drive-sync-v47.js'),
  appsScript: await read('integrations/google-drive/NeptuneDriveSync.gs'),
};

const failures = [];
check(files.driveStore, 'CREATE TABLE IF NOT EXISTS portal_drive_clients', 'table Drive client absente');
check(files.driveStore, 'CREATE TABLE IF NOT EXISTS portal_drive_passages', 'table Drive passage absente');
check(files.driveStore, 'CREATE TABLE IF NOT EXISTS portal_drive_events', 'journal idempotent Drive absent');
check(files.driveStore, 'UNIQUE(drive_file_id, modified_at)', 'déduplication fichier/version absente');
check(files.driveRoutes, '/api/webhooks/drive/sync-plan', 'route sync-plan absente');
check(files.driveRoutes, '/api/webhooks/drive/provisioned', 'route provisioned absente');
check(files.driveRoutes, '/api/webhooks/drive/files', 'route files absente');
check(files.driveRoutes, 'X-Neptune-Drive-Secret', 'en-tête secret Drive absent');
check(files.driveRoutes, 'drive_delivery_email_failed', 'retry e-mail Drive absent');
check(files.driveEmail, 'Voir mes contenus', 'CTA e-mail livraison compact absent');
check(files.driveEmail, 'deliveryIdempotencyKey(payload.orderId, summary)', 'signature d’idempotence de bibliothèque absente');
check(files.driveEmail, 'summary.latestContentAt', 'date de dernière version absente de l’idempotence');
check(files.store, "'/portal/drive-sync-plan'", 'store ne route pas le plan Drive');
check(files.entry, 'handleDriveRoute', 'Worker ne charge pas les routes Drive');
check(files.entry, '/studio/drive-sync-v47.js?v=2', 'version corrigée de l’interface Studio Drive non injectée');
check(files.release, 'driveSecretPresent', 'diagnostic secret Drive absent');
check(files.release, 'client/passage/long-and-shorts', 'architecture Drive absente du diagnostic');
check(files.release, 'studioDriveObserver', 'diagnostic de protection anti-boucle absent');
check(files.clientUi, 'clientDriveDeliveries', 'livraisons Drive absentes de l’espace client');
check(files.studioUi, 'studioDrivePanel', 'suivi Drive absent du Studio');
check(files.studioUi, 'driveObserver?.disconnect()', 'observateur Studio non suspendu pendant le rendu');
check(files.studioUi, 'driveRenderKey', 'rendu Studio Drive non idempotent');
check(files.studioUi, 'requestAnimationFrame', 'rafraîchissement DOM Studio non limité par frame');
forbid(files.studioUi, 'new MutationObserver(decorateDriveUi)', 'boucle MutationObserver directe réintroduite');
check(files.appsScript, 'installerSynchronisationDrive', 'installateur Apps Script absent');
check(files.appsScript, 'everyMinutes(5)', 'déclencheur Drive 5 minutes absent');
check(files.appsScript, 'sendNotificationEmail=false', 'partage silencieux Drive absent');

try {
  new Function(files.appsScript);
} catch (error) {
  failures.push(`Apps Script invalide : ${error.message}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Google Drive delivery synchronization contract passed.');

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function check(content, needle, message) {
  if (!content.includes(needle)) failures.push(message);
}

function forbid(content, needle, message) {
  if (content.includes(needle)) failures.push(message);
}
