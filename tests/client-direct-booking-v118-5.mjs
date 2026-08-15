import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base=(process.env.DASHBOARD_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/u,'');
const sourceRoot='neptune-tv-media-cloudflare';

const [catalogJs,catalogCss,entry,bridge,store,wrangler,pointerFix,hoverCss]=await Promise.all([
  fs.readFile(`${sourceRoot}/public/espace-client/client-visual-coherence-v118-2.js`,'utf8'),
  fs.readFile(`${sourceRoot}/public/espace-client/client-visual-coherence-v118-2.css`,'utf8'),
  fs.readFile(`${sourceRoot}/src/entry-v38.js`,'utf8'),
  fs.readFile(`${sourceRoot}/src/portal-client-direct-booking-v118-5.js`,'utf8'),
  fs.readFile(`${sourceRoot}/src/store-v29.js`,'utf8'),
  fs.readFile(`${sourceRoot}/wrangler.jsonc`,'utf8'),
  fs.readFile(`${sourceRoot}/public/espace-client/client-catalog-interaction-v118-7.js`,'utf8'),
  fs.readFile(`${sourceRoot}/public/espace-client/client-catalog-hover-v118-7.css`,'utf8'),
]);

expect(catalogJs.includes("new URL('/espace-client/reserver/'"),'les cartes doivent ouvrir la réservation client');
expect(catalogJs.includes('cc-v118-catalog-card-link'),'la carte complète doit être une cible interactive unique');
expect(!catalogJs.includes('<article class="format-card cc-v118-catalog-card"'),'l’ancien conteneur article à liens multiples doit être retiré du renderer visuel');
expect(!catalogJs.includes('<a class="format-card cc-v118-catalog-card'),'le renderer visuel ne doit plus émettre la classe legacy format-card');
expect(!catalogJs.includes('href="${esc(href)}">Choisir'),'le CTA ne doit plus créer un second lien imbriqué dans le renderer visuel');
expect(catalogCss.includes('a.cc-v118-catalog-card-link.active'),'le vieux state .active doit rester neutralisé par compatibilité');
expect(entry.includes("const CATALOG_INTERACTION_RELEASE='neptune-client-catalog-interaction-20260815-v118.7'"),'le runtime doit annoncer la correction v118.7');
expect(entry.includes("'/espace-client/client-catalog-interaction-v118-7.js?v=1'"),'le correctif hover v118.7 doit être injecté en dernier');
expect(entry.includes("'/espace-client/client-catalog-hover-v118-7.css?v=1'"),'le contrat CSS de stabilité hover doit être injecté dans le head');
expect(entry.includes('clientCatalogInteraction:CATALOG_INTERACTION_RELEASE'),'le release endpoint doit exposer la version du correctif catalogue');
expect(pointerFix.includes("classList.contains('format-card')"),'les cartes modernes doivent être isolées des anciens états format-card');
expect(pointerFix.includes("querySelectorAll('article.cc-v118-catalog-card').forEach(upgradeLegacyCard)"),'un ancien renderer concurrent doit être migré automatiquement');
expect(pointerFix.includes("attributeFilter:['class','aria-current']"),'le correctif doit surveiller le retour d’un état sélectionné legacy');
expect(pointerFix.includes('.cc-v1187-format-card>*{pointer-events:none}'),'les descendants ne doivent plus créer de zones de clic concurrentes');
expect(pointerFix.includes("url.pathname='/espace-client/reserver/'"),'les anciennes cartes /reserver doivent être ramenées vers la réservation authentifiée');
expect(!pointerFix.includes("addEventListener('pointerover'"),'aucun travail DOM ne doit être déclenché par le simple survol');
expect(hoverCss.includes('.cc-v118-catalog-card:hover'),'le hover stable doit être défini explicitement');
expect(hoverCss.includes('transform:none!important'),'le hover ne doit jamais déplacer le hitbox');
expect(hoverCss.includes('transition:none!important'),'le zoom image hérité doit être neutralisé');
expect(entry.includes("'/api/client/reservation/prepare-payment'"),'le runtime client v38 doit exposer la préparation de paiement authentifiée');
expect(entry.includes('isSameOrigin(request)'),'la route de paiement doit vérifier la même origine');
expect(entry.includes('clientToken(request)'),'la route de paiement doit dériver le client depuis sa session');
expect(store.includes('/portal/client-direct-booking-v1185/prepare-payment'),'le store canonique v29 doit router la réservation authentifiée');
expect(bridge.includes('requireClient(store'),'le store doit valider la session avant de préparer une réservation');
expect(!bridge.includes('raw.email'),'le pont de réservation ne doit jamais faire confiance à un email fourni par le navigateur');
expect(wrangler.includes('"main": "src/entry-v39.js"'),'entry-v39 doit rester l’entrée Worker canonique');

