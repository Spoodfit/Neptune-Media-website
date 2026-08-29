import {chromium} from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const familyKey='city-toulouse|format-hors-norme|supplier-recbox';
const tierIds={launch:'offer-hn-launch',promo:'offer-hn-promo',base:'offer-hn-base'};
const families=[{
  key:familyKey,cityId:'city-toulouse',cityName:'Toulouse',formatId:'format-hors-norme',formatName:'Hors Norme',supplierId:'supplier-recbox',supplierName:'RECBOX',active:true,
  supplierNetCents:60000,vatRateBps:2000,configurationOptions:['Chaise','Canapé'],configurationVisuals:[{label:'Chaise',description:'Interview dynamique'},{label:'Canapé',description:'Conversation posée'}],
  tiers:{launch:{id:tierIds.launch,name:'Tarif de lancement',clientPriceCents:89000,paymentUrl:'https://buy.stripe.com/test-launch',active:true,supplierGrossCents:72000},promo:{id:tierIds.promo,name:'Tarif préférentiel',clientPriceCents:149000,paymentUrl:'https://buy.stripe.com/test-promo',active:true,supplierGrossCents:72000},base:{id:tierIds.base,name:'Tarif de base',clientPriceCents:199000,paymentUrl:'https://buy.stripe.com/test-base',active:true,supplierGrossCents:72000}}
}];
const catalog={ok:true,formats:[{id:'format-hors-norme',name:'Hors Norme',concept:'Émission Neptune Business',description:'Interview incarnée',shootMinutes:60,totalMinutes:90,image:'/assets/logo-neptune.svg',active:true,publicOrder:10}],suppliers:[{id:'supplier-recbox',name:'RECBOX',email:'contact@recbox.fr',legalName:'RECBOX',active:true,defaultNetCents:60000,vatRateBps:2000,defaultGrossCents:72000}],cities:[{id:'city-toulouse',name:'Toulouse',country:'France',active:true}],families,services:[],supplierRates:[],rateUnits:[],durationOptions:[]};
const policies={ok:true,offerPolicies:[{offerId:tierIds.launch,tierCode:'launch',visible:true,capacity:3,usedPlaces:1},{offerId:tierIds.promo,tierCode:'promo',visible:true,capacity:7,usedPlaces:0},{offerId:tierIds.base,tierCode:'base',visible:true,capacity:0,usedPlaces:0}]};
const publicCatalog={ok:true,cities:[{id:'city-toulouse',name:'Toulouse',formats:[{id:'format-hors-norme',name:'Hors Norme',offers:[{id:tierIds.launch},{id:tierIds.promo},{id:tierIds.base}]}]}]};
const user={id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const admin={user,programs:[],episodes:[],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};

await main();

async function main(){
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];let familySaves=0,publicGets=0;
  page.on('pageerror',error=>errors.push(`PAGE ${error.message}`));
  page.on('console',message=>{if(message.type()==='error'&&!/^Failed to load resource:/u.test(message.text()))errors.push(`CONSOLE ${message.text()}`)});
  await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(path==='/api/reservation/catalog-v96'){publicGets+=1;return json(route,publicCatalog)}
    if(path==='/api/auth/status')return json(route,{authenticated:true,csrfToken:'test-csrf',user});
    if(path==='/api/admin/state')return json(route,admin);
    if(path==='/api/admin/clients')return json(route,{clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}});
    if(path==='/api/admin/media-catalog-v98/context')return json(route,catalog);
    if(path==='/api/admin/media-catalog-v143/policies')return json(route,policies);
    if(path==='/api/admin/sales-config-v96/stripe-links')return json(route,{ok:true,links:[]});
    if(path==='/api/admin/media-catalog-v143/family/save'){familySaves+=1;return json(route,{ok:true,savedTierIds:tierIds,supplierGrossCents:72000})}
    if(path==='/api/admin/media-catalog-v143/city/save')return json(route,{...catalog,ok:true,savedId:'city-toulouse'});
    if(path==='/api/admin/media-catalog-v98/supplier/save')return json(route,{...catalog,ok:true,savedId:'supplier-recbox'});
    if(path==='/api/admin/media-catalog-v98/format/save')return json(route,{...catalog,ok:true,savedId:'format-hors-norme'});
    if(path==='/api/admin/media-catalog-v98/configuration-visual/save')return json(route,{...catalog,ok:true});
    return json(route,{ok:true});
  });

  try{
    const response=await page.goto(`${baseURL}/studio/advanced.html#programs`,{waitUntil:'domcontentloaded',timeout:30000});
    assert(response?.ok(),`Catalogue HTTP ${response?.status()||'absent'}`);
    await page.waitForSelector('#studioCatalogCommercialCockpitV145',{timeout:30000});
    await page.waitForSelector('[data-v147-manage]',{timeout:10000});
    await page.waitForFunction(()=>document.documentElement.dataset.neptuneCatalogManager?.includes('v147'),null,{timeout:5000});

    const business=page.locator('[data-v142-business-open]');
    if(await business.count())assert(await business.evaluate(node=>getComputedStyle(node).display)==='none','Règles business reste visible dans le Catalogue');

    await page.locator('[data-v147-manage]').click();
    await page.waitForSelector('#v147CatalogManager[open] [data-v147-list="city"]');
    for(const kind of ['city','supplier','concept','physical','offer'])assert(await page.locator(`#v147CatalogManager [data-v147-list="${kind}"]`).count()===1,`Hub sans gestion ${kind}`);

    await page.locator('#v147CatalogManager [data-v147-list="city"]').click();
    await page.waitForSelector('#v147CatalogManager [data-v147-edit="city"]');
    await page.locator('#v147CatalogManager [data-v147-edit="city"]').first().click();
    await page.waitForSelector('#v147CatalogManager [data-v147-form="city"]');
    assert((await page.locator('#v147CatalogManager [name="name"]').inputValue())==='Toulouse','Edition ville non hydratée');

    await page.locator('#v147CatalogManager [data-v147-back-list="city"]').click();
    await page.locator('#v147CatalogManager [data-v147-back]').click();
    await page.locator('#v147CatalogManager [data-v147-list="supplier"]').click();
    await page.locator('#v147CatalogManager [data-v147-edit="supplier"]').first().click();
    await page.waitForSelector('#v147CatalogManager [data-v147-form="supplier"]');
    assert((await page.locator('#v147CatalogManager [name="name"]').inputValue())==='RECBOX','Edition fournisseur non hydratée');

    await page.locator('#v147CatalogManager [data-v147-back-list="supplier"]').click();
    await page.locator('#v147CatalogManager [data-v147-back]').click();
    await page.locator('#v147CatalogManager [data-v147-list="concept"]').click();
    await page.locator('#v147CatalogManager [data-v147-edit="concept"]').first().click();
    await page.waitForSelector('#v147CatalogManager [data-v147-form="concept"]');
    assert((await page.locator('#v147CatalogManager [name="name"]').inputValue())==='Hors Norme','Edition concept non hydratée');

    await page.locator('#v147CatalogManager [data-v147-close]').first().click();
    await page.locator('[data-v145-configure]').first().click();
    await page.waitForSelector('#v147CatalogManager [data-v147-form="offer"]');
    assert(await page.locator('.v143-offer-drawer').count()===0,'Configurer délègue encore au drawer legacy');
    const offerForm=page.locator('#v147CatalogManager [data-v147-form="offer"]');
    assert((await offerForm.locator('[name="cityId"]').inputValue())==='city-toulouse','Ville offre incorrecte');
    assert((await offerForm.locator('[name="supplierId"]').inputValue())==='supplier-recbox','Fournisseur offre incorrect');
    assert((await offerForm.locator('[name="formatId"]').inputValue())==='format-hors-norme','Concept offre incorrect');
    await offerForm.locator('button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#syncState')?.dataset.catalogSync==='ok',null,{timeout:10000});
    assert(familySaves>=1,'Aucun POST family/save après Enregistrer');
    assert(publicGets>=1,'Aucune lecture du tunnel public après Enregistrer');

    await page.waitForTimeout(800);
    if(await page.locator('#v147CatalogManager[open]').count())await page.locator('#v147CatalogManager [data-v147-close]').first().click();
    await page.locator('.v145-city-head [data-v145-menu="city"]').first().click();
    await page.waitForSelector('[data-v145-action="city-edit"]');
    await page.locator('[data-v145-action="city-edit"]').click();
    await page.waitForSelector('#v147CatalogManager [data-v147-form="city"]');
    await page.locator('#v147CatalogManager [data-v147-close]').first().click();

    await page.locator('.v145-supplier-head [data-v145-menu="supplier"]').first().click();
    await page.waitForSelector('[data-v145-action="supplier-edit"]');
    await page.locator('[data-v145-action="supplier-edit"]').click();
    await page.waitForSelector('#v147CatalogManager [data-v147-form="supplier"]');
    await page.locator('#v147CatalogManager [data-v147-close]').first().click();

    await page.locator('.v145-offer [data-v145-menu="offer"]').first().click();
    await page.waitForSelector('[data-v145-action="offer-format"]');
    await page.locator('[data-v145-action="offer-format"]').click();
    await page.waitForSelector('#v147CatalogManager [data-v147-form="physical"]');
    assert((await page.locator('#v147CatalogManager [name="conceptId"]').inputValue())==='format-hors-norme','Ajouter un format ne conserve pas le concept');
    await page.locator('#v147CatalogManager [data-v147-close]').first().click();

    await page.locator('[data-v145-add]').click();
    await page.waitForSelector('#v147CatalogManager[open] [data-v147-list="offer"]');
    assert((await page.locator('#v147CatalogManager h2').textContent()).includes('ajoutez'),'Le bouton + Ajouter n’ouvre pas le manager v147');

    const blockingErrors=errors.filter(error=>!error.includes('favicon')&&!error.includes('Permissions policy violation'));
    assert(blockingErrors.length===0,`Erreurs navigateur: ${blockingErrors.join(' | ')}`);
    console.log(`Catalogue manager v147 audit: OK · family saves=${familySaves} · public reads=${publicGets}`);
  }finally{
    await context.close();
    await browser.close();
  }
}

function json(route,body,status=200){return route.fulfill({status,contentType:'application/json; charset=utf-8',headers:{'Cache-Control':'no-store'},body:JSON.stringify(body)})}
function assert(condition,message){if(!condition)throw new Error(message)}
