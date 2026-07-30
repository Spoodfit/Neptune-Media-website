import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../src/entry-v11.js', import.meta.url), 'utf8');
const store = await readFile(new URL('../src/store-v7.js', import.meta.url), 'utf8');
const route = await readFile(new URL('../src/portal-client-media-v51.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../public/espace-client/client-media-runtime-v51.js', import.meta.url), 'utf8');

const failures = [];
check(entry, "clientMediaTransport: 'authenticated-same-origin-drive-proxy-with-range-v1'", 'le transport média authentifié n’est pas déclaré');
check(entry, "youtubePublicationDiscovery: 'public-channel-feed-client-title-matching-v1'", 'la découverte YouTube n’est pas déclarée');
check(entry, '/espace-client/client-media-runtime-v51.js?v=1', 'le runtime média client n’est pas injecté');
check(store, "'/portal/session-media'", 'la session enrichie est absente du Store');
check(store, 'drive_file_id AS driveFileId', 'l’identifiant Drive n’est pas exposé à la session');
check(store, 'previewUrl:', 'l’URL de lecture authentifiée est absente');
check(route, 'drive.usercontent.google.com/download', 'le proxy Drive ne cible pas le flux média');
check(route, "headers.set('Range', range)", 'le proxy Drive ne relaie pas les requêtes Range');
check(route, "'/api/client/youtube-publications'", 'la route YouTube client est absente');
check(client, 'interceptMediaClick', 'la lecture par le proxy Neptune n’est pas activée');
check(client, 'renderBroadcastPublication', 'la diffusion YouTube n’est pas rendue dans le dashboard');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Drive proxy and YouTube client runtime contract passed.');

function check(content, needle, message) {
  if (!content.includes(needle)) failures.push(message);
}
