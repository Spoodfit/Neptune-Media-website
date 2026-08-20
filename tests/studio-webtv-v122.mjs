import fs from 'node:fs/promises';

const root='neptune-tv-media-cloudflare';
const read=path=>fs.readFile(`${root}/${path}`,'utf8');
const [overviewJs,overviewCss,catalogJs,catalogCss,webtvJs,webtvCss,analytics,entry,advanced,webtv,wrangler]=await Promise.all([
  read('public/studio/studio-overview-v122.js'),
  read('public/studio/studio-overview-v122.css'),
  read('public/studio/studio-catalog-cockpit-v131.js'),
  read('public/studio/studio-catalog-cockpit-v131.css'),
  read('public/studio/webtv-control-room-v122.js'),
  read('public/studio/webtv-control-room-v122.css'),
  read('public/direct/webtv-analytics-v122.js'),
  read('src/entry-v40.js'),
  read('public/studio/advanced.html'),
  read('public/studio/webtv.html'),
  read('wrangler.jsonc'),
]);

const checks=[];
const expect=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message);};

for(const label of ['Parcours clients','Diffusion','Catalogue Média','Finance','Réglage'])expect(overviewJs.includes(label),`navigation v122 contient ${label}`);
expect(overviewJs.includes('neptune-studio-nav-link'),'navigation v122 conserve le contrat DOM canonique');
expect(!overviewJs.includes('data-studio-route="${key}"'),'navigation v122 n’est plus pilotable par l’ancien contrôleur de routes');
expect(overviewCss.includes('.studio-context-nav-v65{display:none!important}'),'ancienne rangée de sous-onglets masquée');

expect(catalogCss.includes('body.v131-catalog-cockpit .content')&&catalogCss.includes('overflow:hidden!important'),'Catalogue Média utilise un cockpit desktop sans scroll global');
expect(catalogCss.includes('#content .c98-layout{display:none!important'),'CRUD historique masqué par défaut');
expect(catalogCss.includes('v131-admin-open #content .c98-layout{display:block!important'),'CRUD historique réactivable à la demande');
expect(catalogCss.includes('#content .c98-hero')&&catalogCss.includes('#content .c98-tabs'),'ancien hero et ancienne navigation Catalogue retirés de la vue principale');
expect(catalogCss.includes('.v131-table')&&catalogCss.includes('.v131-elements-grid'),'cockpit expose vue globale et éléments du catalogue');
expect(catalogJs.includes("const RELEASE='neptune-studio-catalog-cockpit-20260820-v131'"),'release cockpit v131 active');
for(const label of ['Vue d’ensemble','Offres','Éléments du catalogue'])expect(catalogJs.includes(label),`cockpit v131 contient ${label}`);
expect(catalogJs.includes('Ville</th><th>Offre</th><th>Fournisseur')&&catalogJs.includes('<th>Coût</th><th>Prix client</th><th>État</th>'),'vue d’ensemble rapproche les données métier dans une ligne');
expect(catalogJs.includes("elementCard('formats','Concepts'")&&catalogJs.includes("elementCard('suppliers','Fournisseurs'")&&catalogJs.includes("elementCard('configurations','Configurations'")&&catalogJs.includes("elementCard('cities','Villes'"),'éléments réutilisables regroupés dans une seule vue');
expect(catalogJs.includes('/api/admin/media-catalog-v98/context'),'cockpit réutilise la source de vérité Studio');
expect(catalogJs.includes('openLegacy')&&catalogJs.includes('← Retour au catalogue'),'édition détaillée reste disponible sans seconde source de vérité');
expect(advanced.includes('/studio/studio-catalog-cockpit-v131.css?v=1')&&advanced.includes('/studio/studio-catalog-cockpit-v131.js?v=1'),'advanced charge le cockpit canonique v131');
expect(!advanced.includes('/studio/studio-catalog-runtime-v130.js')&&!advanced.includes('/studio/studio-catalog-visibility-v130-1.js'),'anciens runtimes v130 retirés du shell statique');
expect(overviewCss.includes('.v122-overview-grid'),'réglages disposent d’une vue d’ensemble compacte');

for(const contract of ['Synchroniser les émissions','Activer la chaîne H24','Copier le code d’intégration','Bibliothèque Cloudflare','Performance mesurée sur le direct Neptune'])expect(webtvJs.includes(contract),`WebTV contient ${contract}`);
expect(webtvJs.includes("api('/api/admin/webtv/state'"),'WebTV charge le vrai contrôle Cloudflare');
expect(webtvJs.includes("method:'PUT'"),'WebTV publie le vrai état antenne par PUT');
expect(webtvJs.includes('synchronizeEpisodes'),'synchronisation Cloudflare non destructive présente');
expect(webtvJs.includes('sameMedia'),'déduplication des émissions par média présente');
expect(webtvJs.includes('studio.stats?.webTv'),'régie affiche uniquement les statistiques WebTV');
expect(webtvCss.includes('.v122-source-rail'),'bibliothèque Cloudflare compacte et horizontale');
expect(webtv.includes('/studio/webtv-control-room-v122.js?v=1'),'régie charge v122 à la source');

for(const event of ["trackVideo('view'","trackVideo('play'","trackVideo('watch'","trackVideo('booking_click'","trackAd('impression'"])expect(analytics.includes(event),`analytics WebTV mesure ${event}`);
expect(analytics.includes("'/api/public/webtv/state'"),'analytics suit le programme réellement à l’antenne');
expect(analytics.includes("'/api/public/catalog'"),'analytics rapproche l’antenne du catalogue d’émissions');
expect(analytics.includes("send('/api/track'"),'analytics réutilise le moteur Neptune existant');
expect(analytics.includes('webtv:${crypto.randomUUID()}'),'sessions WebTV identifiables sans nouvelle table');

for(const asset of ['studio-overview-v122.js','studio-overview-v122.css','webtv-control-room-v122.js','webtv-control-room-v122.css','webtv-analytics-v122.js','studio-catalog-cockpit-v131.js','studio-catalog-cockpit-v131.css'])expect(entry.includes(asset),`Worker injecte ${asset}`);
expect(entry.includes("session_id LIKE 'webtv:%'"),'Studio calcule les métriques WebTV sur les sessions dédiées');
expect(entry.includes('webTv:webTvStats(this.sql)'),'admin state expose stats.webTv sans migration de schéma');
expect(entry.includes("STUDIO_V122_RELEASE='neptune-studio-webtv-20260818-v122'"),'release Studio v122 exposée');
expect(entry.includes("WEBTV_ANALYTICS_RELEASE='neptune-webtv-analytics-20260818-v122'"),'release analytics v122 exposée');
expect(wrangler.includes('"* * * * *"'),'watchdog Cloudflare planifié chaque minute');
expect(wrangler.includes('"main": "src/entry-v40.js"'),'entry-v40 reste le Worker actif');

console.log(JSON.stringify({ok:true,checks:checks.length},null,2));
