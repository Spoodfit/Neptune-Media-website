import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const must=(condition,message)=>{if(!condition)throw new Error(`media-catalog-v109: ${message}`);};

const entry=read('src/entry-v36.js');
const salesEntry=read('src/entry-v34.js');
const backend=read('src/portal-media-catalog-v98.js');
const visuals=read('src/media-catalog-visuals-v98.js');
const tunnelV98=read('src/portal-sales-tunnel-v98.js');
const dataGuard=read('src/portal-sales-tunnel-v109-guard.js');
const store=read('src/store-v29.js');
const loader=read('public/studio/media-catalog-loader-v104.js');
const advanced=read('public/studio/advanced.html');
const ia=read('public/studio/studio-information-architecture-v65-1.js');
const router=read('public/studio/studio-app-router-v104.js');

must(store.includes('publicSalesCatalogV98'),'public reservation catalog must pass through v98 visual resolution');
must(store.includes("'/portal/media-catalog-v98/context'"),'admin catalog context route missing');

must(visuals.includes("MEDIA_CATALOG_VISUALS_RELEASE='neptune-media-catalog-visuals-20260813-v109'"),'visual release marker missing');
must(visuals.includes("if(hn&&n.includes('canap'))return {imageBase64:'/assets/formats/exact-hn1.b64'"),'Hors Norme Canapé must use exact-hn1');
must(visuals.includes("if(hn&&n.includes('chaise'))return {imageBase64:'/assets/formats/exact-hn2.b64'"),'Hors Norme Chaise must use exact-hn2');
must(visuals.includes("if(n.includes('bar'))return {imageBase64:'/assets/formats/exact-cl1.b64'"),'Bar must use exact-cl1');
must(visuals.includes("if(n.includes('canap'))return {imageBase64:'/assets/formats/exact-cl2.b64'"),'Concept Libre Canapé must use exact-cl2');
must(visuals.includes("if(n.includes('plateau'))return {imageBase64:'/assets/formats/exact-cl3.b64'"),'Plateau must use exact-cl3');
must(visuals.includes("if(n.includes('chaise'))return {image:'/assets/posters/studio-wide.webp'"),'Concept Libre Chaise must not reuse the supplied Plateau image');
must(visuals.includes("imageSource:row.imageUrl?'custom'"),'visual provenance must be exposed');

must(!backend.includes('family.configurationOptions.sort('),'configuration public order must not be silently alphabetized');

must(tunnelV98.includes('publicSalesCatalogGuardedV109'),'public catalog must pass through inactive-tier guard');
must(tunnelV98.includes('saveTunnelSelectionGuardedV109'),'reservation selection must pass through inactive-tier guard before v97 side effects');
must(dataGuard.includes("if(!seed||!seed.active||seed.cityId!==cityId||seed.formatId!==formatId)return json({error:'offer_not_available'},409)"),'inactive seed offer must be rejected');
must(dataGuard.includes("Boolean(row.active)&&tierKey(row)===current"),'effective current-tier offer must be active');
must(dataGuard.includes("reason:'current_tier_inactive'"),'missing active current tier must fail closed');
must(dataGuard.includes("format.offers=(format.offers||[]).filter(offer=>offerIsActive(store,offer?.id))"),'inactive offer must not be published by public catalog');

must(loader.includes('installCatalogFetchGuard()'),'catalog loader fetch guard missing');
must(loader.includes("headers.set('X-CSRF-Token',csrf)"),'catalog admin requests must include CSRF');
must(loader.includes('refreshStudioCsrf'),'expired CSRF recovery missing');
must(loader.includes('MANAGER_SETTLE_TIMEOUT_MS=12000'),'terminal loading timeout missing');
must(advanced.includes('/studio/media-catalog-loader-v104.js?v=3'),'advanced page must use hardened catalog loader');

must(entry.includes("const AUDIT_RELEASE='neptune-media-catalog-audit-20260813-v109'"),'audit release marker missing');
must(entry.includes("let wasActive=active()"),'catalog manager route transition tracking missing');
must(entry.includes("if(!h.querySelector('.c98-page'))h.dataset.c98=''"),'catalog manager cannot recover after another settings screen replaces #content');
must(entry.includes("h.dataset.c98='error'"),'catalog failure must have a terminal state');
must(entry.includes(".observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden']})"),'stabilized runtime must observe route state only');
must(entry.includes("params.set('catalog_view',active==='configurations'?'configuration':'format')"),'preview must request the edited tunnel screen');
must(entry.includes("STUDIO_CATALOG_PREVIEW=params.get('catalog_preview')==='studio'"),'isolated Studio tunnel preview mode missing');
must(entry.includes('hydrateStudioCatalogPreview()'),'preview family hydration missing');
must(entry.includes('o.description||configurationCopy(o.label)'),'client-facing configuration description is not wired to tunnel');
must(entry.includes('if(STUDIO_CATALOG_PREVIEW)return;localStorage.setItem'),'preview may still mutate reservation localStorage');
must(entry.includes('mediaCatalogAudit:AUDIT_RELEASE'),'public release marker for v109 missing');

const stripeStart=salesEntry.indexOf("if(key==='stripe-links')");
const stripeAuth=salesEntry.indexOf('const auth=await studioAuth(request,env,ctx);',stripeStart);
const stripeFetch=salesEntry.indexOf('return secure(await activeStripeLinks(env));',stripeStart);
must(stripeStart>=0&&stripeAuth>stripeStart&&stripeFetch>stripeAuth,'Stripe Payment Link listing must require authenticated Studio access');

must(ia.includes("settings: [['programs', 'Catalogue Media']"),'Catalogue Media must remain first in Settings');
must(ia.includes("link('settings', '/studio/advanced.html#programs'"),'Settings primary link must open Catalogue Media');
must(router.includes("'settings/catalogue':'/studio/advanced.html#programs'"),'compatibility router must open Catalogue Media');
must(entry.includes("const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=107'"),'current Studio JS cache key mismatch');
must(entry.includes("const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=3'"),'current Studio CSS cache key mismatch');

console.log('Media catalog v109 source contract: OK — exact visuals, stable remounts, CSRF, isolated real preview, ordered configurations, inactive-tier guard and authenticated Stripe discovery.');
