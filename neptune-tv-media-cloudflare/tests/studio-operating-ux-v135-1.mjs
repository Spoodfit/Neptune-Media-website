import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.LOCAL_BASE_URL||'http://127.0.0.1:4173';
const read=file=>fs.readFile(new URL(`../${file}`,import.meta.url),'utf8');
const [entry,extension,operating,modalFix,css,wizard,catalog,localWrangler,rootWrangler]=await Promise.all([
  read('src/entry-v40.js'),read('src/studio-operating-v135.js'),read('public/studio/studio-operating-v135.js'),read('public/studio/studio-operating-modal-fix-v135-1.js'),read('public/studio/studio-operating-v135.css'),read('public/studio/client-passage-wizard-v118.js'),read('public/studio/studio-catalog-visual-v132.js'),read('wrangler.jsonc'),fs.readFile(new URL('../../wrangler.jsonc',import.meta.url),'utf8')
]);
assert.match(localWrangler,/"main"\s*:\s*"src\/entry-v40\.js"/u);
assert.match(rootWrangler,/"main"\s*:\s*"neptune-tv-media-cloudflare\/src\/entry-v40\.js"/u);
assert.ok(entry.includes("from './studio-operating-v135.js'"));
assert.ok(extension.includes("post('/api/admin/media-catalog-v98/context',{},true)"));
assert.ok(extension.includes('renderCatalogResultsV135()'));
assert.ok(extension.includes('webtv-workspace-v1.js')&&extension.includes('webtv-control-room-v122.js'));
assert.ok(operating.includes('studioAgendaV135')&&operating.includes('wizardPhoneV135'));
assert.ok(modalFix.includes("target.closest('[data-v135-date]')")&&modalFix.includes("target.closest('[data-v135-create]')"));

const wizardLegacy="async function loadContext(){try{const [clients,catalog,sales]=await Promise.all([get('/api/admin/clients'),post('/api/admin/media-catalog-v98/context',{}),get('/api/reservation/catalog-v96').catch(()=>({cities:[]}))]);";
const wizardSafe="async function loadContext(){try{const auth=await get('/api/auth/status');if(auth.csrfToken)sessionStorage.setItem('neptune_csrf',auth.csrfToken);const [clients,catalog,sales]=await Promise.all([get('/api/admin/clients'),post('/api/admin/media-catalog-v98/context',{},true),get('/api/reservation/catalog-v96').catch(()=>({cities:[]}))]);";
const catalogLegacy="if(event.target.matches('[data-v132-search]')){state.query=event.target.value;render();}";
const catalogSafe="if(event.target.matches('[data-v132-search]')){state.query=event.target.value;renderCatalogResultsV135();}";
assert.ok(wizard.includes(wizardLegacy));assert.ok(catalog.includes(catalogLegacy));
const safeWizard=wizard.replace(wizardLegacy,wizardSafe);
const safeCatalog=`${catalog.replace(catalogLegacy,catalogSafe)}\nfunction renderCatalogResultsV135(){const content=$('.v132-content');if(content)content.innerHTML=state.mode==='structure'?renderStructure():renderCatalog();}`;

const browser=await chromium.launch({headless:true});
try{await catalogTyping();await wizardAgenda();await webTvViewport();}finally{await browser.close();}
console.log('Studio v135.1 gate passed');

async function addModule(page,source){await page.addScriptTag({type:'module',content:source});}

async function catalogTyping(){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/fixture-catalog-v135',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body><h1 id="title">Catalogue Média</h1><button data-tab="programs" class="active"></button><div class="c98-page"><div class="c98-hero"></div><div class="c98-tabs"></div><div class="c98-layout"></div></div></body>'}));
  await page.route('**/api/admin/media-catalog-v98/context',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,cities:[],formats:[],suppliers:[],services:[],supplierRates:[],offerFamilies:[],configurationVisuals:[]})}));
  await page.goto(`${base}/fixture-catalog-v135#programs`);await addModule(page,safeCatalog);
  const input=page.locator('[data-v132-search]');await input.waitFor();await input.type('Toulouse',{delay:10});
  assert.equal(await input.inputValue(),'Toulouse');
  assert.equal(await page.evaluate(()=>document.activeElement?.matches?.('[data-v132-search]')),true);
  await page.close();
}

