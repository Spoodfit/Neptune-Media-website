import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=process.env.DASHBOARD_BASE_URL||'http://127.0.0.1:4173';
const outputDir=path.resolve('test-results/client-command-center-v118');
const catalog={ok:true,dataGuardRelease:'neptune-sales-tunnel-data-guard-20260814-v118',cities:[{id:'toulouse',slug:'toulouse',name:'Toulouse',formats:[{id:'hn',slug:'hors-norme',name:'Hors Norme',concept:'Interview incarnée',description:'Une conversation éditoriale premium.',durationLabel:'1 h 30',image:'/media/catalog-v98/hors-norme-custom.webp',imagePublicUrl:'/media/catalog-v98/hors-norme-custom.webp',visualSource:'custom',offers:[{id:'offer-hn',clientPriceCents:79000,currency:'eur'}]},{id:'connexio',slug:'connexio',name:'Connexio',concept:'Conversation',description:'Un format vivant.',durationLabel:'2 h',image:'/assets/catalog-v98/connexio.svg',imagePublicUrl:'/assets/catalog-v98/connexio.svg',offers:[{id:'offer-co',clientPriceCents:99000,currency:'eur'}]}]}]};
const client={id:'client-test',fullName:'Client Neptune',email:'client@example.com'};
const scenarios=[
  {name:'tracking-opens-current-step',viewport:{width:1440,height:1000},state:{authenticated:true,client,orders:[{id:'editing-1',title:'Hors Norme',format:'Hors Norme',status:'editing',paymentStatus:'paid',appointmentAt:'2026-08-01T08:00:00Z',filmingAt:'2026-08-05T09:00:00Z',workflow:{preparationStatus:'completed',supplierStatus:'confirmed',sourceReceivedAt:'2026-08-06T09:00:00Z',editingStartedAt:'2026-08-07T09:00:00Z'},files:[{id:'f1',name:'Emission finale.mp4',fileType:'final',createdAt:'2026-08-10T09:00:00Z'}]}]},async assert(page){await page.locator('[data-cc-track]').first().click();await page.waitForTimeout(80);const d=await diagnostics(page);expect(d.detailStage==='editing','Voir le suivi doit ouvrir Montage');expect(/Montage/iu.test(d.detailHeading),'le détail Montage doit avoir son propre titre');expect(!/Tout ce qu’il faut savoir/iu.test(d.detailText),'le détail global v117 ne doit plus rester');expect(d.folderCount===1,'un dossier de contenus doit remplacer les blocs secondaires');expect(!d.secondaryExists,'À savoir / Votre émission ne doivent plus exister');}},
  {name:'preparation-step-context',viewport:{width:1280,height:1000},state:{authenticated:true,client,orders:[{id:'prep-1',title:'Hors Norme · Test',format:'Hors Norme',status:'preparation',paymentStatus:'paid',appointmentAt:'2026-08-20T08:00:00Z',filmingAt:'2026-08-28T09:00:00Z',workflow:{supplierStatus:'confirmed',preparationStatus:'pending'},files:[]}]},async assert(page){await page.locator('[data-cc-stage="3"]').click();await page.waitForSelector('#ccPreparationDeckV118 #horsNormePreparationV77',{timeout:10000});let d=await diagnostics(page);expect(d.detailStage==='preparation','le clic Préparation doit ouvrir uniquement Préparation');expect(/Préparer Hors Norme/iu.test(d.detailHeading),'le panneau doit reprendre Préparer Hors Norme');expect(d.prepInsideDetail,'la préparation historique doit migrer dans l’étape');expect(!d.prepOutsideDetail,'aucun doublon de préparation ne doit rester en bas');expect(d.prepAckDisabled,'la confirmation doit être bloquée avant lecture');await page.evaluate(()=>localStorage.setItem('neptune_hors_norme_preparation_seen_v77',JSON.stringify(Array.from({length:10},(_,i)=>i))));await page.locator('[data-preparation-card]').first().dispatchEvent('click');await page.waitForTimeout(160);d=await diagnostics(page);expect(!d.prepAckDisabled,'la confirmation doit devenir disponible après lecture complète');await page.locator('[data-v118-prep-ack]').click();await page.waitForTimeout(50);d=await diagnostics(page);expect(/Préparation validée/iu.test(d.detailText),'la compréhension doit pouvoir être confirmée');expect(d.folderCount===0,'aucun rail contenu ne doit être affiché sans contenu');expect(d.formatsVisible,'le catalogue doit remonter quand il n’y a aucun contenu');}},
  {name:'catalog-and-spacing-mobile',viewport:{width:390,height:844},state:{authenticated:true,client,orders:[{id:'prep-2',title:'Hors Norme',format:'Hors Norme',status:'preparation',paymentStatus:'paid',workflow:{supplierStatus:'confirmed'},files:[]}]},async assert(page){const d=await diagnostics(page);expect(d.formatsVisible,'le catalogue inférieur doit être visible');expect(d.catalogImages>=2,'les cartes catalogue doivent afficher les images synchronisées');expect(d.customCatalogImage,'le visuel personnalisé Studio doit être utilisé');expect(d.metricsMargin>=26,'les blocs doivent être davantage aérés');expect(d.supportHeight<230,`Besoin d’aide reste trop haut (${d.supportHeight}px)`);expect(d.overflow<=3,`débordement mobile de ${d.overflow}px`);}},
];

