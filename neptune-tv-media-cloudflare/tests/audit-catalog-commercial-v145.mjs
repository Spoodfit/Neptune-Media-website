import {chromium} from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const release='v145';
const families=[
 {key:'city-toulouse|format-hors-norme|supplier-recbox',cityId:'city-toulouse',cityName:'Toulouse',formatId:'format-hors-norme',formatName:'Hors Norme',supplierId:'supplier-recbox',supplierName:'RECBOX',active:true,supplierNetCents:60000,vatRateBps:2000,supplierRate:{netCents:60000,vatRateBps:2000,grossCents:72000},tiers:{launch:{id:'offer-hn-launch',clientPriceCents:89000,paymentUrl:'https://buy.stripe.com/test',active:true,supplierGrossCents:72000},promo:{id:'offer-hn-promo',clientPriceCents:149000,paymentUrl:'https://buy.stripe.com/test',active:true,supplierGrossCents:72000},base:{id:'offer-hn-base',clientPriceCents:199000,paymentUrl:'https://buy.stripe.com/test',active:true,supplierGrossCents:72000}},configurationOptions:['Chaise','Canapé']},
 {key:'city-toulouse|format-libre|supplier-recbox',cityId:'city-toulouse',cityName:'Toulouse',formatId:'format-libre',formatName:'Libre',supplierId:'supplier-recbox',supplierName:'RECBOX',active:true,supplierNetCents:60000,vatRateBps:2000,supplierRate:{netCents:60000,vatRateBps:2000,grossCents:72000},tiers:{launch:{id:'offer-libre-launch',clientPriceCents:79000,paymentUrl:'https://buy.stripe.com/test',active:true,supplierGrossCents:72000},promo:{id:'offer-libre-promo',clientPriceCents:99000,paymentUrl:'https://buy.stripe.com/test',active:true,supplierGrossCents:72000},base:{id:'offer-libre-base',clientPriceCents:109000,paymentUrl:'https://buy.stripe.com/test',active:true,supplierGrossCents:72000}},configurationOptions:['Plateau','Bar','Chaise','Canapé']},
];
const catalog={ok:true,formats:[{id:'format-hors-norme',name:'Hors Norme',concept:'Émission Neptune Business',image:'/assets/logo-neptune.svg',active:true},{id:'format-libre',name:'Libre',concept:'Format libre',image:'/assets/logo-neptune.svg',active:true}],suppliers:[{id:'supplier-recbox',name:'RECBOX',active:true,defaultNetCents:60000,vatRateBps:2000,defaultGrossCents:72000}],cities:[{id:'city-toulouse',name:'Toulouse',country:'France',active:true},{id:'city-carcassonne',name:'Carcassonne',country:'France',active:true}],families,services:[],supplierRates:[],rateUnits:[],durationOptions:[]};
const policies={ok:true,offerPolicies:[{offerId:'offer-hn-launch',tierCode:'launch',visible:true,capacity:3,usedPlaces:1},{offerId:'offer-hn-promo',tierCode:'promo',visible:true,capacity:7,usedPlaces:0},{offerId:'offer-hn-base',tierCode:'base',visible:true,capacity:0,usedPlaces:0},{offerId:'offer-libre-launch',tierCode:'launch',visible:true,capacity:3,usedPlaces:0},{offerId:'offer-libre-promo',tierCode:'promo',visible:true,capacity:7,usedPlaces:0},{offerId:'offer-libre-base',tierCode:'base',visible:true,capacity:0,usedPlaces:0}]};
const user={id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const admin={user,programs:[],episodes:[],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};

await main();

async function main(){
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(`PAGE ${error.message}`));
 page.on('console',message=>{if(message.type()==='error'&&!/^Failed to load resource:/u.test(message.text()))errors.push(`CONSOLE ${message.text()}`);});
 await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json; charset=utf-8',headers:{'Cache-Control':'no-store'},body:JSON.stringify(mockApi(new URL(route.request().url()).pathname))}));
 try{
  const response=await page.goto(`${baseURL}/studio/advanced.html#programs`,{waitUntil:'domcontentloaded',timeout:30000});
  assert(response?.ok(),`Catalogue HTTP ${response?.status()||'absent'}`);
  const headers=await response.headers();
  assert((headers['x-neptune-catalog-cockpit']||'')===release,`Header cockpit incorrect: ${headers['x-neptune-catalog-cockpit']||'absent'}`);
  await waitForStableOffers(page,2,650,30000);

  const snap=await page.evaluate(()=>({
    runtime:document.body.dataset.neptuneCatalogCockpit||'',
    offers:document.querySelectorAll('.v145-offer').length,
    cityText:document.querySelector('.v145-city-chips')?.textContent||'',
    hero:document.querySelector('.c98-hero')?getComputedStyle(document.querySelector('.c98-hero')).display:'none',
    refresh:document.querySelector('#refresh')?getComputedStyle(document.querySelector('#refresh')).display:'none',
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    text:document.querySelector('#studioCatalogCommercialCockpitV145')?.textContent||'',
    firstMargin:document.querySelector('.v145-offer .v145-money>div:nth-child(3) strong')?.textContent||'',
    firstPlaces:document.querySelector('.v145-offer .v145-money>div:nth-child(4) strong')?.textContent||'',
    shellReady:document.documentElement.dataset.neptuneStudioShellReady||'',
  }));
  assert(snap.runtime==='v145',`Runtime incorrect: ${snap.runtime}`);
  assert(snap.shellReady==='v105',`Shell Studio non stabilisé: ${snap.shellReady||'absent'}`);
  assert(snap.offers===2,`Offres attendues 2, reçues ${snap.offers}`);
  assert(!snap.cityText.includes('Carcassonne'),'Ville sans offre encore visible dans les filtres commerciaux');
  assert(snap.hero==='none','Hero historique encore visible');
  assert(snap.refresh==='none','Actualiser manuel encore visible dans le Catalogue');
  assert(snap.overflow<=1,`Débordement horizontal: ${snap.overflow}px`);
  for(const text of ['Pilotage des offres','Prix client TTC','Coût fournisseur TTC','Marge brute','Toulouse','RECBOX','Hors Norme','Libre','Nouvelle offre'])assert(snap.text.includes(text),`Cockpit sans « ${text} »`);
  assert(snap.firstMargin.includes('170'),'Marge TTC attendue de 170 € non affichée');
  assert(snap.firstPlaces.trim()==='2','Quota lancement réel 2/3 non affiché');

  await page.locator('[data-v145-filter]').click();
  await page.waitForSelector('[data-v145-status]');
  await page.waitForSelector('[data-v145-supplier]');
  await page.waitForSelector('[data-v145-margin]');
  await page.locator('[data-v145-margin]').selectOption('strong');
  await page.waitForFunction(()=>document.querySelectorAll('.v145-offer').length===0,null,{timeout:3000});
  await page.locator('[data-v145-reset]').click();
  await waitForStableOffers(page,2,250,3000);
  await page.locator('[data-v145-configure]').first().click();
  await page.waitForSelector('.v143-offer-drawer',{state:'attached',timeout:5000});

  const blockingErrors=errors.filter(error=>!error.includes('favicon')&&!isKnownPermissionsPolicyNoise(error));
  assert(blockingErrors.length===0,`Erreurs navigateur: ${blockingErrors.join(' | ')}`);
  await page.screenshot({path:process.env.CATALOG_SCREENSHOT||'/tmp/catalog-commercial-v145.png',fullPage:false});
  console.log('Catalogue commercial v145 browser audit: OK');
 }finally{
  await context.close();
  await browser.close();
 }
}

