import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=process.env.DASHBOARD_BASE_URL||'http://127.0.0.1:4173';
const out=path.resolve('test-results/client-ux-v118-4');
const errors=[];
const today=new Date();
const tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);tomorrow.setHours(10,30,0,0);
const later=new Date(tomorrow);later.setDate(tomorrow.getDate()+2);later.setHours(15,0,0,0);

const files=[
  {id:'long-1',driveFileId:'drive-long-1',fileType:'final',name:'Hors_Norme_Master.mp4',sizeLabel:'1,2 Go',createdAt:'2026-08-10T10:00:00Z'},
  {id:'long-2',driveFileId:'drive-long-2',fileType:'long',name:'Hors_Norme_Bonus.mp4',sizeLabel:'800 Mo',createdAt:'2026-08-10T10:00:00Z'},
  ...Array.from({length:8},(_,i)=>({id:`short-${i+1}`,driveFileId:`drive-short-${i+1}`,fileType:i?'short':'reel',name:`Sujet_Reel_${String(i+1).padStart(2,'0')}.mp4`,sizeLabel:'42 Mo',createdAt:'2026-08-10T10:00:00Z'})),
];
const order={id:'order-v1184',title:'Hors Norme — Léa',format:'Hors Norme',status:'editing',paymentStatus:'paid',appointmentAt:'2026-08-01T08:00:00Z',filmingAt:'2026-08-05T09:00:00Z',workflow:{preparationStatus:'completed',supplierStatus:'confirmed',sourceReceivedAt:'2026-08-06T09:00:00Z',editingStartedAt:'2026-08-07T09:00:00Z'},files};
const session={authenticated:true,client:{id:'c',fullName:'Léa Neptune',email:'lea@example.com'},orders:[order]};
const catalog={ok:true,cities:[{id:'toulouse',slug:'toulouse',name:'Toulouse',formats:[{id:'hn',slug:'hors-norme',name:'Hors Norme',imagePublicUrl:'/assets/logo-neptune.svg',offers:[{id:'o',clientPriceCents:79000}]}]}]};
const calendar={
  ok:true,
  assets:[
    {fileId:'short-1',name:'Sujet_Reel_01.mp4',fileType:'short',orderId:order.id,orderTitle:order.title,format:order.format,downloadUrl:'/api/client/files/short-1',aiTitle:'TITRE IA HORS CONTEXTE',aiDescription:'DESCRIPTION IA HORS CONTEXTE'},
    {fileId:'short-2',name:'Sujet_Reel_02.mp4',fileType:'short',orderId:order.id,orderTitle:order.title,format:order.format,downloadUrl:'/api/client/files/short-2',aiTitle:'AUTRE TITRE IA FAUX',aiDescription:'AUTRE DESCRIPTION IA FAUSSE'},
  ],
  occurrences:[
    {occurrenceId:'occ-1',fileId:'short-1',orderId:order.id,publishAt:tomorrow.toISOString(),networks:['youtube','instagram'],title:'TITRE IA HORS CONTEXTE',description:'DESCRIPTION IA HORS CONTEXTE',hashtags:['business'],useIndex:1},
    {occurrenceId:'occ-2',fileId:'short-2',orderId:order.id,publishAt:later.toISOString(),networks:['tiktok'],title:'AUTRE TITRE IA FAUX',description:'AUTRE DESCRIPTION IA FAUSSE',hashtags:['interview'],useIndex:1},
  ],
  publications:[],minimumReuseDays:30,
};

await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
await homeAudit();
await libraryAudit();
await calendarAudit({width:1440,height:1000},'calendar-desktop');
await calendarAudit({width:390,height:844},'calendar-mobile');
await browser.close();
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({errors},null,2));
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log('UX client v118.4 validée : sélection compacte, détail repliable, bibliothèque pleine largeur et planning semaine/mois fondé sur les vraies vidéos.');

