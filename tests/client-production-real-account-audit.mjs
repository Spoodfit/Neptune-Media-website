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
  data:{email:auditEmail},
  timeout:30000,
});
const login=await loginResponse.json().catch(()=>({}));
expect(loginResponse.ok(),`authentification production HTTP ${loginResponse.status()}`);
expect(login?.ok===true,'l’accès test Neptune doit répondre ok:true');
expect(login?.authenticated===true,'le compte test doit être authentifié sans code');
expect(login?.trustedAccess===true,'le compte test doit utiliser trustedAccess');

const sessionResponse=await bootstrap.request.get(`${baseUrl}/api/client/session`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
expect(sessionResponse.ok(),`session production HTTP ${sessionResponse.status()}`);
const session=await sessionResponse.json();
expect(session?.authenticated===true,'la session client production doit être authentifiée');
expect(Array.isArray(session?.orders),'la session doit exposer orders[]');

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

const report={
  baseUrl,
  auditedAt:new Date().toISOString(),
  authentication:{ok:true,trustedAccess:true},
  realData:{
    orders:orders.length,
    activeOrders:orders.filter(order=>order?.id&&!FINAL.has(String(order.status||'').toLowerCase())).length,
    ordersWithFiles:ordersWithFiles.length,
    files:files.length,
    schedules:schedules.length,
    statuses:countBy(orders.map(order=>String(order?.status||'unknown').toLowerCase())),
    formats:countBy(orders.map(order=>String(order?.format||order?.title||'unknown').trim()||'unknown')),
    catalogCities:catalogCities.map(city=>({slug:String(city?.slug||city?.id||''),name:String(city?.name||''),formats:Array.isArray(city?.formats)?city.formats.length:0})),
  },
  scenarios:[],
  findings:[],
  errors:[],
};

const scenarios=[
  {name:'dashboard-desktop',path:'/espace-client/',viewport:{width:1440,height:1000},kind:'dashboard'},
  {name:'dashboard-mobile-390',path:'/espace-client/',viewport:{width:390,height:844},kind:'dashboard'},
  {name:'dashboard-mobile-320',path:'/espace-client/',viewport:{width:320,height:700},kind:'dashboard'},
  {name:'library-desktop',path:'/espace-client/videos/',viewport:{width:1440,height:1000},kind:'library'},
  {name:'library-mobile',path:'/espace-client/videos/',viewport:{width:390,height:844},kind:'library'},
  {name:'calendar-desktop',path:'/espace-client/calendrier/',viewport:{width:1440,height:1000},kind:'calendar'},
  {name:'calendar-mobile',path:'/espace-client/calendrier/',viewport:{width:390,height:844},kind:'calendar'},
];

for(const scenario of scenarios){
  const context=await browser.newContext({viewport:scenario.viewport,reducedMotion:'reduce',storageState});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  const failedRequests=[];
  page.on('requestfailed',request=>{
    const url=request.url();
    if(!/youtube|googlevideo|doubleclick|googlesyndication|ytimg|instagram|tiktok|linkedin/iu.test(url)){
      failedRequests.push(`${request.method()} ${url} :: ${request.failure()?.errorText||'failed'}`);
    }
  });

  try{
    const response=await page.goto(`${baseUrl}${scenario.path}?production_audit=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
    expect(response&&response.status()<400,`${scenario.name}: navigation HTTP ${response?.status()||0}`);

    if(scenario.kind==='dashboard'){
      await page.waitForSelector('#dashboard:not([hidden])',{timeout:25000});
      await page.waitForSelector('.client-command-center #ccContent:not([hidden])',{timeout:25000});
      await page.waitForTimeout(1200);
    }else{
      await page.waitForTimeout(1500);
    }

    const diagnostics=await page.evaluate(({kind,expectedFolders,expectedFiles,expectedCities,hasActive})=>{
      const doc=document.documentElement;
      const body=document.body;
      const overflow=Math.max(doc.scrollWidth,body.scrollWidth)-innerWidth;
      const duplicateIds=[...document.querySelectorAll('[id]')]
        .map(node=>node.id)
        .filter((id,index,all)=>id&&all.indexOf(id)!==index)
        .filter((id,index,all)=>all.indexOf(id)===index);
      const allTargets=[...document.querySelectorAll('button,a[href]')];
      const clippedTargetDetails=allTargets.map(node=>{
        const rect=node.getBoundingClientRect();
        return {
          tag:node.tagName.toLowerCase(),
          text:(node.textContent||node.getAttribute('aria-label')||'').replace(/\s+/gu,' ').trim().slice(0,90),
          className:String(node.className||'').slice(0,140),
          href:node.getAttribute('href')||'',
          left:Math.round(rect.left),right:Math.round(rect.right),top:Math.round(rect.top),width:Math.round(rect.width),height:Math.round(rect.height),
          visible:rect.width>0&&rect.height>0,
        };
      }).filter(item=>item.visible&&(item.right>innerWidth+3||item.left<-3));
      const data={
        kind,
        title:document.title,
        overflow,
        duplicateIds,
        clippedTargets:clippedTargetDetails.length,
        clippedTargetDetails,
        releaseMarker:doc.dataset.clientVisualCoherenceV1182||'',
        pageHeight:Math.round(Math.max(doc.scrollHeight,body.scrollHeight)),
        expectedFolders,
        expectedFiles,
        expectedCities,
        hasActive,
      };
      if(kind==='dashboard'){
        const selected=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-copy strong');
        const selectedColor=selected?getComputedStyle(selected).color:'';
        const snapshot=document.querySelector('#clientContentSnapshot');
        const support=document.querySelector('.support-card');
        const utility=document.querySelector('.cc-utility-grid>.utility-column');
        const formats=document.querySelector('.formats-panel');
        const formatRect=formats?.getBoundingClientRect();
        const utilityRect=utility?.getBoundingClientRect();
        const cityButtons=[...document.querySelectorAll('[data-v1182-city]')];
        const folders=document.querySelectorAll('.cc-v118-folder').length;
        const videoBadge=document.querySelector('#videoBadge')?.textContent?.trim()||'';
        data.dashboard={
          selectedLabel:selected?.textContent?.trim()||'',
          selectedColor,
          selectedWhite:/rgb\(255,\s*255,\s*255\)|rgba\(255,\s*255,\s*255/iu.test(selectedColor),
          snapshotVisible:Boolean(snapshot&&!snapshot.hidden&&getComputedStyle(snapshot).display!=='none'),
          supportHeight:Math.round(support?.getBoundingClientRect().height||0),
          utilityAlign:utility?getComputedStyle(utility).alignItems:'',
          catalogUtilityGap:formatRect&&utilityRect?Math.round(utilityRect.top-formatRect.bottom):null,
          cityButtons:cityButtons.length,
          activeCity:cityButtons.find(button=>button.getAttribute('aria-pressed')==='true')?.dataset.v1182City||'',
          folders,
          videoBadge,
          stageCount:document.querySelectorAll('.cc-stage[data-stage-index]').length,
          commandMode:document.querySelector('.client-command-center')?.dataset.mode||'',
        };
      }
      return data;
    },{kind:scenario.kind,expectedFolders:ordersWithFiles.length,expectedFiles:files.length,expectedCities:catalogCities.length,hasActive:Boolean(activeOrder)});

    const screenshot=path.join(outputDir,`${scenario.name}.png`);
    await page.screenshot({path:screenshot,fullPage:true});

    const scenarioErrors=[];
    const check=(condition,message)=>{if(!condition)scenarioErrors.push(message);};
    if(scenario.kind==='dashboard'){
      const d=diagnostics.dashboard;
      check(d.selectedLabel.length>0||!activeOrder,`${scenario.name}: étape active sans libellé`);
      check(!d.selectedWhite,`${scenario.name}: libellé actif blanc sur surface claire`);
      check(!d.snapshotVisible,`${scenario.name}: ancien résumé contenus visible`);
      check(d.supportHeight<260,`${scenario.name}: bloc support anormalement haut (${d.supportHeight}px)`);
      check(d.folders===ordersWithFiles.length,`${scenario.name}: ${d.folders} dossiers affichés pour ${ordersWithFiles.length} passages avec fichiers`);
      if(catalogCities.length>1)check(d.cityButtons===catalogCities.length,`${scenario.name}: ${d.cityButtons} villes visibles pour ${catalogCities.length} villes catalogue`);
      check(d.stageCount===8||!activeOrder,`${scenario.name}: parcours attendu de 8 étapes, reçu ${d.stageCount}`);
    }
    check(diagnostics.overflow<=3,`${scenario.name}: débordement horizontal de ${diagnostics.overflow}px`);
    check(diagnostics.clippedTargets===0,`${scenario.name}: ${diagnostics.clippedTargets} cible(s) interactive(s) débordent (${diagnostics.clippedTargetDetails.map(item=>`${item.text||item.className} [${item.left},${item.right}]`).join(' | ')})`);
    check(diagnostics.duplicateIds.length===0,`${scenario.name}: IDs dupliqués ${diagnostics.duplicateIds.join(', ')}`);
    check(pageErrors.length===0,`${scenario.name}: erreurs JavaScript: ${pageErrors.join(' | ')}`);

    report.scenarios.push({...scenario,diagnostics,pageErrors,failedRequests:failedRequests.slice(0,20),errors:scenarioErrors});
    report.errors.push(...scenarioErrors);
  }catch(error){
    report.errors.push(`${scenario.name}: ${error.message}`);
    report.scenarios.push({...scenario,diagnostics:null,pageErrors,failedRequests:failedRequests.slice(0,20),errors:[error.message]});
    try{await page.screenshot({path:path.join(outputDir,`${scenario.name}-failure.png`),fullPage:true});}catch{}
  }
  await context.close();
}

await browser.close();

for(const scenario of report.scenarios){
  if(scenario.failedRequests.length)report.findings.push({severity:'info',scenario:scenario.name,message:`${scenario.failedRequests.length} requête(s) réseau non critique(s) ont échoué`,details:scenario.failedRequests});
}

await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({
  ok:report.errors.length===0,
  realData:report.realData,
  scenarios:report.scenarios.map(item=>({name:item.name,overflow:item.diagnostics?.overflow??null,pageHeight:item.diagnostics?.pageHeight??null,clippedTargetDetails:item.diagnostics?.clippedTargetDetails||[],dashboard:item.diagnostics?.dashboard||null,errors:item.errors})),
  findings:report.findings,
  errors:report.errors,
},null,2));
if(report.errors.length)process.exit(1);

function countBy(values){
  return values.reduce((acc,value)=>{acc[value]=(acc[value]||0)+1;return acc;},{});
}

function expect(value,message){
  if(!value)throw new Error(message);
}
