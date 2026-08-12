import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const must=(condition,message)=>{if(!condition)throw new Error(`media-catalog-v109: ${message}`);};

const wrangler=read('wrangler.jsonc');
const entry=read('src/entry-v36.js');
const legacyEntry=read('src/entry-v34.js');
const store=read('src/store-v29.js');
const backend=read('src/portal-media-catalog-v98.js');
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

must(visuals.includes("MEDIA_CATALOG_VISUALS_RELEASE='neptune-media-catalog-visuals-20260813-v109'"),'visual release is not v109');
must(visuals.includes("if(hn&&n.includes('canap'))return {imageBase64:'/assets/formats/exact-hn1.b64'"),'Hors Norme canapé must use supplied exact-hn1');
must(visuals.includes("if(hn&&n.includes('chaise'))return {imageBase64:'/assets/formats/exact-hn2.b64'"),'Hors Norme chaise must use supplied exact-hn2');
must(visuals.includes("if(n.includes('bar'))return {imageBase64:'/assets/formats/exact-cl1.b64'"),'Concept Libre bar must use supplied exact-cl1');
must(visuals.includes("if(n.includes('canap'))return {imageBase64:'/assets/formats/exact-cl2.b64'"),'Concept Libre canapé must use supplied exact-cl2');
must(visuals.includes("if(n.includes('plateau'))return {imageBase64:'/assets/formats/exact-cl3.b64'"),'Concept Libre plateau must use supplied exact-cl3');
must(visuals.includes("if(n.includes('chaise'))return {image:'/assets/posters/studio-wide.webp'"),'Concept Libre chaise must use a neutral fallback until an authoritative image exists');
must(visuals.includes("imageSource:row.imageUrl?'custom'"),'catalog context must expose whether a visual is custom or fallback');
must(visuals.includes("'/assets/catalog-v98/hors-norme.svg'"),'Hors Norme default concept visual missing');
must(visuals.includes("'/assets/catalog-v98/connexio.svg'"),'Connexio fallback asset missing');

must(tunnel.includes('formatVisualV98')&&tunnel.includes('configurationVisualV98'),'public tunnel must resolve visuals from catalog data');
must(!tunnel.includes('exact-hn1.b64')&&!tunnel.includes('exact-hn2.b64'),'v98 tunnel wrapper must not duplicate hardcoded configuration assets');
must(!backend.includes('family.configurationOptions.sort('),'admin context must preserve configuration public_order instead of alphabetizing it');

for(const label of ['Concepts & formats','Configurations','Offres & tarifs','Fournisseurs','Villes','APERÇU TUNNEL'])must(admin.includes(label),`Studio manager is missing ${label}`);
must(admin.includes("fetch('/api/reservation/catalog-v96'"),'catalog manager must read actual public catalog');
must(admin.includes('asset/upload'),'Studio image upload is missing');
must(admin.includes('Ouvrir le tunnel réel'),'real tunnel shortcut missing');
must(ux.includes("new URLSearchParams({catalog_preview:'studio'})")&&ux.includes('return `/reserver?${params}`'),'v99 UX must build the real /reserver preview URL in Studio mode');
must(ux.includes('iframe title="Aperçu réel du tunnel Neptune Media"')&&ux.includes('src="${esc(src)}"'),'v99 UX must render the real tunnel URL in its preview iframe');
must(ux.includes('Formats & configurations')&&ux.includes('Tarifs & offres'),'catalog UX labels are not normalized');

must(entry.includes("const AUDIT_RELEASE='neptune-media-catalog-audit-20260813-v109'"),'v109 audit release marker missing');
must(entry.includes("const MEDIA_CATALOG_UX='/studio/media-catalog-ux-v99.js'"),'v109 UX response hardening route missing');
must(entry.includes("const SALES_TUNNEL_APP='/reserver/assets/app-v96.js'"),'v109 tunnel preview response hardening route missing');
must(entry.includes('enhanceMediaCatalogUx'),'catalog UX response enhancer missing');
must(entry.includes('enhanceSalesTunnelApp'),'sales tunnel Studio preview enhancer missing');
must(entry.includes("let wasActive=active()"),'catalog manager must track active/inactive route transitions');
must(entry.includes("if(!h.querySelector('.c98-page'))h.dataset.c98=''"),'catalog manager must recover after another Settings tab replaces content');
must(entry.includes("h.dataset.c98='error'"),'catalog errors must remain terminal instead of entering an automatic remount loop');
must(!entry.includes("subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']"),'v109 manager rewrite must not observe arbitrary child mutations');
must(entry.includes("params.set('catalog_view',active==='configurations'?'configuration':'format')"),'preview must identify the edited tunnel screen');
must(entry.includes("STUDIO_CATALOG_PREVIEW=params.get('catalog_preview')==='studio'"),'sales tunnel must have an isolated Studio preview mode');
must(entry.includes('hydrateStudioCatalogPreview()'),'Studio preview must select the requested family before rendering');
must(entry.includes('o.description||configurationCopy(o.label)'),'sales tunnel must render configured client-facing descriptions');
must(entry.includes('if(STUDIO_CATALOG_PREVIEW)return;localStorage.setItem'),'Studio preview must never overwrite customer reservation localStorage');
must(entry.includes('mediaCatalogAudit:AUDIT_RELEASE'),'public release endpoint must expose v109 audit marker');