async function homeAudit(){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  const browserErrors=[];watch(page,browserErrors);await routes(page);
  try{
    await okGoto(page,`${baseUrl}/espace-client/?v1184=${Date.now()}`);
    await page.waitForSelector('#dashboard:not([hidden])',{timeout:20000});
    await page.evaluate(async()=>{
      for(const href of ['/espace-client/client-command-center-v118.css?v=1','/espace-client/client-catalog-rail-v118.css?v=1','/espace-client/client-visual-coherence-v118-2.css?v=1','/espace-client/client-ux-polish-v118-3.css?v=1','/espace-client/client-ux-v118-4.css?v=1']){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);}
      await import('/espace-client/client-experience-v117.js?v=1');
      await import('/espace-client/client-command-center-v118-1.js?v=1');
      await import('/espace-client/client-preparation-context-v118.js?v=3');
      await import('/espace-client/client-visual-coherence-v118-2.js?v=1');
      await import('/espace-client/client-ux-v118-4.js?v=1');
    });
    await page.waitForSelector('.cc-stage.is-selected-v118',{timeout:12000});
    await page.waitForTimeout(150);
    const selected=await page.evaluate(()=>{
      const button=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-button');
      const icon=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-icon');
      const pseudo=button?getComputedStyle(button,'::after'):null;
      const marker=button?getComputedStyle(button,'::before'):null;
      return {after:pseudo?.content,markerHeight:marker?.height,buttonShadow:button?getComputedStyle(button).boxShadow:'',iconShadow:icon?getComputedStyle(icon).boxShadow:''};
    });
    expect(selected.after==='none'||selected.after==='normal'||selected.after==='""',`ancien grand contour encore actif (${selected.after})`);
    expect(selected.markerHeight==='3px',`marqueur sélection absent (${selected.markerHeight})`);
    expect(selected.buttonShadow==='none',`carte sélectionnée encore surélevée (${selected.buttonShadow})`);
    expect(selected.iconShadow&&selected.iconShadow!=='none','halo compact absent autour du statut');

    await page.locator('[data-cc-stage="3"]').click();
    await page.waitForSelector('#ccDetailRegion:not([hidden])',{timeout:3000});
    await page.locator('#ccDetailRegion [data-v118-close]').click();
    await page.evaluate(()=>document.querySelector('.client-command-center')?.append(document.createComment('force old observer')));
    await page.waitForTimeout(120);
    const closed=await page.evaluate(()=>({collapsed:document.querySelector('#ccDetailRegion')?.dataset.v1184Collapsed,display:getComputedStyle(document.querySelector('#ccDetailRegion')).display,toggleHidden:document.querySelector('[data-v1184-detail-toggle]')?.hidden}));
    expect(closed.collapsed==='1','détail ne conserve pas son état fermé');
    expect(closed.display==='none','détail réouvert par le MutationObserver historique');
    expect(closed.toggleHidden===false,'bouton de réouverture absent');
    await page.locator('[data-v1184-detail-toggle]').click();
    await page.waitForTimeout(50);
    const reopened=await page.evaluate(()=>({collapsed:document.querySelector('#ccDetailRegion')?.dataset.v1184Collapsed||'',display:getComputedStyle(document.querySelector('#ccDetailRegion')).display}));
    expect(!reopened.collapsed&&reopened.display!=='none','détail impossible à rouvrir');
    if(browserErrors.length)throw new Error(browserErrors.join(' | '));
    await page.screenshot({path:path.join(out,'home-selection-detail.png'),fullPage:true});
  }catch(error){errors.push(`home: ${error.message}`);}await context.close();
}

async function libraryAudit(){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();const browserErrors=[];watch(page,browserErrors);await routes(page);
  try{
    await okGoto(page,`${baseUrl}/espace-client/videos/?passage=${order.id}&v1184=${Date.now()}`);
    await page.addStyleTag({url:'/espace-client/client-ux-v118-4.css?v=1'});
    await page.waitForSelector('.media-folder-selector',{timeout:10000});
    await page.locator('[data-media-folder="short"]').click();await page.waitForTimeout(80);
    const d=await page.evaluate(()=>{
      const shell=document.querySelector('.library-shell')?.getBoundingClientRect();
      const section=document.querySelector('.content-section')?.getBoundingClientRect();
      const grid=document.querySelector('.media-strip--short');
      const cards=[...document.querySelectorAll('.compact-media-card--short')];
      const first=cards[0]?.getBoundingClientRect(),second=cards[1]?.getBoundingClientRect();
      return {shellW:Math.round(shell?.width||0),sectionW:Math.round(section?.width||0),gridDisplay:grid?getComputedStyle(grid).display:'',overflow:grid?getComputedStyle(grid).overflowX:'',cards:cards.length,firstW:Math.round(first?.width||0),sameRow:Boolean(first&&second&&Math.abs(first.top-second.top)<4),pageOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};
    });
    expect(d.shellW>1300,`bibliothèque encore trop étroite (${d.shellW}px)`);
    expect(d.sectionW>1250,`contenu dossier encore comprimé (${d.sectionW}px)`);
    expect(d.gridDisplay==='grid',`contenus encore en rail (${d.gridDisplay})`);
    expect(d.cards===8,`${d.cards} shorts au lieu de 8`);
    expect(d.sameRow,'grille shorts non répartie sur la largeur');
    expect(d.firstW>150,`cartes shorts trop écrasées (${d.firstW}px)`);
    expect(d.pageOverflow<=3,`overflow bibliothèque ${d.pageOverflow}px`);
    if(browserErrors.length)throw new Error(browserErrors.join(' | '));
    await page.screenshot({path:path.join(out,'library-full-width.png'),fullPage:true});
  }catch(error){errors.push(`library: ${error.message}`);}await context.close();
}

