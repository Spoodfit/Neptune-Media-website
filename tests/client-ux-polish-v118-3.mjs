import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=process.env.DASHBOARD_BASE_URL||'http://127.0.0.1:4173';
const outputDir=path.resolve('test-results/client-ux-polish-v118-3');
const errors=[];
const client={id:'client-v1183',fullName:'Léa Neptune',email:'lea@example.com'};
const files=[
  {id:'long-1',driveFileId:'drive-long-1',fileType:'final',name:'Hors_Norme_Master.mp4',createdAt:'2026-08-10T09:00:00Z'},
  {id:'long-2',driveFileId:'drive-long-2',fileType:'long',name:'Hors_Norme_Bonus.mp4',createdAt:'2026-08-10T09:05:00Z'},
  ...Array.from({length:5},(_,index)=>({id:`short-${index+1}`,driveFileId:`drive-short-${index+1}`,fileType:index===0?'reel':'short',name:`Short_${index+1}.mp4`,createdAt:`2026-08-10T10:0${index}:00Z`})),
];
const order={
  id:'order-v1183',title:'Hors Norme — Léa',format:'Hors Norme',status:'editing',paymentStatus:'paid',
  appointmentAt:'2026-08-01T08:00:00Z',filmingAt:'2026-08-05T09:00:00Z',
  workflow:{preparationStatus:'completed',supplierStatus:'confirmed',sourceReceivedAt:'2026-08-06T09:00:00Z',editingStartedAt:'2026-08-07T09:00:00Z'},
  files,
};
const state={authenticated:true,client,orders:[order]};
const catalog={ok:true,cities:[{id:'toulouse',slug:'toulouse',name:'Toulouse',formats:[{id:'hn',slug:'hors-norme',name:'Hors Norme',concept:'Interview incarnée',description:'Une conversation éditoriale premium.',durationLabel:'1 h 30',imagePublicUrl:'/assets/logo-neptune.svg',offers:[{id:'offer',clientPriceCents:79000,currency:'eur'}]}]}]};

await fs.rm(outputDir,{recursive:true,force:true});
await fs.mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});

await auditHome();
await auditLibrary({width:1280,height:900},'library-desktop');
await auditLibrary({width:390,height:844},'library-mobile-390');

await browser.close();
await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify({errors},null,2));
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log('UX client v118.3 validée : parcours stable, préparation préchargée, aide compacte et bibliothèque en deux dossiers.');

