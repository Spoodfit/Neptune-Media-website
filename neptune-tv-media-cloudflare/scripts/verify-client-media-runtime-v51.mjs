import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../src/entry-v11.js', import.meta.url), 'utf8');
const store = await readFile(new URL('../src/store-v7.js', import.meta.url), 'utf8');
const route = await readFile(new URL('../src/portal-client-media-v51.js', import.meta.url), 'utf8');
const youtube = await readFile(new URL('../src/portal-youtube-client-v52.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../public/espace-client/client-media-runtime-v51.js', import.meta.url), 'utf8');

const failures = [];
check(entry, "clientMediaTransport: 'authenticated-same-origin-drive-proxy-with-range-v1'", 'le transport média authentifié n’est pas déclaré');
check(entry, "youtubePublicationMatcher: 'channel-feed-and-exact-long-title-search-v2'", 'le rapprochement YouTube v2 n’est pas déclaré');
check(entry, '/espace-client/client-media-runtime-v51.js?v=1', 'le runtime média client n’est pas injecté');
check(store, "'/portal/session-media'", 'la session enrichie est absente du Store');
check(store, "'/portal/drive-token-set'", 'le stockage du jeton Drive est absent');
check(store, 'drive_file_id AS driveFileId', 'l’identifiant Drive n’est pas exposé à la session');
check(store, 'previewUrl:', 'l’URL de lecture authentifiée est absente');
check(route, "const DRIVE_TOKEN_PATH = '/api/webhooks/drive/access-token'", 'le relais OAuth Apps Script est absent');
check(route, 'www.googleapis.com/drive/v3/files', 'le proxy ne cible pas l’API Drive authentifiée');
check(route, "baseHeaders.set('Range', range)", 'le proxy Drive ne relaie pas les requêtes Range');
check(route, "authenticatedHeaders.set('Authorization'", 'l’authentification OAuth Drive n’est pas appliquée');
check(youtube, 'results?search_query=', 'la recherche exacte des titres longs est absente');
check(youtube, 'channel-feed-and-exact-long-title-search-v2', 'le contrat de rapprochement YouTube v2 est absent');
check(client, 'interceptMediaClick', 'la lecture par le proxy Neptune n’est pas activée');
check(client, 'renderBroadcastPublication', 'la diffusion YouTube n’est pas rendue dans le dashboard');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('OAuth Drive relay and exact-title YouTube client runtime contract passed.');

function check(content, needle, message) {
  if (!content.includes(needle)) failures.push(message);
}