const stripeBranch=legacyEntry.indexOf("if(key==='stripe-links')");
const stripeAuth=legacyEntry.indexOf('const auth=await studioAuth(request,env,ctx);',stripeBranch);
const stripeReturn=legacyEntry.indexOf('return secure(await activeStripeLinks(env));',stripeBranch);
must(stripeBranch>=0&&stripeAuth>stripeBranch&&stripeReturn>stripeAuth,'Stripe Payment Link discovery must require an authenticated Studio operator');

must(loader.includes("const CATALOG_HASH='programs'"),'catalog loader must target only #programs');
must(loader.includes("const CATALOG_CSS='/studio/media-catalog-manager-v98.css?v=1'"),'catalog loader must load catalog CSS');
must(loader.includes("const CATALOG_MANAGER='/studio/media-catalog-manager-v98.js?v=2'"),'catalog loader must load the v108/v109 manager cache key');
must(loader.includes("const CATALOG_UX='/studio/media-catalog-ux-v99.js?v=1'"),'catalog loader must load the UX layer');
must(loader.includes('await import(CATALOG_MANAGER)')&&loader.includes('await import(CATALOG_UX)'),'catalog loader must import manager then UX');
must(loader.includes('ADMIN_TIMEOUT_MS=10000'),'catalog admin request timeout missing');
must(loader.includes('PUBLIC_PREVIEW_TIMEOUT_MS=3500'),'public preview fallback timeout missing');
must(loader.includes('MANAGER_SETTLE_TIMEOUT_MS=12000'),'catalog manager settle timeout missing');
must(loader.includes('waitForManagerState()'),'catalog loader must wait for a deterministic manager state before mounting UX');
must(loader.includes('installCatalogFetchGuard()'),'catalog loader network guard missing');
must(loader.includes("headers.set('X-CSRF-Token',csrf)"),'catalog loader must attach Studio CSRF to admin requests');
must(loader.includes('refreshStudioCsrf'),'catalog loader must recover from csrf_failed with auth status refresh');
must(loader.includes("document.documentElement.dataset.neptuneMediaCatalog='v108'"),'catalog loader ready marker missing');
must(advanced.includes('/studio/media-catalog-loader-v104.js?v=3'),'advanced Studio must load the hardened route-aware catalog loader');
must(advanced.includes('<main id="auth" class="login" hidden>'),'advanced Studio must not paint the legacy login screen before session resolution');

must(!app.includes('<iframe'),'Studio compatibility entry must not reintroduce a business iframe');
must(app.includes('/studio/studio-app-router-v104.js?v=1'),'Studio compatibility entry must use the top-level compatibility router');
must(router.includes("'settings/catalogue':'/studio/advanced.html#programs'"),'Settings compatibility route must open Catalogue Media top-level');
must(ia.includes("link('settings', '/studio/advanced.html#programs'"),'Settings primary route must open Catalogue Media');
must(ia.includes("settings: [['programs', 'Catalogue Media']"),'Catalogue Media must live first in Settings context');
must(ia.includes("groupForTab(tab) { return ['programs', 'finances', 'users', 'audit', 'settings'].includes(tab) ? 'settings' : 'diffusion'; }"),'Catalogue Media must activate Settings rather than Diffusion');
must(ia.includes('settleAdvancedSession(markReady)'),'Settings must not reveal before auth resolution');
must(entry.includes("const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=107'"),'Studio pages must receive current canonical navigation runtime');
must(entry.includes("const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=3'"),'Studio pages must receive current shell stylesheet');
must(entry.includes('data-neptune-studio-shell-boot="v105"'),'Studio pages must be marked before first paint to prevent legacy shell flash');
must(entry.includes('secureStudioDocument(await injectStudioNavigation(response))'),'advanced Studio content must remain a top-level secured page with shared navigation');
must(entry.includes("allowSameOriginFrame(response,'X-Neptune-Studio-Preview')"),'real sales-tunnel preview must remain the only Studio same-origin iframe exception');
must(css.includes('.c98-layout')&&css.includes('@media(max-width:980px)')&&css.includes('@media(max-width:720px)'),'responsive catalog layout missing');

for(const asset of ['public/assets/catalog-v98/hors-norme.svg','public/assets/catalog-v98/connexio.svg']){
  const content=read(asset);
  must(content.includes('<image')&&content.includes('data:image/webp;base64,'),`${asset} must embed image data`);
}
console.log('Media catalog v109 contract: OK — CSRF-safe loader, stable remounts, exact supplied visuals, isolated real tunnel preview, ordered configurations and authenticated Stripe discovery.');
