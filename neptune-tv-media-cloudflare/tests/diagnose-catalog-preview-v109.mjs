import { chromium } from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const familyKey='city-toulouse|format-hors-norme|supplier-recbox';
const publicCatalog={ok:true,pricing:{tierKey:'launch',tierLabel:'Prix coûtant · lancement',remaining:2},cities:[{id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[{id:'format-hors-norme',slug:'hors-norme',name:'Hors Norme',concept:'Interview signature',description:'Le concept Hors Norme.',durationLabel:'60 min',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'offer-launch',name:'Prix coûtant · lancement',clientPriceCents:99000,currency:'eur',priceSuffix:'HT',pricing:{tierKey:'launch',tierLabel:'Prix coûtant · lancement',remaining:2,basePriceCents:159000},configurations:[{label:'Canapé',imageBase64:'/assets/formats/exact-hn1.b64',description:'DESCRIPTION CLIENT CANAPÉ PERSONNALISÉE'},{label:'Chaise',imageBase64:'/assets/formats/exact-hn2.b64',description:'DESCRIPTION CLIENT CHAISE PERSONNALISÉE'}]}]}]}]};

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('neptune_media_reservation_v96',JSON.stringify({token:'must-be-ignored',cityId:'wrong',formatId:'wrong'})));
  await context.route('**/api/reservation/catalog-v96**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(publicCatalog)}));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(`pageerror:${error.message}`));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console:${message.text()}`);});
  const runtime=await context.request.get(`${baseURL}/reserver/assets/app-v96.js?diagnose=v109`);
  const runtimeText=await runtime.text();
  console.log(JSON.stringify({runtimeStatus:runtime.status(),runtimeMarker:runtime.headers()['x-neptune-sales-tunnel-preview']||'',hasPreviewFlag:runtimeText.includes("STUDIO_CATALOG_PREVIEW=params.get('catalog_preview')==='studio'"),hasHydrator:runtimeText.includes('hydrateStudioCatalogPreview()'),hasDescription:runtimeText.includes('o.description||configurationCopy(o.label)')}));
  const url=`${baseURL}/reserver?catalog_preview=studio&catalog_view=configuration&catalog_family=${encodeURIComponent(familyKey)}`;
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(2500);
  const diagnostic=await page.evaluate(()=>({url:location.href,preview:document.body.dataset.catalogPreview||'',release:document.body.dataset.salesTunnelRelease||'',enhancement:document.body.dataset.salesTunnelEnhancement||'',text:document.getElementById('app-content')?.innerText||'',html:document.getElementById('app-content')?.innerHTML?.slice(0,1200)||'',storage:localStorage.getItem('neptune_media_reservation_v96')}));
  console.log(JSON.stringify({http:response?.status(),errors,diagnostic},null,2));
  if(!runtime.ok())throw new Error(`runtime HTTP ${runtime.status()}`);
  if(!runtimeText.includes("STUDIO_CATALOG_PREVIEW=params.get('catalog_preview')==='studio'"))throw new Error('runtime preview patch absent');
  if(errors.length)throw new Error(errors.join(' | '));
  if(!diagnostic.preview)throw new Error(`preview hydration absent; content=${diagnostic.text.slice(0,500)}`);
  if(!diagnostic.text.includes('Quel univers souhaitez-vous ?'))throw new Error(`configuration screen absent; content=${diagnostic.text.slice(0,500)}`);
  if(!diagnostic.text.includes('DESCRIPTION CLIENT CANAPÉ PERSONNALISÉE'))throw new Error(`configured description absent; content=${diagnostic.text.slice(0,500)}`);
  console.log('Catalogue v109 direct preview diagnosis: OK.');
}finally{await browser.close();}
