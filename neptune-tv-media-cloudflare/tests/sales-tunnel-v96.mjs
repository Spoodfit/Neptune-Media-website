import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=process.env.LOCAL_BASE_URL||'http://127.0.0.1:4173';
const out=process.env.OUTPUT_DIR||'test-results/sales-tunnel-v96';
const token='t'.repeat(48);
const opportunityId='22222222-2222-4222-8222-222222222222';
const paymentBase='https://buy.stripe.com/cNi8wPelvgXw9FIdSK73G06';
const pricing={tierKey:'launch',tierLabel:'Prix coûtant · lancement',paidCount:0,remaining:3,nextLabel:'Tarif préférentiel',currentPriceCents:89000,launchPriceCents:89000,promoPriceCents:149000,basePriceCents:199000};
const configurations=[
  {label:'Chaise',imageBase64:'/assets/formats/exact-hn1.b64'},
  {label:'Canapé',imageBase64:'/assets/formats/exact-hn2.b64'},
];
const catalog={
  ok:true,
  release:'neptune-sales-tunnel-20260811-v96',
  enhancementRelease:'neptune-sales-tunnel-20260811-v97',
  preparationBookingUrl:'https://calendar.app.google/X9q1T5JT9ngMfZY67',
  pricing,
  cities:[
    {id:'toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[
      {id:'hn',slug:'hors-norme',name:'Hors Norme',concept:'Émission Neptune Business',description:'Interview signature.',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'hn-launch',name:'Prix coûtant · lancement',clientPriceCents:89000,currency:'eur',priceSuffix:'',pricing,configurations}]},
      {id:'libre',slug:'libre',name:'Libre',concept:'Format libre',description:'Format modulable.',image:'/assets/posters/concept-libre-wide.webp',offers:[{id:'libre-launch',name:'Prix coûtant · lancement',clientPriceCents:79000,currency:'eur',priceSuffix:'',pricing:{...pricing,currentPriceCents:79000,launchPriceCents:79000,promoPriceCents:99000,basePriceCents:109000},configurations:[{label:'Plateau',imageBase64:'/assets/formats/exact-cl1.b64'}]}]},
    ]},
    {id:'lyon',slug:'lyon',name:'Lyon',country:'France',formats:[{id:'hn-lyon',slug:'hors-norme-lyon',name:'Hors Norme',concept:'Émission Neptune Business',description:'Disponible à Lyon.',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'hn-lyon-launch',name:'Prix coûtant · lancement',clientPriceCents:99000,currency:'eur',priceSuffix:'',pricing:{...pricing,currentPriceCents:99000},configurations:[{label:'Chaise',image:'/assets/posters/studio-wide.webp'}]}]}]},
  ],
};

await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});

async function shot(page,label,stage){await page.screenshot({path:path.join(out,`${label}-${stage}.png`),fullPage:false});}
async function visualGuard(page,label,stage,mobile){
  const metrics=await page.evaluate(()=>{
    const visible=[...document.querySelectorAll('button,.btn')].filter(x=>x.offsetParent);
    const stageEl=document.querySelector('.stage')?.getBoundingClientRect();
    const first=document.querySelector('#app-content')?.firstElementChild?.getBoundingClientRect();
    return {scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,minButton:visible.length?Math.min(...visible.map(x=>x.getBoundingClientRect().height)):999,stageTop:stageEl?.top||0,contentTop:first?.top||0};
  });
  if(metrics.scrollWidth>metrics.innerWidth+2)throw new Error(`${label}/${stage}: horizontal overflow ${metrics.scrollWidth}/${metrics.innerWidth}`);
  if(metrics.contentTop<metrics.stageTop-1)throw new Error(`${label}/${stage}: content clipped under header (${metrics.contentTop}/${metrics.stageTop})`);
  if(mobile&&metrics.minButton<44)throw new Error(`${label}/${stage}: touch target below 44px (${metrics.minButton})`);
  return metrics;
}

