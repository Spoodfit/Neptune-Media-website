import { chromium } from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const user={id:'admin-v115',email:'contact@neptunebusiness.com',fullName:'Compte Studio',role:'admin'};
const state={user,programs:[],episodes:[{id:'episode-v115',title:'Émission Neptune de test',videoUrl:'https://tv.neptunebusiness.com/media/v115-test.mp4',durationSeconds:1860,status:'published'}],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};
const browser=await chromium.launch({headless:true});

try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const probe=await context.request.get(`${baseURL}/studio/webtv-v1.js?v=7&probe=${Date.now()}`);
  const source=await probe.text();
  assert(probe.ok(),'runtime Diffusion inaccessible');
  assert(probe.headers()['x-neptune-webtv-runtime']==='neptune-studio-runtime-recovery-20260813-v115','runtime v115 non servi');
  for(const marker of ['initV115();','Promise.allSettled','retryWebTvStateV115','const accountName=$(\'#accountName\')','Reconnectez la régie avant de modifier le programme'])assert(source.includes(marker),`runtime incomplet: ${marker}`);
  new Function(source);

  let webtvAttempts=0;
  await context.route('**/api/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    if(p==='/api/auth/status')return json(route,200,{authenticated:true,csrfToken:'csrf-v115',user});
    if(p==='/api/admin/state')return json(route,200,state);
    if(p==='/api/admin/webtv/state'){webtvAttempts+=1;return json(route,503,{error:'simulated_webtv_failure'});}
    if(p==='/api/admin/webtv/media')return json(route,200,{ok:true,items:[]});
    return json(route,200,{ok:true});
  });

  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(`pageerror:${e.stack||e.message}`));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('503')&&!m.text().includes('simulated_webtv_failure'))errors.push(`console:${m.text()}`);});
  const response=await page.goto(`${baseURL}/studio/webtv.html?runtime_v115=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000});
  assert(response?.ok(),`Diffusion HTTP ${response?.status()}`);

  await page.waitForFunction(()=>document.getElementById('syncState')?.textContent?.includes('Régie indisponible'),null,{timeout:8000});
  assert(webtvAttempts>=3,`retries WebTV insuffisants: ${webtvAttempts}`);
  assert(await page.locator('.neptune-studio-account-copy b').textContent()==='Compte Studio','sidebar canonique incompatible');
  assert(errors.length===0,errors.join(' | '));

  await page.locator('[data-webtv-section-button="program"]').click();
  await page.locator('[data-webtv-section-panel="program"]:not([hidden])').waitFor({state:'visible',timeout:5000});
  const add=page.locator('#addFromLibrary');
  assert(await add.isVisible()&&await add.isEnabled(),'Ajouter un contenu indisponible dans Programme');

  await add.click();
  await page.waitForTimeout(150);
  const dialogState=await page.evaluate(()=>({
    exists:Boolean(document.getElementById('libraryDialog')),
    open:Boolean(document.getElementById('libraryDialog')?.open),
    items:document.querySelectorAll('.library-item').length,
    hint:document.getElementById('libraryHint')?.textContent||'',
  }));
  assert(errors.length===0,`erreur au clic Ajouter un contenu: ${errors.join(' | ')}`);
  assert(dialogState.exists&&dialogState.open,`dialogue catalogue non ouvert: ${JSON.stringify(dialogState)}`);
  assert(dialogState.items===1,'émission Studio absente du catalogue');
  assert((await page.locator('.library-item').textContent()).includes('Émission Neptune de test'),'mauvaise émission affichée');
  assert(await page.locator('.library-item [data-add]').isDisabled(),'mutation du programme permise sans état WebTV réel');
  assert(dialogState.hint.includes('régie doit être reconnectée'),'absence d’explication du mode dégradé');

  const save=page.locator('#save');
  assert(await save.isDisabled(),'publication antenne permise en mode dégradé');
  assert((await save.textContent()).includes('Régie à reconnecter'),'CTA antenne ambigu en mode dégradé');
  await page.locator('#closeLibrary').click();
  await page.locator('#refreshState').click();
  await page.waitForFunction(()=>document.getElementById('refreshState')?.textContent==='Actualiser',null,{timeout:8000});
  assert((await page.locator('#syncState').textContent()).includes('Régie indisponible'),'Actualiser masque la panne persistante');
  assert(await add.isEnabled(),'Actualiser désactive le catalogue Studio');
  assert(errors.length===0,errors.join(' | '));

  console.log(`Studio runtime v115 browser audit: OK — ${webtvAttempts} échecs WebTV simulés, Programme navigable, catalogue Studio visible et mutations antenne bloquées jusqu’à reconnexion.`);
  await context.close();
} finally {
  await browser.close();
}

async function json(route,status,body){await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});}
function assert(value,message){if(!value)throw new Error(message);}
