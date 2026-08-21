import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const base=process.env.LOCAL_BASE_URL||'http://127.0.0.1:4173';
const entry=await fs.readFile(path.join(root,'src/entry-v41.js'),'utf8');
const operating=await fs.readFile(path.join(root,'public/studio/studio-operating-v135.js'),'utf8');
const operatingCss=await fs.readFile(path.join(root,'public/studio/studio-operating-v135.css'),'utf8');
const wizardSource=await fs.readFile(path.join(root,'public/studio/client-passage-wizard-v118.js'),'utf8');
const catalogSource=await fs.readFile(path.join(root,'public/studio/studio-catalog-visual-v132.js'),'utf8');
const localWrangler=await fs.readFile(path.join(root,'wrangler.jsonc'),'utf8');
const rootWrangler=await fs.readFile(path.join(root,'../wrangler.jsonc'),'utf8');

assert.match(localWrangler,/"main"\s*:\s*"src\/entry-v41\.js"/u);
assert.match(rootWrangler,/"main"\s*:\s*"neptune-tv-media-cloudflare\/src\/entry-v41\.js"/u);
assert.ok(entry.includes("WEBTV_LEGACY_SCRIPTS=['/studio/webtv-workspace-v1.js','/studio/webtv-control-room-v122.js']"));
assert.ok(entry.includes("post('/api/admin/media-catalog-v98/context',{},true)"));
assert.ok(entry.includes("content.innerHTML=state.mode==='structure'?renderStructure():renderCatalog()"));
assert.ok(operating.includes('studioAgendaV135')&&operating.includes('wizardFirstNameV135')&&operating.includes('/api/admin/contact-profile-v135'));
assert.ok(operatingCss.includes('.webtv-section-tabs')&&operatingCss.includes('height:calc(100dvh - 54px)'));

const wizardNeedle="async function loadContext(){try{const [clients,catalog,sales]=await Promise.all([get('/api/admin/clients'),post('/api/admin/media-catalog-v98/context',{}),get('/api/reservation/catalog-v96').catch(()=>({cities:[]}))]);";
const wizardReplacement="async function loadContext(){try{const auth=await get('/api/auth/status');if(auth.csrfToken)sessionStorage.setItem('neptune_csrf',auth.csrfToken);const [clients,catalog,sales]=await Promise.all([get('/api/admin/clients'),post('/api/admin/media-catalog-v98/context',{},true),get('/api/reservation/catalog-v96').catch(()=>({cities:[]}))]);";
assert.ok(wizardSource.includes(wizardNeedle),'wizard source contract changed');
const hardenedWizard=wizardSource.replace(wizardNeedle,wizardReplacement);
const catalogNeedle="if(event.target.matches('[data-v132-search]')){state.query=event.target.value;render();}";
const catalogReplacement="if(event.target.matches('[data-v132-search]')){state.query=event.target.value;const content=$('.v132-content');if(content)content.innerHTML=state.mode==='structure'?renderStructure():renderCatalog();}";
assert.ok(catalogSource.includes(catalogNeedle),'catalog source contract changed');
const hardenedCatalog=catalogSource.replace(catalogNeedle,catalogReplacement);

const browser=await chromium.launch({headless:true});
try{
  await testCatalogTyping();
  await testWizardAndAgenda();
  await testWebTvViewport();
}finally{await browser.close();}
console.log('Studio operating UX v135 passed: stable typing, CSRF-safe passage wizard, direct interactive agenda, compact no-legacy Diffusion viewport.');

async function testCatalogTyping(){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/studio/catalog-fixture-v135',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><h1 id="title">Catalogue Média</h1><button data-tab="programs" class="active">Catalogue</button><div class="c98-page"><div class="c98-hero"></div><div class="c98-tabs"></div><div class="c98-layout"></div></div></body></html>'}));
  await page.route('**/api/admin/media-catalog-v98/context',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,cities:[],formats:[],suppliers:[],services:[],supplierRates:[],offerFamilies:[],configurationVisuals:[]})}));
  await page.goto(`${base}/studio/catalog-fixture-v135#programs`);
  await page.addScriptTag({content:hardenedCatalog});
  const search=page.locator('[data-v132-search]');await search.waitFor();await search.click();await search.type('Toulouse',{delay:15});
  assert.equal(await search.inputValue(),'Toulouse','catalog search lost characters');
  assert.equal(await page.evaluate(()=>document.activeElement?.matches?.('[data-v132-search]')),true,'catalog search lost focus after rerender');
  await page.close();
}

