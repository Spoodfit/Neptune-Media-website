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
expect(overviewCss.includes('.studio-context-nav-v65{display:none!important}'),'ancienne rangée de sous-onglets masquée');
expect(catalogUxCss.includes('body.v122-studio-catalog .content')&&catalogUxCss.includes('width:100%!important'),'Catalogue Média utilise toute la largeur disponible');
expect(catalogUxCss.includes('#content .c98-page .c98-layout')&&catalogUxCss.includes('display:block!important'),'ancienne grille Catalogue + aperçu remplacée par un espace de travail pleine largeur');
expect(catalogUxCss.includes('#c98Preview')&&catalogUxCss.includes('display:none!important'),'aperçu tunnel permanent masqué de la console');
expect(catalogUxCss.includes('.v122-catalog-glance')&&catalogUxCss.includes('grid-template-columns:repeat(5'),'vue d’ensemble Catalogue en cinq raccourcis');
expect(catalogUxJs.includes('Voir le tunnel client ↗'),'accès tunnel client explicite depuis le Catalogue');
expect(catalogUxJs.includes('Voir dans le tunnel ↗')&&catalogUxJs.includes('catalog_family'),'prévisualisation ciblée d’une offre ouvre le tunnel à la demande');
expect(catalogUxJs.includes('/api/admin/media-catalog-v98/context'),'synthèse Catalogue utilise la source de vérité Studio');
expect(overviewCss.includes('.v122-overview-grid'),'réglages disposent d’une vue d’ensemble compacte');
expect(advanced.includes('/studio/studio-overview-v122.js?v=1'),'advanced charge v122 à la source');
expect(advanced.includes('/studio/studio-catalog-ux-v122-1.css?v=1')&&advanced.includes('/studio/studio-catalog-ux-v122-1.js?v=1'),'advanced charge l’UX Catalogue pleine largeur');

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