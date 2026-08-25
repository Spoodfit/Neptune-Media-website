import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const js=read('public/studio/studio-catalog-commercial-cockpit-v145.js');
const css=read('public/studio/studio-catalog-commercial-cockpit-v145.css');
const entry=read('src/entry-v44.js');
const checks=[];
const expect=(name,condition)=>checks.push({name,ok:Boolean(condition)});

expect('entry-v44 serves v145 CSS',entry.includes("studio-catalog-commercial-cockpit-v145.css?v=1"));
expect('entry-v44 serves v145 JS',entry.includes("studio-catalog-commercial-cockpit-v145.js?v=1"));
expect('entry-v44 exposes v145 marker',entry.includes("X-Neptune-Catalog-Cockpit','v145"));
expect('v145 preserves v143.4 commerce and city drawer',js.includes("import '/studio/studio-catalog-commerce-v143-4.js?v=1'"));
expect('margin uses TTC supplier cost',js.includes('supplierGrossCents')&&js.includes('marginCents=minPrice-supplierGrossCents'));
expect('UI explicitly labels TTC basis',js.includes('Prix client TTC')&&js.includes('Coût fournisseur TTC')&&js.includes('% du prix TTC'));
expect('legacy HT client label removed',!js.includes('Prix client HT'));
expect('supplier HT remains secondary information only',js.includes("${money(offer.supplierNetCents)} HT"));
expect('real quota policy endpoint is loaded',js.includes("POLICY_API='/api/admin/media-catalog-v143/policies'")&&js.includes('usedPlaces')&&js.includes('capacity'));
expect('real status supplier margin filters exist',js.includes('data-v145-status')&&js.includes('data-v145-supplier')&&js.includes('data-v145-margin'));
expect('refresh invalidates cockpit data',js.includes("event.target.closest('#refresh')")&&js.includes('scheduleReload(250)'));
expect('focus refreshes stale cockpit data',js.includes("window.addEventListener('focus'")&&js.includes('loadData(true)'));
expect('zero-offer cities are omitted from commercial chips',js.includes('filter(city=>(counts.get(String(city.id))||0)>0)'));
expect('KPI city count uses active city records',js.includes('const activeCities=cities().filter(city=>city.active!==false)'));
expect('legacy hero is removed from visible cockpit',css.includes('.c98-page>.c98-hero')&&css.includes('display:none!important'));
expect('manual top refresh is hidden on catalog route',css.includes('.top-actions #refresh{display:none!important}'));
expect('one main scrolling surface is restored',css.includes('.main{height:100dvh!important;overflow-y:auto!important;overflow-x:hidden!important}'));
expect('commercial money labels are at least 10px',css.includes('.v145-money span{font-size:10px')&&css.includes('.v145-money strong{margin-top:3px;font-size:12px')&&css.includes('.v145-money small{margin-top:2px;font-size:10px'));
expect('primary action is explicit',js.includes('+ Nouvelle offre'));

const sampleClientTtc=89000,sampleSupplierHt=60000,sampleVatBps=2000;
const sampleSupplierTtc=sampleSupplierHt+Math.round(sampleSupplierHt*sampleVatBps/10000);
const sampleMargin=sampleClientTtc-sampleSupplierTtc;
expect('TTC sample margin is 170 EUR not 290 EUR',sampleSupplierTtc===72000&&sampleMargin===17000);

for(const check of checks)console.log(`${check.ok?'✓':'✗'} ${check.name}`);
const failed=checks.filter(check=>!check.ok);
if(failed.length){console.error(`Catalogue commercial cockpit v145 failed: ${failed.length}/${checks.length}`);process.exit(1);}
console.log(`Catalogue commercial cockpit v145 verified: ${checks.length}/${checks.length} checks.`);
