import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.ZERO_FLASH_BASE_URL||'http://127.0.0.1:8787';
const user={id:'admin-v139',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const adminState={user,programs:[],episodes:[],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};
const cases=[
  ['/studio/clients','clients'],
  ['/studio/webtv.html','diffusion'],
  ['/studio/advanced.html#programs','catalog'],
  ['/studio/advanced.html#finances','finance'],
  ['/studio/advanced.html#settings','settings-main'],
  ['/studio/advanced.html#episodes','diffusion'],
  ['/studio/video-ai.html',''],
];
const expected=[
  ['clients','Parcours clients','/studio/clients'],
  ['diffusion','Diffusion','/studio/webtv.html'],
  ['catalog','Catalogue Média','/studio/advanced.html#programs'],
  ['finance','Finance','/studio/advanced.html#finances'],
  ['settings-main','Réglage','/studio/advanced.html#settings'],
];

const browser=await chromium.launch({headless:true});
try{
  for(const [path,active] of cases)await verifyScreen(path,active);
  console.log('Studio navigation v139 gate passed: every Studio screen exposes the approved five-section sidebar.');
}finally{await browser.close();}

async function verifyScreen(path,activeRoute){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  await context.route('**/api/**',route=>mockApi(route));
  const page=await context.newPage();
  const pageErrors=[];
  const runtimeErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error.stack||error.message||error)));
  const cdp=await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown',({exceptionDetails:d})=>{
    const frames=d.stackTrace?.callFrames||[];
    runtimeErrors.push(JSON.stringify({text:d.text,description:d.exception?.description||'',url:d.url||frames[0]?.url||'',line:(d.lineNumber??-1)+1,column:(d.columnNumber??-1)+1,frames:frames.slice(0,3).map(f=>({url:f.url,line:f.lineNumber+1,column:f.columnNumber+1,functionName:f.functionName}))}));
  });
  try{
    await page.goto(`${base}${path}`,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>Boolean(document.documentElement.dataset.neptuneStudioShellReady),null,{timeout:12000});
    await page.waitForSelector('.neptune-studio-nav',{state:'attached',timeout:10000});
    await page.waitForFunction(()=>document.documentElement.dataset.neptuneStudioNavigationReady==='v138'&&document.querySelectorAll('.neptune-studio-nav [data-studio-route]').length===5,null,{timeout:10000});
    await page.waitForTimeout(120);
    const snapshot=await page.evaluate(()=>({
      routes:[...document.querySelectorAll('.neptune-studio-nav [data-studio-route]')].map(item=>({
        route:item.dataset.studioRoute,
        label:item.querySelector('strong')?.textContent?.trim()||'',
        href:item.getAttribute('href')||'',
        active:item.classList.contains('active'),
        current:item.getAttribute('aria-current')||'',
      })),
      sidebars:document.querySelectorAll('.neptune-studio-sidebar').length,
      overflow:document.documentElement.scrollWidth-innerWidth,
      guard:document.documentElement.dataset.neptuneStudioNavigationGuard||'',
      accountName:document.querySelector('.neptune-studio-account b')?.textContent?.trim()||'',
      accountRole:document.querySelector('.neptune-studio-account small')?.textContent?.trim()||'',
    }));
    assert.equal(snapshot.sidebars,1,`${path}: canonical sidebar duplicated or missing`);
    assert.match(snapshot.guard,/v139/u,`${path}: approved navigation guard missing`);
    assert.equal(snapshot.routes.length,5,`${path}: expected exactly five main Studio sections`);
    assert.deepEqual(snapshot.routes.map(({route,label,href})=>[route,label,href]),expected,`${path}: menu differs from the approved Studio reference`);
    const active=snapshot.routes.filter(item=>item.active||item.current==='page');
    if(activeRoute){
      assert.equal(active.length,1,`${path}: expected exactly one active main section`);
      assert.equal(active[0].route,activeRoute,`${path}: wrong active main section`);
    }else{
      assert.equal(active.length,0,`${path}: Production vidéo must remain outside the main Studio navigation`);
    }
    assert.equal(snapshot.accountName,'Neptune Media',`${path}: account card label differs from reference`);
    assert.equal(snapshot.accountRole,'admin',`${path}: account card role differs from reference`);
    assert(snapshot.overflow<=1,`${path}: canonical navigation creates horizontal overflow (${snapshot.overflow}px)`);
    assert.equal(pageErrors.length,0,`${path}: runtime error(s): ${pageErrors.join('\n---\n')}\nCDP: ${runtimeErrors.join('\n')}`);
  }finally{await cdp.detach().catch(()=>{});await context.close();}
}

function mockApi(route){
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/status')return json(route,200,{authenticated:true,csrfToken:'csrf-v139',user});
  if(path==='/api/admin/state')return json(route,200,adminState);
  if(path==='/api/admin/clients')return json(route,200,{clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}});
  if(path==='/api/admin/webtv/state')return json(route,200,{ok:true,enabled:false,mode:'loop',playlist:[],encoder:{},output:{},fallback:{}});
  if(path==='/api/admin/webtv/library'||path==='/api/admin/webtv/media')return json(route,200,{ok:true,items:[]});
  if(path==='/api/admin/media-catalog-v98/context')return json(route,200,{ok:true,cities:[],formats:[],suppliers:[],services:[],supplierRates:[],offerFamilies:[],configurationVisuals:[]});
  if(path==='/api/reservation/catalog-v96')return json(route,200,{ok:true,cities:[]});
  return json(route,200,{ok:true,items:[],jobs:[]});
}
function json(route,status,body){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});}
