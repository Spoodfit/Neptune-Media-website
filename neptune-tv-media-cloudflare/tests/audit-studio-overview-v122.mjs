import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const outputDir=process.env.OUTPUT_DIR||'test-results/studio-overview-v122';
await mkdir(outputDir,{recursive:true});

const expectedNav=['Parcours clients','Production vidéo','Diffusion','Réglages'];
const adminState={
  user:{id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'},
  programs:[{id:'program-1',name:'Hors Norme',slug:'hors-norme',description:'Interview signature',displayOrder:10,active:true}],
  episodes:[{id:'episode-1',title:'Les secrets des clubs d’affaires',programId:'program-1',displayOrder:10,status:'published',durationSeconds:3200,mediaUrl:'https://media.example/episode-1.mp4'}],
  ads:[{id:'ad-1',name:'Partenaire Neptune',title:'Partenaire Neptune',active:true,durationSeconds:30,mediaUrl:'https://media.example/ad-1.mp4'}],
  users:[{id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin',active:true}],
  audit:[{id:'audit-1',action:'media.updated',occurredAt:new Date().toISOString()}],
  settings:{},
  finance:{revenueCents:420000,payingClients:2,supplierDueCents:72000,estimatedMarginCents:348000},
  stats:{views:1240,watchSeconds:54000,uniqueViewers:730,bookingClicks:42,byEpisode:{},conversions:{count:4,revenueCents:420000},webTv:{views:1240,watchSeconds:54000,uniqueViewers:730,bookingClicks:42,byEpisode:{},daily:[]}},
};
const webTvState={
  enabled:true,mode:'loop',
  output:{provider:'neptune',protocol:'hls',configured:true,watchUrl:'/direct/',manifestUrl:'/direct/live/index.m3u8',youtube:{configured:false,enabled:false,watchUrl:''}},
  playlist:[{id:'episode-1',title:'Les secrets des clubs d’affaires',mediaUrl:'https://media.example/episode-1.mp4',durationSeconds:3200,type:'episode',enabled:true}],
  fallback:{title:'Neptune Media',mediaUrl:''},
  encoder:{status:'streaming',lastHeartbeatAt:new Date().toISOString(),lastError:null,currentItem:{id:'episode-1',title:'Les secrets des clubs d’affaires',type:'episode',startedAt:new Date().toISOString()}},
};
const webTvLibrary={ok:true,items:[{id:'upload:asset-a.mp4',assetId:'asset-a',title:'Émission Cloudflare A',mediaUrl:'/media/webtv/asset-a.mp4',durationSeconds:1800,size:120000000,contentType:'video/mp4',source:'cloudflare-r2'}]};
const catalogFamilyKey='city-toulouse|format-hors-norme|supplier-recbox';
const catalogFamily={
  key:catalogFamilyKey,
  cityId:'city-toulouse',cityName:'Toulouse',formatId:'format-hors-norme',formatName:'Hors Norme',formatSlug:'hors-norme',
  supplierId:'supplier-recbox',supplierName:'RecBox',active:true,publicOrder:10,priceSuffix:'TTC',currency:'eur',supplierNetCents:60000,supplierGrossCents:72000,vatRateBps:2000,
  preparationUrl:'https://example.com/preparation',
  tiers:{
    launch:{id:'offer-launch',clientPriceCents:99000,paymentUrl:'https://buy.stripe.com/test-launch',active:true},
    promo:{id:'offer-promo',clientPriceCents:129000,paymentUrl:'https://buy.stripe.com/test-promo',active:true},
    base:{id:'offer-base',clientPriceCents:159000,paymentUrl:'https://buy.stripe.com/test-base',active:true},
  },
  configurationOptions:['Canapé','Chaise'],
  configurationVisuals:[{label:'Canapé',image:'/assets/posters/hors-norme-wide.webp',description:'Canapé'},{label:'Chaise',image:'/assets/posters/hors-norme-wide.webp',description:'Chaise'}],
  format:{id:'format-hors-norme',slug:'hors-norme',name:'Hors Norme',concept:'Interview signature',description:'Le concept Hors Norme.',durationLabel:'60 min',image:'/assets/posters/hors-norme-wide.webp',active:true},
};
const catalogContext={
  ok:true,
  formats:[catalogFamily.format],
  suppliers:[{id:'supplier-recbox',name:'RecBox',active:true,defaultNetCents:60000,defaultGrossCents:72000,vatRateBps:2000}],
  cities:[{id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',active:true,publicOrder:10}],
  families:[catalogFamily],configurationVisuals:catalogFamily.configurationVisuals,offers:[],services:[],supplierRates:[],rateUnits:[],durationOptions:[],
};
const publishedCatalog={
  ok:true,
  pricing:{tierKey:'launch',tierLabel:'Prix lancement',remaining:2},
  cities:[{id:'city-toulouse',slug:'toulouse',name:'Toulouse',country:'France',formats:[{id:'format-hors-norme',slug:'hors-norme',name:'Hors Norme',concept:'Interview signature',description:'Le concept Hors Norme.',durationLabel:'60 min',image:'/assets/posters/hors-norme-wide.webp',offers:[{id:'offer-launch',name:'Prix lancement',clientPriceCents:99000,currency:'eur',priceSuffix:'TTC',pricing:{tierKey:'launch',tierLabel:'Prix lancement',remaining:2,basePriceCents:159000},configurations:catalogFamily.configurationVisuals}]}]}],
  formats:[],offers:[],suppliers:[],
};
const portal={clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:adminState.finance};
const screens=[
  {id:'webtv',path:'/studio/webtv.html',active:'Diffusion',kind:'webtv',context:false},
  {id:'catalogue',path:'/studio/advanced.html#programs',active:'Réglages',kind:'catalogue',context:true},
  {id:'finance',path:'/studio/advanced.html#finances',active:'Réglages',kind:'finance',context:true},
  {id:'settings',path:'/studio/advanced.html#settings',active:'Réglages',kind:'settings',context:true},
  {id:'programme',path:'/studio/advanced.html#episodes',active:'Diffusion',kind:'programme',context:true},
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
        else if(url.pathname==='/api/admin/media-catalog-v143/policies')body={ok:true,offerPolicies:[]};
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
      await page.waitForSelector('.neptune-studio-nav-link',{timeout:20000});
      await page.waitForFunction(()=>document.documentElement.dataset.neptuneStudioShellReady==='v105',null,{timeout:20000});
      if(screen.kind!=='webtv')await page.waitForSelector('#app:not([hidden])',{timeout:20000});
      if(screen.kind==='catalogue'){
        await page.waitForSelector('.c98-page',{timeout:20000});
        await page.waitForFunction(()=>document.getElementById('content')?.dataset.c98==='ready',null,{timeout:20000});
        await page.waitForSelector('#studioCatalogCommercialCockpitV145',{state:'visible',timeout:20000});
      }
      if(screen.kind==='webtv')await page.waitForSelector('#webtvCockpitV125',{state:'visible',timeout:20000});
      await page.waitForTimeout(350);

      const metrics=await page.evaluate(kind=>{
        const visible=element=>{if(!element||element.hidden)return false;const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.05&&rect.width>0&&rect.height>0;};
        const links=[...document.querySelectorAll('.neptune-studio-nav-link')];
        const active=links.filter(link=>link.classList.contains('active')).map(link=>link.querySelector('strong')?.textContent.trim()||'');
        const nav=links.map(link=>link.querySelector('strong')?.textContent.trim()||'');
        const contextNav=document.querySelector('.studio-context-nav-v65');
        const root=document.documentElement,body=document.body;
        const overflow=Math.max(root.scrollWidth,body.scrollWidth)-innerWidth;
        const data={
          kind,nav,active,contextVisible:visible(contextNav),overflow,
          logout:Boolean(document.getElementById('neptuneStudioLogout')),
          menuToggle:Boolean(document.getElementById('neptuneStudioMenuToggle')),
          shellReady:root.dataset.neptuneStudioShellReady||'',
        };
        if(kind==='catalogue'){
          const cockpit=document.getElementById('studioCatalogCommercialCockpitV145');
          const hierarchy=document.getElementById('studioCatalogHierarchyV133');
          data.catalogue={
            cockpitVisible:visible(cockpit),
            cockpitMounted:Boolean(cockpit),
            legacyHierarchyMarked:hierarchy?.dataset.v145LegacyHost==='1',
            legacyHierarchyVisible:visible(hierarchy),
            release:window.__neptuneCatalogCommercialCockpitV145||'',
            bodyMode:body.classList.contains('v145-catalog-active'),
          };
        }
        if(kind==='webtv')data.webtv={cockpit:visible(document.querySelector('#webtvCockpitV125'))};
        return data;
      },screen.kind);

      assert(JSON.stringify(metrics.nav)===JSON.stringify(expectedNav),`${screen.id}/${viewport.id}: navigation ${JSON.stringify(metrics.nav)}`);
      assert(metrics.active.length===1&&metrics.active[0]===screen.active,`${screen.id}/${viewport.id}: actif ${JSON.stringify(metrics.active)}`);
      assert(metrics.contextVisible===screen.context,`${screen.id}/${viewport.id}: navigation contextuelle inattendue (${metrics.contextVisible})`);
      assert(metrics.overflow<=3,`${screen.id}/${viewport.id}: overflow ${metrics.overflow}px`);
      assert(metrics.logout,`${screen.id}/${viewport.id}: bloc de déconnexion canonique absent`);
      assert(metrics.menuToggle,`${screen.id}/${viewport.id}: bouton de menu responsive absent`);
      assert(metrics.shellReady==='v105',`${screen.id}/${viewport.id}: shell non marqué prêt`);
      if(screen.kind==='catalogue'){
        assert(metrics.catalogue.cockpitMounted&&metrics.catalogue.cockpitVisible,`${screen.id}: cockpit commercial v145 absent`);
        assert(metrics.catalogue.bodyMode,`${screen.id}: mode catalogue v145 absent`);
        assert(metrics.catalogue.release==='neptune-catalog-commercial-cockpit-v145',`${screen.id}: release v145 absente`);
        assert(metrics.catalogue.legacyHierarchyMarked,`${screen.id}: hiérarchie v133 non classée comme hôte legacy`);
        assert(!metrics.catalogue.legacyHierarchyVisible,`${screen.id}: hiérarchie v133 legacy encore visible sous v145`);
      }
      if(screen.kind==='webtv')assert(metrics.webtv.cockpit,`${screen.id}: cockpit WebTV absent`);
      assert(errors.length===0,`${screen.id}/${viewport.id}: erreurs ${JSON.stringify(errors)}`);

      if(viewport.id==='mobile'){
        const toggle=page.locator('#neptuneStudioMenuToggle');
        await toggle.click();
        assert(await toggle.getAttribute('aria-expanded')==='true',`${screen.id}/mobile: menu ne s’ouvre pas`);
        await page.keyboard.press('Escape');
        assert(await toggle.getAttribute('aria-expanded')==='false',`${screen.id}/mobile: Escape ne ferme pas le menu`);
      }

      const report={screen:screen.id,viewport:viewport.id,metrics,errors};
      reports.push(report);
      await page.screenshot({path:path.join(outputDir,`${screen.id}-${viewport.id}.png`),fullPage:false});
      await context.close();
    }
  }
}finally{
  await browser.close();
}

await writeFile(path.join(outputDir,'report.json'),JSON.stringify({ok:true,release:'studio-overview-v122-canonical-v145',reports},null,2));
console.log(JSON.stringify({ok:true,checks:reports.length,nav:expectedNav,catalogue:'v145'},null,2));

function assert(condition,message){if(!condition)throw new Error(message);}