async function calendarAudit(viewport,name){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();const browserErrors=[];watch(page,browserErrors);await routes(page);
  try{
    await okGoto(page,`${baseUrl}/espace-client/calendrier/?v1184=${Date.now()}`);
    await page.addStyleTag({url:'/espace-client/client-ux-v118-4.css?v=1'});
    await page.evaluate(async()=>{await import('/espace-client/client-ux-v118-4.js?v=1');});
    await page.waitForSelector('.planning-v1184-week',{timeout:10000});
    const week=await page.evaluate(()=>({title:document.querySelector('.calendar-intro h1')?.textContent?.trim(),weekActive:document.querySelector('[data-v1184-mode="week"]')?.classList.contains('is-active'),wrongText:document.body.innerText.includes('TITRE IA HORS CONTEXTE')||document.body.innerText.includes('DESCRIPTION IA HORS CONTEXTE'),realText:document.body.innerText.includes('Sujet Reel 01'),libraryHidden:getComputedStyle(document.querySelector('#libraryView')).display==='none',reuseHidden:getComputedStyle(document.querySelector('.reuse-guide')).display==='none',overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth}));
    expect(week.title==='Que dois-je publier ?',`${name}: promesse calendrier incorrecte`);
    expect(week.weekActive,`${name}: semaine non active par défaut`);
    expect(!week.wrongText,`${name}: texte IA hors contexte encore visible`);
    expect(week.realText,`${name}: identité réelle vidéo absente`);
    expect(week.libraryHidden&&week.reuseHidden,`${name}: doublons historiques encore visibles`);
    expect(week.overflow<=3,`${name}: overflow semaine ${week.overflow}px`);

    await page.locator('[data-v1184-mode="month"]').click();await page.waitForSelector('.planning-v1184-month',{timeout:3000});
    expect(await page.locator('.planning-v1184-month-item').count()>=2,`${name}: occurrences absentes en vue mois`);
    await page.locator('[data-v1184-mode="week"]').click();
    await page.locator('[data-v1184-occurrence="occ-1"]').click();await page.waitForSelector('.v1184-publication-sheet',{timeout:3000});
    const sheet=await page.evaluate(()=>({wrong:document.querySelector('#editorBody')?.innerText.includes('TITRE IA HORS CONTEXTE'),real:document.querySelector('#editorTitle')?.textContent?.includes('Sujet Reel 01'),hasTitleField:Boolean(document.querySelector('[data-v1184-publication-form] input[name="title"]')),hasDate:Boolean(document.querySelector('[data-v1184-publication-form] input[name="publishAt"]'))}));
    expect(!sheet.wrong,`${name}: mauvais titre IA dans le détail`);expect(sheet.real,`${name}: vraie vidéo absente du détail`);expect(!sheet.hasTitleField,`${name}: champ titre IA encore exposé`);expect(sheet.hasDate,`${name}: édition planning absente`);
    if(browserErrors.length)throw new Error(browserErrors.join(' | '));
    await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});
  }catch(error){errors.push(`${name}: ${error.message}`);}await context.close();
}

async function routes(page){
  await page.route('**/api/client/content-calendar/update',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,publishAt:tomorrow.toISOString(),title:'TITRE IA HORS CONTEXTE',description:'DESCRIPTION IA HORS CONTEXTE',hashtags:['business'],networks:['youtube','instagram'],caption:''})}));
  await page.route('**/api/client/content-calendar',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(calendar)}));
  await page.route('**/api/client/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(session)}));
  await page.route('**/api/client/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**/api/reservation/catalog-v96',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
  await page.route('**/api/public/connexio-availability',route=>route.fulfill({status:200,contentType:'application/json',body:'{"available":false,"event":null}'}));
  await page.route('https://drive.google.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html>'}));
}
function watch(page,out){page.on('pageerror',error=>out.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!/compute-pressure|Failed to load resource/iu.test(message.text()))out.push(message.text());});}
async function okGoto(page,url){const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});expect(response&&response.status()<400,`HTTP ${response?.status()||0}`);}
function expect(value,message){if(!value)throw new Error(message);}
