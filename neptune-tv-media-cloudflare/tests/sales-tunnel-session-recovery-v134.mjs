import { chromium } from 'playwright';

const base=process.env.LOCAL_BASE_URL||'http://127.0.0.1:4173';
const STORAGE='neptune_media_reservation_v96';
const staleToken='expired-'+('x'.repeat(48));
const catalog={
  ok:true,
  release:'neptune-sales-tunnel-20260811-v96',
  enhancementRelease:'neptune-sales-tunnel-20260811-v97',
  preparationBookingUrl:'https://calendar.app.google/X9q1T5JT9ngMfZY67',
  pricing:{tierKey:'base',tierLabel:'Tarif normal',remaining:0,currentPriceCents:199000,basePriceCents:199000},
  cities:[]
};

const browser=await chromium.launch({headless:true});
try{
  await verifyRecoverable('prospect_token_expired');
  await verifyRecoverable('prospect_token_invalid');
  await verifyRealFailureStillFails();
  console.log('Sales tunnel session recovery v134: OK');
}finally{
  await browser.close();
}

async function seed(page){
  await page.addInitScript(({key,token})=>{
    localStorage.setItem(key,JSON.stringify({
      token,
      contact:{firstName:'Ancien',lastName:'Prospect',email:'old@example.com',phone:'0600000000'},
      cityId:'old-city',formatId:'old-format',offerId:'old-offer'
    }));
  },{key:STORAGE,token:staleToken});
}

async function commonRoutes(page){
  await page.route('**/api/reservation/catalog-v96*',route=>route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify(catalog)
  }));
}

async function verifyRecoverable(code){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  let contextCalls=0;
  await seed(page);
  await commonRoutes(page);
  await page.route('**/api/reservation/prospect/context*',route=>{
    contextCalls++;
    route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:code})});
  });
  await page.goto(`${base}/reserver/?reservation_token=${encodeURIComponent(staleToken)}&session_id=stale-session&payment=success&utm_source=v134-test`,{waitUntil:'networkidle'});
  await page.getByText('Parlez-nous de vous.',{exact:true}).waitFor({timeout:10000});
  const content=await page.locator('#app-content').innerText();
  if(content.includes('Le tunnel est momentanément indisponible.'))throw new Error(`${code}: fatal screen still visible`);
  if(content.includes(code))throw new Error(`${code}: raw token error leaked to user`);
  const current=new URL(page.url());
  for(const key of ['reservation_token','session_id','payment'])if(current.searchParams.has(key))throw new Error(`${code}: ${key} was not removed from URL`);
  if(current.searchParams.get('utm_source')!=='v134-test')throw new Error(`${code}: unrelated campaign parameter was removed`);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),STORAGE);
  if(saved?.token)throw new Error(`${code}: stale token remains in localStorage`);
  const release=await page.evaluate(()=>document.body.dataset.salesTunnelSessionRecovery||'');
  if(!release.includes('v134'))throw new Error(`${code}: v134 recovery runtime not active`);
  await page.waitForTimeout(500);
  if(contextCalls!==1)throw new Error(`${code}: recovery loop detected (${contextCalls} context calls)`);
  await page.close();
}

async function verifyRealFailureStillFails(){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await seed(page);
  await commonRoutes(page);
  await page.route('**/api/reservation/prospect/context*',route=>route.fulfill({
    status:503,
    contentType:'application/json',
    body:JSON.stringify({error:'database_unavailable'})
  }));
  await page.goto(`${base}/reserver/?reservation_token=${encodeURIComponent(staleToken)}&utm_source=v134-test`,{waitUntil:'networkidle'});
  await page.getByText('Le tunnel est momentanément indisponible.',{exact:true}).waitFor({timeout:10000});
  const content=await page.locator('#app-content').innerText();
  if(!content.includes('database_unavailable'))throw new Error('real backend failure was incorrectly hidden');
  const current=new URL(page.url());
  if(!current.searchParams.has('reservation_token'))throw new Error('real backend failure incorrectly cleared session token');
  await page.close();
}
