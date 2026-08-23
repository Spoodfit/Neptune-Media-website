import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const outputDir=process.env.OUTPUT_DIR||'test-results/studio-overview-v122';
await mkdir(outputDir,{recursive:true});

const expectedNav=['Parcours clients','Diffusion','Catalogue Média','Finance','Réglage'];
const adminState={
  user:{id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'},
  programs:[{id:'program-1',name:'Hors Norme',slug:'hors-norme',description:'Interview signature',displayOrder:10,active:true}],
  episodes:[
    {id:'episode-1',title:'Les secrets des clubs d’affaires',programId:'program-1',displayOrder:10,status:'published',durationSeconds:3200,mediaUrl:'https://media.example/episode-1.mp4'},
    {id:'episode-2',title:'Diriger sans s’épuiser',programId:'program-1',displayOrder:20,status:'published',durationSeconds:2800,mediaUrl:'https://media.example/episode-2.mp4'},
  ],
  ads:[{id:'ad-1',name:'Partenaire Neptune',title:'Partenaire Neptune',active:true,durationSeconds:30,mediaUrl:'https://media.example/ad-1.mp4'}],
  users:[{id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin',active:true}],
  audit:[{id:'audit-1',action:'media.updated',occurredAt:new Date().toISOString()}],
  settings:{},
  finance:{revenueCents:420000,payingClients:2,supplierDueCents:72000,estimatedMarginCents:348000},
  stats:{views:1240,watchSeconds:54000,uniqueViewers:730,bookingClicks:42,byEpisode:{'episode-1':{views:700,watchSeconds:30000,bookingClicks:30},'episode-2':{views:540,watchSeconds:24000,bookingClicks:12}},conversions:{count:4,revenueCents:420000},webTv:{views:1240,watchSeconds:54000,uniqueViewers:730,bookingClicks:42,byEpisode:{'episode-1':{views:700,watchSeconds:30000,bookingClicks:30},'episode-2':{views:540,watchSeconds:24000,bookingClicks:12}},daily:[{day:'2026-08-18',views:50,watchSeconds:2400,bookingClicks:2},{day:'2026-08-19',views:63,watchSeconds:3100,bookingClicks:3}]}},
};
const webTvState={
  enabled:true,mode:'loop',
  output:{provider:'neptune',protocol:'hls',configured:true,watchUrl:'/direct/',manifestUrl:'/direct/live/index.m3u8',youtube:{configured:false,enabled:false,watchUrl:''}},
  playlist:[
    {id:'episode-1',title:'Les secrets des clubs d’affaires',mediaUrl:'https://media.example/episode-1.mp4',durationSeconds:3200,type:'episode',enabled:true},
    {id:'ad-1',title:'Partenaire Neptune',mediaUrl:'https://media.example/ad-1.mp4',durationSeconds:30,type:'ad',enabled:true},
  ],
  fallback:{title:'Neptune Media',mediaUrl:''},
  encoder:{status:'streaming',lastHeartbeatAt:new Date().toISOString(),lastError:null,currentItem:{id:'episode-1',title:'Les secrets des clubs d’affaires',type:'episode',startedAt:new Date().toISOString()}},
};
const webTvLibrary={ok:true,items:[
  {id:'upload:asset-a.mp4',assetId:'asset-a',title:'Émission Cloudflare A',mediaUrl:'/media/webtv/asset-a.mp4',durationSeconds:1800,size:120000000,contentType:'video/mp4',source:'cloudflare-r2'},
  {id:'upload:asset-b.mp4',assetId:'asset-b',title:'Émission Cloudflare B',mediaUrl:'/media/webtv/asset-b.mp4',durationSeconds:1500,size:95000000,contentType:'video/mp4',source:'cloudflare-r2'},
]};
const catalogContext={ok:true,formats:[],suppliers:[],cities:[],families:[],configurationVisuals:[],offers:[],services:[],supplierRates:[],rateUnits:[],durationOptions:[]};
const publishedCatalog={ok:true,formats:[],cities:[],offers:[],suppliers:[],pricing:{}};
const portal={clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:adminState.finance};
const screens=[
  {id:'webtv',path:'/studio/webtv.html',active:'Diffusion',kind:'webtv'},
  {id:'catalogue',path:'/studio/advanced.html#programs',active:'Catalogue Média',kind:'catalogue'},
  {id:'finance',path:'/studio/advanced.html#finances',active:'Finance',kind:'finance'},
  {id:'settings',path:'/studio/advanced.html#settings',active:'Réglage',kind:'settings'},
  {id:'legacy-programme',path:'/studio/advanced.html#episodes',active:'Diffusion',kind:'legacy'},
];
const viewports=[{id:'desktop',width:1440,height:900},{id:'mobile',width:390,height:844}];
const browser=await chromium.launch({headless:true});
const reports=[];

try{
  for(const viewport of viewports){
    for(const screen of screens){
      const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:'block'});
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='media.example')return route.fulfill({status:204,body:''});
        if(url.pathname.startsWith('/media/webtv/'))return route.fulfill({status:204,contentType:'video/mp4',body:''});
        if(!url.pathname.startsWith('/api/'))return route.continue();
        let body={ok:true};
        if(url.pathname==='/api/auth/status')body={authenticated:true,csrfToken:'test-csrf',user:adminState.user};
        else if(url.pathname==='/api/admin/state'||url.pathname==='/api/v1/media/studio/state')body=adminState;
        else if(url.pathname==='/api/admin/webtv/state')body=webTvState;
        else if(url.pathname==='/api/admin/webtv/library')body=webTvLibrary;
        else if(url.pathname==='/api/admin/clients')body=portal;
        else if(url.pathname==='/api/admin/control-room')body={actions:[],summary:{}};
        else if(url.pathname==='/api/admin/media-catalog-v98/context')body=catalogContext;
        else if(url.pathname==='/api/reservation/catalog-v96')body=publishedCatalog;
        else if(url.pathname.startsWith('/api/admin/client-feedback'))body={feedback:[]};
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(`PAGE ${error.message}`));
      page.on('response',response=>{const status=response.status(),url=response.url();if(status>=400&&!/favicon/iu.test(url))errors.push(`HTTP ${status} ${url}`);});
      page.on('console',message=>{const text=message.text();if(message.type()==='error'&&!/favicon/iu.test(text)&&!/^Failed to load resource:/iu.test(text))errors.push(`CONSOLE ${text}`);});
      const response=await page.goto(`${baseURL}${screen.path}`,{waitUntil:'domcontentloaded',timeout:30000});
      assert(response?.ok(),`${screen.id}/${viewport.id}: HTTP ${response?.status()}`);
      await page.waitForFunction(()=>Boolean(document.documentElement.dataset.studioOverviewV122),null,{timeout:20000});
      await page.waitForSelector('.neptune-studio-nav-link',{timeout:20000});
      if(screen.kind!=='webtv')await page.waitForSelector('#app:not([hidden])',{timeout:20000});
      if(screen.kind==='catalogue'){
        await page.waitForSelector('.c98-page',{timeout:20000});
        await page.waitForFunction(()=>document.getElementById('content')?.dataset.c98==='ready',null,{timeout:20000});
        await page.waitForSelector('#studioCatalogMarketplaceV128',{state:'visible',timeout:20000});
      }
      if(screen.kind==='settings')await page.waitForSelector('#studioSettingsOverviewV122:not([hidden])',{timeout:20000});
      if(screen.kind==='webtv'){
        await page.waitForSelector('#webtvCockpitV125',{state:'visible',timeout:20000});
        await page.waitForFunction(()=>Boolean(document.documentElement.dataset.webtvMonitorControlsV135),null,{timeout:10000});
        await page.waitForSelector('#antennaPreview',{state:'attached',timeout:10000});
        await page.waitForSelector('#v125MonitorControls',{state:'attached',timeout:10000});
      }
      await page.waitForTimeout(500);

      const metrics=await page.evaluate(kind=>{
        const visible=element=>{if(!element||element.hidden)return false;const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;};
        const links=[...document.querySelectorAll('.neptune-studio-nav-link')];
        const active=links.filter(link=>link.classList.contains('active')).map(link=>link.querySelector('strong')?.textContent.trim()||'');
        const nav=links.filter(visible).map(link=>link.querySelector('strong')?.textContent.trim()||'');
        const context=[...document.querySelectorAll('.studio-context-nav-v65')].filter(visible).length;
        const root=document.documentElement,body=document.body;
        const overflow=Math.max(root.scrollWidth,body.scrollWidth)-innerWidth;
        const data={kind,nav,active,context,overflow,pageHeight:Math.max(root.scrollHeight,body.scrollHeight),viewportHeight:innerHeight};
        if(kind==='catalogue'){
          const marketplace=document.getElementById('studioCatalogMarketplaceV128');
          const legacyLayout=document.querySelector('.c98-layout');
          const oldTabs=document.querySelector('.c98-tabs');
          data.catalogue={
            bodyMode:body.classList.contains('v122-studio-catalog'),
            marketplaceVisible:visible(marketplace),
            legacyLayoutDisplay:legacyLayout?getComputedStyle(legacyLayout).display:'missing',
            oldTabsDisplay:oldTabs?getComputedStyle(oldTabs).display:'missing',
            legacyGlance:document.querySelectorAll('[data-v122-catalog-tab]').length,
            tunnel:Boolean(document.querySelector('a[href^="/reserver"]')),
          };
        }
        if(kind==='settings')data.settings={cards:document.querySelectorAll('.v122-overview-card').length,bodyMode:body.classList.contains('v122-studio-settings'),overviewVisible:visible(document.querySelector('#studioSettingsOverviewV122'))};
        if(kind==='finance')data.finance={bodyMode:body.classList.contains('v122-studio-finance')};
        if(kind==='webtv'){
          const video=document.querySelector('#antennaPreview');
          data.webtv={
            cockpit:visible(document.querySelector('#webtvCockpitV125')),
            tabs:[...document.querySelectorAll('[data-v125-tab]')].map(x=>x.textContent.trim()),
            activeTabs:[...document.querySelectorAll('[data-v125-tab].active')].map(x=>x.textContent.trim()),
            programRows:document.querySelectorAll('.v125-program-row').length,
            monitorControlsRelease:document.documentElement.dataset.webtvMonitorControlsV135||'',
            antennaAttached:Boolean(video),
            controlsAttached:Boolean(document.querySelector('#v125MonitorControls')),
            nativeControls:Boolean(video?.controls),
            legacyCommand:visible(document.querySelector('#webTvCommandV122')),
            legacyAudience:visible(document.querySelector('#webTvAudienceV122')),
            libraryRows:document.querySelectorAll('.v125-media-row').length,
          };
        }
        return data;
      },screen.kind);

      const expectedActive=screen.active;
      assert(JSON.stringify(metrics.nav)===JSON.stringify(expectedNav),`${screen.id}/${viewport.id}: navigation ${JSON.stringify(metrics.nav)}`);
      assert(metrics.active.length===1&&metrics.active[0]===expectedActive,`${screen.id}/${viewport.id}: actif ${JSON.stringify(metrics.active)}`);
      assert(metrics.context===0,`${screen.id}/${viewport.id}: ancienne sous-navigation encore visible`);
      assert(metrics.overflow<=3,`${screen.id}/${viewport.id}: overflow ${metrics.overflow}px`);
      if(screen.kind==='catalogue'){
        assert(metrics.catalogue.bodyMode,`${screen.id}: mode Catalogue absent`);
        assert(metrics.catalogue.marketplaceVisible,`${screen.id}: marketplace Catalogue v128 absente`);
        assert(metrics.catalogue.legacyLayoutDisplay==='none',`${screen.id}: gestion legacy visible dans la marketplace`);
        assert(metrics.catalogue.oldTabsDisplay==='none',`${screen.id}: ancienne navigation Catalogue encore visible`);
        assert(metrics.catalogue.legacyGlance===0,`${screen.id}: raccourcis legacy encore montés`);
        assert(metrics.catalogue.tunnel,`${screen.id}: accès au tunnel absent`);
      }
      if(screen.kind==='finance')assert(metrics.finance.bodyMode,'finance: mode compact absent');
      if(screen.kind==='settings'){
        assert(metrics.settings.bodyMode&&metrics.settings.overviewVisible,'settings: vue Réglage compacte absente');
        assert(metrics.settings.cards===3,`settings: ${metrics.settings.cards} cartes au lieu de 3`);
      }
      if(screen.kind==='webtv'){
        assert(metrics.webtv.cockpit,'webtv: cockpit v125 absent');
        assert(JSON.stringify(metrics.webtv.tabs)===JSON.stringify(['Antenne','Bibliothèque','Configuration','Analyse']),`webtv: onglets ${JSON.stringify(metrics.webtv.tabs)}`);
        assert(metrics.webtv.activeTabs.length===1&&metrics.webtv.activeTabs[0]==='Antenne','webtv: onglet Antenne initial absent');
        assert(metrics.webtv.programRows===2,'webtv: programme v125 incomplet');
        assert(metrics.webtv.monitorControlsRelease,'webtv: runtime de contrôle moniteur v135 absent');
        assert(metrics.webtv.antennaAttached,'webtv: retour antenne Neptune absent');
        assert(metrics.webtv.controlsAttached,'webtv: contrôles Neptune non montés');
        assert(metrics.webtv.nativeControls===false,'webtv: contrôles vidéo natifs encore actifs');
        assert(metrics.webtv.legacyCommand===false,'webtv: ancien command center v122 encore visible');
        assert(metrics.webtv.legacyAudience===false,'webtv: ancienne analyse externe encore visible');
        if(viewport.width>1000)assert(metrics.pageHeight<=metrics.viewportHeight+3,`webtv: scroll global desktop ${metrics.pageHeight}px/${metrics.viewportHeight}px`);
      }
      if(viewport.width<=860){
        const toggle=page.locator('#neptuneStudioMenuToggle');
        assert(await toggle.isVisible(),`${screen.id}: bouton menu mobile absent`);
        await toggle.click();
        await page.waitForFunction(()=>document.body.classList.contains('studio-menu-open-v65'),null,{timeout:5000});
        const drawerNav=await page.locator('.neptune-studio-nav-link').allTextContents();
        assert(drawerNav.length===5,`${screen.id}: tiroir mobile incomplet`);
        await page.keyboard.press('Escape');
      }
      await page.screenshot({path:path.join(outputDir,`${screen.id}-${viewport.id}.png`),fullPage:true});
      reports.push({screen,viewport,metrics,errors});
      assert(errors.length===0,`${screen.id}/${viewport.id}: erreurs navigateur ${errors.join(' | ')}`);
      await context.close();
    }
  }
}finally{await browser.close();}

await writeFile(path.join(outputDir,'report.json'),JSON.stringify(reports,null,2));
console.log('Studio overview v122 audit passed.');

function assert(condition,message){if(!condition)throw new Error(message);}
