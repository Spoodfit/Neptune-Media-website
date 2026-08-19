await import('./diagnose-catalog-preview-v109.mjs');
import { chromium } from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const timeout=30000;
const runtimeRelease='neptune-studio-catalog-marketplace-20260820-v130-runtime';
const familyKey='city-toulouse|format-hors-norme|supplier-recbox';
const family={
  key:familyKey,
  cityId:'city-toulouse',cityName:'Toulouse',formatId:'format-hors-norme',formatName:'Hors Norme',formatSlug:'hors-norme',
  supplierId:'supplier-recbox',supplierName:'RecBox',active:true,publicOrder:10,priceSuffix:'HT',currency:'eur',supplierNetCents:60000,vatRateBps:2000,preparationUrl:'https://example.com/preparation',
  tiers:{launch:{id:'offer-launch',clientPriceCents:99000,paymentUrl:'https://buy.stripe.com/test-launch'},promo:{id:'offer-promo',clientPriceCents:129000,paymentUrl:'https://buy.stripe.com/test-promo'},base:{id:'offer-base',clientPriceCents:159000,paymentUrl:'https://buy.stripe.com/test-base'}},
  configurationOptions:['Canapé','Chaise'],
  configurationVisuals:[{label:'Canapé',imageBase64:'/assets/formats/exact-hn1.b64',description:'DESCRIPTION CLIENT CANAPÉ PERSONNALISÉE'},{label:'Chaise',imageBase64:'/assets/formats/exact-hn2.b64',description:'DESCRIPTION CLIENT CHAISE PERSONNALISÉE'}],
  format:{id:'format-hors-norme',slug:'hors-norme',name:'Hors Norme',concept:'Interview signature',description:'Le concept Hors Norme.',durationLabel:'60 min',image:'/assets/posters/hors-norme-wide.webp',active:true},
};
const service={id:'service-1',cityId:'city-toulouse',cityName:'Toulouse',supplierId:'supplier-recbox',supplierName:'RecBox',formatId:'format-hors-norme',formatName:'Hors Norme',active:true,preparationUrl:'https://example.com/preparation'};
const catalogContext={ok:true,formats:[family.format],suppliers:[{id:'supplier-recbox',name:'RecBox',active:true,defaultNetCents:60000,vatRateBps:2000}],cities:[{id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',active:true,publicOrder:10}],families:[family],services:[service],supplierRates:[],rateUnits:[],durationOptions:[]};
const publicCatalog={ok:true,pricing:{tierKey:'launch',tierLabel:'Prix coûtant · lancement',remaining:2},cities:[{id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[{id:'format-hors-norme',slug:'hors-norme',name:'Hors Norme',concept:'Interview signature',description:'Le concept Hors Norme.',durationLabel:'60 min',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'offer-launch',name:'Prix coûtant · lancement',clientPriceCents:99000,currency:'eur',priceSuffix:'HT',pricing:{tierKey:'launch',tierLabel:'Prix coûtant · lancement',remaining:2,basePriceCents:159000},configurations:family.configurationVisuals}]}]}]};
const adminUser={id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const adminState={user:adminUser,programs:[{id:'p1',name:'Legacy format',slug:'legacy',displayOrder:10,active:true}],episodes:[],ads:[],users:[adminUser],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('neptune_media_reservation_v96',JSON.stringify({token:'customer-token-that-preview-must-ignore',cityId:'wrong-city',formatId:'wrong-format',configurationChoice:'Wrong'})));
  await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let body={ok:true};
    if(url.pathname==='/api/auth/status')body={authenticated:true,csrfToken:'test-csrf',user:adminUser};
    else if(url.pathname==='/api/admin/state')body=adminState;
    else if(url.pathname==='/api/admin/clients')body={clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}};
    else if(url.pathname==='/api/admin/media-catalog-v98/context')body=catalogContext;
    else if(url.pathname==='/api/reservation/catalog-v96')body=publicCatalog;
    else if(url.pathname==='/api/auth/logout')body={ok:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(`pageerror:${error.stack||error.message}`));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console:${message.text()}`);});

  const response=await page.goto(`${baseURL}/studio/advanced.html#programs`,{waitUntil:'commit',timeout});
  assert(response?.ok(),`Studio HTTP ${response?.status()}`);
  assert((await response.headerValue('x-neptune-catalog-runtime'))===runtimeRelease,'Le Worker ne marque pas le runtime Catalogue v130');
  await page.waitForSelector('#app:not([hidden])',{timeout});
  await page.waitForSelector('.c98-page',{timeout});
  await page.waitForFunction(()=>document.getElementById('content')?.dataset.c98==='ready',null,{timeout});
  await page.waitForSelector('#studioCatalogMarketplaceV128',{state:'visible',timeout});
  await page.waitForSelector('.v128-offer',{timeout});
  assert((await page.evaluate(()=>document.body.dataset.studioCatalogRuntime))===runtimeRelease,'Le runtime Catalogue v130 ne s’est pas exécuté');
  assert(await page.locator('script[data-neptune-disabled="catalog-v128"]').count()===1,'L’ancien runtime Catalogue reste exécutable');

  assert(await page.locator('#studioCatalogGlanceV1221').count()===0,'Les six raccourcis legacy sont encore montés');
  assert(await page.locator('[data-v122-catalog-tab]').count()===0,'Ancienne navigation catalogue encore visible');
  assert(await page.locator('[data-v130-city]').count()===2,'Sélecteur ville marketplace incomplet');
  assert((await page.getByText('Toulouse',{exact:true}).count())>=1,'Ville Toulouse absente de la marketplace');
  assert((await page.getByText('Hors Norme',{exact:true}).count())>=1,'Concept Hors Norme absent de la marketplace');
  assert((await page.getByText('RecBox',{exact:true}).count())>=1,'Fournisseur absent de la carte offre');
  assert((await page.getByText('600 € HT',{exact:true}).count())>=1||(await page.getByText('600 € HT',{exact:true}).count())>=1,'Coût fournisseur absent');
  assert((await page.getByText('990 € HT',{exact:true}).count())>=1||(await page.getByText('990 € HT',{exact:true}).count())>=1,'Tarif coûtant absent');
  assert((await page.getByText('1 290 € HT',{exact:true}).count())>=1||(await page.getByText('1 290 € HT',{exact:true}).count())>=1,'Tarif préférentiel absent');
  assert((await page.getByText('1 590 € HT',{exact:true}).count())>=1||(await page.getByText('1 590 € HT',{exact:true}).count())>=1,'Tarif normal absent');
  assert((await page.getByText('Canapé',{exact:true}).count())>=1&&(await page.getByText('Chaise',{exact:true}).count())>=1,'Configurations absentes de la carte');
  assert(await page.getByRole('button',{name:'Gérer les données ▾'}).count()===1,'Administration secondaire absente');
  assert(await page.getByRole('link',{name:'Voir le tunnel de réservation côté client'}).count()===1,'Bouton tunnel client absent');

  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,legacyLayout:getComputedStyle(document.querySelector('.c98-layout')).display,legacyTabs:getComputedStyle(document.querySelector('.c98-tabs')).display}));
  assert(geometry.overflow<=1,`Débordement horizontal Catalogue: ${geometry.overflow}px`);
  assert(geometry.legacyLayout==='none','Gestion legacy visible dans la marketplace');
  assert(geometry.legacyTabs==='none','Onglets legacy visibles dans la marketplace');

  const search=page.locator('[data-v130-search]');
  await search.fill('recbox');
  assert(await page.locator('.v128-offer').count()===1,'Recherche fournisseur ne retrouve pas l’offre');
  await search.fill('ville introuvable');
  assert((await page.getByText('Aucun résultat.',{exact:true}).count())===1,'État vide de recherche absent');
  await search.fill('');

  const popupPromise=page.waitForEvent('popup',{timeout});
  await page.getByRole('link',{name:'Voir côté client ↗'}).click();
  const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded',{timeout});
  const popupUrl=new URL(popup.url());
  assert(popupUrl.pathname==='/reserver','La carte marketplace n’ouvre pas le tunnel');
  assert(popupUrl.searchParams.get('catalog_preview')==='studio','Mode aperçu Studio absent');
  assert(popupUrl.searchParams.get('catalog_family')===familyKey,'Famille offre perdue');
  await popup.close();

  await page.getByRole('button',{name:'Gérer les données ▾'}).click();
  await page.getByRole('button',{name:'Configurations',exact:true}).click();
  await page.waitForSelector('[data-c99-config-manager]',{timeout});
  const adminDisplay=await page.evaluate(()=>({market:getComputedStyle(document.getElementById('studioCatalogMarketplaceV128')).display,layout:getComputedStyle(document.querySelector('.c98-layout')).display,bar:getComputedStyle(document.getElementById('studioCatalogAdminV128')).display}));
  assert(adminDisplay.market==='none'&&adminDisplay.layout!=='none'&&adminDisplay.bar!=='none',`Bascule gestion incorrecte: ${JSON.stringify(adminDisplay)}`);
  const cardLabels=await page.locator('.c99-config-card h4').allTextContents();
  assert(JSON.stringify(cardLabels)===JSON.stringify(['Canapé','Chaise']),`Ordre des configurations altéré: ${JSON.stringify(cardLabels)}`);
  await page.getByRole('button',{name:'← Retour au catalogue'}).click();
  await page.waitForSelector('#studioCatalogMarketplaceV128',{state:'visible',timeout});

  await page.getByRole('button',{name:'Modifier',exact:true}).click();
  await page.waitForSelector('#offerForm',{timeout});
  assert((await page.locator('#offerForm').count())===1,'Éditeur offre non ouvert depuis la marketplace');
  await page.getByRole('button',{name:'← Retour au catalogue'}).click();
  await page.waitForSelector('#studioCatalogMarketplaceV128',{state:'visible',timeout});

  assert(errors.length===0,`Erreurs navigateur: ${errors.join(' | ')}`);
  console.log('Catalogue Media v130 browser audit: OK — runtime Worker actif, marketplace par ville, offre agrégée, recherche, tarifs visibles et administration secondaire.');
  await context.close();
} finally {await browser.close();}

function assert(condition,message){if(!condition)throw new Error(message);}
