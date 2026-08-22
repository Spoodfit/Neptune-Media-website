import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=(process.env.CLIENT_PRODUCTION_URL||'https://tv.neptunebusiness.com').replace(/\/$/u,'');
const email=process.env.CLIENT_AUDIT_EMAIL||'contact@neptunebusiness.com';
const out=path.resolve('test-results/client-production-direct-booking-v118-5');
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true});
const bootstrap=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const loginResponse=await bootstrap.request.post(`${base}/api/client/request-code`,{headers:{Origin:base,'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},data:{email},timeout:30000});
const login=await loginResponse.json().catch(()=>({}));
expect(loginResponse.ok()&&login?.authenticated===true&&login?.trustedAccess===true,'trusted production login unavailable');
const releaseResponse=await bootstrap.request.get(`${base}/api/public/release`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
const release=await releaseResponse.json().catch(()=>({}));
expect(releaseResponse.ok(),'release endpoint unavailable');
expect(release.clientDirectBooking==='neptune-client-direct-reservation-20260815-v118.5','direct booking release not active');
expect(release.clientCatalogInteraction==='single-target-hover-focus-v118.5','catalog interaction release not active');
const storageState=await bootstrap.storageState();await bootstrap.close();

const report={ok:true,auditedAt:new Date().toISOString(),release:{clientDirectBooking:release.clientDirectBooking,clientCatalogInteraction:release.clientCatalogInteraction},scenarios:[]};
for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},reducedMotion:'reduce',storageState});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/espace-client/?audit=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.cc-v118-catalog-card-link',{timeout:25000});
  const card=page.locator('.cc-v118-catalog-card-link').first();
  const href=await card.getAttribute('href');
  expect(/^\/espace-client\/reserver\/\?/.test(href||''),`${viewport.name}: wrong booking href ${href}`);
  const interaction=await card.evaluate(node=>({tag:node.tagName,nestedLinks:node.querySelectorAll('a').length,active:node.classList.contains('active'),after:getComputedStyle(node,'::after').display,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth}));
  expect(interaction.tag==='A'&&interaction.nestedLinks===0,`${viewport.name}: card is not a single anchor target`);
  expect(!interaction.active&&interaction.after==='none',`${viewport.name}: stale active selection remains`);
  expect(interaction.overflow<=3,`${viewport.name}: home horizontal overflow ${interaction.overflow}`);
  if(viewport.name==='desktop'){
    await card.hover();
    await page.mouse.move(8,8);await page.waitForTimeout(80);
    const afterHover=await card.evaluate(node=>({active:node.classList.contains('active'),after:getComputedStyle(node,'::after').display}));
    expect(!afterHover.active&&afterHover.after==='none','desktop: hover leaves a persistent selected state');
  }
  await page.screenshot({path:path.join(out,`home-${viewport.name}.png`),fullPage:true});

  await page.goto(new URL(href,base).toString(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#bookingForm:not([hidden])',{timeout:25000});
  const booking=await page.evaluate(()=>({
    title:document.querySelector('#selectedFormatTitle')?.textContent?.trim()||'',
    price:document.querySelector('#summaryPrice')?.textContent?.trim()||'',
    contactFields:document.querySelectorAll('input[type="email"],input[type="tel"],[name="firstName"],[name="lastName"],[name="company"]').length,
    date:Boolean(document.querySelector('#requestedDate')),
    dayparts:document.querySelectorAll('[name="requestedDaypart"]').length,
    payment:Boolean(document.querySelector('#paymentButton')),
    overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
  }));
  expect(booking.title&&booking.price,`${viewport.name}: selected catalog format not hydrated`);
  expect(booking.contactFields===0,`${viewport.name}: public contact capture leaked into client booking`);
  expect(booking.date&&booking.dayparts===3&&booking.payment,`${viewport.name}: slot/payment controls incomplete`);
  expect(booking.overflow<=3,`${viewport.name}: booking horizontal overflow ${booking.overflow}`);
  await page.screenshot({path:path.join(out,`booking-${viewport.name}.png`),fullPage:true});

  const empty=await context.request.post(`${base}/api/client/reservation/prepare-payment`,{headers:{Origin:base,'Content-Type':'application/json'},data:{},timeout:30000});
  const emptyPayload=await empty.json().catch(()=>({}));
  expect(empty.status()===400&&emptyPayload.error==='reservation_fields_required',`${viewport.name}: authenticated direct endpoint contract unavailable`);
  expect(errors.length===0,`${viewport.name}: page errors ${errors.join(' | ')}`);
  report.scenarios.push({name:viewport.name,href,interaction,booking});
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

function expect(value,message){if(!value){report.ok=false;throw new Error(message);}}
