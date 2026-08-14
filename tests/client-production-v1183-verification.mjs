import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=(process.env.CLIENT_PRODUCTION_URL||'https://tv.neptunebusiness.com').replace(/\/$/u,'');
const email=process.env.CLIENT_AUDIT_EMAIL||'contact@neptunebusiness.com';
const out=path.resolve('test-results/client-production-v1183-verification');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
const bootstrap=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const loginResponse=await bootstrap.request.post(`${baseUrl}/api/client/request-code`,{
  headers:{Origin:baseUrl,'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},
  data:{email},timeout:30000,
});
const login=await loginResponse.json().catch(()=>({}));
expect(loginResponse.ok()&&login?.authenticated===true&&login?.trustedAccess===true,'trusted login production indisponible');
const sessionResponse=await bootstrap.request.get(`${baseUrl}/api/client/session`,{headers:{'Cache-Control':'no-cache, no-store'},timeout:30000});
const session=await sessionResponse.json().catch(()=>({}));
expect(sessionResponse.ok()&&session?.authenticated===true&&Array.isArray(session?.orders),'session production invalide');
const storageState=await bootstrap.storageState();
await bootstrap.close();

const report={ok:false,baseUrl,orders:session.orders.length,home:null,library:null,errors:[]};
try{report.home=await verifyHome();}catch(error){report.errors.push(`home: ${error.message}`);}
try{report.library=await verifyLibrary();}catch(error){report.errors.push(`library: ${error.message}`);}
report.ok=report.errors.length===0;
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
await browser.close();
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exit(1);

async function verifyHome(){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',storageState});
  const page=await context.newPage();
  await page.goto(`${baseUrl}/espace-client/?v1183_prod=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:25000});
  await page.waitForSelector('.client-command-center #ccContent:not([hidden])',{timeout:25000});
  await page.waitForTimeout(900);
  const before=await page.evaluate(()=>{
    const rail=document.querySelector('.cc-flow-scroll');
    const selected=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-button');
    const rr=rail?.getBoundingClientRect(),sr=selected?.getBoundingClientRect();
    const support=document.querySelector('.support-card'),referral=document.querySelector('.referral-panel');
    const actions=[...document.querySelectorAll('.support-card .support-actions .utility-action')].map(node=>node.getBoundingClientRect());
    return {
      polishLoaded:[...document.styleSheets].some(sheet=>String(sheet.href||'').includes('client-ux-polish-v118-3.css')),
      selectedTransform:selected?getComputedStyle(selected).transform:'',
      selectedCursor:selected?getComputedStyle(selected).cursor:'',
      selectedInside:Boolean(rr&&sr&&sr.left>=rr.left-1&&sr.right<=rr.right+1&&sr.top>=rr.top-1&&sr.bottom<=rr.bottom+1),
      supportHeight:Math.round(support?.getBoundingClientRect().height||0),
      supportWidth:Math.round(support?.getBoundingClientRect().width||0),
      referralWidth:Math.round(referral?.getBoundingClientRect().width||0),
      actionsStacked:actions.length===2&&actions[1].top>=actions[0].bottom-1,
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    };
  });
  expect(before.polishLoaded,'CSS v118.3 non chargée en production');
  expect(before.selectedTransform==='none',`étape active déplacée (${before.selectedTransform})`);
  expect(before.selectedCursor==='pointer',`curseur étape active ${before.selectedCursor}`);
  expect(before.selectedInside,'étape active encore coupée/hors rail');
  expect(before.supportHeight<150,`Besoin d’aide trop haut (${before.supportHeight}px)`);
  expect(before.referralWidth>before.supportWidth,`parrainage trop étroit (${before.referralWidth}/${before.supportWidth})`);
  expect(before.actionsStacked,'boutons Besoin d’aide non empilés');
  expect(before.overflow<=3,`overflow horizontal ${before.overflow}px`);

  const prepButton=page.locator('.cc-stage-button').filter({hasText:'Préparation'}).first();
  expect(await prepButton.count()===1,'étape Préparation introuvable');
  const started=Date.now();
  await prepButton.click();
  await page.waitForSelector('#ccPreparationDeckV118 #horsNormePreparationV77',{state:'attached',timeout:1500});
  const prepMs=Date.now()-started;
  const cards=await page.locator('#ccPreparationDeckV118 [data-preparation-card]').count();
  expect(cards===10,`${cards} cartes de préparation au lieu de 10`);
  expect(prepMs<500,`préparation encore perceptiblement lente (${prepMs}ms)`);
  await page.screenshot({path:path.join(out,'home-preparation.png'),fullPage:true});
  await context.close();
  return {...before,preparationMountMs:prepMs,preparationCards:cards};
}

async function verifyLibrary(){
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',storageState});
  const page=await context.newPage();
  await page.goto(`${baseUrl}/espace-client/videos/?v1183_prod=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.media-folder-selector',{timeout:20000});
  await page.waitForTimeout(300);
  const initial=await diagnostics(page);
  expect(initial.labels.join('|')==='Format long|Format court',`dossiers incorrects: ${initial.labels.join(', ')}`);
  expect(initial.folderCount===2,`${initial.folderCount} dossiers au lieu de 2`);
  expect(initial.overflow<=3,`overflow bibliothèque ${initial.overflow}px`);
  expect(initial.cards>0,'aucune vidéo visible dans le dossier actif');
  expect(initial.mixed===false,'formats long/court mélangés dans le dossier actif');

  const other=initial.active==='final'?'short':'final';
  const otherButton=page.locator(`[data-media-folder="${other}"]`);
  if(await otherButton.isEnabled()){
    await otherButton.click();
    await page.waitForTimeout(100);
    const switched=await diagnostics(page);
    expect(switched.active===other,`dossier ${other} non sélectionné`);
    expect(switched.mixed===false,'formats mélangés après changement de dossier');
  }
  await page.screenshot({path:path.join(out,'library-folders.png'),fullPage:true});
  const final=await diagnostics(page);
  await context.close();
  return {initial,final};
}

async function diagnostics(page){
  return page.evaluate(()=>{
    const folders=[...document.querySelectorAll('[data-media-folder]')];
    const cards=[...document.querySelectorAll('.compact-media-card')];
    const active=folders.find(node=>node.getAttribute('aria-pressed')==='true')?.dataset.mediaFolder||'';
    const long=cards.filter(node=>node.classList.contains('compact-media-card--final')).length;
    const short=cards.filter(node=>node.classList.contains('compact-media-card--short')).length;
    return {
      folderCount:folders.length,
      labels:folders.map(node=>node.querySelector('.media-format-folder-copy strong')?.textContent?.trim()||''),
      active,cards:cards.length,long,short,mixed:long>0&&short>0,
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    };
  });
}

function expect(value,message){if(!value)throw new Error(message);}
