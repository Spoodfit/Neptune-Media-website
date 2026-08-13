import { chromium } from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const timeout=30000;
const familyKey='city-toulouse|format-hors-norme|supplier-recbox';
const format={id:'format-hors-norme',slug:'hors-norme',name:'Hors Norme',concept:'Interview signature',conceptId:'concept-interview',description:'Le concept Hors Norme.',durationLabel:'1 h',shootMinutes:60,totalMinutes:120,shootDurationLabel:'1 h',totalDurationLabel:'2 h',image:'/assets/posters/hors-norme-wide.webp',active:true,publicOrder:10};
const service={id:'service-toulouse-recbox-hn',cityId:'city-toulouse',cityName:'Toulouse',supplierId:'supplier-recbox',supplierName:'RecBox',formatId:'format-hors-norme',formatName:'Hors Norme',preparationUrl:'https://example.com/preparation',notes:'',active:true};
const rates=[
  {id:'rate-2h',serviceId:service.id,unitCode:'block',durationMinutes:120,label:'Bloc horaire · 2 h',netCents:32000,vatRateBps:2000,grossCents:38400,active:true,publicOrder:10},
  {id:'rate-halfday',serviceId:service.id,unitCode:'half_day',durationMinutes:240,label:'Demi-journée · 4 h',netCents:55000,vatRateBps:2000,grossCents:66000,active:true,publicOrder:20},
];
const family={key:familyKey,cityId:'city-toulouse',cityName:'Toulouse',formatId:format.id,formatName:format.name,formatSlug:format.slug,supplierId:'supplier-recbox',supplierName:'RecBox',active:true,publicOrder:10,priceSuffix:'HT',currency:'eur',supplierNetCents:32000,vatRateBps:2000,preparationUrl:service.preparationUrl,supplierRateId:'rate-2h',supplierRate:rates[0],service,tiers:{launch:{id:'offer-launch',clientPriceCents:99000,paymentUrl:'https://buy.stripe.com/test-launch'},promo:{id:'offer-promo',clientPriceCents:129000,paymentUrl:'https://buy.stripe.com/test-promo'},base:{id:'offer-base',clientPriceCents:159000,paymentUrl:'https://buy.stripe.com/test-base'}},configurationOptions:['Canapé'],configurationVisuals:[{label:'Canapé',image:'/assets/posters/studio-wide.webp',description:'Canapé'}],format};
const contextData={ok:true,release:'neptune-media-catalog-model-20260813-v116',modelRelease:'neptune-media-catalog-model-20260813-v116',formats:[format],concepts:[{id:'concept-interview',label:'Interview signature',active:true,publicOrder:10}],suppliers:[{id:'supplier-recbox',name:'RecBox',email:'studio@example.com',legalName:'RecBox',active:true,serviceCount:1,rateCount:2}],cities:[{id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',active:true,publicOrder:10,supplierCount:1,serviceCount:1}],families:[family],services:[service],supplierRates:rates,durationOptions:[{minutes:30,label:'30 min'},{minutes:60,label:'1 h'},{minutes:90,label:'1 h 30'},{minutes:120,label:'2 h'},{minutes:180,label:'3 h'},{minutes:240,label:'4 h'}],rateUnits:[{code:'half_hour',label:'Demi-heure'},{code:'hour',label:'Heure'},{code:'block',label:'Bloc horaire'},{code:'half_day',label:'Demi-journée'},{code:'day',label:'Journée'},{code:'custom',label:'Durée personnalisée'}]};
const publicCatalog={ok:true,pricing:{tierKey:'launch',tierLabel:'Prix coûtant · lancement',remaining:2},cities:[{id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[{...format,offers:[{id:'offer-launch',clientPriceCents:99000,currency:'eur',priceSuffix:'HT',pricing:{tierKey:'launch',tierLabel:'Prix coûtant · lancement',remaining:2},configurations:family.configurationVisuals}]}]}]};
const adminUser={id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const adminState={user:adminUser,programs:[],episodes:[],ads:[],users:[adminUser],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1500,height:1100},serviceWorkers:'block'});
  await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let body={ok:true};
    if(url.pathname==='/api/auth/status')body={authenticated:true,csrfToken:'test-csrf',user:adminUser};
    else if(url.pathname==='/api/admin/state')body=adminState;
    else if(url.pathname==='/api/admin/clients')body={clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}};
    else if(url.pathname==='/api/admin/media-catalog-v98/context')body=contextData;
    else if(url.pathname==='/api/reservation/catalog-v96')body=publicCatalog;
    else if(url.pathname==='/api/auth/logout')body={ok:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(`pageerror:${error.message}`));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console:${message.text()}`);});
  const response=await page.goto(`${baseURL}/studio/advanced.html#programs`,{waitUntil:'commit',timeout});assert(response?.ok(),`Studio HTTP ${response?.status()}`);
  await page.waitForSelector('#app:not([hidden])',{timeout});await page.waitForSelector('.c98-page',{timeout});
  await page.waitForFunction(()=>document.body.dataset.mediaCatalogFormV116&&document.querySelector('[data-c116-services]'),null,{timeout});

  const layout=page.locator('.c98-layout'),panel=page.locator('details.c116-preview-panel');
  assert(await panel.count()===1,'Aperçu rétractable v116 absent');
  assert(await page.locator('.c98-layout #c98Preview').count()===0,'Aperçu encore coincé dans la colonne droite');
  assert(await panel.locator('#c98Preview').count()===1,'Aperçu réel non déplacé sous la zone de travail');
  const layoutBox=await layout.boundingBox(),workBox=await page.locator('#c98Work').boundingBox();assert(layoutBox&&workBox&&workBox.width>layoutBox.width*.9,'Zone manipulable non pleine largeur');

  await page.locator('[data-edit-format="format-hors-norme"]').click();await page.waitForSelector('#formatForm[data-c116="1"]',{timeout});
  const slug=page.locator('#formatForm [name="slug"]');assert(await slug.isEditable()===false,'Slug format encore modifiable');
  assert(await page.locator('#formatForm [name="concept"]').count()===0,'Accroche/concept encore en saisie libre');
  assert(await page.locator('#formatForm [name="conceptId"] option').allTextContents().then(items=>items.some(text=>text.includes('+ Ajouter un autre concept'))),'Ajout contrôlé de concept absent');
  assert(await page.locator('#formatForm [name="durationLabel"]').count()===0,'Ancienne durée affichée encore présente');
  assert(await page.locator('#formatForm select[name="shootMinutes"]').inputValue()==='60','Durée de tournage structurée incorrecte');
  assert(await page.locator('#formatForm select[name="totalMinutes"]').inputValue()==='120','Durée totale structurée incorrecte');

  await page.locator('[data-c116-services]').click();await page.waitForSelector('.c116-service-card',{timeout});
  assert(await page.locator('.c116-service-card').count()===1,'Prestation fournisseur non rendue');
  assert(await page.locator('.c116-service-card [data-c116-edit-rate]').count()===2,'Plusieurs tarifs fournisseur non rendus');
  assert(await page.getByText('Bloc horaire · 2 h').isVisible(),'Tarif 2 h absent');
  assert(await page.getByText('Demi-journée · 4 h').isVisible(),'Tarif demi-journée absent');

  await page.locator('[data-c98-tab="offers"]').click();await page.locator(`[data-edit-offer="${familyKey}"]`).click();await page.waitForSelector('#offerForm[data-c116="1"]',{timeout});
  assert(await page.locator('#offerForm [name="supplierNet"]').count()===0,'Coût fournisseur libre encore présent dans l’offre');
  assert(await page.locator('#offerForm [name="vatRate"]').count()===0,'TVA fournisseur libre encore présente dans l’offre');
  const rateOptions=await page.locator('#offerForm [name="supplierRateId"] option').allTextContents();assert(rateOptions.filter(Boolean).length===2,`Sélecteur tarif fournisseur incomplet: ${JSON.stringify(rateOptions)}`);
  assert(errors.length===0,`Erreurs navigateur: ${errors.join(' | ')}`);
  console.log('Catalogue Media v116 browser audit: OK — slugs verrouillés, durées structurées, prestations multi-tarifs, offre sans coût libre et aperçu pleine largeur rétractable.');
  await context.close();
} finally {await browser.close();}
function assert(condition,message){if(!condition)throw new Error(message);}
