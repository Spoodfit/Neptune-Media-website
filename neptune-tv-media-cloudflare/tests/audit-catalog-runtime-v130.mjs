import { chromium } from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const release='neptune-studio-catalog-marketplace-20260820-v130-runtime';
const timeout=30000;
const family={
  key:'city-toulouse|format-hors-norme|supplier-recbox',cityId:'city-toulouse',cityName:'Toulouse',formatId:'format-hors-norme',formatName:'Hors Norme',supplierId:'supplier-recbox',supplierName:'RecBox',active:true,publicOrder:10,supplierNetCents:60000,
  tiers:{launch:{clientPriceCents:99000},promo:{clientPriceCents:129000},base:{clientPriceCents:159000}},
  configurationOptions:['Canapé','Chaise'],configurationVisuals:[{label:'Canapé'},{label:'Chaise'}],
};
const catalog={ok:true,formats:[{id:'format-hors-norme',name:'Hors Norme',concept:'Interview signature',durationLabel:'60 min',image:'/assets/posters/hors-norme-wide.webp',active:true}],suppliers:[{id:'supplier-recbox',name:'RecBox',active:true,defaultNetCents:60000}],cities:[{id:'city-toulouse',name:'Toulouse',country:'France',active:true,publicOrder:10}],families:[family],services:[]};
const user={id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const admin={user,programs:[],episodes:[],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.route('**/api/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    let body={ok:true};
    if(pathname==='/api/auth/status')body={authenticated:true,csrfToken:'test-csrf',user};
    else if(pathname==='/api/admin/state')body=admin;
    else if(pathname==='/api/admin/clients')body={clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}};
    else if(pathname==='/api/admin/media-catalog-v98/context')body=catalog;
    else if(pathname==='/api/reservation/catalog-v96')body={ok:true,cities:[],pricing:{}};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});

  const response=await page.goto(`${baseURL}/studio/advanced.html#programs`,{waitUntil:'commit',timeout});
  assert(response?.ok(),`Studio HTTP ${response?.status()}`);
  assert((await response.headerValue('x-neptune-catalog-runtime'))===release,'Header Worker Catalogue v130 absent');
  await page.waitForSelector('#app:not([hidden])',{timeout});
  await page.waitForSelector('#studioCatalogMarketplaceV128 .v128-offer',{state:'visible',timeout});

  const snapshot=await page.evaluate(()=>({
    release:document.body.dataset.studioCatalogRuntime||'',
    legacyScript:document.querySelector('script[data-neptune-disabled="catalog-v128"]')?.type||'',
    oldGlance:Boolean(document.querySelector('#studioCatalogGlanceV1221')),
    oldTabs:getComputedStyle(document.querySelector('.c98-tabs')).display,
    oldLayout:getComputedStyle(document.querySelector('.c98-layout')).display,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    text:document.querySelector('#studioCatalogMarketplaceV128')?.textContent||'',
  }));
  assert(snapshot.release===release,`Runtime exécuté incorrect: ${snapshot.release}`);
  assert(snapshot.legacyScript==='application/x-neptune-disabled','Ancien runtime Catalogue encore exécutable');
  assert(!snapshot.oldGlance,'Ancienne rangée de raccourcis encore montée');
  assert(snapshot.oldTabs==='none'&&snapshot.oldLayout==='none','Gestion historique visible par défaut');
  assert(snapshot.overflow<=1,`Débordement horizontal: ${snapshot.overflow}px`);
  for(const text of ['Toutes les villes','Toulouse','Hors Norme','RecBox','Coût fournisseur','Coûtant','Préférentiel','Normal','Canapé','Chaise','Gérer les données'])assert(snapshot.text.includes(text),`Marketplace v130 sans « ${text} »`);

  await page.locator('[data-v130-search]').fill('recbox');
  assert(await page.locator('.v128-offer').count()===1,'Recherche fournisseur non fonctionnelle');
  await page.getByRole('button',{name:/Gérer les données/}).click();
  await page.getByRole('button',{name:'Fournisseurs',exact:true}).click();
  await page.waitForFunction(()=>document.body.classList.contains('v128-catalog-admin-open'),null,{timeout});
  assert((await page.locator('.c98-layout').evaluate(node=>getComputedStyle(node).display))!=='none','Administration détaillée inaccessible');
  await page.getByRole('button',{name:'← Retour au catalogue'}).click();
  await page.waitForSelector('#studioCatalogMarketplaceV128',{state:'visible',timeout});

  assert(errors.length===0,`Erreurs navigateur: ${errors.join(' | ')}`);
  console.log('Catalogue runtime v130 browser audit: OK');
  await context.close();
}finally{await browser.close();}

function assert(condition,message){if(!condition)throw new Error(message);}