async function run(viewport,label){
  const page=await browser.newPage({viewport});
  let paid=false,selectionBody=null,anonymousStarted=false;
  await page.route('https://calendar.google.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Calendar mock</title>'}));
  await page.route('**/api/reservation/catalog-v96*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
  await page.route('**/api/reservation/prospect/anonymous-v165',route=>{
    anonymousStarted=true;
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,token,prospectId:'11111111-1111-4111-8111-111111111111'})});
  });
  await page.route('**/api/reservation/selection-v96',async route=>{
    selectionBody=JSON.parse(route.request().postData()||'{}');
    const paymentUrl=`${paymentBase}?client_reference_id=NPOPP_${opportunityId}&locked_prefilled_email=contact%40example.com`;
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,status:'date_selected',paymentUrl,selection:{city:{id:'toulouse',name:'Toulouse',slug:'toulouse'},format:{id:'hn',name:'Hors Norme',slug:'hors-norme',image:'/assets/posters/hors-norme-wide.webp'},offer:{id:'hn-launch',name:'Prix coûtant · lancement',clientPriceCents:89000,currency:'eur',priceSuffix:'',pricing,configurations},configurationChoice:selectionBody.configurationChoice,requestedDate:selectionBody.requestedDate,requestedDaypart:selectionBody.requestedDaypart}})});
  });
  await page.route('**/api/reservation/prospect/context*',route=>{
    if(!selectionBody){
      route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,release:'neptune-sales-tunnel-20260811-v96',enhancementRelease:'neptune-sales-tunnel-20260811-v97',prospectId:'11111111-1111-4111-8111-111111111111',status:'tunnel_started',orderId:'',contact:null,selection:{}})});
      return;
    }
    const requestedDate=selectionBody.requestedDate||'2026-09-10',requestedDaypart=selectionBody.requestedDaypart||'morning';
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,release:'neptune-sales-tunnel-20260811-v96',enhancementRelease:'neptune-sales-tunnel-20260811-v97',prospectId:'11111111-1111-4111-8111-111111111111',status:paid?'paid':'tunnel_started',orderId:paid?'33333333-3333-4333-8333-333333333333':'',contact:null,selection:{city:{id:'toulouse',name:'Toulouse',slug:'toulouse'},format:{id:'hn',name:'Hors Norme',slug:'hors-norme',image:'/assets/posters/hors-norme-wide.webp'},offer:{id:'hn-launch',name:'Prix coûtant · lancement',clientPriceCents:89000,currency:'eur',priceSuffix:'',pricing,configurations},configurationChoice:'Chaise',requestedDate,requestedDaypart,paymentUrl:paid?'':`${paymentBase}?client_reference_id=NPOPP_${opportunityId}`}})});
  });

  await page.goto(`${base}/reserver/`,{waitUntil:'networkidle'});
  await page.locator('[data-v165-concept]').first().waitFor();
  await shot(page,label,'formats');
  const publicText=await page.locator('#app-content').innerText();
  if(/RECBOX|fournisseur/iu.test(publicText))throw new Error(`${label}: supplier leaked into public tunnel`);
  await visualGuard(page,label,'formats',viewport.width<=420);

  await page.getByRole('button',{name:/Hors Norme/}).first().click();
  if(!anonymousStarted)throw new Error(`${label}: anonymous prospect was not started after format click`);
  await page.locator('[data-city="toulouse"]').waitFor();
  await page.getByText('Où souhaitez-vous tourner ?',{exact:true}).waitFor();
  await page.getByText('Toulouse',{exact:true}).waitFor();
  await page.getByText('Lyon',{exact:true}).waitFor();
  if(!page.url().includes('reservation_token='))throw new Error(`${label}: reservation token missing after format click`);
  await shot(page,label,'cities');
  await visualGuard(page,label,'cities',viewport.width<=420);

  await page.locator('[data-city="toulouse"]').click();
  await page.getByText('Dans quel univers voulez-vous apparaître ?',{exact:true}).waitFor();
  const configImage=page.locator('.configuration-card').first().locator('img');
  await configImage.waitFor();
  await page.waitForFunction(el=>String(el.src||'').startsWith('data:image/webp;base64,')&&el.naturalWidth>0,await configImage.elementHandle());
  await shot(page,label,'configuration');await visualGuard(page,label,'configuration',viewport.width<=420);
  await page.getByRole('button',{name:/Chaise/}).click();

  await page.locator('.calendar-shell').waitFor();
  if(await page.locator('input[type="date"]').count())throw new Error(`${label}: raw date input still visible`);
  const availableDay=page.locator('.day[data-date]:not(:disabled)').first();
  await availableDay.click();
  await page.getByRole('button',{name:/Matin/}).click();
  await page.getByRole('button',{name:'Continuer vers le paiement',exact:true}).waitFor();
  await shot(page,label,'calendar');await visualGuard(page,label,'calendar',viewport.width<=420);
  await page.getByRole('button',{name:'Continuer vers le paiement',exact:true}).click();
  if(!selectionBody||selectionBody.cityId!=='toulouse'||selectionBody.formatId!=='hn'||selectionBody.offerId!=='hn-launch'||selectionBody.configurationChoice!=='Chaise'||selectionBody.requestedDaypart!=='morning'||!selectionBody.requestedDate)throw new Error(`${label}: calendar selection was not persisted correctly`);

  await page.locator('.pricing-alert').waitFor();
  const urgency=await page.locator('.launch-banner').innerText();
  if(!/PRIX COÛTANT/iu.test(urgency)||!/3 place/iu.test(urgency))throw new Error(`${label}: urgency tier banner missing`);
  const pay=page.locator('#payLink');
  const href=await pay.getAttribute('href');
  if(!href?.startsWith(paymentBase)||!href.includes(`NPOPP_${opportunityId}`))throw new Error(`${label}: wrong Stripe tier link ${href}`);
  if(await pay.getAttribute('target'))throw new Error(`${label}: Stripe payment must stay in the same tab for the confirmation return`);
  if((await pay.getAttribute('aria-disabled'))!=='true')throw new Error(`${label}: payment must be locked before CGV`);
  await shot(page,label,'payment');await visualGuard(page,label,'payment',viewport.width<=420);
  await page.locator('#termsAccepted').check();
  if((await pay.getAttribute('aria-disabled'))!=='false'||await pay.evaluate(el=>el.classList.contains('is-disabled')))throw new Error(`${label}: payment button did not become clickable after CGV`);

  paid=true;
  await page.goto(`${base}/reserver/?payment=success&session_id=cs_test_v97&reservation_token=${token}`,{waitUntil:'networkidle'});
  await page.getByText('Merci, votre passage est réservé.',{exact:true}).waitFor();
  const confirmation=await page.locator('#app-content').innerText();
  if(!/fournisseur vérifie maintenant votre créneau/iu.test(confirmation)||!/proposition de date alternative/iu.test(confirmation))throw new Error(`${label}: supplier date confirmation explanation missing`);
  const iframe=page.locator('.calendar-embed iframe');await iframe.waitFor();
  const src=await iframe.getAttribute('src');
  if(!src?.includes('calendar.google.com/calendar/appointments/schedules/AcZssZ0Zxy57HrKj43TqUhbv9bMsGMbkgyg1MnuGdxFhb3W_LcNr2SqGtfO0AR8noAdLDwlnSqriORjU'))throw new Error(`${label}: embedded preparation calendar missing`);
  const prep=await page.getByRole('link',{name:'Choisir mon rendez-vous',exact:true}).getAttribute('href');
  if(!prep?.includes('calendar.app.google/X9q1T5JT9ngMfZY67'))throw new Error(`${label}: preparation fallback link missing`);
  await shot(page,label,'confirmation');
  const metrics=await visualGuard(page,label,'confirmation',viewport.width<=420);
  await page.close();
  return metrics;
}

const desktop=await run({width:1440,height:900},'desktop');
const mobile=await run({width:390,height:844},'mobile');
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({release:'neptune-sales-tunnel-20260811-v97',desktop,mobile},null,2));
await browser.close();
console.log('Sales tunnel browser audit passed: anonymous format click resumes on city selection, then configuration, calendar, payment and confirmation remain responsive.');
