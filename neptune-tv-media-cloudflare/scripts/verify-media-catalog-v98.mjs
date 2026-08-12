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
const ux=read('public/studio/media-catalog-ux-v99.js');
const loader=read('public/studio/media-catalog-loader-v104.js');
const advanced=read('public/studio/advanced.html');
const ia=read('public/studio/studio-information-architecture-v65-1.js');
const app=read('public/studio/app.html');
const router=read('public/studio/studio-app-router-v104.js');
const css=read('public/studio/media-catalog-manager-v98.css');

must(wrangler.includes('"main": "src/entry-v36.js"'),'wrangler must use entry-v36.js');
must(entry.includes("'/api/admin/media-catalog-v98/'"),'admin catalog API missing');
must(entry.includes("'/media/catalog-v98/'"),'catalog R2 media route missing');
must(!entry.includes('ADMIN_CSS')&&!entry.includes('ADMIN_JS')&&!entry.includes('ADMIN_UX_JS'),'advanced HTML must not be rewritten a second time for the catalog');
must(!entry.includes('media-catalog-nav-v98.js'),'legacy v98 navigation must not be injected beside the shared Studio navigation');
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
must(admin.includes("fetch('/api/reservation/catalog-v96'"),'catalog manager must read actual public catalog');
must(admin.includes('asset/upload'),'Studio image upload is missing');
must(admin.includes('Ouvrir le tunnel réel'),'real tunnel shortcut missing');
must(ux.includes("new URLSearchParams({catalog_preview:'studio'})")&&ux.includes('return `/reserver?${params}`'),'v99 UX must build the real /reserver preview URL in Studio mode');
must(ux.includes('iframe title="Aperçu réel du tunnel Neptune Media"')&&ux.includes('src="${esc(src)}"'),'v99 UX must render the real tunnel URL in its preview iframe');
must(ux.includes('Formats & configurations')&&ux.includes('Tarifs & offres'),'catalog UX labels are not normalized');

must(loader.includes("const CATALOG_HASH='programs'"),'catalog loader must target only #programs');
must(loader.includes("const CATALOG_CSS='/studio/media-catalog-manager-v98.css?v=1'"),'catalog loader must load catalog CSS');
must(loader.includes("const CATALOG_MANAGER='/studio/media-catalog-manager-v98.js?v=1'"),'catalog loader must load the manager');
must(loader.includes("const CATALOG_UX='/studio/media-catalog-ux-v99.js?v=1'"),'catalog loader must load the UX layer');
must(loader.includes('await import(CATALOG_MANAGER)')&&loader.includes('await import(CATALOG_UX)'),'catalog loader must import manager then UX');
must(loader.includes('ADMIN_TIMEOUT_MS=10000'),'catalog admin request timeout missing');
must(loader.includes('PUBLIC_PREVIEW_TIMEOUT_MS=3500'),'public preview fallback timeout missing');
must(loader.includes('MANAGER_SETTLE_TIMEOUT_MS=12000'),'catalog manager settle timeout missing');
must(loader.includes('waitForManagerState()'),'catalog loader must wait for a deterministic manager state before mounting UX');
must(loader.includes('installCatalogFetchGuard()'),'catalog loader network guard missing');
must(advanced.includes('/studio/media-catalog-loader-v104.js?v=2'),'advanced Studio must load the hardened route-aware catalog loader');
must(advanced.includes('<main id="auth" class="login" hidden>'),'advanced Studio must not paint the legacy login screen before session resolution');

must(!app.includes('<iframe'),'Studio compatibility entry must not reintroduce a business iframe');
must(app.includes('/studio/studio-app-router-v104.js?v=1'),'Studio compatibility entry must use the top-level compatibility router');
must(router.includes("'settings/catalogue':'/studio/advanced.html#programs'"),'Settings compatibility route must open Catalogue Media top-level');
must(ia.includes("link('settings', '/studio/advanced.html#programs'"),'Settings primary route must open Catalogue Media');
must(ia.includes("settings: [['programs', 'Catalogue Media']"),'Catalogue Media must live first in the Settings context');
must(ia.includes("groupForTab(tab) { return ['programs', 'finances', 'users', 'audit', 'settings'].includes(tab) ? 'settings' : 'diffusion'; }"),'Catalogue Media must activate Settings rather than Diffusion');
must(ia.includes('settleAdvancedSession(markReady)'),'Settings must not reveal before auth resolution');
must(entry.includes("const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=107'"),'Studio pages must receive the canonical navigation runtime with current cache-bust');
must(entry.includes("const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=3'"),'Studio pages must receive the canonical shell stylesheet with current cache-bust');
must(entry.includes('data-neptune-studio-shell-boot="v105"'),'Studio pages must be marked before first paint to prevent legacy shell flash');
must(entry.includes('secureStudioDocument(await injectStudioNavigation(response))'),'advanced Studio content must remain a top-level secured page with shared navigation');
must(entry.includes("allowSameOriginFrame(response,'X-Neptune-Studio-Preview')"),'real sales-tunnel preview must remain the only Studio same-origin iframe exception');
must(css.includes('.c98-layout')&&css.includes('@media(max-width:980px)')&&css.includes('@media(max-width:720px)'),'responsive catalog layout missing');

for(const asset of ['public/assets/catalog-v98/hors-norme.svg','public/assets/catalog-v98/connexio.svg']){
  const content=read(asset);
  must(content.includes('<image')&&content.includes('data:image/webp;base64,'),`${asset} must embed supplied image data`);
}
console.log('Media catalog v98/v99 contract: OK — bounded loader, auth-gated Settings, canonical Studio shell, real tunnel preview isolated.');
