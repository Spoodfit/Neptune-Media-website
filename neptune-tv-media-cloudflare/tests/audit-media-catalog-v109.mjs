await import('./diagnose-catalog-preview-v109.mjs');
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
  page.on('pageerror',error=>errors.push(`pageerror:${error.stack||error.message}`));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console:${message.text()}`);});

  const response=await page.goto(`${baseURL}/studio/advanced.html#programs`,{waitUntil:'commit',timeout});
  assert(response?.ok(),`Studio HTTP ${response?.status()}`);
  await page.waitForSelector('#app:not([hidden])',{timeout});
  await page.waitForSelector('.c98-page',{timeout});
  await page.waitForFunction(()=>document.getElementById('content')?.dataset.c98==='ready',null,{timeout});
  await page.waitForSelector('#studioCatalogGlanceV1221',{timeout});

  await page.getByRole('link',{name:'Finance',exact:true}).click();
  await page.waitForFunction(()=>location.hash==='#finances'&&!document.querySelector('.c98-page'),null,{timeout});
  await page.getByRole('link',{name:'Catalogue Média',exact:true}).click();
  await page.waitForFunction(()=>location.hash==='#programs',null,{timeout});
  await page.waitForSelector('.c98-page',{timeout});
  await page.waitForFunction(()=>document.getElementById('content')?.dataset.c98==='ready',null,{timeout});
  await page.waitForSelector('#studioCatalogGlanceV1221',{timeout});
  assert(!(await page.locator('#content').getByText('Organisez les formats éditoriaux de la chaîne.').count()),'Retour Catalogue affiche encore le gestionnaire legacy');

  const dimensions=await page.evaluate(()=>{
    const layout=document.querySelector('.c98-layout')?.getBoundingClientRect();
    const work=document.querySelector('.c98-work')?.getBoundingClientRect();
    const preview=document.getElementById('c98Preview');
    const content=document.getElementById('content')?.getBoundingClientRect();
    return {
      layoutWidth:layout?.width||0,
      workWidth:work?.width||0,
      contentWidth:content?.width||0,
      previewDisplay:preview?getComputedStyle(preview).display:'missing',
      pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    };
  });
  assert(dimensions.layoutWidth>0&&dimensions.workWidth/dimensions.layoutWidth>.97,`Catalogue n’utilise pas toute la largeur: ${JSON.stringify(dimensions)}`);
  assert(dimensions.previewDisplay==='none','Aperçu tunnel permanent encore visible');
  assert(dimensions.pageOverflow<=1,`Débordement horizontal Catalogue: ${dimensions.pageOverflow}px`);
  assert(await page.locator('[data-v122-catalog-tab]').count()===5,'Vue d’ensemble Catalogue incomplète');
  assert(await page.getByRole('link',{name:'Voir le tunnel de réservation côté client'}).count()===1,'Bouton tunnel client absent');
  await page.waitForFunction(()=>document.querySelector('[data-v122-catalog-value="formats"]')?.textContent.includes('1 actif'),null,{timeout});

  await page.locator('[data-v122-catalog-tab="configurations"]').click();
  await page.waitForSelector('[data-c99-config-manager]',{timeout});
  await page.waitForSelector('.c99-config-card',{timeout});
  const cardLabels=await page.locator('.c99-config-card h4').allTextContents();
  assert(JSON.stringify(cardLabels)===JSON.stringify(['Canapé','Chaise']),`Ordre des configurations altéré: ${JSON.stringify(cardLabels)}`);
  assert((await page.locator('[data-v122-catalog-tab="configurations"]').getAttribute('aria-current'))==='true','Raccourci actif non synchronisé avec la section');

  /* La prévisualisation historique reste synchronisée en arrière-plan pour préserver
     le contrat v109, mais elle ne participe plus au layout. */
  await page.waitForFunction(()=>document.getElementById('c98Preview')?.dataset.catalogPreviewOwner==='v109',null,{timeout});
  assert(await page.locator('#c98Preview iframe').count()===1,'Plusieurs iframes de prévisualisation coexistent');
  const iframe=page.locator('#c98Preview iframe[data-catalog-preview-v109]');
  await iframe.waitFor({state:'attached',timeout});
  await page.waitForFunction(()=>{
    const frame=document.querySelector('#c98Preview iframe[data-catalog-preview-v109]');
    return frame&&frame.src.includes('catalog_view=configuration')&&frame.src.includes('catalog_family=');
  },null,{timeout});
  const src=await iframe.getAttribute('src');
  assert(src.includes(`catalog_family=${encodeURIComponent(familyKey)}`),`Aperçu non ciblé sur la famille: ${src}`);
  const iframeHandle=await iframe.elementHandle();
  const frame=await iframeHandle?.contentFrame();
  assert(frame&&frame.url().includes('catalog_preview=studio'),'Iframe stable non naviguée vers le tunnel Studio');
  await frame.waitForSelector('.configuration-grid',{state:'attached',timeout});
  assert((await frame.getByText('DESCRIPTION CLIENT CANAPÉ PERSONNALISÉE').count())>0,'Description configurée dans Studio ignorée par le tunnel');
  const before=await frame.evaluate(()=>localStorage.getItem('neptune_media_reservation_v96'));
  await frame.evaluate(()=>document.querySelector('[data-configuration="Canapé"]')?.click());
  const after=await frame.evaluate(()=>localStorage.getItem('neptune_media_reservation_v96'));
  assert(before===after,'Aperçu Studio a modifié le localStorage d’une réservation client');

  /* Le bouton d’une offre ouvre désormais directement le tunnel ciblé, au lieu de
     monopoliser une colonne permanente dans le Studio. */
  await page.locator('[data-v122-catalog-tab="offers"]').click();
  await page.waitForSelector('[data-preview]',{timeout});
  const popupPromise=page.waitForEvent('popup',{timeout});
  await page.locator('[data-preview]').first().click();
  const popup=await popupPromise;
  await popup.waitForLoadState('domcontentloaded',{timeout});
  const popupUrl=new URL(popup.url());
  assert(popupUrl.pathname==='/reserver','Prévisualisation à la demande n’ouvre pas le tunnel');
  assert(popupUrl.searchParams.get('catalog_preview')==='studio','Mode aperçu Studio absent du tunnel ouvert');
  assert(popupUrl.searchParams.get('catalog_family')===familyKey,'Offre ciblée perdue dans le tunnel ouvert');
  await popup.close();

  assert(errors.length===0,`Erreurs navigateur: ${errors.join(' | ')}`);
  console.log('Catalogue Media v122.1 browser audit: OK — pleine largeur, vue d’ensemble, aperçu permanent masqué, tunnel à la demande et contrats v109 préservés.');
  await context.close();
} finally {
  await browser.close();
}

function assert(condition,message){if(!condition)throw new Error(message);}