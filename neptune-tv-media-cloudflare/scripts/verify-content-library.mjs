import { readFile } from 'node:fs/promises';

const files = {
  entry: await read('src/entry-v8.js'),
  release: await read('src/entry-v9.js'),
  runtime: await read('src/entry-v11.js'),
  localConfig: await read('wrangler.jsonc'),
  rootConfig: await readRoot('wrangler.jsonc'),
  snapshot: await read('public/espace-client/content-snapshot-v48.js'),
  snapshotCss: await read('public/espace-client/content-snapshot-v48.css'),
  videosHtml: await read('public/espace-client/videos/index.html'),
  videos: await read('public/espace-client/videos/videos-compact-v3.js'),
  calendarHtml: await read('public/espace-client/calendrier/index.html'),
  calendar: await read('public/espace-client/calendrier/calendar-compact-v5.js'),
  studio: await read('public/studio/content-gallery-v49.js'),
  mediaSafety: await read('public/assets/media-dialog-safety-v50.js'),
};

const failures = [];
check(files.localConfig, '"main": "src/entry-v11.js"', 'la configuration locale ne cible pas entry-v11');
check(files.rootConfig, '"main": "neptune-tv-media-cloudflare/src/entry-v11.js"', 'la configuration racine ne cible pas entry-v11');
forbid(files.localConfig, '"analytics_engine_datasets"', 'la configuration locale exige encore Analytics Engine');
forbid(files.rootConfig, '"analytics_engine_datasets"', 'la configuration racine exige encore Analytics Engine');
check(files.runtime, "from './store-v7.js'", 'le runtime final ne réexporte pas store-v7');
check(files.runtime, "workflowStore: 'store-v7'", 'le diagnostic final ne confirme pas store-v7');
check(files.runtime, 'neptune-efficiency-operational-fallback-20260730-v5', 'la release fallback v5 est absente');
check(files.runtime, "analyticsEngineBinding: 'optional-not-required-for-deployment'", 'Analytics Engine n’est pas déclaré optionnel');
check(files.runtime, "telemetryStorage: 'operational-sqlite-with-optional-analytics-engine'", 'le stockage opérationnel de secours n’est pas déclaré');
check(files.entry, '/espace-client/content-snapshot-v48.css?v=2', 'la feuille compacte du snapshot client n’est pas injectée');
check(files.entry, '/espace-client/content-snapshot-v48.js?v=4', 'la version à bandes horizontales du snapshot client n’est pas injectée');
check(files.entry, '/studio/content-gallery-v49.js?v=1', 'la galerie Studio n’est pas injectée');
check(files.entry, '/assets/media-dialog-safety-v50.js?v=1', 'la protection de fermeture des médias n’est pas injectée');
check(files.release, 'neptune-verified-content-runtime-20260730-v18', 'la release de contenu vérifiée v18 est absente');
check(files.release, "contentScrollModel: 'bounded-by-passage-horizontal-rails-and-pagination'", 'le diagnostic du modèle de scroll actuel est absent');
check(files.release, "clientVideoLibrary: 'passage-selector-horizontal-rails-4-long-8-short-v4'", 'le diagnostic de bibliothèque vidéo est obsolète');
check(files.snapshot, 'new MutationObserver', 'le snapshot ne surveille pas l’ouverture du dashboard après authentification');
check(files.snapshot, 'if (!dashboard || dashboard.hidden || snapshotInFlight) return;', 'le snapshot peut encore charger lorsque le dashboard est masqué');
check(files.snapshot, 'const SNAPSHOT_LIMITS = { long: 4, short: 8 };', 'les limites compactes du dashboard sont absentes');
check(files.snapshot, "renderRail(longFiles, 'long', SNAPSHOT_LIMITS.long)", 'les émissions ne sont pas rendues en bande horizontale');
check(files.snapshot, "renderRail(shortFiles, 'short', SNAPSHOT_LIMITS.short)", 'les shorts ne sont pas rendus en bande horizontale');
check(files.snapshot, 'snapshot-rail-more', 'la carte Voir plus en fin de bande est absente');
check(files.snapshot, 'snapshotSignature', 'le snapshot est rerendu sans empreinte stable');
check(files.snapshotCss, '.client-drive-deliveries{display:none!important}', 'l’ancienne liste client n’est pas retirée');
check(files.snapshotCss, '.snapshot-rail{display:flex', 'les contenus du dashboard ne sont pas disposés en bandes');
check(files.snapshotCss, 'overflow-x:auto', 'les bandes du dashboard ne défilent pas horizontalement');
check(files.videosHtml, '/espace-client/videos/videos-compact-v3.js?v=3', 'la bibliothèque vidéo active n’est pas chargée');
check(files.videosHtml, '/assets/media-dialog-safety-v50.js?v=1', 'la bibliothèque vidéo ne charge pas la protection de fermeture');
check(files.videos, 'const INITIAL_LIMITS = { final: 4, short: 8 };', 'les limites initiales des bandes vidéo sont absentes');
check(files.videos, 'data-toggle-media', 'l’action Voir plus des bandes vidéo est absente');
check(files.videos, 'passage-selector', 'le sélecteur de passage vidéo est absent');
check(files.calendarHtml, '/espace-client/calendrier/calendar-compact-v5.js?v=1', 'la bibliothèque calendrier compacte n’est pas chargée');
check(files.calendar, 'const PAGE_SIZE=8', 'la bibliothèque des shorts n’est pas paginée à huit éléments');
check(files.calendar, 'observer?.disconnect()', 'l’observateur calendrier n’est pas suspendu pendant le rendu');
check(files.studio, 'const PAGE_SIZE=8', 'la galerie Studio n’est pas paginée à huit éléments');
check(files.studio, 'observer?.disconnect()', 'l’observateur Studio n’est pas suspendu pendant le rendu');
check(files.studio, "if(!detailGrid)return", 'la garde de rendu Studio est absente');
check(files.studio, 'studio-upload-details', 'l’import manuel Studio n’est pas replié');
check(files.mediaSafety, "document.addEventListener('cancel'", 'la touche Échap peut encore contourner le nettoyage média');
check(files.mediaSafety, "frame.src = 'about:blank'", 'les lecteurs Drive ne sont pas arrêtés à la fermeture');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Verified compact horizontal dashboard rails and bounded content runtime passed.');

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function readRoot(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function check(content, needle, message) {
  if (!content.includes(needle)) failures.push(message);
}

function forbid(content, needle, message) {
  if (content.includes(needle)) failures.push(message);
}
