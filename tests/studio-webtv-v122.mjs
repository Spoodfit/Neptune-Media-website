import fs from 'node:fs/promises';

const root='neptune-tv-media-cloudflare';
const read=path=>fs.readFile(`${root}/${path}`,'utf8');
const [overviewJs,overviewCss,catalogJs,catalogCss,webtvJs,webtvCss,analytics,entry40,webtv,wrangler]=await Promise.all([
  read('public/studio/studio-overview-v122.js'),
  read('public/studio/studio-overview-v122.css'),
  read('public/studio/studio-catalog-visual-v132.js'),
  read('public/studio/studio-catalog-visual-v132.css'),
  read('public/studio/webtv-control-room-v122.js'),
  read('public/studio/webtv-control-room-v122.css'),
  read('public/direct/webtv-analytics-v122.js'),
  read('src/entry-v40.js'),
  read('public/studio/webtv.html'),
  read('wrangler.jsonc'),
]);

const checks=[];
const expect=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message);};

for(const label of ['Parcours clients','Diffusion','Catalogue Média','Finance','Réglage'])expect(overviewJs.includes(label),`navigation v122 contient ${label}`);
expect(overviewJs.includes('neptune-studio-nav-link'),'navigation v122 conserve le contrat DOM canonique');
expect(!overviewJs.includes('data-studio-route="${key}"'),'navigation v122 n’est plus pilotable par l’ancien contrôleur de routes');
expect(overviewCss.includes('.studio-context-nav-v65{display:none!important}'),'ancienne rangée de sous-onglets masquée');

expect(catalogCss.includes('body.v132-catalog-visual .content')&&catalogCss.includes('overflow:hidden!important'),'Catalogue Média utilise une marketplace visuelle sans scroll global desktop');
expect(catalogCss.includes('#content .c98-layout{display:none!important'),'CRUD historique masqué par défaut');
expect(catalogCss.includes('v132-admin-open #content .c98-layout{display:block!important'),'CRUD historique réactivable à la demande');
expect(catalogCss.includes('.v132-city-card')&&catalogCss.includes('.v132-offer-visual')&&catalogCss.includes('.v132-gallery'),'v132 repose sur villes illustrées et cartes offres visuelles');
expect(catalogJs.includes("const RELEASE='neptune-studio-catalog-visual-20260820-v132'"),'release visuelle v132 active');
for(const label of ['Catalogue visuel','Structure','Toutes les offres','Coût fournisseur','Préférentiel','Normal'])expect(catalogJs.includes(label),`catalogue v132 contient ${label}`);
expect(catalogJs.includes('format.image||format.imageUrl||family.image'),'v132 réutilise les vrais visuels des concepts');
expect(catalogJs.includes('cityCard(city')&&catalogJs.includes('offerCard(offer)'),'ville et offre deviennent les deux objets visuels principaux');
expect(catalogJs.includes("structureBlock('◈','Concepts'")&&catalogJs.includes("structureBlock('⬡','Fournisseurs'")&&catalogJs.includes("structureBlock('⇄','Configurations'")&&catalogJs.includes("structureBlock('⌖','Villes'"),'structure réunit les quatre briques du catalogue');
expect(catalogJs.includes('/api/admin/media-catalog-v98/context'),'v132 réutilise la source de vérité Studio');
expect(catalogJs.includes('openLegacy')&&catalogJs.includes('← Catalogue'),'édition détaillée reste disponible sans seconde source de vérité');
expect(entry40.includes("CATALOG_VISUAL_RELEASE='neptune-studio-catalog-visual-20260820-v132'"),'entry-v40 expose la release visuelle v132');
expect(entry40.includes('/studio/studio-catalog-visual-v132.js?v=1')&&entry40.includes('/studio/studio-catalog-visual-v132.css?v=1'),'entry-v40 injecte les assets visuels v132');
expect(entry40.includes("CATALOG_RUNTIME_RELEASE='neptune-studio-catalog-cockpit-20260820-v131'"),'compatibilité du pipeline v131 conservée sans réactiver son UI');
expect(entry40.includes('application/x-neptune-compat'),'ancien cockpit référencé uniquement comme marqueur non exécutable');
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

for(const asset of ['studio-overview-v122.js','studio-overview-v122.css','webtv-control-room-v122.js','webtv-control-room-v122.css','webtv-analytics-v122.js'])expect(entry40.includes(asset),`Worker v40 conserve ${asset}`);
expect(entry40.includes("session_id LIKE 'webtv:%'"),'Studio calcule les métriques WebTV sur les sessions dédiées');
expect(entry40.includes('webTv:webTvStats(this.sql)'),'admin state expose stats.webTv sans migration de schéma');
expect(entry40.includes("STUDIO_V122_RELEASE='neptune-studio-webtv-20260818-v122'"),'release Studio v122 exposée');
expect(entry40.includes("WEBTV_ANALYTICS_RELEASE='neptune-webtv-analytics-20260818-v122'"),'release analytics v122 exposée');
expect(wrangler.includes('"* * * * *"'),'watchdog Cloudflare planifié chaque minute');
expect(wrangler.includes('"main": "src/entry-v40.js"'),'entry-v40 reste le Worker actif');

console.log(JSON.stringify({ok:true,checks:checks.length},null,2));