async function waitForStableOffers(page,expected,stableMs,timeoutMs){
 const deadline=Date.now()+timeoutMs;
 let stableSince=0;
 while(Date.now()<deadline){
  const state=await page.evaluate(()=>({
   offers:document.querySelectorAll('#studioCatalogCommercialCockpitV145 .v145-offer').length,
   runtime:document.body.dataset.neptuneCatalogCockpit||'',
   shell:document.documentElement.dataset.neptuneStudioShellReady||'',
  })).catch(()=>({offers:-1,runtime:'',shell:''}));
  if(state.offers===expected&&state.runtime==='v145'&&state.shell==='v105'){
   if(!stableSince)stableSince=Date.now();
   if(Date.now()-stableSince>=stableMs)return;
  }else stableSince=0;
  await page.waitForTimeout(100);
 }
 throw new Error(`Cockpit v145 non stabilisé avec ${expected} offre(s)`);
}

function isKnownPermissionsPolicyNoise(error){
 return error.includes('Permissions policy violation: Geolocation access has been blocked because of a permissions policy');
}

function mockApi(path){
 if(path==='/api/auth/status')return{authenticated:true,csrfToken:'test-csrf',user};
 if(path==='/api/admin/state')return admin;
 if(path==='/api/admin/clients')return{clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}};
 if(path==='/api/admin/media-catalog-v98/context')return catalog;
 if(path==='/api/admin/media-catalog-v143/policies')return policies;
 if(path==='/api/reservation/catalog-v96')return{ok:true,cities:[],pricing:{}};
 return{ok:true};
}
function assert(condition,message){if(!condition)throw new Error(message);}
