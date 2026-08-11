import { readFile } from 'node:fs/promises';

const files = {
  entry: await read('src/entry-v8.js'),
  release: await read('src/entry-v9.js'),
  runtime: await read('src/entry-v11.js'),
  editorialEntry: await read('src/entry-v12.js'),
  activeEntry: await read('src/entry-v13.js'),
  videoEntry: await read('src/entry-v16.js'),
  operationsEntry: await read('src/entry-v17.js'),
  clientDashboardEntry: await read('src/entry-v18.js'),
  passageEntry: await read('src/entry-v19.js'),
  clientDashboardCss: await read('public/espace-client/client-dashboard-clean-v78.css'),
  clientStore: await read('src/store-v14.js'),
  passageStore: await read('src/store-v15.js'),
  passageBackend: await read('src/portal-passage-admin-v80.js'),
  clientManagement: await read('src/portal-client-management-v76.js'),
  localConfig: await read('wrangler.jsonc'),
  rootConfig: await readRoot('wrangler.jsonc'),
  snapshot: await read('public/espace-client/content-snapshot-v48.js'),
  snapshotCss: await read('public/espace-client/content-snapshot-v48.css'),
  videosHtml: await read('public/espace-client/videos/index.html'),
  videos: await read('public/espace-client/videos/videos-compact-v3.js'),
  calendarHtml: await read('public/espace-client/calendrier/index.html'),
  calendar: await read('public/espace-client/calendrier/calendar-compact-v5.js'),
  studio: await read('public/studio/content-gallery-v76.js'),
  studioCss: await read('public/studio/content-gallery-v76.css'),
  studioOperations: await read('public/studio/studio-client-operations-v76.js'),
  passageUi: await read('public/studio/passage-editor-v80.js'),
  passageCss: await read('public/studio/passage-editor-v80.css'),
  mediaSafety: await read('public/assets/media-dialog-safety-v50.js'),
};

