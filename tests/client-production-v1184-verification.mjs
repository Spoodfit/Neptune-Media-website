import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=(process.env.CLIENT_PRODUCTION_URL||'https://tv.neptunebusiness.com').replace(/\/$/u,'');
const auditEmail=process.env.CLIENT_AUDIT_EMAIL||'contact@neptunebusiness.com';
const outputDir=path.resolve('test-results/client-production-v1184-verification');
const errors=[];

await fs.rm(outputDir,{recursive:true,force:true});
await fs.mkdir(outputDir,{recursive:true});

const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
const bootstrap=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});

const loginResponse=await bootstrap.request.post(`${baseUrl}/api/client/request-code`,{
  headers:{Origin:baseUrl,'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},
  data:{email:auditEmail},timeout:30000,
});
const login=await loginResponse.json().catch(()=>({}));
expect(loginResponse.ok(),`auth HTTP ${loginResponse.status()}`);
expect(login?.ok===true&&login?.authenticated===true&&login?.trustedAccess===true,'trusted test access unavailable');

const releaseResponse=await bootstrap.request.get(`${baseUrl}/api/public/release`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
expect(releaseResponse.ok(),`release HTTP ${releaseResponse.status()}`);
const release=await releaseResponse.json().catch(()=>({}));
expect(release.clientExperience==='neptune-client-experience-20260814-v118.4',`unexpected clientExperience: ${release.clientExperience||'missing'}`);
expect(release.clientLibraryLayout==='full-width-responsive-long-short-workspaces-v118.4',`unexpected clientLibraryLayout: ${release.clientLibraryLayout||'missing'}`);
expect(release.clientContentPlanning==='week-month-grounded-video-identity-no-blocking-ai-v118.4',`unexpected clientContentPlanning: ${release.clientContentPlanning||'missing'}`);
expect(release.clientContentReuse==='instant-grounded-file-identity-no-ai-wait-v118.4',`unexpected clientContentReuse: ${release.clientContentReuse||'missing'}`);

const sessionResponse=await bootstrap.request.get(`${baseUrl}/api/client/session`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
expect(sessionResponse.ok(),`session HTTP ${sessionResponse.status()}`);
const session=await sessionResponse.json().catch(()=>({}));
expect(session?.authenticated===true&&Array.isArray(session?.orders),'authenticated session missing orders');

const calendarResponse=await bootstrap.request.get(`${baseUrl}/api/client/content-calendar`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
expect(calendarResponse.ok(),`calendar API HTTP ${calendarResponse.status()}`);
const calendarData=await calendarResponse.json().catch(()=>({}));
const assets=Array.isArray(calendarData.assets)?calendarData.assets:[];
const occurrences=Array.isArray(calendarData.occurrences)?calendarData.occurrences:[];
const scheduledAssets=occurrences.map(item=>assets.find(asset=>String(asset.fileId)===String(item.fileId))).filter(Boolean);
const expectedFileLabels=[...new Set(scheduledAssets.map(asset=>cleanName(asset.name)).filter(Boolean))];
const storageState=await bootstrap.storageState();
await bootstrap.close();

const report={baseUrl,auditedAt:new Date().toISOString(),release,realData:{orders:session.orders.length,assets:assets.length,occurrences:occurrences.length},scenarios:[],errors};

await verifyHome({width:1440,height:1000},'home-desktop');
await verifyHome({width:390,height:844},'home-mobile');
await verifyLibrary({width:1440,height:1000},'library-desktop');
await verifyLibrary({width:390,height:844},'library-mobile');
await verifyCalendar({width:1440,height:1000},'calendar-desktop');
await verifyCalendar({width:390,height:844},'calendar-mobile');

await browser.close();
await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({ok:errors.length===0,release:{clientExperience:release.clientExperience,clientLibraryLayout:release.clientLibraryLayout,clientContentPlanning:release.clientContentPlanning,clientContentReuse:release.clientContentReuse},realData:report.realData,scenarios:report.scenarios,errors},null,2));
if(errors.length)process.exit(1);

async function verifyHome(viewport,name){
  const context=await browser.newContext({viewport,reducedMotion:'reduce',storageState});
  const page=await context.newPage();const pageErrors=[];watch(page,pageErrors);
  try{
    const response=await page.goto(`${baseUrl}/espace-client/?v1184_prod=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
    expect(response&&response.status()<400,`${name}: HTTP ${response?.status()||0}`);
    await page.waitForSelector('#dashboard:not([hidden])',{timeout:25000});
    await page.waitForFunction(()=>document.documentElement.dataset.clientUxV1184==='1',{timeout:15000});
    await page.waitForSelector('.cc-stage.is-selected-v118',{timeout:15000});
    await page.waitForTimeout(500);
    const diagnostics=await page.evaluate(()=>{
      const button=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-button');
      const icon=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-icon');
      return {
        uxMarker:document.documentElement.dataset.clientUxV1184||'',
        selectedAfter:button?getComputedStyle(button,'::after').content:'',
        selectedMarkerHeight:button?getComputedStyle(button,'::before').height:'',
        selectedButtonShadow:button?getComputedStyle(button).boxShadow:'',
        selectedIconShadow:icon?getComputedStyle(icon).boxShadow:'',
        overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
      };
    });
    expect(diagnostics.uxMarker==='1',`${name}: v118.4 marker absent`);
    expect(['none','normal','""'].includes(diagnostics.selectedAfter),`${name}: giant selected card still active (${diagnostics.selectedAfter})`);
    expect(diagnostics.selectedMarkerHeight==='3px',`${name}: compact selected marker missing (${diagnostics.selectedMarkerHeight})`);
    expect(diagnostics.selectedButtonShadow==='none',`${name}: selected stage button still card-like (${diagnostics.selectedButtonShadow})`);
    expect(diagnostics.selectedIconShadow&&diagnostics.selectedIconShadow!=='none',`${name}: selected icon halo missing`);
    expect(diagnostics.overflow<=3,`${name}: horizontal overflow ${diagnostics.overflow}px`);

    const clickableStage=page.locator('.cc-stage [data-cc-stage], .cc-stage [data-cc-track]').first();
    if(await clickableStage.count()){
      await clickableStage.click();
      const region=page.locator('#ccDetailRegion');
      await region.waitFor({state:'visible',timeout:5000});
      const close=region.locator('[data-v118-close]');
      if(await close.count()){
        await close.click();
        await page.evaluate(()=>document.querySelector('.client-command-center')?.append(document.createComment('v1184-production-collapse-check')));
        await page.waitForTimeout(150);
        const collapsed=await page.evaluate(()=>({flag:document.querySelector('#ccDetailRegion')?.dataset.v1184Collapsed||'',display:getComputedStyle(document.querySelector('#ccDetailRegion')).display,toggleVisible:Boolean(document.querySelector('[data-v1184-detail-toggle]')&&!document.querySelector('[data-v1184-detail-toggle]').hidden)}));
        expect(collapsed.flag==='1'&&collapsed.display==='none',`${name}: stage detail does not stay closed`);
        expect(collapsed.toggleVisible,`${name}: reopen detail control missing`);
      }
    }
    expect(pageErrors.length===0,`${name}: JS errors ${pageErrors.join(' | ')}`);
    await page.screenshot({path:path.join(outputDir,`${name}.png`),fullPage:true});
    report.scenarios.push({name,diagnostics,ok:true});
  }catch(error){errors.push(`${name}: ${error.message}`);report.scenarios.push({name,ok:false,error:error.message});}
  await context.close();
}

async function verifyLibrary(viewport,name){
  const context=await browser.newContext({viewport,reducedMotion:'reduce',storageState});
  const page=await context.newPage();const pageErrors=[];watch(page,pageErrors);
  try{
    const response=await page.goto(`${baseUrl}/espace-client/videos/?v1184_prod=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
    expect(response&&response.status()<400,`${name}: HTTP ${response?.status()||0}`);
    await page.waitForSelector('.media-folder-selector',{timeout:25000});
    const folderLabels=await page.locator('[data-media-folder]').allTextContents();
    expect(folderLabels.some(text=>/Format long/iu.test(text)),`${name}: Format long folder missing`);
    expect(folderLabels.some(text=>/Format court/iu.test(text)),`${name}: Format court folder missing`);
    const shortFolder=page.locator('[data-media-folder="short"]');
    if(await shortFolder.count())await shortFolder.click();
    await page.waitForTimeout(500);
    const diagnostics=await page.evaluate(()=>{
      const shell=document.querySelector('.library-shell')?.getBoundingClientRect();
      const section=document.querySelector('.content-section')?.getBoundingClientRect();
      const grid=document.querySelector('.media-strip:not([hidden])')||document.querySelector('.media-strip--short')||document.querySelector('.media-strip--final');
      const cards=[...document.querySelectorAll('.compact-media-card')].filter(node=>getComputedStyle(node).display!=='none');
      const first=cards[0]?.getBoundingClientRect(),second=cards[1]?.getBoundingClientRect();
      return {
        shellWidth:Math.round(shell?.width||0),sectionWidth:Math.round(section?.width||0),viewport:innerWidth,
        gridDisplay:grid?getComputedStyle(grid).display:'',cards:cards.length,
        sameRow:Boolean(first&&second&&Math.abs(first.top-second.top)<4),overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
      };
    });
    if(viewport.width>=1000){
      expect(diagnostics.shellWidth>=viewport.width*.88,`${name}: shell still narrow (${diagnostics.shellWidth}/${viewport.width})`);
      expect(diagnostics.sectionWidth>=viewport.width*.84,`${name}: folder content still narrow (${diagnostics.sectionWidth}/${viewport.width})`);
      expect(diagnostics.gridDisplay==='grid',`${name}: media folder is not a grid (${diagnostics.gridDisplay})`);
      if(diagnostics.cards>1)expect(diagnostics.sameRow,`${name}: cards remain stacked in a narrow column`);
    }
    expect(diagnostics.overflow<=3,`${name}: horizontal overflow ${diagnostics.overflow}px`);
    expect(pageErrors.length===0,`${name}: JS errors ${pageErrors.join(' | ')}`);
    await page.screenshot({path:path.join(outputDir,`${name}.png`),fullPage:true});
    report.scenarios.push({name,diagnostics,folderLabels:folderLabels.map(text=>text.replace(/\s+/gu,' ').trim()),ok:true});
  }catch(error){errors.push(`${name}: ${error.message}`);report.scenarios.push({name,ok:false,error:error.message});}
  await context.close();
}

async function verifyCalendar(viewport,name){
  const context=await browser.newContext({viewport,reducedMotion:'reduce',storageState});
  const page=await context.newPage();const pageErrors=[];watch(page,pageErrors);
  try{
    const response=await page.goto(`${baseUrl}/espace-client/calendrier/?v1184_prod=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
    expect(response&&response.status()<400,`${name}: HTTP ${response?.status()||0}`);
    await page.waitForFunction(()=>document.documentElement.dataset.clientPlanningV1184==='1',{timeout:15000});
    await page.waitForSelector('.planning-v1184-week',{timeout:25000});
    await page.waitForTimeout(300);
    const diagnostics=await page.evaluate(()=>({
      title:document.querySelector('.calendar-intro h1')?.textContent?.trim()||'',
      weekActive:Boolean(document.querySelector('[data-v1184-mode="week"].is-active')),
      monthControl:Boolean(document.querySelector('[data-v1184-mode="month"]')),
      oldReuseVisible:Boolean(document.querySelector('.reuse-guide')&&getComputedStyle(document.querySelector('.reuse-guide')).display!=='none'),
      oldLibraryVisible:Boolean(document.querySelector('#libraryView')&&getComputedStyle(document.querySelector('#libraryView')).display!=='none'),
      oldCalendarScripts:[...document.scripts].map(script=>script.src).filter(src=>/\/calendrier\/(calendar|calendar-compact-v5)\.js/iu.test(src)),
      itemTexts:[...document.querySelectorAll('.planning-v1184-item strong')].map(node=>node.textContent?.trim()||''),
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    }));
    expect(diagnostics.title==='Que dois-je publier ?',`${name}: wrong planner title (${diagnostics.title})`);
    expect(diagnostics.weekActive,`${name}: week is not default view`);
    expect(diagnostics.monthControl,`${name}: month switch missing`);
    expect(!diagnostics.oldReuseVisible&&!diagnostics.oldLibraryVisible,`${name}: legacy calendar blocks still visible`);
    expect(diagnostics.oldCalendarScripts.length===0,`${name}: legacy calendar runtime still loaded`);
    if(expectedFileLabels.length&&diagnostics.itemTexts.length){
      expect(diagnostics.itemTexts.some(text=>expectedFileLabels.includes(text)),`${name}: visible schedule does not use actual video identity`);
    }
    expect(diagnostics.overflow<=3,`${name}: horizontal overflow ${diagnostics.overflow}px`);

    await page.locator('[data-v1184-mode="month"]').click();
    await page.waitForSelector('.planning-v1184-month',{timeout:5000});
    const monthOverflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
    expect(monthOverflow<=3,`${name}: month view page overflow ${monthOverflow}px`);
    expect(pageErrors.length===0,`${name}: JS errors ${pageErrors.join(' | ')}`);
    await page.screenshot({path:path.join(outputDir,`${name}.png`),fullPage:true});
    report.scenarios.push({name,diagnostics:{...diagnostics,monthOverflow},ok:true});
  }catch(error){errors.push(`${name}: ${error.message}`);report.scenarios.push({name,ok:false,error:error.message});}
  await context.close();
}

function cleanName(value){return String(value||'').replace(/\.[a-z0-9]{2,5}$/iu,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim();}
function watch(page,out){page.on('pageerror',error=>out.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!/compute-pressure|Failed to load resource/iu.test(message.text()))out.push(message.text());});}
function expect(value,message){if(!value)throw new Error(message);}
