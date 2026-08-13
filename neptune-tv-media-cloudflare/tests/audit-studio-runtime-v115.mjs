import { chromium } from 'playwright';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const timeout=30000;
const adminUser={id:'admin-v115',email:'contact@neptunebusiness.com',fullName:'Compte Studio',role:'admin'};
const studioState={
  user:adminUser,
  programs:[],
  episodes:[{
    id:'episode-v115',
    title:'Émission Neptune de test',
    videoUrl:'https://tv.neptunebusiness.com/media/v115-test.mp4',
    durationSeconds:1860,
    status:'published',
  }],
  ads:[],users:[adminUser],audit:[],settings:{},
  stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}},
};

const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  let webtvAttempts=0;
  await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/auth/status'){
      await json(route,200,{authenticated:true,csrfToken:'csrf-v115',user:adminUser});return;
    }
    if(url.pathname==='/api/admin/state'){
      await json(route,200,studioState);return;
    }
    if(url.pathname==='/api/admin/webtv/state'){
      webtvAttempts+=1;
      await json(route,503,{error:'simulated_webtv_failure'});return;
    }
    if(url.pathname==='/api/admin/webtv/media'){
      await json(route,200,{ok:true,items:[]});return;
    }
    await json(route,200,{ok:true});
  });

  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.stack||error.message));

  const response=await page.goto(`${baseURL}/studio/webtv.html?runtime_v115=${Date.now()}`,{waitUntil:'domcontentloaded',timeout});
  assert(response?.ok(),`Diffusion HTTP ${response?.status()}`);

  await page.waitForFunction(()=>document.getElementById('syncState')?.textContent?.includes('Régie indisponible'),null,{timeout});
  assert(webtvAttempts>=3,`La reprise v115 n'a pas effectué ses retries WebTV: ${webtvAttempts}`);
  assert(await page.locator('#accountName').textContent()==='Compte Studio','L’identité Studio n’a pas été conservée pendant la panne WebTV');

  const addContent=page.locator('#addFromLibrary');
  assert(await addContent.isEnabled(),'Ajouter un contenu reste désactivé pendant une panne partielle');
  await addContent.click();
  await page.locator('#libraryDialog[open]').waitFor({state:'visible',timeout});
  assert(await page.locator('.library-item').count()===1,'Le catalogue Studio a disparu pendant la panne WebTV');
  assert(await page.locator('.library-item').getByText('Émission Neptune de test').isVisible(),'L’émission Studio récupérée n’est plus visible');

  await page.locator('.library-item [data-add]').click();
  await page.locator('.playlist-item').waitFor({state:'visible',timeout});
  assert(await page.locator('.playlist-item').getByText('Émission Neptune de test').isVisible(),'Le bouton Ajouter n’a pas modifié le programme local');

  const save=page.locator('#save');
  assert(await save.isDisabled(),'Une publication antenne reste possible alors que la régie est indisponible');
  assert((await save.textContent())?.includes('Régie à reconnecter'),'Le blocage antenne n’explique pas la reconnexion requise');

  const refresh=page.locator('#refreshState');
  await refresh.click();
  await page.waitForFunction(()=>document.getElementById('refreshState')?.textContent==='Actualiser',null,{timeout});
  assert((await page.locator('#syncState').textContent())?.includes('Régie indisponible'),'Actualiser masque à tort la panne persistante');
  assert(await page.locator('.playlist-item').count()===1,'Actualiser a effacé le programme local pendant la panne');

  assert(pageErrors.length===0,`Erreurs JavaScript dans Diffusion v115: ${pageErrors.join(' | ')}`);
  console.log(`Studio runtime v115 browser audit: OK — ${webtvAttempts} appels WebTV en échec simulé, catalogue Studio conservé, boutons actifs et publication antenne bloquée.`);
  await context.close();
} finally {
  await browser.close();
}

async function json(route,status,body){
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
}
function assert(condition,message){if(!condition)throw new Error(message);}