const failures = [];
check(files.localConfig, '"main": "src/entry-v19.js"', 'la configuration locale ne conserve pas le marqueur runtime passage entry-v19');
check(files.rootConfig, '"main": "neptune-tv-media-cloudflare/src/entry-v19.js"', 'la configuration racine ne conserve pas le marqueur runtime passage entry-v19');
check(files.passageEntry, "from './entry-v18.js'", 'entry-v19 ne prolonge pas le runtime client entry-v18');
check(files.passageEntry, "from './store-v15.js'", 'entry-v19 ne réexporte pas le store de modification des passages');
check(files.passageEntry, "'/api/admin/passage-update'", 'entry-v19 n’expose pas la modification complète du passage');
check(files.passageEntry, 'studioPassageEditor: RELEASE', 'entry-v19 ne déclare pas la fiche Passage v80');
check(files.passageStore, "from './store-v14.js'", 'store-v15 ne prolonge pas le store de contenu v14');
check(files.passageStore, "'/portal/admin-passage-update'", 'store-v15 ne route pas la mutation du passage');
check(files.passageBackend, 'expectedUpdatedAt', 'la protection anti-écrasement du passage est absente');
check(files.passageBackend, 'filming_before_preparation', 'la validation chronologique du passage est absente');
check(files.passageUi, 'Modifier le passage', 'l’action visible de modification du passage est absente');
check(files.passageUi, 'Rendez-vous de préparation', 'la date de préparation est absente de la fiche Passage');
check(files.passageUi, 'Date et heure du passage', 'la date de tournage est absente de la fiche Passage');
check(files.passageUi, 'Notifier le client', 'la notification client facultative est absente');
check(files.passageCss, '.passage-v80-form', 'la structure SaaS de la fiche Passage est absente');
check(files.passageCss, '.passage-v80-footer', 'la barre d’enregistrement du passage est absente');
check(files.clientDashboardEntry, "from './entry-v17.js'", 'entry-v18 ne prolonge pas le runtime Studio entry-v17');
check(files.clientDashboardEntry, "'/espace-client/client-dashboard-clean-v78.css?v=1'", 'entry-v18 n’injecte pas la feuille de correction client v78');
check(files.clientDashboardEntry, "clientDashboardFirstViewport: 'quick-actions-visible-without-duplicate-summary-v78'", 'entry-v18 ne déclare pas les actions rapides dans le premier écran');
check(files.clientDashboardEntry, "clientPreparationTheme: 'light-editorial-cards-and-dialog-v78'", 'entry-v18 ne déclare pas le thème clair de préparation');
check(files.clientDashboardCss, '.client-preparation-action-v77', 'la neutralisation du résumé de préparation dupliqué est absente');
check(files.clientDashboardCss, 'display: none !important', 'le résumé v77 dupliqué reste visible');
check(files.clientDashboardCss, 'align-items: start', 'la carte Dernière livraison peut encore s’étirer inutilement');
check(files.clientDashboardCss, '.hors-norme-card-visual-v77', 'la carte de préparation claire n’est pas stylée');
check(files.clientDashboardCss, 'linear-gradient(145deg, #ffffff 0%, #f5f6fb 100%)', 'le visuel des cartes HORS NORME reste sombre');
check(files.clientDashboardCss, '.hors-norme-dialog-visual-v77', 'la fenêtre de préparation claire n’est pas stylée');
check(files.operationsEntry, "from './entry-v16.js'", 'entry-v17 ne prolonge pas le runtime vidéo entry-v16');
check(files.operationsEntry, "from './store-v14.js'", 'entry-v17 ne réexporte pas le store de gestion clients');
check(files.operationsEntry, "studioPrimaryNavigation: ['Parcours clients', 'Diffusion', 'Réglages']", 'la navigation Studio à trois destinations n’est pas déclarée');
check(files.operationsEntry, "studioVideoProductionWorkspace: 'removed-external-editing-drive-sync-only'", 'la suppression de Production vidéo n’est pas déclarée');
check(files.operationsEntry, "'/api/admin/client-manage'", 'la route de gestion des comptes clients est absente');
check(files.operationsEntry, "'/studio/content-gallery-v76.js?v=1'", 'la galerie Studio v76 n’est pas injectée');
check(files.operationsEntry, "'/studio/studio-client-operations-v76.js?v=1'", 'le gestionnaire de comptes Studio v76 n’est pas injecté');
check(files.videoEntry, "from './entry-v13.js'", 'entry-v16 ne prolonge pas le runtime visuel entry-v13');
check(files.videoEntry, 'videoAiContainerRequired: false', 'entry-v16 exige encore un moteur Container pour le montage vidéo');
check(files.videoEntry, "videoAiEngineMode: 'persistent-local-service-with-browser-fallback'", 'entry-v16 ne confirme pas le service vidéo permanent');
check(files.videoEntry, 'videoAiSafeToCloseAfterUpload: true', 'entry-v16 ne confirme pas la poursuite après import');
check(files.videoEntry, "videoAiDispatchMode: 'localhost-persistent-sqlite-queue'", 'entry-v16 ne confirme pas la file locale persistante');
check(files.videoEntry, 'videoAiBrowserFallbackPresent: true', 'entry-v16 ne conserve pas le secours navigateur');
check(files.activeEntry, "from './entry-v12.js'", 'entry-v13 ne prolonge pas entry-v12');
check(files.editorialEntry, "from './entry-v11.js'", 'entry-v12 ne prolonge pas le runtime de contenu entry-v11');
forbid(files.localConfig, '"analytics_engine_datasets"', 'la configuration locale exige encore Analytics Engine');
forbid(files.rootConfig, '"analytics_engine_datasets"', 'la configuration racine exige encore Analytics Engine');
forbid(files.localConfig, '"VIDEO_JOBS"', 'la configuration locale réintroduit la Queue vidéo');
forbid(files.rootConfig, '"VIDEO_JOBS"', 'la configuration racine réintroduit la Queue vidéo');
forbid(files.localConfig, '"name": "VIDEO_PROCESSOR"', 'la configuration locale réintroduit le moteur vidéo Container');
forbid(files.rootConfig, '"name": "VIDEO_PROCESSOR"', 'la configuration racine réintroduit le moteur vidéo Container');
check(files.runtime, "from './store-v7.js'", 'le runtime final ne réexporte pas store-v7');
check(files.runtime, "workflowStore: 'store-v7'", 'le diagnostic final ne confirme pas store-v7');
checkAny(files.runtime, [
  'neptune-efficiency-operational-fallback-20260730-v11',
  'neptune-client-information-architecture-20260730-v62',
  'neptune-studio-sidebar-authority-20260730-v12',
], 'aucun identifiant de release entry-v11 compatible n’est présent');
check(files.runtime, "clientInformationArchitecture: 'three-primary-screens-home-content-publications-v62'", 'le diagnostic de l’architecture client active est absent');
check(files.runtime, "analyticsEngineBinding: 'optional-not-required-for-deployment'", 'Analytics Engine n’est pas déclaré optionnel');
check(files.runtime, "telemetryStorage: 'operational-sqlite-with-optional-analytics-engine'", 'le stockage opérationnel de secours n’est pas déclaré');
check(files.entry, '/espace-client/content-snapshot-v48.css?v=2', 'la feuille compacte du snapshot client n’est pas injectée');
check(files.entry, '/espace-client/content-snapshot-v48.js?v=4', 'la version à bandes horizontales du snapshot client n’est pas injectée');
check(files.entry, '/assets/media-dialog-safety-v50.js?v=1', 'la protection de fermeture des médias n’est pas injectée');
check(files.release, 'neptune-verified-content-runtime-20260730-v18', 'la release de contenu vérifiée v18 est absente');
check(files.release, "contentScrollModel: 'bounded-by-passage-horizontal-rails-and-pagination'", 'le diagnostic du modèle de scroll actuel est absent');
check(files.release, "clientVideoLibrary: 'passage-selector-horizontal-rails-4-long-8-short-v4'", 'le diagnostic de bibliothèque vidéo est obsolète');
check(files.snapshot, 'new MutationObserver', 'le snapshot ne surveille pas l’ouverture du dashboard après authentification');
check(files.snapshot, 'if (!dashboard || dashboard.hidden || snapshotInFlight) return;', 'le snapshot peut encore charger lorsque le dashboard est masqué');
check(files.snapshot, 'const SNAPSHOT_LIMITS = { long: 4, short: 4 };', 'les limites compactes du dashboard sont absentes');
check(files.snapshot, 'Voir les ${total} shorts', 'le raccourci vers la bibliothèque complète des shorts est absent');
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
check(files.studio, 'const PAGE_SIZE = 24;', 'la galerie Studio v76 n’est pas paginée à vingt-quatre éléments');
check(files.studio, 'observer?.disconnect()', 'l’observateur Studio v76 n’est pas suspendu pendant le rendu');
check(files.studio, 'if (!detailGrid) return;', 'la garde de rendu Studio v76 est absente');
check(files.studio, 'studio-upload-details', 'l’import manuel Studio v76 n’est pas replié');
check(files.studio, 'studio-content-search', 'la recherche dans la bibliothèque Studio est absente');
check(files.studio, 'data-studio-view', 'le changement grille/liste de la bibliothèque Studio est absent');
check(files.studio, 'thumbnailUrl', 'les miniatures Drive ne sont pas utilisées');
check(files.studioCss, '.studio-media-card--short .studio-media-preview', 'le ratio vertical des shorts est absent');
check(files.studioCss, '-webkit-line-clamp:2', 'les titres de contenus ne sont pas lisibles sur deux lignes');
check(files.studioOperations, 'data-client-edit', 'la modification des comptes clients est absente');
check(files.studioOperations, "data-client-action=\"${active ? 'archive' : 'activate'}\"", 'l’archivage et la réactivation des comptes sont absents');
check(files.studioOperations, 'data-client-delete-form', 'la suppression confirmée des comptes est absente');
check(files.studioOperations, 'studio-calendar-summary-v76', 'le résumé de lisibilité du calendrier Studio est absent');
check(files.clientStore, "'/portal/admin-client-manage'", 'le store ne route pas la gestion des comptes clients');
check(files.clientManagement, "const ACTIONS = new Set(['update', 'archive', 'activate', 'delete'])", 'les opérations de gestion client sont incomplètes');
check(files.clientManagement, "actor.role !== 'admin'", 'la suppression définitive n’est pas réservée aux administrateurs');
check(files.clientManagement, "driveFilesDeleted: false", 'la politique de conservation Google Drive est absente');
check(files.mediaSafety, "document.addEventListener('cancel'", 'la touche Échap peut encore contourner le nettoyage média');
check(files.mediaSafety, "frame.src = 'about:blank'", 'les lecteurs Drive ne sont pas arrêtés à la fermeture');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Verified active content chain and media library; Video AI remains local while Cloudflare Containers may be used exclusively by Web TV.');

async function read(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }
async function readRoot(path) { return readFile(new URL(`../../${path}`, import.meta.url), 'utf8'); }
function check(content, needle, message) { if (!content.includes(needle)) failures.push(message); }
function checkAny(content, needles, message) { if (!needles.some((needle) => content.includes(needle))) failures.push(message); }
function forbid(content, needle, message) { if (content.includes(needle)) failures.push(message); }