async function auditHome(){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  const browserErrors=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/compute-pressure/iu.test(message.text()))browserErrors.push(message.text());});
  await routes(page);
  try{
    const response=await page.goto(`${baseUrl}/espace-client/?v1183=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
    expect(response&&response.status()<400,`home HTTP ${response?.status()||0}`);
    await page.waitForSelector('#dashboard:not([hidden])',{timeout:20000});
    await page.evaluate(async()=>{
      await import('/espace-client/client-experience-v117.js?v=1');
      for(const href of [
        '/espace-client/client-command-center-v118.css?v=1',
        '/espace-client/client-catalog-rail-v118.css?v=1',
        '/espace-client/client-visual-coherence-v118-2.css?v=1',
        '/espace-client/client-ux-polish-v118-3.css?v=1',
      ]){
        const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
      }
      await import('/espace-client/client-command-center-v118-1.js?v=1');
      await import('/espace-client/client-preparation-context-v118.js?v=2');
      await import('/espace-client/client-visual-coherence-v118-2.js?v=1');
    });
    await page.waitForSelector('.client-command-center #ccContent:not([hidden])',{timeout:20000});
    await page.waitForSelector('#horsNormePreparationV77',{state:'attached',timeout:3000});
    await page.waitForTimeout(120);

    const before=await page.evaluate(()=>{
      const selected=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-button');
      const selectedCopy=selected?.querySelector('strong');
      const scroll=document.querySelector('.cc-flow-scroll');
      const sr=selected?.getBoundingClientRect(),rr=scroll?.getBoundingClientRect();
      const pseudo=selected?getComputedStyle(selected,'::after'):null;
      const support=document.querySelector('.support-card'),referral=document.querySelector('.referral-panel');
      const actions=[...document.querySelectorAll('.support-card .support-actions .utility-action')].map(node=>node.getBoundingClientRect());
      return {
        selectedTransform:selected?getComputedStyle(selected).transform:'',
        selectedCursor:selectedCopy?getComputedStyle(selectedCopy).cursor:'',
        selectedInside:Boolean(sr&&rr&&sr.left>=rr.left-1&&sr.right<=rr.right+1&&sr.top>=rr.top-1&&sr.bottom<=rr.bottom+1),
        pseudoTop:pseudo?.top||'',pseudoLeft:pseudo?.left||'',pseudoRight:pseudo?.right||'',pseudoBottom:pseudo?.bottom||'',
        supportHeight:Math.round(support?.getBoundingClientRect().height||0),
        supportWidth:Math.round(support?.getBoundingClientRect().width||0),
        referralWidth:Math.round(referral?.getBoundingClientRect().width||0),
        actionsStacked:actions.length===2&&actions[1].top>=actions[0].bottom-1,
        globalOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
      };
    });
    expect(before.selectedTransform==='none',`étape sélectionnée encore déplacée (${before.selectedTransform})`);
    expect(before.selectedCursor==='pointer',`curseur de l’étape instable (${before.selectedCursor})`);
    expect(before.selectedInside,'l’étape sélectionnée dépasse encore de son rail');
    expect(before.pseudoTop==='0px'&&before.pseudoBottom==='0px','le contour sélectionné dépasse encore verticalement');
    expect(before.supportHeight<150,`Besoin d’aide reste trop haut (${before.supportHeight}px)`);
    expect(before.referralWidth>before.supportWidth,`le parrainage ne reçoit pas plus de place (${before.referralWidth}px vs ${before.supportWidth}px)`);
    expect(before.actionsStacked,'les actions de Besoin d’aide ne sont pas empilées');
    expect(before.globalOverflow<=3,`débordement global home de ${before.globalOverflow}px`);

    const start=Date.now();
    await page.locator('[data-cc-stage="3"]').click();
    await page.waitForSelector('#ccPreparationDeckV118 #horsNormePreparationV77',{state:'attached',timeout:600});
    const elapsed=Date.now()-start;
    const prep=await page.evaluate(()=>({
      loader:Boolean(document.querySelector('#ccPreparationDeckV118 .cc-v118-prep-loading')),
      cards:document.querySelectorAll('#ccPreparationDeckV118 [data-preparation-card]').length,
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    }));
    expect(elapsed<350,`montage de la préparation trop lent (${elapsed} ms)`);
    expect(!prep.loader,'le placeholder de chargement reste visible après montage du deck');
    expect(prep.cards===10,`${prep.cards} cartes Hors Norme au lieu de 10`);
    expect(prep.overflow<=3,`débordement après ouverture préparation de ${prep.overflow}px`);
    if(browserErrors.length)throw new Error(`erreurs navigateur: ${browserErrors.join(' | ')}`);
    await page.screenshot({path:path.join(outputDir,'home-preparation-desktop.png'),fullPage:true});
  }catch(error){errors.push(`home: ${error.message}`);}
  await context.close();
}

async function auditLibrary(viewport,name){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  const page=await context.newPage();
  const browserErrors=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/compute-pressure/iu.test(message.text()))browserErrors.push(message.text());});
  await routes(page);
  try{
    const response=await page.goto(`${baseUrl}/espace-client/videos/?passage=${encodeURIComponent(order.id)}&v1183=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
    expect(response&&response.status()<400,`${name} HTTP ${response?.status()||0}`);
    await page.waitForSelector('.media-folder-selector',{timeout:10000});
    const initial=await libraryDiagnostics(page);
    expect(initial.folderCount===2,`${name}: ${initial.folderCount} dossiers au lieu de 2`);
    expect(initial.folderLabels.join('|')==='Format long|Format court',`${name}: dossiers incorrects (${initial.folderLabels.join(', ')})`);
    expect(initial.activeFolder==='final',`${name}: le dossier Format long doit être actif par défaut`);
    expect(initial.cards===2&&initial.longCards===2&&initial.shortCards===0,`${name}: le dossier long mélange les contenus`);
    expect(initial.folderCursor==='pointer',`${name}: curseur dossier instable (${initial.folderCursor})`);
    expect(initial.overflow<=3,`${name}: débordement global de ${initial.overflow}px`);

    await page.locator('[data-media-folder="short"]').click();
    await page.waitForTimeout(40);
    const short=await libraryDiagnostics(page);
    expect(short.activeFolder==='short',`${name}: Format court ne devient pas actif`);
    expect(short.cards===5&&short.longCards===0&&short.shortCards===5,`${name}: le dossier court mélange les contenus`);
    expect(short.overflow<=3,`${name}: débordement après ouverture du dossier court (${short.overflow}px)`);
    if(browserErrors.length)throw new Error(`erreurs navigateur: ${browserErrors.join(' | ')}`);
    await page.screenshot({path:path.join(outputDir,`${name}.png`),fullPage:true});
  }catch(error){errors.push(`${name}: ${error.message}`);}
  await context.close();
}

async function libraryDiagnostics(page){
  return page.evaluate(()=>{
    const folders=[...document.querySelectorAll('[data-media-folder]')];
    const cards=[...document.querySelectorAll('.compact-media-card')];
    const active=folders.find(node=>node.getAttribute('aria-pressed')==='true');
    return {
      folderCount:folders.length,
      folderLabels:folders.map(node=>node.querySelector('.media-format-folder-copy strong')?.textContent?.trim()||''),
      activeFolder:active?.dataset.mediaFolder||'',
      folderCursor:folders[0]?getComputedStyle(folders[0].querySelector('strong')||folders[0]).cursor:'',
      cards:cards.length,
      longCards:cards.filter(node=>node.classList.contains('compact-media-card--final')).length,
      shortCards:cards.filter(node=>node.classList.contains('compact-media-card--short')).length,
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    };
  });
}

async function routes(page){
  await page.route('**/api/client/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/api/client/session')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)});
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  await page.route('**/api/reservation/catalog-v96',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
  await page.route('**/api/public/connexio-availability',route=>route.fulfill({status:200,contentType:'application/json',body:'{"available":false,"event":null}'}));
  await page.route('https://drive.google.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Drive preview</title>'}));
}

function expect(value,message){if(!value)throw new Error(message);}
