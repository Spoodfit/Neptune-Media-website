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
  stats:{views:1240,watchSeconds:54000,uniqueViewers:730,bookingClicks:42,byEpisode:{'episode-1':{views:700,watchSeconds:30000,bookingClicks:30},'episode-2':{views:540,watchSeconds:24000,bookingClicks:12}},conversions:{count:4,revenueCents:420000}},
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
const catalogContext={ok:true,formats:[],suppliers:[],cities:[],families:[],configurationVisuals:[],offers:[]};
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
        if(!url.pathname.startsWith('/api/'))return route.continue();
        let body={ok:true};
        if(url.pathname==='/api/auth/status')body={authenticated:true,csrfToken:'test-csrf',user:adminState.user};
        else if(url.pathname==='/api/admin/state'||url.pathname==='/api/v1/media/studio/state')body=adminState;
        else if(url.pathname==='/api/admin/webtv/state')body=webTvState;
        else if(url.pathname==='/api/admin/clients')body=portal;
        else if(url.pathname==='/api/admin/control-room')body={actions:[],summary:{}};
        else if(url.pathname==='/api/admin/media-catalog-v98/context')body=catalogContext;
        else if(url.pathname==='/api/reservation/catalog-v96')body=publishedCatalog;
        else if(url.pathname.startsWith('/api/admin/client-feedback'))body={feedback:[]};
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error'&&!/favicon/iu.test(message.text()))errors.push(message.text());});
      const response=await page.goto(`${baseURL}${screen.path}`,{waitUntil:'domcontentloaded',timeout:30000});
      assert(response?.ok(),`${screen.id}/${viewport.id}: HTTP ${response?.status()}`);
      await page.waitForFunction(()=>Boolean(document.documentElement.dataset.studioOverviewV122),null,{timeout:20000});
      await page.waitForSelector('.neptune-studio-nav-link',{timeout:20000});
      if(screen.kind!=='webtv')await page.waitForSelector('#app:not([hidden])',{timeout:20000});
      if(screen.kind==='catalogue')await page.waitForSelector('.c98-page',{timeout:20000});
      if(screen.kind==='settings')await page.waitForSelector('#studioSettingsOverviewV122:not([hidden])',{timeout:20000});
      if(screen.kind==='webtv')await page.waitForSelector('#webTvCommandV122',{timeout:20000});
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
          const hero=document.querySelector('.c98-hero'),layout=document.querySelector('.c98-layout');
          data.catalogue={heroHeight:Math.round(hero?.getBoundingClientRect().height||0),layoutMaxHeight:layout?getComputedStyle(layout).maxHeight:'',bodyMode:body.classList.contains('v122-studio-catalog')};
        }
        if(kind==='settings')data.settings={cards:document.querySelectorAll('.v122-overview-card').length,bodyMode:body.classList.contains('v122-studio-settings'),overviewVisible:visible(document.querySelector('#studioSettingsOverviewV122'))};
        if(kind==='finance')data.finance={bodyMode:body.classList.contains('v122-studio-finance')};
        if(kind==='webtv')data.webtv={command:visible(document.querySelector('#webTvCommandV122')),sourceCards:document.querySelectorAll('.v122-source-card').length,kpis:document.querySelectorAll('.v122-tv-kpis article').length,audience:document.querySelectorAll('.v122-audience-grid article').length,sections:[...document.querySelectorAll('[data-webtv-section-button]')].map(x=>x.textContent.trim())};
        return data;
      },screen.kind);

      const expectedActive=screen.active;
      assert(JSON.stringify(metrics.nav)===JSON.stringify(expectedNav),`${screen.id}/${viewport.id}: navigation ${JSON.stringify(metrics.nav)}`);
      assert(metrics.active.length===1&&metrics.active[0]===expectedActive,`${screen.id}/${viewport.id}: actif ${JSON.stringify(metrics.active)}`);
      assert(metrics.context===0,`${screen.id}/${viewport.id}: ancienne sous-navigation encore visible`);
      assert(metrics.overflow<=3,`${screen.id}/${viewport.id}: overflow ${metrics.overflow}px`);
      if(screen.kind==='catalogue'){
        assert(metrics.catalogue.bodyMode,`${screen.id}: mode compact absent`);
        assert(metrics.catalogue.heroHeight>0&&metrics.catalogue.heroHeight<180,`${screen.id}: hero trop haut ${metrics.catalogue.heroHeight}px`);
        if(viewport.width>1080)assert(metrics.catalogue.layoutMaxHeight!=='none',`${screen.id}: layout catalogue non borné au viewport`);
      }
      if(screen.kind==='finance')assert(metrics.finance.bodyMode,'finance: mode compact absent');
      if(screen.kind==='settings'){
        assert(metrics.settings.bodyMode&&metrics.settings.overviewVisible,'settings: vue Réglage compacte absente');
        assert(metrics.settings.cards===3,`settings: ${metrics.settings.cards} cartes au lieu de 3`);
      }
      if(screen.kind==='webtv'){
        assert(metrics.webtv.command,'webtv: console H24 absente');
        assert(metrics.webtv.kpis===4,'webtv: KPIs H24 incomplets');
        assert(metrics.webtv.sourceCards>=2,'webtv: bibliothèque Cloudflare non rendue');
        assert(metrics.webtv.audience===4,'webtv: statistiques audience absentes');
        assert(metrics.webtv.sections.length===3,'webtv: espaces Antenne/Programme/Configuration incomplets');
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

await writeFile(path.join(outputDir,'report.json'),JSON.stringify({ok:true,reports},null,2));
console.log('Studio v122 visual audit passed: 5 destinations, compact Catalogue/Finance/Réglage and H24 WebTV control room.');
function assert(condition,message){if(!condition)throw new Error(message);}
