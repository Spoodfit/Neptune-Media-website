import { readFile } from 'node:fs/promises';

const files = {
  entry: await read('src/entry-v8.js'),
  release: await read('src/entry-v9.js'),
  snapshot: await read('public/espace-client/content-snapshot-v48.js'),
  snapshotCss: await read('public/espace-client/content-snapshot-v48.css'),
  videosHtml: await read('public/espace-client/videos/index.html'),
  videos: await read('public/espace-client/videos/videos-compact-v3.js'),
  calendarHtml: await read('public/espace-client/calendrier/index.html'),
  calendar: await read('public/espace-client/calendrier/calendar-compact-v5.js'),
  studio: await read('public/studio/content-gallery-v49.js'),
};

const failures = [];
check(files.entry, '/espace-client/content-snapshot-v48.js', 'snapshot client non injecté');
check(files.entry, '/studio/content-gallery-v49.js', 'galerie Studio non injectée');
check(files.release, 'neptune-visual-content-library-20260725-v17', 'release v17 absente');
check(files.release, "contentScrollModel: 'bounded-by-passage-filter-and-page'", 'diagnostic de scroll borné absent');
check(files.snapshot, 'shortFiles.slice(0,4)', 'snapshot client non limité à quatre shorts');
check(files.snapshotCss, '.client-drive-deliveries{display:none!important}', 'ancienne liste client non retirée');
check(files.videosHtml, '/espace-client/videos/videos-compact-v3.js?v=', 'bibliothèque vidéo compacte non chargée');
check(files.videos, 'const INITIAL_LIMITS = { final: 4, short: 8 };', 'limites initiales des bandes vidéo absentes');
check(files.videos, 'data-toggle-media', 'action Voir plus des bandes vidéo absente');
check(files.videos, 'passage-selector', 'sélecteur de passage vidéo absent');
check(files.calendarHtml, '/espace-client/calendrier/calendar-compact-v5.js?v=', 'bibliothèque calendrier compacte non chargée');
check(files.calendar, 'const PAGE_SIZE=8', 'bibliothèque des shorts non paginée à huit éléments');
check(files.calendar, 'observer?.disconnect()', 'observateur calendrier non suspendu pendant le rendu');
check(files.studio, 'const PAGE_SIZE=8', 'galerie Studio non paginée à huit éléments');
check(files.studio, 'observer?.disconnect()', 'observateur Studio non suspendu pendant le rendu');
check(files.studio, "if(!detailGrid)return", 'garde de rendu Studio absente');
check(files.studio, 'studio-upload-details', 'import manuel Studio non replié');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Bounded visual content library contract passed.');

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function check(content, needle, message) {
  if (!content.includes(needle)) failures.push(message);
}
