import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base=(process.env.NEPTUNE_LOCAL_URL||'http://127.0.0.1:4173').replace(/\/$/u,'');
const root='neptune-tv-media-cloudflare';
const [entry,store,prospect,supplierIntegrity,studioReadiness,studioReadinessCss,nativeWebTv,reserverReadiness,reserverIndex]=await Promise.all([
  fs.readFile(`${root}/src/entry-v40.js`,'utf8'),
  fs.readFile(`${root}/src/store-v29.js`,'utf8'),
  fs.readFile(`${root}/src/portal-sales-prospect-v121.js`,'utf8'),
  fs.readFile(`${root}/src/portal-supplier-integrity-v121.js`,'utf8'),
  fs.readFile(`${root}/public/studio/production-readiness-v121.js`,'utf8'),
  fs.readFile(`${root}/public/studio/production-readiness-v121.css`,'utf8'),
  fs.readFile(`${root}/public/studio/webtv-native-v118.js`,'utf8'),
  fs.readFile(`${root}/public/reserver/assets/production-readiness-v121.js`,'utf8'),
  fs.readFile(`${root}/public/reserver/index.html`,'utf8'),
]);

contract(entry.includes("WEBTV_EMBED_RELEASE='neptune-webtv-external-embed-20260817-v121'"),'release WebTV embed v121 absent');
contract(entry.includes("headers.delete('X-Frame-Options')"),'le lecteur externe doit retirer X-Frame-Options');
contract(entry.includes("upsertDirective(directives,'frame-ancestors',[\"'self'\",'https:'])"),'frame-ancestors doit autoriser les sites HTTPS externes');
contract(entry.includes('Cross-Origin-Resource-Policy'),'la politique de ressource cross-origin du lecteur doit être explicite');
contract(entry.includes('production-readiness-v121.js'),'la couche Studio de production doit être injectée');
contract(store.includes('startTunnelProspectV121'),'le prospect doit utiliser le contrat v121');
contract(store.includes('ensureSupplierPaymentIntegrityV121(this)'),'le store doit garantir l’intégrité des coûts fournisseurs');
contract(prospect.includes("company||raw.organization"),'l’entreprise doit être capturée côté serveur');
contract(prospect.includes("neptune_media_tunnel_v121"),'la source CRM v121 doit être traçable');
contract(supplierIntegrity.includes('portal_supplier_payment_guard_v121'),'les fausses dettes fournisseur historiques doivent être bloquées à l’insertion');
contract(supplierIntegrity.includes('portal_supplier_finance_v95'),'la dette doit provenir du coût fournisseur réel');
contract(studioReadiness.includes('Code iframe'),'le Studio doit exposer le code d’intégration WebTV');
contract(studioReadiness.includes('Copier le code d’intégration'),'le Studio doit proposer une copie directe du code');
contract(studioReadiness.includes("location.replace('/studio/?next=webtv')"),'la régie doit rediriger vers l’authentification si la session opérateur est invalide');
contract(reserverReadiness.includes('Nom de votre entreprise'),'le prospect doit voir un champ entreprise neutre');
contract(reserverReadiness.includes("phone.removeAttribute('required')"),'le téléphone prospect doit être facultatif');
contract(!reserverReadiness.includes('Johan')&&!reserverReadiness.includes('Zambelli'),'la couche production ne doit contenir aucun exemple personnel');
contract(reserverIndex.includes('/reserver/assets/production-readiness-v121.js?v=1'),'la couche prospect doit être chargée avant l’application du tunnel');

const browser=await chromium.launch({headless:true});
const report={release:'neptune-production-readiness-20260817-v121',prospect:[],studio:[]};
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    report.prospect.push(await auditProspect(browser,viewport));
    report.studio.push(await auditStudio(browser,viewport));
  }
}finally{
  await browser.close();
}
await fs.mkdir('test-results/production-readiness-v121',{recursive:true});
await fs.writeFile('test-results/production-readiness-v121/report.json',JSON.stringify(report,null,2));
console.log('Production readiness v121 validée : prospect, Studio/WebTV, intégration externe et invariants fournisseurs.');

