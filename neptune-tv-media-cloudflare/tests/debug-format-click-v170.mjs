import { chromium } from 'playwright';

const base=process.env.LOCAL_BASE_URL||'http://127.0.0.1:4173';
const token='t'.repeat(48);
const catalog={ok:true,cities:[{id:'toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[{id:'hn',slug:'hors-norme',name:'Hors Norme',concept:'Émission Neptune Business',description:'Interview signature.',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'hn-launch',name:'Lancement',clientPriceCents:89000,currency:'eur',configurations:[{label:'Chaise',imageBase64:'/assets/formats/exact-hn1.b64'}]}]}]}]};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
let anonymous=0,context=0;
await page.route('**/api/reservation/catalog-v96*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
await page.route('**/api/reservation/prospect/anonymous-v165',r=>{anonymous++;r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,token,prospectId:'11111111-1111-4111-8111-111111111111'})});});
await page.route('**/api/reservation/prospect/context*',r=>{context++;r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,prospectId:'11111111-1111-4111-8111-111111111111',status:'tunnel_started',contact:null,selection:{}})});});
page.on('console',m=>console.log('BROWSER_CONSOLE',m.type(),m.text()));
page.on('pageerror',e=>console.log('BROWSER_PAGEERROR',e.message));
await page.goto(`${base}/reserver/`,{waitUntil:'networkidle'});
await page.locator('[data-v165-concept="hn"]').waitFor();
await page.locator('[data-v165-concept="hn"]').click();
await page.waitForTimeout(2500);
const diagnostic=await page.evaluate(()=>({
  url:location.href,
  storage:localStorage.getItem('neptune_media_reservation_v163'),
  text:document.getElementById('app-content')?.innerText||'',
  html:document.getElementById('app-content')?.innerHTML.slice(0,1800)||'',
  bodyRelease:document.body.dataset.salesTunnelRelease||'',
  salesExperience:document.body.dataset.salesExperienceRelease||''
}));
console.log('FORMAT_CLICK_DIAGNOSTIC',JSON.stringify({anonymous,context,...diagnostic},null,2));
await browser.close();
if(!diagnostic.url.includes('reservation_token='))throw new Error('format click did not navigate with reservation token');
if(!diagnostic.storage?.includes('"conceptId":"hn"'))throw new Error('selected concept not persisted');
if(!diagnostic.html.includes('data-city="toulouse"'))throw new Error('selected format did not advance to city step');