await fs.rm(outputDir,{recursive:true,force:true});await fs.mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});const errors=[];
for(const scenario of scenarios){
  const context=await browser.newContext({viewport:scenario.viewport,reducedMotion:'reduce'});
  const page=await context.newPage();
  const browserErrors=[];
  page.on('pageerror',e=>browserErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/compute-pressure/iu.test(m.text()))browserErrors.push(m.text());});
  await page.route('**/api/client/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(new URL(route.request().url()).pathname==='/api/client/session'?scenario.state:{})}));
  await page.route('**/api/reservation/catalog-v96',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
  await page.route('**/api/public/connexio-availability',route=>route.fulfill({status:200,contentType:'application/json',body:'{"available":false,"event":null}'}));
  const visualSvg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#151b48"/><text x="80" y="48" text-anchor="middle" fill="white" font-size="10">NEPTUNE</text></svg>';
  await page.route('**/media/catalog-v98/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:visualSvg}));
  await page.route('**/assets/catalog-v98/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:visualSvg}));
  const response=await page.goto(`${baseUrl}/espace-client/?v118_test=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  if(!response||response.status()>=400)throw new Error(`${scenario.name}: HTTP ${response?.status()||0}`);
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:20000});
  await page.evaluate(async()=>{
    await import('/espace-client/client-experience-v117.js?v=1');
    const css=document.createElement('link');css.rel='stylesheet';css.href='/espace-client/client-command-center-v118.css?v=1';document.head.append(css);
    await import('/espace-client/client-command-center-v118-1.js?v=1');
    await import('/espace-client/client-preparation-context-v118.js?v=1');
  });
  await page.waitForSelector('.client-command-center #ccContent:not([hidden])',{timeout:20000});
  await page.waitForSelector('.formats-panel:not([hidden])',{timeout:10000});
  await page.waitForTimeout(350);
  try{await scenario.assert(page);if(browserErrors.length)throw new Error(`erreurs navigateur: ${browserErrors.join(' | ')}`);}catch(e){errors.push(`${scenario.name}: ${e.message}`);}
  await page.screenshot({path:path.join(outputDir,`${scenario.name}.png`),fullPage:true});
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify({errors},null,2));
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Client Command Center v118 validé sur ${scenarios.length} scénarios.`);

async function diagnostics(page){return page.evaluate(()=>{const detail=document.querySelector('#ccDetailRegion'),formats=document.querySelector('.formats-panel'),support=document.querySelector('.support-card'),metrics=document.querySelector('.metrics-section'),doc=document.documentElement;return{detailStage:detail?.dataset.stage||'',detailHeading:detail?.querySelector('h3')?.textContent?.trim()||'',detailText:detail?.textContent||'',prepInsideDetail:Boolean(detail?.querySelector('#horsNormePreparationV77')),prepOutsideDetail:Boolean(document.querySelector('#horsNormePreparationV77')&&!detail?.contains(document.querySelector('#horsNormePreparationV77'))),prepAckDisabled:Boolean(document.querySelector('[data-v118-prep-ack]')?.disabled),folderCount:document.querySelectorAll('.cc-v118-folder').length,secondaryExists:Boolean(document.querySelector('#clientSecondaryRow')),formatsVisible:Boolean(formats&&!formats.hidden&&getComputedStyle(formats).display!=='none'),catalogImages:document.querySelectorAll('.cc-v118-catalog-card img').length,customCatalogImage:Boolean(document.querySelector('.cc-v118-catalog-card img[src*="hors-norme-custom"]')),metricsMargin:parseFloat(getComputedStyle(metrics).marginTop||'0'),supportHeight:support?.getBoundingClientRect().height||0,overflow:Math.max(doc.scrollWidth,document.body.scrollWidth)-innerWidth};});}
function expect(value,message){if(!value)throw new Error(message);}
