import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.ZERO_FLASH_BASE_URL||'http://127.0.0.1:8787';
const user={id:'admin-v138',email:'contact@neptunebusiness.com',fullName:'Compte Studio',role:'admin'};
const adminState={user,programs:[],episodes:[],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};
const cases=[
  ['/studio/clients','clients'],
  ['/studio/video-ai.html','production'],
  ['/studio/webtv.html','diffusion'],
  ['/studio/advanced.html#programs','settings'],
];
const expected=[
  ['clients','Parcours clients','/studio/clients'],
  ['production','Production vidéo','/studio/video-ai.html'],
  ['diffusion','Diffusion','/studio/webtv.html'],
  ['settings','Réglages','/studio/advanced.html#programs'],
];

const browser=await chromium.launch({headless:true});
try{
  for(const [path,active] of cases)await verifyScreen(path,active);
  console.log('Studio navigation v138 gate passed: all main Studio screens expose the same four canonical tabs with the correct active route.');
}finally{await browser.close();}

async function verifyScreen(path,activeRoute){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  await context.route('**/api/**',route=>mockApi(route));
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error.message||error)));
  try{
    await page.goto(`${base}${path}`,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>Boolean(document.documentElement.dataset.neptuneStudioShellReady),null,{timeout:12000});
    await page.waitForSelector('.neptune-studio-nav',{state:'attached',timeout:10000});
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
    }));
    assert.equal(snapshot.sidebars,1,`${path}: canonical sidebar duplicated or missing`);
    assert.equal(snapshot.routes.length,4,`${path}: expected exactly four main Studio tabs`);
    assert.deepEqual(snapshot.routes.map(({route,label,href})=>[route,label,href]),expected,`${path}: main menu differs from canonical Studio navigation`);
    const active=snapshot.routes.filter(item=>item.active||item.current==='page');
    assert.equal(active.length,1,`${path}: expected exactly one active main tab`);
    assert.equal(active[0].route,activeRoute,`${path}: wrong active main tab`);
    assert(snapshot.overflow<=1,`${path}: canonical navigation creates horizontal overflow (${snapshot.overflow}px)`);
    assert.equal(pageErrors.length,0,`${path}: runtime error(s): ${pageErrors.join(' | ')}`);
  }finally{await context.close();}
}

function mockApi(route){
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/status')return json(route,200,{authenticated:true,csrfToken:'csrf-v138',user});
  if(path==='/api/admin/state')return json(route,200,adminState);
  if(path==='/api/admin/clients')return json(route,200,{clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}});
  if(path==='/api/admin/webtv/state')return json(route,200,{ok:true,enabled:false,mode:'loop',playlist:[],encoder:{},output:{},fallback:{}});
  if(path==='/api/admin/webtv/library'||path==='/api/admin/webtv/media')return json(route,200,{ok:true,items:[]});
  if(path==='/api/admin/media-catalog-v98/context')return json(route,200,{ok:true,cities:[],formats:[],suppliers:[],services:[],supplierRates:[],offerFamilies:[],configurationVisuals:[]});
  if(path==='/api/reservation/catalog-v96')return json(route,200,{ok:true,cities:[]});
  return json(route,200,{ok:true,items:[],jobs:[]});
}
function json(route,status,body){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});}
