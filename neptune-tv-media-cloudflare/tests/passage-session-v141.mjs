import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.ZERO_FLASH_BASE_URL||'http://127.0.0.1:8787';
const user={id:'admin-v141',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const freshCsrf='csrf-v141-fresh';
let contextCalls=0;
let orderCalls=0;

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'});
  await context.addInitScript(()=>sessionStorage.setItem('neptune_csrf','csrf-v141-stale'));

  // Reproduce the production failure: the old cache-keyed v140 helper is unavailable/stale.
  await context.route('**/studio/studio-operating-modal-fix-v135-1.js*',route=>route.fulfill({
    status:200,
    contentType:'application/javascript',
    body:"document.body.dataset.cachedLegacyModalFix='1';",
  }));
  await context.route('**/api/**',route=>mockApi(route));

  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack||error.message||error)));

  await page.goto(`${base}/studio/clients`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>document.documentElement.dataset.neptunePassageSessionGuard?.includes('v141'),null,{timeout:10000});
  await page.waitForFunction(()=>document.getElementById('wizardBodyV118')?.textContent?.includes('Pour qui est ce passage ?'),null,{timeout:10000});
  await page.waitForFunction(()=>document.getElementById('wizardNextV118')?.disabled===false,null,{timeout:10000});

  const initial=await page.evaluate(()=>({
    text:document.getElementById('wizardBodyV118')?.textContent||'',
    message:document.getElementById('wizardMessageV118')?.textContent||'',
    nextDisabled:document.getElementById('wizardNextV118')?.disabled,
    csrf:sessionStorage.getItem('neptune_csrf')||'',
    guard:document.documentElement.dataset.neptunePassageSessionGuard||'',
    legacy:document.body.dataset.cachedLegacyModalFix||'',
  }));

  assert.match(initial.guard,/v141/u,'cache-safe session guard was not injected before the wizard');
  assert.equal(initial.legacy,'1','test did not reproduce the stale legacy helper condition');
  assert(!initial.text.includes('Impossible de charger les données du Studio.'),'wizard remained in the broken context state');
  assert(!initial.message.includes('session de sécurité a expiré'),'wizard exposed an expired-session error after automatic recovery');
  assert.equal(initial.nextDisabled,false,'Continue should be available after context recovery');
  assert.equal(initial.csrf,freshCsrf,'fresh CSRF token was not persisted');
  assert.equal(contextCalls,2,'catalog context must retry exactly once after csrf_failed');

  await page.evaluate(()=>sessionStorage.setItem('neptune_csrf','csrf-v141-stale-again'));
  const writeResult=await page.evaluate(async()=>{
    const response=await fetch('/api/admin/client-order',{
      method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      credentials:'same-origin',
      body:JSON.stringify({probe:'v141'}),
    });
    return {status:response.status,body:await response.json().catch(()=>({}))};
  });
  assert.equal(writeResult.status,200,'protected passage creation did not recover after csrf_failed');
  assert.equal(writeResult.body.ok,true,'protected passage creation retry returned an invalid payload');
  assert.equal(orderCalls,2,'passage creation must retry exactly once after csrf_failed');
  assert.equal(errors.length,0,`runtime error(s): ${errors.join('\n---\n')}`);

  await context.close();
  console.log('Passage session v141 gate passed: recovery works even when the previous cache-keyed helper is stale.');
}finally{
  await browser.close();
}

function mockApi(route){
  const request=route.request();
  const path=new URL(request.url()).pathname;
  if(path==='/api/auth/status')return json(route,200,{authenticated:true,csrfToken:freshCsrf,user});
  if(path==='/api/admin/clients')return json(route,200,{clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}});
  if(path==='/api/admin/media-catalog-v98/context'){
    contextCalls+=1;
    if(contextCalls===1)return json(route,403,{error:'csrf_failed'});
    assert.equal(request.headers()['x-csrf-token'],freshCsrf,'catalog retry did not use refreshed CSRF');
    return json(route,200,{ok:true,cities:[],formats:[],suppliers:[],services:[],supplierRates:[],offerFamilies:[],configurationVisuals:[]});
  }
  if(path==='/api/reservation/catalog-v96')return json(route,200,{ok:true,cities:[]});
  if(path==='/api/admin/client-order'){
    orderCalls+=1;
    if(orderCalls===1)return json(route,403,{error:'csrf_failed'});
    assert.equal(request.headers()['x-csrf-token'],freshCsrf,'passage retry did not use refreshed CSRF');
    return json(route,200,{ok:true,id:'probe-v141'});
  }
  return json(route,200,{ok:true,items:[],jobs:[]});
}

function json(route,status,body){
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
}
