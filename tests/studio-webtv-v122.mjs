import fs from 'node:fs/promises';

const root='neptune-tv-media-cloudflare';
const read=path=>fs.readFile(`${root}/${path}`,'utf8');
const [overviewJs,overviewCss,webtvJs,webtvCss,analytics,entry,advanced,webtv,wrangler]=await Promise.all([
  read('public/studio/studio-overview-v122.js'),
  read('public/studio/studio-overview-v122.css'),
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
expect(overviewCss.includes('.studio-context-nav-v65{display:none!important}'),'ancienne rangée de sous-onglets masquée');
expect(overviewCss.includes('max-height:calc(100dvh - 285px)'),'catalogue borné au viewport desktop');
expect(overviewCss.includes('.v122-overview-grid'),'réglages disposent d’une vue d’ensemble compacte');
expect(advanced.includes('/studio/studio-overview-v122.js?v=1'),'advanced charge v122 à la source');

for(const contract of ['Synchroniser les émissions','Activer la chaîne H24','Copier le code d’intégration','Bibliothèque Cloudflare','Performance des émissions programmées'])expect(webtvJs.includes(contract),`WebTV contient ${contract}`);
expect(webtvJs.includes("api('/api/admin/webtv/state'"),'WebTV charge le vrai contrôle Cloudflare');
expect(webtvJs.includes("method:'PUT'"),'WebTV publie le vrai état antenne par PUT');
expect(webtvJs.includes('synchronizeEpisodes'),'synchronisation Cloudflare non destructive présente');
expect(webtvJs.includes('sameMedia'),'déduplication des émissions par média présente');
expect(webtvCss.includes('.v122-source-rail'),'bibliothèque Cloudflare compacte et horizontale');
expect(webtv.includes('/studio/webtv-control-room-v122.js?v=1'),'régie charge v122 à la source');

for(const event of ["trackVideo('view'","trackVideo('play'","trackVideo('watch'","trackVideo('booking_click'","trackAd('impression'"])expect(analytics.includes(event),`analytics WebTV mesure ${event}`);
expect(analytics.includes("'/api/public/webtv/state'"),'analytics suit le programme réellement à l’antenne');
expect(analytics.includes("'/api/public/catalog'"),'analytics rapproche l’antenne du catalogue d’émissions');
expect(analytics.includes("send('/api/track'"),'analytics réutilise le moteur Neptune existant');

for(const asset of ['studio-overview-v122.js','studio-overview-v122.css','webtv-control-room-v122.js','webtv-control-room-v122.css','webtv-analytics-v122.js'])expect(entry.includes(asset),`Worker injecte ${asset}`);
expect(entry.includes("STUDIO_V122_RELEASE='neptune-studio-webtv-20260818-v122'"),'release Studio v122 exposée');
expect(entry.includes("WEBTV_ANALYTICS_RELEASE='neptune-webtv-analytics-20260818-v122'"),'release analytics v122 exposée');
expect(wrangler.includes('"* * * * *"'),'watchdog Cloudflare planifié chaque minute');
expect(wrangler.includes('"main": "src/entry-v40.js"'),'entry-v40 reste le Worker actif');

console.log(JSON.stringify({ok:true,checks:checks.length},null,2));
