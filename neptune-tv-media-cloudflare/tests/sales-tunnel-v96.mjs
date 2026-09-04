import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=process.env.LOCAL_BASE_URL||'http://127.0.0.1:4173';
const out=process.env.OUTPUT_DIR||'test-results/sales-tunnel-v180';
const token='t'.repeat(48);
const paymentBase='https://buy.stripe.com/cNi8wPelvgXw9FIdSK73G06';
const pricing={tierKey:'launch',tierLabel:'Prix coûtant · lancement',paidCount:0,remaining:3,nextLabel:'Tarif préférentiel',currentPriceCents:89000,launchPriceCents:89000,promoPriceCents:149000,basePriceCents:199000};
const configurations=[{label:'Chaise',description:'Une mise en scène assise, sobre et directe.',image:'/assets/posters/studio-wide.webp'},{label:'Canapé',description:'Une ambiance plus détendue et conversationnelle.',image:'/assets/posters/hors-norme-wide.webp'}];
const catalog={
  ok:true,
  release:'neptune-sales-tunnel-20260811-v96',
  enhancementRelease:'neptune-sales-tunnel-20260811-v97',
  preparationBookingUrl:'https://calendar.app.google/X9q1T5JT9ngMfZY67',
  reservationPolicy:{leadDays:15,minDate:'2026-09-20'},
  pricing,
  cities:[{id:'toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[
    {id:'hn',slug:'hors-norme',name:'Hors Norme',concept:'Émission Neptune Business',description:'La description canonique définie depuis Studio pour Hors Norme.',durationLabel:'1h',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'hn-launch',name:'Prix coûtant · lancement',clientPriceCents:89000,currency:'eur',priceSuffix:'',pricing,configurations}]},
    {id:'connexio',slug:'connexio',name:'Connexio',concept:'Échange et débat',description:'La description canonique Connexio définie dans Studio.',durationLabel:'1h',image:'/assets/posters/concept-libre-wide.webp',offers:[{id:'connexio-launch',name:'Prix coûtant · lancement',clientPriceCents:89000,currency:'eur',priceSuffix:'',pricing,configurations}]},
  ]}],
};

await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});

async function shot(page,label,stage){await page.screenshot({path:path.join(out,`${label}-${stage}.png`),fullPage:false});}
async function visualGuard(page,label,stage){
  const metrics=await page.evaluate(()=>{
    const doc=document.documentElement,stageEl=document.querySelector('.stage'),content=document.getElementById('app-content');
    return{scrollWidth:doc.scrollWidth,innerWidth:window.innerWidth,stageScrollHeight:stageEl?.scrollHeight||0,stageClientHeight:stageEl?.clientHeight||0,contentBottom:content?.getBoundingClientRect().bottom||0,viewportHeight:window.innerHeight};
  });
  if(metrics.scrollWidth>metrics.innerWidth+2)throw new Error(`${label}/${stage}: horizontal overflow ${metrics.scrollWidth}/${metrics.innerWidth}`);
  return metrics;
}

