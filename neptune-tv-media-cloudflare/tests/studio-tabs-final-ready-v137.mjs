import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.ZERO_FLASH_BASE_URL||'http://127.0.0.1:8787';
const user={id:'admin-v137',email:'contact@neptunebusiness.com',fullName:'Compte Studio',role:'admin'};
const adminState={user,programs:[],episodes:[],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};

const browser=await chromium.launch({headless:true});
try{
  await clientsFinalReady();
  await diffusionFinalReady();
  console.log('Studio tabs v137 gate passed: Parcours clients and Diffusion never reveal their intermediate/legacy states.');
}finally{await browser.close();}

async function clientsFinalReady(){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  let releaseClients;
  const clientsGate=new Promise(resolve=>{releaseClients=resolve;});
  await context.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/admin/clients'){
      await clientsGate;
      return json(route,200,{clients:[{id:'c1',fullName:'Client Test',email:'client@example.com'}],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}});
    }
    return mockCommon(route,path);
  });
  const page=await context.newPage();
  try{
    await page.goto(`${base}/studio/clients`,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>Boolean(document.documentElement.dataset.neptuneStudioShellReady),null,{timeout:10000});
    await page.waitForTimeout(250);
    const pending=await page.evaluate(()=>({boot:document.documentElement.getAttribute('data-neptune-studio-boot'),stable:document.documentElement.dataset.neptuneStudioPageStable||'',pipeline:document.getElementById('pipeline')?.textContent||''}));
    assert.equal(pending.boot,'v136','clients: page revealed while client API was still pending');
    assert.equal(pending.stable,'','clients: page marked stable before final pipeline');
    assert.match(pending.pipeline,/Chargement des parcours clients/iu,'clients: expected loading state not exercised');
    releaseClients();
    await page.waitForFunction(()=>document.documentElement.dataset.neptuneStudioPageStable==='v137',null,{timeout:10000});
    const ready=await page.evaluate(()=>({boot:document.documentElement.hasAttribute('data-neptune-studio-boot'),reason:document.documentElement.dataset.neptuneStudioRevealReason,columns:document.querySelectorAll('#pipeline .column').length,nav:document.querySelector('.neptune-studio-sidebar')?.textContent||''}));
    assert.equal(ready.boot,false,'clients: boot guard remains after final render');
    assert.equal(ready.reason,'clients-final','clients: wrong reveal reason');
    assert(ready.columns>0,'clients: final pipeline was not rendered before reveal');
    assert.match(ready.nav,/Parcours clients/iu,'clients: canonical navigation missing');
  }finally{releaseClients?.();await context.close();}
}

async function diffusionFinalReady(){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  let releaseLibrary;
  const libraryGate=new Promise(resolve=>{releaseLibrary=resolve;});
  await context.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/admin/webtv/library'){
      await libraryGate;
      return json(route,200,{ok:true,items:[]});
    }
    return mockCommon(route,path);
  });
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error.message||error)));
  try{
    await page.goto(`${base}/studio/webtv.html`,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>Boolean(document.documentElement.dataset.neptuneStudioShellReady),null,{timeout:10000});
    await page.waitForTimeout(300);
    const pending=await page.evaluate(()=>({boot:document.documentElement.getAttribute('data-neptune-studio-boot'),stable:document.documentElement.dataset.neptuneStudioPageStable||'',cockpit:Boolean(document.getElementById('webtvCockpitV125')),accountName:Boolean(document.getElementById('accountName')),accountRole:Boolean(document.getElementById('accountRole'))}));
    assert.equal(pending.boot,'v136','diffusion: page revealed before v125 cockpit mounted');
    assert.equal(pending.stable,'','diffusion: page marked stable while library API was pending');
    assert.equal(pending.cockpit,false,'diffusion: cockpit unexpectedly mounted before gated API');
    assert.equal(pending.accountName,true,'diffusion: canonical sidebar removed #accountName compatibility anchor');
    assert.equal(pending.accountRole,true,'diffusion: canonical sidebar removed #accountRole compatibility anchor');
    releaseLibrary();
    await page.waitForFunction(()=>document.documentElement.dataset.neptuneStudioPageStable==='v137',null,{timeout:12000});
    const ready=await page.evaluate(()=>({boot:document.documentElement.hasAttribute('data-neptune-studio-boot'),reason:document.documentElement.dataset.neptuneStudioRevealReason,mounted:document.body.classList.contains('webtv-v125-mounted'),cockpit:Boolean(document.getElementById('webtvCockpitV125')),tabs:document.querySelectorAll('#webtvCockpitV125 [data-v125-tab]').length}));
    assert.equal(ready.boot,false,'diffusion: boot guard remains after final cockpit');
    assert.equal(ready.reason,'diffusion-final','diffusion: wrong reveal reason');
    assert.equal(ready.mounted,true,'diffusion: final cockpit class missing');
    assert.equal(ready.cockpit,true,'diffusion: v125 cockpit missing');
    assert(ready.tabs>=4,'diffusion: cockpit tabs incomplete');
    assert.equal(pageErrors.length,0,`diffusion: runtime error(s): ${pageErrors.join(' | ')}`);
  }finally{releaseLibrary?.();await context.close();}
}

function mockCommon(route,path){
  if(path==='/api/auth/status')return json(route,200,{authenticated:true,csrfToken:'csrf-v137',user});
  if(path==='/api/admin/state')return json(route,200,adminState);
  if(path==='/api/admin/clients')return json(route,200,{clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}});
  if(path==='/api/admin/webtv/state')return json(route,200,{ok:true,enabled:false,mode:'loop',playlist:[],encoder:{},output:{},fallback:{}});
  if(path==='/api/admin/webtv/library'||path==='/api/admin/webtv/media')return json(route,200,{ok:true,items:[]});
  if(path==='/api/admin/media-catalog-v98/context')return json(route,200,{ok:true,cities:[],formats:[],suppliers:[],services:[],supplierRates:[],offerFamilies:[],configurationVisuals:[]});
  if(path==='/api/reservation/catalog-v96')return json(route,200,{ok:true,cities:[]});
  return json(route,200,{ok:true,items:[],jobs:[]});
}
function json(route,status,body){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});}
