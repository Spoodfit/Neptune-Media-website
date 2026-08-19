import fs from 'node:fs/promises';

const root='neptune-tv-media-cloudflare';
const read=path=>fs.readFile(`${root}/${path}`,'utf8');
const [overviewJs,overviewCss,catalogUxJs,catalogUxCss,webtvJs,webtvCss,analytics,entry,advanced,webtv,wrangler]=await Promise.all([
  read('public/studio/studio-overview-v122.js'),
  read('public/studio/studio-overview-v122.css'),
  read('public/studio/studio-catalog-ux-v122-1.js'),
  read('public/studio/studio-catalog-ux-v122-1.css'),
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

expect(catalogUxCss.includes('body.v128-studio-marketplace .content')&&catalogUxCss.includes('width:100%!important'),'Catalogue Média utilise toute la largeur disponible');
expect(catalogUxCss.includes('#content .c98-layout{display:none!important'),'gestion détaillée masquée par défaut derrière la marketplace');
expect(catalogUxCss.includes('v128-catalog-admin-open #content .c98-layout{display:block!important'),'gestion détaillée réactivable à la demande');
expect(catalogUxCss.includes('#c98Preview')&&catalogUxCss.includes('display:none!important'),'aperçu tunnel permanent masqué de la console');
expect(catalogUxCss.includes('.c116-preview-panel')&&catalogUxCss.includes('display:none!important'),'aperçu tunnel repliable historique masqué de la console');
expect(catalogUxCss.includes('.c98-tabs')&&catalogUxCss.includes('display:none!important'),'ancienne deuxième navigation Catalogue masquée');
expect(catalogUxCss.includes('.v128-city-chooser')&&catalogUxCss.includes('.v128-offer-grid'),'marketplace structurée par ville et offres');
expect(catalogUxJs.includes("const RELEASE='neptune-studio-catalog-marketplace-20260820-v128'"),'release marketplace canonique v128 active');
expect(catalogUxJs.includes('Toutes les villes'),'ville comme porte d’entrée principale');
expect(catalogUxJs.includes('Gérer les données ▾'),'administration secondaire disponible à la demande');
expect(catalogUxJs.includes('Coût fournisseur')&&catalogUxJs.includes("priceCell('Coûtant'")&&catalogUxJs.includes("priceCell('Préférentiel'")&&catalogUxJs.includes("priceCell('Normal'"),'carte offre rapproche coût fournisseur et trois tarifs client');
expect(catalogUxJs.includes('configurationLabels'),'configurations rapprochées sur chaque offre marketplace');
expect(catalogUxJs.includes('Voir côté client ↗')&&catalogUxJs.includes('catalog_family'),'prévisualisation ciblée d’une offre ouvre le tunnel à la demande');
expect(catalogUxJs.includes('/api/admin/media-catalog-v98/context'),'marketplace utilise la source de vérité Studio');
expect(overviewCss.includes('.v122-overview-grid'),'réglages disposent d’une vue d’ensemble compacte');
expect(advanced.includes('/studio/studio-overview-v122.js?v=1'),'advanced charge v122 à la source');
expect(advanced.includes('/studio/studio-catalog-ux-v122-1.css?v=4')&&advanced.includes('/studio/studio-catalog-ux-v122-1.js?v=4'),'advanced charge la marketplace canonique avec cache-busting v128');
expect(!advanced.includes('studio-catalog-marketplace-v126'),'ancienne surcouche marketplace v126 retirée du runtime');

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

for(const asset of ['studio-overview-v122.js','studio-overview-v122.css','webtv-control-room-v122.js','webtv-control-room-v122.css','webtv-analytics-v122.js'])expect(entry.includes(asset),`Worker injecte ${asset}`);
expect(entry.includes("session_id LIKE 'webtv:%'"),'Studio calcule les métriques WebTV sur les sessions dédiées');
expect(entry.includes('webTv:webTvStats(this.sql)'),'admin state expose stats.webTv sans migration de schéma');
expect(entry.includes("STUDIO_V122_RELEASE='neptune-studio-webtv-20260818-v122'"),'release Studio v122 exposée');
expect(entry.includes("WEBTV_ANALYTICS_RELEASE='neptune-webtv-analytics-20260818-v122'"),'release analytics v122 exposée');
expect(wrangler.includes('"* * * * *"'),'watchdog Cloudflare planifié chaque minute');
expect(wrangler.includes('"main": "src/entry-v40.js"'),'entry-v40 reste le Worker actif');

console.log(JSON.stringify({ok:true,checks:checks.length},null,2));