async function run(viewport,label){
  const page=await browser.newPage({viewport});
  let paid=false,selectionBody=null;
  await page.addInitScript(({token})=>{
    sessionStorage.setItem('neptune_reservation_member_admitted_v171',token);
    localStorage.setItem('neptune_media_reservation_v163',JSON.stringify({token,contact:{email:'contact@example.com'},conceptId:'',cityId:'',offerId:'',physicalFormat:'',requestedDate:'',requestedDaypart:''}));
  },{token});
  await page.route('https://calendar.google.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Calendar mock</title>'}));
  await page.route('**/api/reservation/catalog-v96*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
  await page.route('**/api/reservation/prospect/context*',route=>{
    const selection=selectionBody?{city:{id:'toulouse',name:'Toulouse',slug:'toulouse'},format:{id:'hn',name:'Hors Norme',slug:'hors-norme',image:'/assets/posters/hors-norme-wide.webp'},offer:{id:'hn-launch',name:'Prix coûtant · lancement',clientPriceCents:89000,currency:'eur',pricing,configurations},configurationChoice:selectionBody.configurationChoice,requestedDate:selectionBody.requestedDate,requestedDaypart:selectionBody.requestedDaypart,paymentUrl:paid?'':`${paymentBase}?client_reference_id=NPOPP_test`}:{};
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,prospectId:'prospect-test',status:paid?'paid':'tunnel_started',orderId:paid?'order-test':'',contact:{email:'contact@example.com',company:'Neptune Test'},selection,preparationBookingUrl:catalog.preparationBookingUrl})});
  });
  await page.route('**/api/reservation/selection-v96',route=>{
    selectionBody=JSON.parse(route.request().postData()||'{}');
    const paymentUrl=`${paymentBase}?client_reference_id=NPOPP_test&locked_prefilled_email=contact%40example.com`;
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,status:'date_selected',paymentUrl,selection:{city:{id:'toulouse',name:'Toulouse',slug:'toulouse'},format:{id:'hn',name:'Hors Norme',slug:'hors-norme'},offer:{id:'hn-launch',name:'Prix coûtant · lancement',clientPriceCents:89000,currency:'eur',pricing,configurations},configurationChoice:selectionBody.configurationChoice,requestedDate:selectionBody.requestedDate,requestedDaypart:selectionBody.requestedDaypart}})});
  });

  await page.goto(`${base}/reserver/?reservation_token=${token}`,{waitUntil:'networkidle'});
  if(await page.locator('#neptuneMemberGateV170').count())throw new Error(`${label}: authenticated session should bypass the email gate`);
  await page.locator('[data-concept="hn"]').waitFor();
  await page.getByText('Quel concept vous ressemble ?',{exact:true}).waitFor();
  const conceptDescription=await page.locator('[data-concept="hn"] .concept-benefit-v163').innerText();
  if(conceptDescription!==catalog.cities[0].formats[0].description)throw new Error(`${label}: concept description is not Studio-canonical`);
  await shot(page,label,'concept');await visualGuard(page,label,'concept');

  await page.locator('[data-concept="hn"]').click();
  await page.getByText('Où souhaitez-vous tourner ?',{exact:true}).waitFor();
  await page.locator('[data-city="toulouse"]').click();
  await page.getByText('Quel décor vous ressemble ?',{exact:true}).waitFor();
  const physicalDescription=await page.locator('[data-physical="Chaise"] .configuration-copy p').innerText();
  if(physicalDescription!==configurations[0].description)throw new Error(`${label}: physical description is not Studio-canonical`);
  await shot(page,label,'physical');await visualGuard(page,label,'physical');

  await page.locator('[data-physical="Chaise"]').click();
  await page.getByText('Quand souhaitez-vous tourner ?',{exact:true}).waitFor();
  await page.locator('.calendar-shell').waitFor();
  if(await page.locator('input[type="date"]').count())throw new Error(`${label}: raw date input is visible`);
  const availableDay=page.locator('.day[data-date]:not(:disabled)').first();
  await availableDay.click();
  await page.locator('[data-slot="morning"]').click();
  const continueButton=page.locator('#continuePayment');
  await page.getByRole('button',{name:'Réserver ce créneau →',exact:true}).waitFor();
  await continueButton.scrollIntoViewIfNeeded();
  await shot(page,label,'calendar');const calendarMetrics=await visualGuard(page,label,'calendar');
  await continueButton.click();
  if(!selectionBody||selectionBody.cityId!=='toulouse'||selectionBody.formatId!=='hn'||selectionBody.offerId!=='hn-launch'||selectionBody.configurationChoice!=='Chaise'||selectionBody.requestedDaypart!=='morning'||!selectionBody.requestedDate)throw new Error(`${label}: canonical selection payload is incomplete`);

  await page.getByText('Finalisez votre réservation.',{exact:true}).waitFor();
  await page.locator('.pricing-urgency-v176').waitFor();
  const urgency=await page.locator('.pricing-urgency-v176').innerText();
  if(!/3\s+places restantes/iu.test(urgency)||!/à ce tarif/iu.test(urgency))throw new Error(`${label}: remaining-place urgency is not prominent`);
  const saving=await page.locator('.pricing-saving-v176').innerText();
  if(!/1.?100/iu.test(saving))throw new Error(`${label}: price saving is missing`);
  if(await page.locator('.payment-wait').count())throw new Error(`${label}: obsolete manual payment status is still visible`);
  const pay=page.locator('#payLink'),href=await pay.getAttribute('href');
  if(!href?.startsWith(paymentBase))throw new Error(`${label}: Stripe payment link is wrong`);
  if((await pay.getAttribute('aria-disabled'))!=='true')throw new Error(`${label}: payment should be locked before CGV acceptance`);
  await page.locator('#termsAccepted').check();
  if((await pay.getAttribute('aria-disabled'))!=='false')throw new Error(`${label}: payment did not unlock after CGV acceptance`);
  await shot(page,label,'payment');await visualGuard(page,label,'payment');

  paid=true;
  await page.goto(`${base}/reserver/?payment=success&session_id=cs_test_v180&reservation_token=${token}`,{waitUntil:'networkidle'});
  await page.getByText('Votre passage est réservé.',{exact:true}).waitFor();
  await page.locator('.calendar-embed iframe').waitFor();
  const prep=await page.getByRole('link',{name:'Ouvrir l’agenda',exact:true}).getAttribute('href');
  if(!prep?.includes('calendar.app.google/X9q1T5JT9ngMfZY67'))throw new Error(`${label}: preparation fallback link missing`);
  await shot(page,label,'confirmation');const confirmationMetrics=await visualGuard(page,label,'confirmation');
  await page.close();
  return{calendarMetrics,confirmationMetrics};
}

const desktop=await run({width:1440,height:760},'desktop-normal-window');
const mobile=await run({width:390,height:844},'mobile');
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({release:'neptune-reservation-finalization-20260905-v180',domain:'media.neptunebusiness.com',desktop,mobile},null,2));
await browser.close();
console.log('Final reservation browser audit passed: canonical descriptions, accessible calendar, urgency, payment and confirmation are coherent.');
