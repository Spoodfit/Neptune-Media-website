import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=(process.env.CLIENT_PRODUCTION_URL||'https://tv.neptunebusiness.com').replace(/\/$/u,'');
const auditEmail=process.env.CLIENT_AUDIT_EMAIL||'contact@neptunebusiness.com';
const outputDir=path.resolve('test-results/client-production-real-account-audit');
const FINAL=new Set(['delivered','completed']);

await fs.rm(outputDir,{recursive:true,force:true});
await fs.mkdir(outputDir,{recursive:true});

const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
const bootstrap=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const loginResponse=await bootstrap.request.post(`${baseUrl}/api/client/request-code`,{
  headers:{Origin:baseUrl,'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},
  data:{email:auditEmail},timeout:30000,
});
const login=await loginResponse.json().catch(()=>({}));
expect(loginResponse.ok(),`authentification production HTTP ${loginResponse.status()}`);
expect(login?.ok===true&&login?.authenticated===true&&login?.trustedAccess===true,'le compte test Neptune doit utiliser l’accès de confiance');

const sessionResponse=await bootstrap.request.get(`${baseUrl}/api/client/session`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
expect(sessionResponse.ok(),`session production HTTP ${sessionResponse.status()}`);
const session=await sessionResponse.json();
expect(session?.authenticated===true&&Array.isArray(session?.orders),'la session client production doit être authentifiée et exposer orders[]');

const catalogResponse=await bootstrap.request.get(`${baseUrl}/api/reservation/catalog-v96`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
expect(catalogResponse.ok(),`catalogue production HTTP ${catalogResponse.status()}`);
const catalog=await catalogResponse.json().catch(()=>({}));
const storageState=await bootstrap.storageState();
await bootstrap.close();

const orders=session.orders||[];
const activeOrder=orders.find(order=>order?.id&&!FINAL.has(String(order.status||'').toLowerCase()))||null;
const ordersWithFiles=orders.filter(order=>Array.isArray(order?.files)&&order.files.length);
const files=orders.flatMap(order=>Array.isArray(order?.files)?order.files:[]);
const schedules=orders.flatMap(order=>Array.isArray(order?.schedules)?order.schedules:[]);
const catalogCities=Array.isArray(catalog?.cities)?catalog.cities:[];
const catalogVisuals=catalogCities.flatMap(city=>(city.formats||[]).map(format=>({
  city:String(city?.name||city?.slug||''),format:String(format?.name||format?.slug||''),image:String(format?.imagePublicUrl||format?.image||''),
})));

const report={
  baseUrl,auditedAt:new Date().toISOString(),authentication:{ok:true,trustedAccess:true},
  realData:{
    orders:orders.length,
    activeOrders:orders.filter(order=>order?.id&&!FINAL.has(String(order.status||'').toLowerCase())).length,
    ordersWithFiles:ordersWithFiles.length,files:files.length,schedules:schedules.length,
    statuses:countBy(orders.map(order=>String(order?.status||'unknown').toLowerCase())),
    formats:countBy(orders.map(order=>String(order?.format||order?.title||'unknown').trim()||'unknown')),
    catalogCities:catalogCities.map(city=>({slug:String(city?.slug||city?.id||''),name:String(city?.name||''),formats:Array.isArray(city?.formats)?city.formats.length:0})),
    catalogVisuals,
  },
  scenarios:[],findings:[],errors:[],
};

const scenarios=[
  ['dashboard-desktop','/espace-client/',1440,1000,'dashboard'],
  ['dashboard-mobile-390','/espace-client/',390,844,'dashboard'],
  ['dashboard-mobile-320','/espace-client/',320,700,'dashboard'],
  ['library-desktop','/espace-client/videos/',1440,1000,'library'],
  ['library-mobile','/espace-client/videos/',390,844,'library'],
  ['calendar-desktop','/espace-client/calendrier/',1440,1000,'calendar'],
  ['calendar-mobile','/espace-client/calendrier/',390,844,'calendar'],
].map(([name,pathName,width,height,kind])=>({name,path:pathName,viewport:{width,height},kind}));

for(const scenario of scenarios){
  const context=await browser.newContext({viewport:scenario.viewport,reducedMotion:'reduce',storageState});
  const page=await context.newPage();
  const pageErrors=[];
  const networkFailures=[];
  let abortedRequests=0;
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('requestfailed',request=>{
    const url=request.url();
    const failure=request.failure()?.errorText||'failed';
    if(/ERR_ABORTED/iu.test(failure)){abortedRequests+=1;return;}
    if(/youtube|googlevideo|doubleclick|googlesyndication|ytimg|instagram|tiktok|linkedin/iu.test(url))return;
    networkFailures.push(`${request.method()} ${url} :: ${failure}`);
  });

  try{
    const response=await page.goto(`${baseUrl}${scenario.path}?production_audit=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
    expect(response&&response.status()<400,`${scenario.name}: navigation HTTP ${response?.status()||0}`);
    if(scenario.kind==='dashboard'){
      await page.waitForSelector('#dashboard:not([hidden])',{timeout:25000});
      await page.waitForSelector('.client-command-center #ccContent:not([hidden])',{timeout:25000});
      await page.waitForTimeout(1200);
    }else await page.waitForTimeout(1500);

    const diagnostics=await page.evaluate(({kind,expectedFolders,expectedCities,hasActive})=>{
      const doc=document.documentElement,body=document.body;
      const overflow=Math.max(doc.scrollWidth,body.scrollWidth)-innerWidth;
      const duplicateIds=[...document.querySelectorAll('[id]')].map(node=>node.id).filter((id,index,all)=>id&&all.indexOf(id)!==index).filter((id,index,all)=>all.indexOf(id)===index);
      const isScrollManaged=node=>{
        if(node.closest('[hidden],dialog:not([open])'))return true;
        let parent=node.parentElement;
        while(parent&&parent!==document.body){
          const style=getComputedStyle(parent);
          if((style.overflowX==='auto'||style.overflowX==='scroll')&&parent.scrollWidth>parent.clientWidth+3)return true;
          parent=parent.parentElement;
        }
        return false;
      };
      const unmanagedOffscreenTargets=[...document.querySelectorAll('button,a[href]')].map(node=>{
        const rect=node.getBoundingClientRect();
        return {node,rect,managed:isScrollManaged(node)};
      }).filter(({rect,managed})=>!managed&&rect.width>0&&rect.height>0&&(rect.right>innerWidth+3||rect.left<-3)).map(({node,rect})=>({
        tag:node.tagName.toLowerCase(),text:(node.textContent||node.getAttribute('aria-label')||'').replace(/\s+/gu,' ').trim().slice(0,90),
        className:String(node.className||'').slice(0,120),left:Math.round(rect.left),right:Math.round(rect.right),top:Math.round(rect.top),
      }));
      const data={kind,overflow,duplicateIds,unmanagedOffscreenTargets,releaseMarker:doc.dataset.clientVisualCoherenceV1182||'',pageHeight:Math.round(Math.max(doc.scrollHeight,body.scrollHeight))};
      if(kind==='dashboard'){
        const selected=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-copy strong');
        const selectedColor=selected?getComputedStyle(selected).color:'';
        const snapshot=document.querySelector('#clientContentSnapshot');
        const support=document.querySelector('.support-card');
        const utility=document.querySelector('.cc-utility-grid>.utility-column');
        const formats=document.querySelector('.formats-panel');
        const cityButtons=[...document.querySelectorAll('[data-v1182-city]')];
        const header=document.querySelector('.media-header');
        const nav=document.querySelector('.media-header .client-primary-nav-v117');
        const firstContent=document.querySelector('.dashboard-heading');
        const headerRect=header?.getBoundingClientRect(),navRect=nav?.getBoundingClientRect(),contentRect=firstContent?.getBoundingClientRect();
        data.dashboard={
          selectedLabel:selected?.textContent?.trim()||'',selectedColor,
          selectedWhite:/rgb\(255,\s*255,\s*255\)|rgba\(255,\s*255,\s*255/iu.test(selectedColor),
          snapshotVisible:Boolean(snapshot&&!snapshot.hidden&&getComputedStyle(snapshot).display!=='none'),
          supportHeight:Math.round(support?.getBoundingClientRect().height||0),utilityAlign:utility?getComputedStyle(utility).alignItems:'',
          catalogUtilityGap:formats&&utility?Math.round(utility.getBoundingClientRect().top-formats.getBoundingClientRect().bottom):null,
          cityButtons:cityButtons.length,folders:document.querySelectorAll('.cc-v118-folder').length,
          videoBadge:document.querySelector('#videoBadge')?.textContent?.trim()||'',stageCount:document.querySelectorAll('.cc-stage[data-stage-index]').length,
          commandMode:document.querySelector('.client-command-center')?.dataset.mode||'',
          headerContainsNav:Boolean(!headerRect||!navRect||(navRect.top>=headerRect.top-1&&navRect.bottom<=headerRect.bottom+1)),
          headerContentGap:headerRect&&contentRect?Math.round(contentRect.top-headerRect.bottom):null,
          headerContentOverlap:Boolean(headerRect&&contentRect&&contentRect.top<headerRect.bottom-1),
          expectedFolders,expectedCities,hasActive,
          catalogImages:document.querySelectorAll('.cc-v118-catalog-card img').length,
          catalogCards:document.querySelectorAll('.cc-v118-catalog-card').length,
        };
      }
      if(kind==='library')data.library={cards:document.querySelectorAll('.compact-media-card').length,longCards:document.querySelectorAll('.compact-media-card--final').length,shortCards:document.querySelectorAll('.compact-media-card--short').length};
      if(kind==='calendar')data.calendar={cells:document.querySelectorAll('#calendarGrid>*').length,scheduledCards:document.querySelectorAll('#calendarGrid [data-schedule-id],#calendarGrid .schedule-card,#calendarGrid .calendar-event').length};
      return data;
    },{kind:scenario.kind,expectedFolders:ordersWithFiles.length,expectedCities:catalogCities.length,hasActive:Boolean(activeOrder)});

    await page.screenshot({path:path.join(outputDir,`${scenario.name}.png`),fullPage:true});
    const scenarioErrors=[];
    const check=(condition,message)=>{if(!condition)scenarioErrors.push(message);};
    check(diagnostics.overflow<=3,`${scenario.name}: débordement horizontal global de ${diagnostics.overflow}px`);
    check(diagnostics.unmanagedOffscreenTargets.length===0,`${scenario.name}: cibles hors viewport hors carrousel: ${diagnostics.unmanagedOffscreenTargets.map(item=>`${item.text||item.className} [${item.left},${item.right}]`).join(' | ')}`);
    check(diagnostics.duplicateIds.length===0,`${scenario.name}: IDs dupliqués ${diagnostics.duplicateIds.join(', ')}`);
    check(pageErrors.length===0,`${scenario.name}: erreurs JavaScript: ${pageErrors.join(' | ')}`);
    check(networkFailures.length===0,`${scenario.name}: erreurs réseau: ${networkFailures.join(' | ')}`);
    if(scenario.kind==='dashboard'){
      const d=diagnostics.dashboard;
      check(d.selectedLabel.length>0||!activeOrder,`${scenario.name}: étape active sans libellé`);
      check(!d.selectedWhite,`${scenario.name}: libellé actif blanc sur surface claire`);
      check(!d.snapshotVisible,`${scenario.name}: ancien résumé contenus visible`);
      check(d.supportHeight<260,`${scenario.name}: bloc support anormalement haut (${d.supportHeight}px)`);
      check(d.folders===ordersWithFiles.length,`${scenario.name}: ${d.folders} dossiers pour ${ordersWithFiles.length} passages avec fichiers`);
      if(catalogCities.length>1)check(d.cityButtons===catalogCities.length,`${scenario.name}: ${d.cityButtons} villes visibles pour ${catalogCities.length} villes catalogue`);
      check(d.stageCount===8||!activeOrder,`${scenario.name}: parcours attendu de 8 étapes, reçu ${d.stageCount}`);
      check(d.headerContainsNav,`${scenario.name}: navigation hors du header`);
      check(!d.headerContentOverlap,`${scenario.name}: header/navigation chevauche le contenu (${d.headerContentGap}px)`);
    }
    if(scenario.kind==='library'&&files.length)check(diagnostics.library.cards>0,`${scenario.name}: aucune carte média malgré ${files.length} fichiers`);

    report.scenarios.push({...scenario,diagnostics,pageErrors,networkFailures,abortedRequests,errors:scenarioErrors});
    report.errors.push(...scenarioErrors);
  }catch(error){
    report.errors.push(`${scenario.name}: ${error.message}`);
    report.scenarios.push({...scenario,diagnostics:null,pageErrors,networkFailures,abortedRequests,errors:[error.message]});
    try{await page.screenshot({path:path.join(outputDir,`${scenario.name}-failure.png`),fullPage:true});}catch{}
  }
  await context.close();
}
await browser.close();

for(const scenario of report.scenarios){
  if(scenario.abortedRequests)report.findings.push({severity:'info',scenario:scenario.name,message:`${scenario.abortedRequests} chargement(s) média annulé(s) par le navigateur pendant la capture (ERR_ABORTED), non classés comme erreur HTTP.`});
}
await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({ok:report.errors.length===0,realData:report.realData,scenarios:report.scenarios.map(item=>({name:item.name,diagnostics:item.diagnostics,errors:item.errors})),findings:report.findings,errors:report.errors},null,2));
if(report.errors.length)process.exit(1);

function countBy(values){return values.reduce((acc,value)=>{acc[value]=(acc[value]||0)+1;return acc;},{});}
function expect(value,message){if(!value)throw new Error(message);}
