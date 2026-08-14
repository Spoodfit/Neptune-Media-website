import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=(process.env.CLIENT_PRODUCTION_URL||'https://tv.neptunebusiness.com').replace(/\/$/u,'');
const email=process.env.CLIENT_AUDIT_EMAIL||'contact@neptunebusiness.com';
const out=path.resolve('test-results/client-production-v11841-verification');
const errors=[];
const scenarios=[];
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
const bootstrap=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const login=await bootstrap.request.post(`${baseUrl}/api/client/request-code`,{headers:{Origin:baseUrl,'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},data:{email},timeout:30000});
const loginBody=await login.json().catch(()=>({}));
assert(login.ok()&&loginBody?.authenticated===true&&loginBody?.trustedAccess===true,`trusted auth failed (${login.status()})`);

const releaseResponse=await bootstrap.request.get(`${baseUrl}/api/public/release`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
const release=await releaseResponse.json().catch(()=>({}));
assert(releaseResponse.ok(),'release endpoint unavailable');
assert(release.clientExperience==='neptune-client-experience-20260814-v118.4',`clientExperience=${release.clientExperience||'missing'}`);
assert(release.clientLibraryLayout==='full-width-responsive-long-short-workspaces-v118.4',`clientLibraryLayout=${release.clientLibraryLayout||'missing'}`);
assert(release.clientContentPlanning==='week-month-grounded-video-identity-no-blocking-ai-v118.4',`clientContentPlanning=${release.clientContentPlanning||'missing'}`);
assert(release.clientContentReuse==='instant-grounded-file-identity-no-ai-wait-v118.4',`clientContentReuse=${release.clientContentReuse||'missing'}`);
assert(release.clientCalendarChrome==='persistent-publication-planner-copy-v118.4.1',`clientCalendarChrome=${release.clientCalendarChrome||'missing'}`);

const calendarResponse=await bootstrap.request.get(`${baseUrl}/api/client/content-calendar`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
const calendar=await calendarResponse.json().catch(()=>({}));
assert(calendarResponse.ok(),'calendar API unavailable');
const assets=Array.isArray(calendar.assets)?calendar.assets:[];
const occurrences=Array.isArray(calendar.occurrences)?calendar.occurrences:[];
const expectedLabels=[...new Set(occurrences.map(item=>assets.find(asset=>String(asset.fileId)===String(item.fileId))).filter(Boolean).map(asset=>clean(asset.name)).filter(Boolean))];
const storageState=await bootstrap.storageState();await bootstrap.close();

await checkHome({width:1440,height:1000},'home-desktop');
await checkHome({width:390,height:844},'home-mobile');
await checkLibrary({width:1440,height:1000},'library-desktop');
await checkLibrary({width:390,height:844},'library-mobile');
await checkCalendar({width:1440,height:1000},'calendar-desktop');
await checkCalendar({width:390,height:844},'calendar-mobile');
await browser.close();

const report={ok:errors.length===0,auditedAt:new Date().toISOString(),release:{clientExperience:release.clientExperience,clientLibraryLayout:release.clientLibraryLayout,clientContentPlanning:release.clientContentPlanning,clientContentReuse:release.clientContentReuse,clientCalendarChrome:release.clientCalendarChrome},realData:{assets:assets.length,occurrences:occurrences.length},scenarios,errors};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exit(1);

async function checkHome(viewport,name){
  const ctx=await browser.newContext({viewport,reducedMotion:'reduce',storageState});const page=await ctx.newPage();const js=[];watch(page,js);
  try{
    const response=await page.goto(`${baseUrl}/espace-client/?verify=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});assert(response&&response.status()<400,`${name}: HTTP ${response?.status()||0}`);
    await page.waitForSelector('#dashboard:not([hidden])',{timeout:25000});await page.waitForSelector('.cc-stage.is-selected-v118',{timeout:15000});await page.waitForTimeout(600);
    const d=await page.evaluate(()=>{const b=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-button');const i=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-icon');return {marker:document.documentElement.dataset.clientUxV1184||'',after:b?getComputedStyle(b,'::after').content:'',under:b?getComputedStyle(b,'::before').height:'',buttonShadow:b?getComputedStyle(b).boxShadow:'',iconShadow:i?getComputedStyle(i).boxShadow:'',overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};});
    assert(d.marker==='1',`${name}: v118.4 marker missing`);assert(['none','normal','""'].includes(d.after),`${name}: giant selected card remains`);assert(d.under==='3px',`${name}: compact marker missing`);assert(d.buttonShadow==='none',`${name}: selected card shadow remains`);assert(d.iconShadow&&d.iconShadow!=='none',`${name}: selected icon halo missing`);assert(d.overflow<=3,`${name}: overflow ${d.overflow}px`);
    const stage=page.locator('.cc-stage [data-cc-stage],.cc-stage [data-cc-track]').first();if(await stage.count()){await stage.click();const region=page.locator('#ccDetailRegion');await region.waitFor({state:'visible',timeout:5000});const close=region.locator('[data-v118-close]');if(await close.count()){await close.click();await page.evaluate(()=>document.querySelector('.client-command-center')?.append(document.createComment('collapse-verification')));await page.waitForTimeout(180);const c=await page.evaluate(()=>({flag:document.querySelector('#ccDetailRegion')?.dataset.v1184Collapsed||'',display:getComputedStyle(document.querySelector('#ccDetailRegion')).display,reopen:Boolean(document.querySelector('[data-v1184-detail-toggle]')&&!document.querySelector('[data-v1184-detail-toggle]').hidden)}));assert(c.flag==='1'&&c.display==='none'&&c.reopen,`${name}: detail does not stay collapsed`);}}
    assert(!js.length,`${name}: ${js.join(' | ')}`);await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});scenarios.push({name,ok:true,diagnostics:d});
  }catch(error){errors.push(error.message);scenarios.push({name,ok:false,error:error.message});}await ctx.close();
}

async function checkLibrary(viewport,name){
  const ctx=await browser.newContext({viewport,reducedMotion:'reduce',storageState});const page=await ctx.newPage();const js=[];watch(page,js);
  try{
    const response=await page.goto(`${baseUrl}/espace-client/videos/?verify=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});assert(response&&response.status()<400,`${name}: HTTP ${response?.status()||0}`);await page.waitForSelector('.media-folder-selector',{timeout:25000});
    const labels=(await page.locator('[data-media-folder]').allTextContents()).map(text=>text.replace(/\s+/gu,' ').trim());assert(labels.some(text=>/Format long/iu.test(text)),`${name}: Format long missing`);assert(labels.some(text=>/Format court/iu.test(text)),`${name}: Format court missing`);const short=page.locator('[data-media-folder="short"]');if(await short.count())await short.click();await page.waitForTimeout(500);
    const d=await page.evaluate(()=>{const shell=document.querySelector('.library-shell')?.getBoundingClientRect();const section=document.querySelector('.content-section')?.getBoundingClientRect();const grid=document.querySelector('.media-strip:not([hidden])')||document.querySelector('.media-strip--short')||document.querySelector('.media-strip--final');const cards=[...document.querySelectorAll('.compact-media-card')].filter(node=>getComputedStyle(node).display!=='none');const a=cards[0]?.getBoundingClientRect(),b=cards[1]?.getBoundingClientRect();return {shell:Math.round(shell?.width||0),section:Math.round(section?.width||0),viewport:innerWidth,display:grid?getComputedStyle(grid).display:'',cards:cards.length,sameRow:Boolean(a&&b&&Math.abs(a.top-b.top)<4),overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};});
    if(viewport.width>=1000){assert(d.shell>=viewport.width*.88,`${name}: shell narrow ${d.shell}px`);assert(d.section>=viewport.width*.84,`${name}: content narrow ${d.section}px`);assert(d.display==='grid',`${name}: folder not grid`);if(d.cards>1)assert(d.sameRow,`${name}: cards still stacked`);}assert(d.overflow<=3,`${name}: overflow ${d.overflow}px`);assert(!js.length,`${name}: ${js.join(' | ')}`);await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});scenarios.push({name,ok:true,diagnostics:d,labels});
  }catch(error){errors.push(error.message);scenarios.push({name,ok:false,error:error.message});}await ctx.close();
}

async function checkCalendar(viewport,name){
  const ctx=await browser.newContext({viewport,reducedMotion:'reduce',storageState});const page=await ctx.newPage();const js=[];watch(page,js);
  try{
    const response=await page.goto(`${baseUrl}/espace-client/calendrier/?verify=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});assert(response&&response.status()<400,`${name}: HTTP ${response?.status()||0}`);await page.waitForSelector('.planning-v1184-week',{timeout:25000});await page.waitForFunction(()=>document.documentElement.dataset.clientCalendarChromeV11841==='1',{timeout:10000});await page.waitForTimeout(1200);
    const d=await page.evaluate(()=>({title:document.querySelector('.calendar-intro h1')?.textContent?.trim()||'',sectionTitle:document.querySelector('.calendar-toolbar h2')?.textContent?.trim()||'',week:Boolean(document.querySelector('[data-v1184-mode="week"].is-active')),month:Boolean(document.querySelector('[data-v1184-mode="month"]')),chrome:document.documentElement.dataset.clientCalendarChromeV11841||'',legacyScripts:[...document.scripts].map(s=>s.src).filter(src=>/\/calendrier\/(calendar|calendar-compact-v5)\.js/iu.test(src)),legacyVisible:Boolean((document.querySelector('.reuse-guide')&&getComputedStyle(document.querySelector('.reuse-guide')).display!=='none')||(document.querySelector('#libraryView')&&getComputedStyle(document.querySelector('#libraryView')).display!=='none')),items:[...document.querySelectorAll('.planning-v1184-item strong')].map(n=>n.textContent?.trim()||''),overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth}));
    assert(d.title==='Que dois-je publier ?',`${name}: title=${d.title}`);assert(d.sectionTitle==='Planning de publication',`${name}: section title=${d.sectionTitle}`);assert(d.week&&d.month,`${name}: week/month controls missing`);assert(d.chrome==='1',`${name}: chrome hotfix missing`);assert(!d.legacyScripts.length,`${name}: legacy calendar scripts loaded`);assert(!d.legacyVisible,`${name}: legacy calendar blocks visible`);if(expectedLabels.length&&d.items.length)assert(d.items.some(item=>expectedLabels.includes(item)),`${name}: actual video identity not visible`);assert(d.overflow<=3,`${name}: week overflow ${d.overflow}px`);
    await page.locator('[data-v1184-mode="month"]').click();await page.waitForSelector('.planning-v1184-month',{timeout:5000});await page.waitForTimeout(150);const monthOverflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);assert(monthOverflow<=3,`${name}: month overflow ${monthOverflow}px`);assert(!js.length,`${name}: ${js.join(' | ')}`);await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});scenarios.push({name,ok:true,diagnostics:{...d,monthOverflow}});
  }catch(error){errors.push(error.message);scenarios.push({name,ok:false,error:error.message});}await ctx.close();
}

function clean(value){return String(value||'').replace(/\.[a-z0-9]{2,5}$/iu,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim();}
function watch(page,out){page.on('pageerror',error=>out.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!/compute-pressure|Failed to load resource/iu.test(message.text()))out.push(message.text());});}
function assert(value,message){if(!value)throw new Error(message);}
