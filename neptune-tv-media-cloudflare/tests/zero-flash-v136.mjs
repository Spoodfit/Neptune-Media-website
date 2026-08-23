import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.ZERO_FLASH_BASE_URL||'http://127.0.0.1:8787';
const studioPaths=['/studio/clients','/studio/video-ai.html','/studio/webtv.html','/studio/advanced.html#programs'];
const user={id:'admin-v136',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const adminState={user,programs:[],episodes:[],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};
const approvedNavigation=['Parcours clients','Diffusion','Catalogue Média','Finance','Réglage'];

const browser=await chromium.launch({headless:true});
try{
  await sourceContracts();
  for(const path of studioPaths)await studioFirstPaint(path);
  await clientFirstPaint(true);
  await clientFirstPaint(false);
  await reservationSurface();
  console.log('Zero-flash audit passed: Studio reveals only the approved five-section navigation, client auth never flashes, reservation tunnel has one canonical surface.');
}finally{await browser.close();}

async function sourceContracts(){
  const request=await browser.newContext();
  try{
    for(const path of studioPaths){
      const response=await request.request.get(`${base}${path}`);
      assert(response.ok(),`${path}: HTTP ${response.status()}`);
      assert.match(response.headers()['x-neptune-studio-zero-flash']||'',/v139/u,`${path}: current Studio zero-flash v139 header missing`);
      const html=await response.text();
      assert.match(html,/<html\b[^>]*data-neptune-studio-boot="v136"/iu,`${path}: boot attribute missing before paint`);
      const bodyIndex=html.search(/<body\b/iu),cssIndex=html.indexOf('/studio/studio-zero-flash-v136.css?v=1');
      assert(cssIndex>=0&&cssIndex<bodyIndex,`${path}: render-blocking guard not in head`);
      assert.match(html,/\/studio\/studio-shell-v105\.css\?v=4/u,`${path}: current canonical Studio shell CSS is not injected`);
      assert.match(html,/\/studio\/studio-information-architecture-v65-1\.js\?v=109/u,`${path}: current canonical Studio shell is not injected`);
      assert.match(html,/\/studio\/studio-navigation-guard-v138\.js\?v=2/u,`${path}: approved navigation guard v139 is not injected`);
      assert.equal((html.match(/studio-information-architecture-v65-1\.js/gu)||[]).length,1,`${path}: canonical shell loaded more than once`);
      assert.equal((html.match(/studio-navigation-guard-v138\.js/gu)||[]).length,1,`${path}: navigation guard loaded more than once`);
      assert.equal((html.match(/studio-zero-flash-v136\.js/gu)||[]).length,1,`${path}: reveal runtime duplicated`);
    }
    const client=await request.request.get(`${base}/espace-client/`);
    assert(client.ok(),'client space unavailable');
    assert.match(client.headers()['x-neptune-client-zero-flash']||'',/v136/u,'client zero-flash header missing');
    const html=await client.text();
    assert.match(html,/<html\b[^>]*data-neptune-client-boot="v136"/iu,'client boot attribute missing');
    assert.match(html,/<header id="publicHeader" class="auth-header" hidden/iu,'public auth header is paintable before session resolution');
    assert.match(html,/<section id="auth" class="auth-shell" hidden/iu,'auth form is paintable before session resolution');
  }finally{await request.close();}
}

async function studioFirstPaint(path){
  const context=await browser.newContext({viewport:path.includes('video-ai')?{width:390,height:844}:{width:1440,height:900},serviceWorkers:'block'});
  let releaseCanonical;
  const canonicalGate=new Promise(resolve=>{releaseCanonical=resolve;});
  await context.route('**/studio/studio-information-architecture-v65-1.js*',async route=>{await canonicalGate;await route.continue();});
  await context.route('**/api/**',route=>mockStudioApi(route));
  const page=await context.newPage();
  try{
    await page.goto(`${base}${path}`,{waitUntil:'commit',timeout:30000});
    await page.waitForSelector('body',{state:'attached',timeout:10000});
    await page.waitForTimeout(180);
    const before=await page.evaluate(()=>{
      const root=document.documentElement;
      const legacy=[...document.querySelectorAll('.sidebar,.studio-sidebar,.video-ai-sidebar')].map(node=>({visibility:getComputedStyle(node).visibility,display:getComputedStyle(node).display}));
      return {boot:root.getAttribute('data-neptune-studio-boot'),ready:root.dataset.neptuneStudioReady||'',legacy,before:getComputedStyle(document.body,'::before').position,scrollWidth:document.documentElement.scrollWidth,innerWidth};
    });
    assert.equal(before.boot,'v136',`${path}: guard released before canonical shell`);
    assert.equal(before.ready,'',`${path}: page claims ready before canonical shell`);
    assert(before.legacy.length>0,`${path}: fixture no longer exercises a legacy shell`);
    assert(before.legacy.every(item=>item.visibility==='hidden'||item.display==='none'),`${path}: legacy interface is paintable during boot: ${JSON.stringify(before.legacy)}`);
    assert.equal(before.before,'fixed',`${path}: controlled latest-shell boot surface missing`);
    assert(before.scrollWidth<=before.innerWidth+1,`${path}: boot surface overflows viewport`);
    releaseCanonical();
    await page.waitForFunction(()=>document.documentElement.dataset.neptuneStudioReady==='v136',null,{timeout:12000});
    const after=await page.evaluate(()=>({
      boot:document.documentElement.hasAttribute('data-neptune-studio-boot'),
      canonical:document.querySelectorAll('.neptune-studio-sidebar').length,
      visible:document.querySelector('.neptune-studio-sidebar')?getComputedStyle(document.querySelector('.neptune-studio-sidebar')).visibility:'missing',
      routes:[...document.querySelectorAll('.neptune-studio-nav-link')].map(item=>item.querySelector('strong')?.textContent?.trim()||''),
      accountName:document.querySelector('.neptune-studio-account b')?.textContent?.trim()||'',
      accountRole:document.querySelector('.neptune-studio-account small')?.textContent?.trim()||'',
      guard:document.documentElement.dataset.neptuneStudioNavigationGuard||'',
      scrollWidth:document.documentElement.scrollWidth,
      innerWidth,
    }));
    assert.equal(after.boot,false,`${path}: boot guard not removed`);
    assert.equal(after.canonical,1,`${path}: canonical sidebar duplicated or absent`);
    assert.equal(after.visible,'visible',`${path}: canonical sidebar not visible`);
    assert.match(after.guard,/v139/u,`${path}: approved v139 navigation guard missing`);
    assert.deepEqual(after.routes,approvedNavigation,`${path}: wrong Studio navigation after reveal`);
    assert.equal(after.accountName,'Neptune Media',`${path}: wrong account card name`);
    assert.equal(after.accountRole,'admin',`${path}: wrong account card role`);
    assert(after.scrollWidth<=after.innerWidth+1,`${path}: final shell horizontal overflow`);
  }finally{releaseCanonical?.();await context.close();}
}

async function clientFirstPaint(authenticated){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  let releaseSession;
  const sessionGate=new Promise(resolve=>{releaseSession=resolve;});
  await context.route('**/api/client/session',async route=>{
    await sessionGate;
    if(authenticated)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({client:{id:'client-v136',fullName:'Client Test',email:'client@example.com'},orders:[]})});
    return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'unauthorized'})});
  });
  const page=await context.newPage();
  try{
    await page.goto(`${base}/espace-client/`,{waitUntil:'commit',timeout:30000});
    await page.waitForSelector('body',{state:'attached',timeout:10000});
    await page.waitForTimeout(160);
    const before=await page.evaluate(()=>({boot:document.documentElement.getAttribute('data-neptune-client-boot'),authHidden:document.getElementById('auth')?.hidden,dashboardHidden:document.getElementById('dashboard')?.hidden,before:getComputedStyle(document.body,'::before').position}));
    assert.equal(before.boot,'v136','client: session guard released before API result');
    assert.equal(before.authHidden,true,'client: login flashed before session resolution');
    assert.equal(before.dashboardHidden,true,'client: dashboard flashed before session resolution');
    assert.equal(before.before,'fixed','client: neutral boot surface missing');
    releaseSession();
    await page.waitForFunction((isAuthenticated)=>{
      const auth=document.getElementById('auth');
      const dashboard=document.getElementById('dashboard');
      return document.documentElement.dataset.neptuneClientReady==='v136'
        && auth
        && dashboard
        && auth.hidden===isAuthenticated
        && dashboard.hidden===!isAuthenticated;
    },authenticated,{timeout:12000});
    const after=await page.evaluate(()=>({authHidden:document.getElementById('auth')?.hidden,dashboardHidden:document.getElementById('dashboard')?.hidden,boot:document.documentElement.hasAttribute('data-neptune-client-boot')}));
    assert.equal(after.boot,false,'client: boot guard remains after session resolution');
    assert.equal(after.authHidden,authenticated,'client: wrong auth visibility after session resolution');
    assert.equal(after.dashboardHidden,!authenticated,'client: wrong dashboard visibility after session resolution');
  }finally{releaseSession?.();await context.close();}
}