async function wizardAgenda(){
  const page=await browser.newPage({viewport:{width:1440,height:900}});let csrf='';
  const order={id:'order-v135',clientId:'client-v135',fullName:'Léa Dupoulin',company:'Neptune Test',email:'lea@example.com',title:'Passage Neptune Media',format:'Hors Norme',status:'reservation_confirmed',filmingAt:'2026-08-28T09:00:00.000Z',appointmentAt:'2026-08-25T08:00:00.000Z'};
  await page.route('**/studio/clients',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body><div class="clients-top-actions"><button id="newClient" onclick="newDialog.showModal()">Nouveau passage</button></div><dialog id="newDialog"><form id="newOrder"></form></dialog><button id="refresh"></button></body>'}));
  await page.route('**/api/auth/status',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:true,csrfToken:'csrf-v135',user:{role:'admin'}})}));
  await page.route('**/api/admin/clients',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({clients:[{id:'client-v135',fullName:'Léa Dupoulin',email:'lea@example.com'}],orders:[order]})}));
  await page.route('**/api/admin/media-catalog-v98/context',r=>{csrf=r.request().headers()['x-csrf-token']||'';r.fulfill({status:csrf==='csrf-v135'?200:403,contentType:'application/json',body:JSON.stringify(csrf==='csrf-v135'?{ok:true,formats:[],services:[],supplierRates:[],offerFamilies:[],cities:[],suppliers:[]}:{error:'csrf_failed'})});});
  await page.route('**/api/reservation/catalog-v96',r=>r.fulfill({contentType:'application/json',body:'{"ok":true,"cities":[]}'}));
  await page.goto(`${base}/studio/clients`);await addModule(page,safeWizard);await page.waitForFunction(()=>document.body.dataset.passageWizardV118);assert.equal(csrf,'csrf-v135');
  await addModule(page,operating);await addModule(page,modalFix);await page.waitForSelector('#studioAgendaV135');
  await page.locator('#newClient').click();await page.getByRole('button',{name:'Nouveau client'}).click();
  const first=page.locator('#wizardFirstNameV135'),last=page.locator('#wizardLastNameV135'),phone=page.locator('#wizardPhoneV135');
  await first.type('Jean');await last.type('Dupont');await phone.type('0612345678');
  assert.equal(await first.inputValue(),'Jean');assert.equal(await last.inputValue(),'Dupont');assert.equal(await phone.inputValue(),'0612345678');assert.equal(await page.locator('#wizardNameV118').inputValue(),'Jean Dupont');
  await page.evaluate(()=>newDialog.close());
  await page.locator('#studioAgendaV135').click();await page.waitForSelector('[data-v135-order="order-v135"]');
  await page.locator('[data-v135-date="2026-08-28"]').click();
  await page.waitForFunction(()=>!document.querySelector('#studioAgendaDialogV135')?.open&&document.querySelector('#studioAgendaActionV135')?.open);
  await page.getByRole('button',{name:/Nouvelle préparation/}).click();
  assert.match(await page.locator('#v135PreparationOrder').innerText(),/Léa Dupoulin/u);
  await page.close();
}

async function webTvViewport(){
  const page=await browser.newPage({viewport:{width:1680,height:900}});
  await page.setContent('<!doctype html><body class="studio-operating-v135 studio-operating-webtv-v135 webtv-v125-mounted"><header class="topbar"><h1>Diffusion</h1></header><div class="webtv-section-tabs">legacy</div><main class="main"><section class="v125-cockpit"><div class="v125-summary"></div><nav class="v125-tabs"></nav><div class="v125-workspace"><section class="v125-pane"><div class="v125-analysis"></div></section></div></section><section class="webtv-section-workspace">legacy</section></main></body>');await page.addStyleTag({content:css});
  const x=await page.evaluate(()=>({h:innerHeight,scroll:document.documentElement.scrollHeight,top:document.querySelector('.topbar').getBoundingClientRect().height,bottom:document.querySelector('.main').getBoundingClientRect().bottom,tabs:getComputedStyle(document.querySelector('.webtv-section-tabs')).display,workspace:getComputedStyle(document.querySelector('.webtv-section-workspace')).display}));
  assert.equal(x.tabs,'none');assert.equal(x.workspace,'none');assert.ok(x.top<=55);assert.ok(x.bottom<=x.h+1);assert.ok(x.scroll<=x.h+1);
  await page.close();
}