async function auditProspect(browser,viewport){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[];let startPayload=null;
  page.on('pageerror',e=>errors.push(`page:${e.message}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`console:${m.text()}`);});
  await page.route('**/api/reservation/catalog-v96',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalogPayload())}));
  await page.route('**/api/reservation/prospect/start',async route=>{
    startPayload=route.request().postDataJSON();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,token:'x'.repeat(48),prospectId:'prospect-v121',contact:{firstName:startPayload.firstName,lastName:startPayload.lastName,company:startPayload.company,email:startPayload.email,phone:startPayload.phone}})});
  });
  await page.route('**/api/reservation/prospect/context',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"prospect_token_expired"}'}));
  await page.goto(`${base}/reserver/?readiness=v121`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#contactForm [name="company"]');
  await assertNoVisibleDemo(page,'prospect contact');
  const company=page.locator('#contactForm [name="company"]');
  contract(await company.getAttribute('required')!==null,'le champ entreprise doit être requis');
  contract(await page.locator('[name="phone"]').getAttribute('required')===null,'le téléphone doit être facultatif');
  contract((await page.locator('[name="firstName"]').getAttribute('placeholder'))==='Votre prénom','placeholder prénom non neutre');
  contract((await page.locator('[name="lastName"]').getAttribute('placeholder'))==='Votre nom','placeholder nom non neutre');
  await page.locator('[name="firstName"]').fill('Léa');
  await page.locator('[name="lastName"]').fill('Martin');
  await page.locator('[name="email"]').fill('lea@atelier.fr');
  await company.fill('Atelier Martin');
  await page.locator('[name="phone"]').fill('0612345678');
  await page.locator('#contactForm button[type="submit"]').click();
  await page.waitForSelector('[data-format]');
  contract(startPayload?.company==='Atelier Martin','l’entreprise n’est pas transmise au backend');
  contract(!('companyName' in startPayload),'un seul contrat entreprise doit être utilisé');
  await assertNoVisibleDemo(page,'prospect formats');
  await page.locator('[data-format]').first().click();
  await page.waitForSelector('#daysGrid');
  contract((await page.locator('h1').textContent()).includes('Choisissez votre créneau'),'la sélection format ne mène pas au choix de créneau');
  const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
  contract(overflow<=3,`débordement tunnel prospect ${viewport.width}px: ${overflow}px`);
  contract(errors.length===0,`erreurs prospect ${viewport.width}px: ${errors.join(' | ')}`);
  await context.close();
  return {viewport:viewport.width,companyCaptured:true,formatToDate:true,overflow};
}

async function auditStudio(browser,viewport){
  const context=await browser.newContext({viewport});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(`page:${e.message}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`console:${m.text()}`);});
  await page.route('**/api/auth/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,csrfToken:'csrf-v121',user:{id:'op-1',email:'studio@neptunebusiness.com',fullName:'Neptune Studio',role:'admin',displayRole:'Admin'}})}));
  await page.route('**/api/admin/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{email:'studio@neptunebusiness.com',fullName:'Neptune Studio',role:'admin'},episodes:[{id:'ep-1',title:'Hors Norme · Épisode 1',mediaUrl:'/media/hors-norme-1.mp4',durationSeconds:120,type:'episode'}],stats:{}})}));
  await page.route('**/api/admin/webtv/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,state:webTvState()})}));
  await page.route('**/api/admin/webtv/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(webTvState())}));
  await page.route('**/direct/?embed=1*',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Neptune embed test</title><video id="player"></video>'}));
  await page.goto(`${base}/studio/webtv.html?readiness=v121`,{waitUntil:'domcontentloaded'});
  await page.addStyleTag({content:studioReadinessCss});
  await page.addScriptTag({content:nativeWebTv,type:'module'});
  await page.addScriptTag({content:studioReadiness,type:'module'});

  await page.waitForSelector('[data-webtv-section-button="settings"]');
  await page.locator('[data-webtv-section-button="settings"]').click();
  await page.waitForSelector('#webTvIntegrationV121',{state:'visible'});
  await page.waitForTimeout(80);
  await assertNoVisibleDemo(page,'Studio WebTV configuration');
  const embed=await page.locator('#webTvCopy_embed').inputValue();
  const publicLink=await page.locator('#webTvCopy_public').inputValue();
  const iframe=await page.locator('#webTvEmbedCodeV121').inputValue();
  contract(embed===`${base}/direct/?embed=1`,'lien embed Studio incohérent');
  contract(publicLink===`${base}/direct/`,'lien public Studio incohérent');
  contract(iframe.includes(embed)&&iframe.includes('allowfullscreen'),'code iframe incomplet');
  await page.locator('[data-copy-v121="iframe"]').click();
  await page.waitForTimeout(50);
  contract((await page.locator('#webTvIntegrationStatusV121').textContent()).includes('Copié'),'copie iframe non confirmée');

  await page.locator('[data-webtv-section-button="program"]').click();
  await page.waitForSelector('.playlist-item',{state:'visible'});
  const firstTitle=(await page.locator('.playlist-item b').first().textContent()).trim();
  contract(firstTitle.includes('Hors Norme'),'playlist WebTV non exploitable');
  await page.locator('[data-type="0"]').selectOption('ad');
  contract(await page.locator('[data-type="0"]').inputValue()==='ad','un programme ne peut pas être typé publicité');
  await page.locator('#addFromLibrary').click();
  contract(await page.locator('#libraryDialog').evaluate(dialog=>dialog.open),'le catalogue WebTV ne s’ouvre pas');
  await page.locator('#closeLibrary').click();

  const deadLinks=await page.locator('a[href=""],a[href="#"],a[href^="javascript:"]').count();
  contract(deadLinks===0,`liens Studio morts détectés: ${deadLinks}`);
  const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
  contract(overflow<=3,`débordement Studio WebTV ${viewport.width}px: ${overflow}px`);
  contract(errors.length===0,`erreurs Studio ${viewport.width}px: ${errors.join(' | ')}`);
  await context.close();
  return {viewport:viewport.width,embedCode:true,playlist:true,ads:true,library:true,overflow};
}

async function assertNoVisibleDemo(page,scope){
  const text=(await page.locator('body').innerText()).toLowerCase();
  for(const marker of ['lorem ipsum','johan','zambelli','bouton démo','mode démo'])contract(!text.includes(marker),`${scope}: élément de démonstration visible (${marker})`);
}

function catalogPayload(){return {ok:true,cities:[{id:'toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[{id:'format-hn',slug:'hors-norme',name:'Hors Norme',concept:'Émission Neptune Business',description:'Un format éditorial structuré.',durationLabel:'Format long',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'offer-hn',name:'Tarif normal',clientPriceCents:199000,currency:'eur',configurations:[]}]}]}]};}
function webTvState(){return {enabled:true,mode:'loop',playlist:[{id:'one',title:'Hors Norme · Épisode 1',mediaUrl:'/media/hors-norme-1.mp4',durationSeconds:120,type:'episode',enabled:true},{id:'two',title:'Message partenaire',mediaUrl:'/media/partenaire.mp4',durationSeconds:30,type:'ad',enabled:true}],fallback:{title:'Mire Neptune',mediaUrl:''},output:{watchUrl:'',configured:false,youtube:{configured:false,enabled:false}},encoder:{status:'running',currentItem:{id:'one',title:'Hors Norme · Épisode 1'},lastHeartbeatAt:new Date().toISOString()}};}
function contract(condition,message){if(!condition)throw new Error(message);}