async function testWizardAndAgenda(){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  let csrfSeen='';
  const order={id:'order-v135',clientId:'client-v135',fullName:'Léa Dupoulin',company:'Neptune Test',email:'lea@example.com',title:'Passage Neptune Media',format:'Hors Norme',status:'reservation_confirmed',filmingAt:'2026-08-28T09:00:00.000Z',appointmentAt:'2026-08-25T08:00:00.000Z'};
  const client={id:'client-v135',fullName:'Léa Dupoulin',company:'Neptune Test',email:'lea@example.com'};
  await page.route('**/studio/clients',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div class="clients-top-actions"><button id="newClient" type="button">Nouveau passage</button></div><dialog id="newDialog"><form id="newOrder"></form></dialog><button id="refresh">Actualiser</button></body></html>'}));
  await page.route('**/api/auth/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,csrfToken:'csrf-v135',user:{role:'admin'}})}));
  await page.route('**/api/admin/clients',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({clients:[client],orders:[order]})}));
  await page.route('**/api/admin/media-catalog-v98/context',route=>{csrfSeen=route.request().headers()['x-csrf-token']||'';route.fulfill({status:csrfSeen==='csrf-v135'?200:403,contentType:'application/json',body:JSON.stringify(csrfSeen==='csrf-v135'?{ok:true,formats:[],services:[],supplierRates:[],offerFamilies:[],cities:[],suppliers:[]}:{error:'csrf_failed'})});});
  await page.route('**/api/reservation/catalog-v96',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,cities:[]})}));
  await page.goto(`${base}/studio/clients`);
  await page.addScriptTag({content:hardenedWizard});
  await page.waitForFunction(()=>document.body.dataset.passageWizardV118);
  assert.equal(csrfSeen,'csrf-v135','wizard did not send refreshed CSRF token');
  await page.addScriptTag({content:operating});
  await page.waitForSelector('#studioAgendaV135');

  await page.evaluate(()=>document.getElementById('newDialog').showModal());
  await page.getByRole('button',{name:'Nouveau client'}).click();
  await page.waitForSelector('#wizardFirstNameV135');
  const first=page.locator('#wizardFirstNameV135'),last=page.locator('#wizardLastNameV135'),phone=page.locator('#wizardPhoneV135');
  await first.type('Jean',{delay:15});await last.type('Dupont',{delay:15});await phone.type('0612345678',{delay:15});
  assert.equal(await first.inputValue(),'Jean');assert.equal(await last.inputValue(),'Dupont');assert.equal(await phone.inputValue(),'0612345678');
  assert.equal(await page.locator('#wizardNameV118').inputValue(),'Jean Dupont','unified full name was not synchronized');
  await page.evaluate(()=>document.getElementById('newDialog').close());

  await page.locator('#studioAgendaV135').click();
  await page.waitForFunction(()=>document.getElementById('studioAgendaDialogV135')?.open===true);
  assert.equal(await page.getByText('Léa Dupoulin',{exact:true}).count()>0,true,'global agenda did not load client event');
  const day=page.locator('[data-v135-date="2026-08-28"]');await day.click();
  await page.waitForFunction(()=>document.getElementById('studioAgendaActionV135')?.open===true);
  await page.getByRole('button',{name:/Nouvelle préparation/}).click();
  assert.equal(await page.locator('#v135PreparationForm').isVisible(),true,'preparation creation form did not open from agenda');
  assert.match(await page.locator('#v135PreparationOrder').innerText(),/Léa Dupoulin/u);
  await page.close();
}

async function testWebTvViewport(){
  const page=await browser.newPage({viewport:{width:1680,height:900}});
  await page.route('**/studio/webtv-fixture-v135',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body class="studio-operating-v135 studio-operating-webtv-v135 webtv-v125-mounted"><header class="topbar"><h1>Diffusion</h1></header><div class="webtv-section-tabs">legacy tabs</div><main class="main"><section class="v125-cockpit"><div class="v125-summary"></div><nav class="v125-tabs"><button>Antenne</button><button>Bibliothèque</button><button>Configuration</button><button>Analyse</button></nav><div class="v125-workspace"><section class="v125-pane"><div class="v125-analysis">Analyse</div></section></div></section><section class="webtv-section-workspace">legacy content</section></main></body></html>'}));
  await page.goto(`${base}/studio/webtv-fixture-v135`);await page.addStyleTag({content:operatingCss});
  const metrics=await page.evaluate(()=>({innerHeight,scrollHeight:document.documentElement.scrollHeight,topbar:document.querySelector('.topbar').getBoundingClientRect().height,mainBottom:document.querySelector('.main').getBoundingClientRect().bottom,legacyTabs:getComputedStyle(document.querySelector('.webtv-section-tabs')).display,legacyWorkspace:getComputedStyle(document.querySelector('.webtv-section-workspace')).display}));
  assert.equal(metrics.legacyTabs,'none');assert.equal(metrics.legacyWorkspace,'none');assert.ok(metrics.topbar<=55,`topbar too tall: ${metrics.topbar}`);assert.ok(metrics.mainBottom<=metrics.innerHeight+1,`Diffusion exceeds viewport: ${metrics.mainBottom}/${metrics.innerHeight}`);assert.ok(metrics.scrollHeight<=metrics.innerHeight+1,`global page scroll remains: ${metrics.scrollHeight}/${metrics.innerHeight}`);
  await page.close();
}