async function reservationSurface(){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  try{
    await context.route('**/reserver/assets/app-v96.js*',async route=>{await new Promise(resolve=>setTimeout(resolve,250));await route.continue();});
    await page.goto(`${base}/reserver/`,{waitUntil:'commit',timeout:30000});
    await page.waitForSelector('.app',{state:'attached',timeout:10000});
    const snap=await page.evaluate(()=>({apps:document.querySelectorAll('.app').length,contentRoots:document.querySelectorAll('#app-content').length,studioBoot:document.documentElement.hasAttribute('data-neptune-studio-boot'),clientBoot:document.documentElement.hasAttribute('data-neptune-client-boot'),overflow:document.documentElement.scrollWidth-innerWidth}));
    assert.equal(snap.apps,1,'reservation: duplicate application shell');
    assert.equal(snap.contentRoots,1,'reservation: duplicate dynamic content root');
    assert.equal(snap.studioBoot,false,'reservation: Studio guard leaked into sales tunnel');
    assert.equal(snap.clientBoot,false,'reservation: client guard leaked into sales tunnel');
    assert(snap.overflow<=1,`reservation: initial mobile overflow ${snap.overflow}px`);
  }finally{await context.close();}
}

async function mockStudioApi(route){
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/auth/status')return json(route,200,{authenticated:true,csrfToken:'csrf-v136',user});
  if(path==='/api/admin/state')return json(route,200,adminState);
  if(path==='/api/admin/clients')return json(route,200,{clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}});
  if(path==='/api/admin/webtv/state')return json(route,200,{ok:true,enabled:false,mode:'loop',playlist:[],encoder:{},youtube:{}});
  if(path==='/api/admin/webtv/library'||path==='/api/admin/webtv/media')return json(route,200,{ok:true,items:[]});
  if(path==='/api/admin/media-catalog-v98/context')return json(route,200,{ok:true,cities:[],formats:[],suppliers:[],services:[],supplierRates:[],offerFamilies:[],configurationVisuals:[]});
  if(path==='/api/reservation/catalog-v96')return json(route,200,{ok:true,cities:[]});
  return json(route,200,{ok:true,items:[],jobs:[]});
}
function json(route,status,body){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});}
