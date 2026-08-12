import { chromium } from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const timeout=30000;
const familyKey='city-toulouse|format-hors-norme|supplier-recbox';
const family={
  key:familyKey,
  cityId:'city-toulouse',cityName:'Toulouse',formatId:'format-hors-norme',formatName:'Hors Norme',formatSlug:'hors-norme',
  supplierId:'supplier-recbox',supplierName:'RecBox',active:true,publicOrder:10,priceSuffix:'HT',currency:'eur',supplierNetCents:60000,vatRateBps:2000,preparationUrl:'https://example.com/preparation',
  tiers:{
    launch:{id:'offer-launch',clientPriceCents:99000,paymentUrl:'https://buy.stripe.com/test-launch'},
    promo:{id:'offer-promo',clientPriceCents:129000,paymentUrl:'https://buy.stripe.com/test-promo'},
    base:{id:'offer-base',clientPriceCents:159000,paymentUrl:'https://buy.stripe.com/test-base'},
  },
  configurationOptions:['Canapé','Chaise'],
  configurationVisuals:[
    {label:'Canapé',imageBase64:'/assets/formats/exact-hn1.b64',description:'DESCRIPTION CLIENT CANAPÉ PERSONNALISÉE'},
    {label:'Chaise',imageBase64:'/assets/formats/exact-hn2.b64',description:'DESCRIPTION CLIENT CHAISE PERSONNALISÉE'},
  ],
  format:{id:'format-hors-norme',slug:'hors-norme',name:'Hors Norme',concept:'Interview signature',description:'Le concept Hors Norme.',durationLabel:'60 min',image:'/assets/posters/hors-norme-wide.webp',active:true},
};
const catalogContext={
  ok:true,
  formats:[family.format],
  suppliers:[{id:'supplier-recbox',name:'RecBox',active:true,defaultNetCents:60000,vatRateBps:2000}],
  cities:[{id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',active:true,publicOrder:10}],
  families:[family],
};
const publicCatalog={
  ok:true,
  pricing:{tierKey:'launch',tierLabel:'Prix coûtant · lancement',remaining:2},
  cities:[{
    id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[{
      id:'format-hors-norme',slug:'hors-norme',name:'Hors Norme',concept:'Interview signature',description:'Le concept Hors Norme.',durationLabel:'60 min',image:'/assets/posters/hors-norme-wide.webp',
      offers:[{id:'offer-launch',name:'Prix coûtant · lancement',clientPriceCents:99000,currency:'eur',priceSuffix:'HT',pricing:{tierKey:'launch',tierLabel:'Prix coûtant · lancement',remaining:2,basePriceCents:159000},configurations:family.configurationVisuals}],
    }],
  }],
};
const adminUser={id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const adminState={user:adminUser,programs:[{id:'p1',name:'Legacy format',slug:'legacy',displayOrder:10,active:true}],episodes:[],ads:[],users:[adminUser],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('neptune_media_reservation_v96',JSON.stringify({token:'customer-token-that-preview-must-ignore',cityId:'wrong-city',formatId:'wrong-format',configurationChoice:'Wrong'})));
  await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    let body={ok:true};
    if(url.pathname==='/api/auth/status')body={authenticated:true,csrfToken:'test-csrf',user:adminUser};
    else if(url.pathname==='/api/admin/state')body=adminState;
    else if(url.pathname==='/api/admin/clients')body={clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}};
    else if(url.pathname==='/api/admin/media-catalog-v98/context')body=catalogContext;
    else if(url.pathname==='/api/reservation/catalog-v96')body=publicCatalog;
    else if(url.pathname==='/api/auth/logout')body={ok:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(`pageerror:${error.message}`));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console:${message.text()}`);});

  const response=await page.goto(`${baseURL}/studio/advanced.html#programs`,{waitUntil:'commit',timeout});
  assert(response?.ok(),`Studio HTTP ${response?.status()}`);
  await page.waitForSelector('#app:not([hidden])',{timeout});
  await page.waitForSelector('.c98-page',{timeout});
  await page.waitForFunction(()=>document.getElementById('content')?.dataset.c98==='ready',null,{timeout});

  // Regression 1: another Settings screen replaces #content, then Catalogue must really remount.
  await page.getByRole('button',{name:'Finances'}).click();
  await page.waitForFunction(()=>!document.querySelector('.c98-page'),null,{timeout});
  await page.getByRole('button',{name:'Catalogue Media'}).click();
  await page.waitForSelector('.c98-page',{timeout});
  await page.waitForFunction(()=>document.getElementById('content')?.dataset.c98==='ready',null,{timeout});
  assert(!(await page.locator('#content').getByText('Organisez les formats éditoriaux de la chaîne.').count()),'Retour Catalogue affiche encore le gestionnaire legacy');

  // Regression 2: opening visual configurations must update the real tunnel preview URL.
  await page.locator('[data-c98-tab="configurations"]').click();
  await page.waitForSelector('[data-c99-config-manager]',{timeout});
  await page.waitForSelector('.c99-config-card',{timeout});
  const cardLabels=await page.locator('.c99-config-card h4').allTextContents();
  assert(JSON.stringify(cardLabels)===JSON.stringify(['Canapé','Chaise']),`Ordre des configurations altéré: ${JSON.stringify(cardLabels)}`);

  await page.waitForFunction(()=>{
    const frame=document.querySelector('#c98Preview iframe');
    return frame&&frame.src.includes('catalog_view=configuration')&&frame.src.includes('catalog_family=');
  },null,{timeout});
  const iframe=page.locator('#c98Preview iframe');
  const src=await iframe.getAttribute('src');
  assert(src.includes(`catalog_family=${encodeURIComponent(familyKey)}`),`Aperçu non ciblé sur la famille: ${src}`);

  // FrameLocator waits for the iframe navigation itself; page.frames() alone can be one event-loop behind src changes.
  const tunnel=page.frameLocator('#c98Preview iframe');
  await tunnel.locator('.configuration-grid').waitFor({state:'visible',timeout});
  assert(await tunnel.getByText('Quel univers souhaitez-vous ?').isVisible(),'Aperçu réel non ouvert sur l’écran Configuration');
  assert(await tunnel.getByText('DESCRIPTION CLIENT CANAPÉ PERSONNALISÉE').isVisible(),'Description configurée dans Studio ignorée par le tunnel');

  const frame=page.frames().find(candidate=>candidate.url().includes('catalog_preview=studio'));
  assert(frame,'Iframe du tunnel réel non enregistrée après navigation');
  const before=await frame.evaluate(()=>localStorage.getItem('neptune_media_reservation_v96'));
  await tunnel.locator('[data-configuration="Canapé"]').click();
  await tunnel.locator('.configuration-grid').waitFor({state:'visible',timeout});
  const after=await frame.evaluate(()=>localStorage.getItem('neptune_media_reservation_v96'));
  assert(before===after,'Aperçu Studio a modifié le localStorage d’une réservation client');
  assert(await tunnel.getByText('Quel univers souhaitez-vous ?').isVisible(),'Cliquer dans l’aperçu Studio fait avancer vers un vrai paiement/créneau');

  assert(errors.length===0,`Erreurs navigateur: ${errors.join(' | ')}`);
  console.log('Catalogue Media v109 browser audit: OK — retour onglet, ordre, aperçu réel ciblé, description client et isolation localStorage.');
  await context.close();
} finally {
  await browser.close();
}

function assert(condition,message){if(!condition)throw new Error(message);}
