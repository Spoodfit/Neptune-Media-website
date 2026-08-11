import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const must=(condition,message)=>{if(!condition)throw new Error(`media-catalog-v98: ${message}`);};

const wrangler=read('wrangler.jsonc');
const entry=read('src/entry-v36.js');
const store=read('src/store-v29.js');
const visuals=read('src/media-catalog-visuals-v98.js');
const tunnel=read('src/portal-sales-tunnel-v98.js');
const admin=read('public/studio/media-catalog-manager-v98.js');
const nav=read('public/studio/media-catalog-nav-v98.js');
const css=read('public/studio/media-catalog-manager-v98.css');

must(wrangler.includes('"main": "src/entry-v36.js"'),'wrangler must use entry-v36.js');
must(entry.includes("'/api/admin/media-catalog-v98/'"),'admin catalog API missing');
must(entry.includes("'/media/catalog-v98/'"),'catalog R2 media route missing');
must(entry.includes('media-catalog-manager-v98.js')&&entry.includes('media-catalog-nav-v98.js'),'Studio catalog scripts injection missing');
must(entry.includes('image/jpeg')&&entry.includes('image/png')&&entry.includes('image/webp'),'image upload allow-list missing');
must(entry.includes('5*1024*1024'),'5 MB image upload cap missing');

must(store.includes('publicSalesCatalogV98'),'public tunnel is not routed through catalog v98');
must(store.includes("'/portal/media-catalog-v98/context'"),'admin context store route missing');
must(store.includes("'/portal/media-catalog-v98/configuration-visual-save'"),'configuration visual store route missing');

must(visuals.includes("n.includes('canap')")&&visuals.includes("'/assets/formats/exact-hn1.b64'"),'Hors Norme canapé must use exact-hn1');
must(visuals.includes("n.includes('chaise')")&&visuals.includes("'/assets/formats/exact-hn2.b64'"),'Hors Norme chaise must use exact-hn2');
const canape=visuals.indexOf("if(hn&&n.includes('canap'))return {imageBase64:'/assets/formats/exact-hn1.b64'");
const chaise=visuals.indexOf("if(hn&&n.includes('chaise'))return {imageBase64:'/assets/formats/exact-hn2.b64'");
must(canape>=0&&chaise>=0,'exact HN configuration mapping missing or inverted');
must(visuals.includes("'/assets/catalog-v98/hors-norme.svg'"),'supplied Hors Norme visual is not the default catalog visual');
must(visuals.includes("'/assets/catalog-v98/connexio.svg'"),'supplied Connexio visual is not available as catalog default');

must(tunnel.includes('formatVisualV98')&&tunnel.includes('configurationVisualV98'),'tunnel must resolve visuals from catalog data');
must(!tunnel.includes('exact-hn1.b64')&&!tunnel.includes('exact-hn2.b64'),'tunnel wrapper must not hardcode configuration assets');

for(const label of ['Concepts & formats','Configurations','Offres & tarifs','Fournisseurs','Villes','APERÇU TUNNEL'])must(admin.includes(label),`Studio manager is missing ${label}`);
must(nav.includes('[data-context-tab="programs"]')&&nav.includes("textContent='Catalogue Media'"),'dynamic Studio navigation must say Catalogue Media');
must(nav.includes("['finances','Finances'],['users','Équipe'],['programs','Catalogue Media'],['audit','Journal'],['settings','Réglages']"),'Catalogue Media must live in Settings context');
must(nav.includes('setPrimarySettings')&&nav.includes("item.dataset.studioRoute==='settings'"),'Catalogue Media must keep Settings as primary navigation');
must(nav.includes('ensureCatalogMount')&&nav.includes("content.dataset.c98!=='ready'")&&nav.includes('media-catalog-v98-remount'),'catalog must remount after round trips');
must(admin.includes("fetch('/api/reservation/catalog-v96'"),'preview must read actual public catalog');
must(admin.includes('asset/upload'),'Studio image upload is missing');
must(admin.includes('Ouvrir le tunnel réel'),'real tunnel shortcut missing');
must(css.includes('.c98-layout')&&css.includes('@media(max-width:980px)')&&css.includes('@media(max-width:720px)'),'responsive catalog layout missing');

for(const asset of ['public/assets/catalog-v98/hors-norme.svg','public/assets/catalog-v98/connexio.svg']){
  const content=read(asset);
  must(content.includes('<image')&&content.includes('data:image/webp;base64,'),`${asset} must embed supplied image data`);
}
console.log('Media catalog v98 contract: OK');