const browser=await chromium.launch({headless:true});
const payloads=[];
try{
  await validateCatalogPointerRace(browser,pointerFix,hoverCss);

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
    await page.locator('.configuration-choice').filter({hasText:'Canapé'}).click();
    await page.locator('.daypart-grid label').filter({hasText:'Après-midi'}).click();
    expect(await page.locator('[name="configurationChoice"][value="Canapé"]').isChecked(),'la carte Canapé doit sélectionner le radio associé');
    expect(await page.locator('[name="requestedDaypart"][value="afternoon"]').isChecked(),'la carte Après-midi doit sélectionner le créneau associé');
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

console.log('Réservation client directe v118.7 validée : hitbox immobile au hover, aucun pointerover DOM, carte unique et paiement sans tunnel contact.');

async function validateCatalogPointerRace(browser,pointerFix,hoverCss){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  await page.route('**/api/client/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,client:{id:'client-race',email:'lea@example.com',fullName:'Léa Martin'},orders:[]})}));
  await page.goto(`${base}/espace-client/?catalog_pointer_race=1`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.formats-panel .format-grid');
  await page.addStyleTag({content:hoverCss});
  await page.evaluate(()=>{
    const grid=document.querySelector('.formats-panel .format-grid');
    grid.innerHTML=`<article class="format-card cc-v118-catalog-card active" aria-current="true">
      <a class="cc-v118-catalog-visual" href="/reserver?city=toulouse&format=hors-norme"><span>NEPTUNE</span><i>Toulouse</i></a>
      <div class="cc-v118-catalog-copy"><span>ÉMISSION</span><strong>Hors Norme</strong><p>Interview signature.</p></div>
      <footer><b>Dès 890 €</b><a href="/reserver?city=toulouse&format=hors-norme">Choisir <span>→</span></a></footer>
    </article>`;
  });
  await page.addScriptTag({content:pointerFix});
  await page.waitForSelector('a.cc-v1187-format-card[data-v1187-owner="true"]');
  await page.waitForTimeout(80);

  const card=page.locator('a.cc-v1187-format-card').first();
  expect(await page.locator('article.cc-v118-catalog-card').count()===0,'le renderer legacy doit être remplacé');
  expect(await card.locator('a').count()===0,'aucun lien imbriqué ne doit rester dans la carte');
  expect(!(await card.evaluate(node=>node.classList.contains('format-card'))),'la classe legacy format-card doit être retirée');
  expect(!(await card.evaluate(node=>node.classList.contains('active'))),'la classe legacy active doit être retirée');
  expect(!(await card.evaluate(node=>node.hasAttribute('aria-current'))),'aria-current ne doit pas transformer la carte en sélection persistante');
  expect((await card.getAttribute('href'))==='/espace-client/reserver/?city=toulouse&format=hors-norme','la destination doit utiliser le parcours authentifié');

  await card.evaluate(node=>{node.classList.add('format-card','active');node.setAttribute('aria-current','true');});
  await page.waitForTimeout(80);
  expect(!(await card.evaluate(node=>node.classList.contains('format-card'))),'le MutationObserver doit retirer format-card si un ancien script la réinjecte');
  expect(!(await card.evaluate(node=>node.classList.contains('active'))),'le MutationObserver doit retirer active si un ancien script la réinjecte');
  expect(!(await card.evaluate(node=>node.hasAttribute('aria-current'))),'le MutationObserver doit retirer aria-current réinjecté');

  const before=await card.boundingBox();
  expect(Boolean(before),'la carte doit avoir une géométrie mesurable avant hover');
  await card.hover();
  await page.waitForTimeout(180);
  const during=await card.boundingBox();
  const hovered=await card.evaluate(node=>({
    cursor:getComputedStyle(node).cursor,
    transform:getComputedStyle(node).transform,
    imageTransform:getComputedStyle(node.querySelector('.cc-v118-catalog-visual img')||node).transform,
  }));
  expect(hovered.cursor==='pointer','la carte doit conserver un curseur pointer');
  expect(hovered.transform==='none','le hover ne doit appliquer aucune transformation géométrique à la carte');
  expect(hovered.imageTransform==='none','le hover ne doit plus zoomer le visuel');
  expect(Math.abs(during.x-before.x)<.1&&Math.abs(during.y-before.y)<.1,'la position de la hitbox doit rester strictement stable au hover');
  expect(Math.abs(during.width-before.width)<.1&&Math.abs(during.height-before.height)<.1,'la taille de la hitbox doit rester strictement stable au hover');
  expect(!(await card.evaluate(node=>node.classList.contains('active'))),'le hover ne doit jamais devenir une sélection persistante');

  await page.mouse.move(3,3);
  await page.waitForTimeout(180);
  const after=await card.boundingBox();
  expect(Math.abs(after.x-before.x)<.1&&Math.abs(after.y-before.y)<.1,'la carte ne doit pas se décaler après sortie de souris');
  expect(await card.locator(':scope > *').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).pointerEvents==='none')),'les descendants doivent laisser la carte entière gérer le clic');
  await context.close();
}

function nextWeekday(){
  const date=new Date();date.setDate(date.getDate()+3);date.setHours(12,0,0,0);
  while(date.getDay()===0||date.getDay()===6)date.setDate(date.getDate()+1);
  const pad=value=>String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
function expect(condition,message){if(!condition)throw new Error(message);}
