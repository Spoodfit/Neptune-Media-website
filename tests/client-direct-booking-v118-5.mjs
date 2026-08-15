import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base=(process.env.DASHBOARD_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/u,'');
const sourceRoot='neptune-tv-media-cloudflare';

const [catalogJs,catalogCss,entry,bridge,wrangler]=await Promise.all([
  fs.readFile(`${sourceRoot}/public/espace-client/client-visual-coherence-v118-2.js`,'utf8'),
  fs.readFile(`${sourceRoot}/public/espace-client/client-visual-coherence-v118-2.css`,'utf8'),
  fs.readFile(`${sourceRoot}/src/entry-v40.js`,'utf8'),
  fs.readFile(`${sourceRoot}/src/portal-client-direct-booking-v118-5.js`,'utf8'),
  fs.readFile(`${sourceRoot}/wrangler.jsonc`,'utf8'),
]);

expect(catalogJs.includes("new URL('/espace-client/reserver/'"),'les cartes doivent ouvrir la réservation client');
expect(catalogJs.includes('cc-v118-catalog-card-link'),'la carte complète doit être une cible interactive unique');
expect(!catalogJs.includes('<article class="format-card cc-v118-catalog-card"'),'l’ancien conteneur article à liens multiples doit être retiré');
expect(!catalogJs.includes('href="${esc(href)}">Choisir'),'le CTA ne doit plus créer un second lien imbriqué');
expect(catalogCss.includes('a.cc-v118-catalog-card-link.active'),'le vieux state .active doit être neutralisé');
expect(catalogCss.includes('@media(hover:hover) and (pointer:fine)'),'le hover doit être limité aux pointeurs qui le supportent');
expect(entry.includes("'/api/client/reservation/prepare-payment'"),'le Worker doit exposer la préparation de paiement authentifiée');
expect(entry.includes('isSameOrigin(request)'),'la route de paiement doit vérifier la même origine');
expect(entry.includes('clientToken(request)'),'la route de paiement doit dériver le client depuis sa session');
expect(bridge.includes('requireClient(store'),'le store doit valider la session avant de préparer une réservation');
expect(!bridge.includes('raw.email'),'le pont de réservation ne doit jamais faire confiance à un email fourni par le navigateur');
expect(wrangler.includes('"main": "src/entry-v40.js"'),'v40 doit être l’entrée Worker active');

const browser=await chromium.launch({headless:true});
const payloads=[];
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    await page.route('**/api/client/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,client:{id:'client-1',email:'lea@example.com',fullName:'Léa Martin',company:'Acme'},orders:[]})}));
    await page.route('**/api/reservation/catalog-v96',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,cities:[{id:'city-tls',slug:'toulouse',name:'Toulouse',formats:[{id:'format-hn',slug:'hors-norme',name:'Hors Norme',concept:'Émission Neptune Business',description:'Un passage éditorial structuré.',durationLabel:'Format long',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'offer-hn-launch',name:'Prix coûtant · lancement',clientPriceCents:89000,currency:'eur',configurations:[{label:'Fauteuils',image:'/assets/posters/studio-wide.webp'},{label:'Canapé',image:'/assets/posters/hors-norme-wide.webp'}]}]}]}]})}));
    await page.route('**/api/client/reservation/prepare-payment',async route=>{
      const body=route.request().postDataJSON();payloads.push(body);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,directClientBooking:true,paymentUrl:`${base}/__payment-test`})});
    });
    await page.route('**/__payment-test',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Paiement test</title><p>ok</p>'}));

    await page.goto(`${base}/espace-client/reserver/?city=toulouse&format=hors-norme`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#bookingForm:not([hidden])');
    expect(await page.locator('input[type="email"],input[type="tel"],[name="firstName"],[name="lastName"]').count()===0,'aucun formulaire de captation ne doit réapparaître');
    expect((await page.locator('#selectedFormatTitle').textContent()).trim()==='Hors Norme','le format doit être pré-sélectionné');
    expect((await page.locator('#summaryPrice').textContent()).includes('890'),'le prix catalogue doit être affiché');
    expect(await page.locator('[name="configurationChoice"]').count()===2,'les configurations du Studio doivent être proposées');

    const date=nextWeekday();
    await page.locator('#requestedDate').fill(date);
    await page.locator('[name="configurationChoice"][value="Canapé"]').check();
    await page.locator('[name="requestedDaypart"][value="afternoon"]').check();
    const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
    expect(overflow<=3,`aucun overflow global attendu (${viewport.width}px): ${overflow}px`);

    await Promise.all([
      page.waitForURL('**/__payment-test'),
      page.locator('#paymentButton').click(),
    ]);
    await context.close();
  }
}finally{await browser.close();}

expect(payloads.length===2,'la réservation doit préparer exactement un paiement par scénario');
for(const body of payloads){
  expect(body.cityId==='city-tls'&&body.formatId==='format-hn'&&body.offerId==='offer-hn-launch','les identifiants catalogue doivent être transmis');
  expect(body.configurationChoice==='Canapé','la configuration choisie doit être transmise');
  expect(body.requestedDaypart==='afternoon','le créneau doit être transmis');
  expect(/^\d{4}-\d{2}-\d{2}$/u.test(body.requestedDate),'la date doit être transmise au format ISO local');
  expect(!('email' in body)&&!('clientId' in body)&&!('fullName' in body),'l’identité ne doit jamais venir du navigateur');
}

console.log('Réservation client directe v118.5 validée : carte unique, session de confiance, créneau et paiement sans tunnel contact.');

function nextWeekday(){
  const date=new Date();date.setDate(date.getDate()+3);date.setHours(12,0,0,0);
  while(date.getDay()===0||date.getDay()===6)date.setDate(date.getDate()+1);
  const pad=value=>String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
function expect(condition,message){if(!condition)throw new Error(message);}
