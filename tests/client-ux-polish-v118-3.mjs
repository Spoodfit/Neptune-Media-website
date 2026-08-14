import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=process.env.DASHBOARD_BASE_URL||'http://127.0.0.1:4173';
const out=path.resolve('test-results/client-ux-polish-v118-3');
const errors=[];
const files=[
  {id:'long-1',driveFileId:'drive-long-1',fileType:'final',name:'Hors_Norme_Master.mp4'},
  {id:'long-2',driveFileId:'drive-long-2',fileType:'long',name:'Hors_Norme_Bonus.mp4'},
  ...Array.from({length:5},(_,i)=>({id:`short-${i+1}`,driveFileId:`drive-short-${i+1}`,fileType:i?'short':'reel',name:`Short_${i+1}.mp4`})),
];
const order={id:'order-v1183',title:'Hors Norme — Léa',format:'Hors Norme',status:'editing',paymentStatus:'paid',appointmentAt:'2026-08-01T08:00:00Z',filmingAt:'2026-08-05T09:00:00Z',workflow:{preparationStatus:'completed',supplierStatus:'confirmed',sourceReceivedAt:'2026-08-06T09:00:00Z',editingStartedAt:'2026-08-07T09:00:00Z'},files};
const state={authenticated:true,client:{id:'c',fullName:'Léa Neptune',email:'lea@example.com'},orders:[order]};
const catalog={ok:true,cities:[{id:'toulouse',slug:'toulouse',name:'Toulouse',formats:[{id:'hn',slug:'hors-norme',name:'Hors Norme',imagePublicUrl:'/assets/logo-neptune.svg',offers:[{id:'o',clientPriceCents:79000}]}]}]};

await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
await homeAudit();
await libraryAudit({width:1280,height:900},'library-desktop');
await libraryAudit({width:390,height:844},'library-mobile-390');
await browser.close();
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({errors},null,2));
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log('UX client v118.3 validée : parcours stable, préparation rapide, aide compacte et dossiers long/court.');

async function homeAudit(){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  const browserErrors=[];watch(page,browserErrors);await routes(page);
  try{
    await okGoto(page,`${baseUrl}/espace-client/?v1183=${Date.now()}`);
    await page.waitForSelector('#dashboard:not([hidden])',{timeout:20000});
    await page.evaluate(async()=>{
      await import('/espace-client/client-experience-v117.js?v=1');
      for(const href of ['/espace-client/client-command-center-v118.css?v=1','/espace-client/client-catalog-rail-v118.css?v=1','/espace-client/client-visual-coherence-v118-2.css?v=1','/espace-client/client-ux-polish-v118-3.css?v=1']){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);}
      await import('/espace-client/client-command-center-v118-1.js?v=1');
      await import('/espace-client/client-preparation-context-v118.js?v=2');
      await import('/espace-client/client-visual-coherence-v118-2.js?v=1');
    });
    await page.waitForSelector('.client-command-center #ccContent:not([hidden])',{timeout:20000});
    await page.waitForTimeout(180);
    const d=await page.evaluate(()=>{
      const b=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-button'),copy=b?.querySelector('strong'),rail=document.querySelector('.cc-flow-scroll');
      const br=b?.getBoundingClientRect(),rr=rail?.getBoundingClientRect(),pseudo=b?getComputedStyle(b,'::after'):null;
      const support=document.querySelector('.support-card'),referral=document.querySelector('.referral-panel'),actions=[...document.querySelectorAll('.support-card .support-actions .utility-action')].map(n=>n.getBoundingClientRect());
      return {transform:b?getComputedStyle(b).transform:'',cursor:copy?getComputedStyle(copy).cursor:'',inside:Boolean(br&&rr&&br.left>=rr.left-1&&br.right<=rr.right+1&&br.top>=rr.top-1&&br.bottom<=rr.bottom+1),top:pseudo?.top,bottom:pseudo?.bottom,supportH:Math.round(support?.getBoundingClientRect().height||0),supportW:Math.round(support?.getBoundingClientRect().width||0),referralW:Math.round(referral?.getBoundingClientRect().width||0),stacked:actions.length===2&&actions[1].top>=actions[0].bottom-1,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};
    });
    expect(d.transform==='none',`étape sélectionnée déplacée (${d.transform})`);expect(d.cursor==='pointer',`curseur instable (${d.cursor})`);expect(d.inside,'étape sélectionnée hors du rail');expect(d.top==='0px'&&d.bottom==='0px','contour sélectionné hors de sa cellule');expect(d.supportH<150,`Besoin d’aide trop haut (${d.supportH}px)`);expect(d.referralW>d.supportW,`parrainage pas assez large (${d.referralW}/${d.supportW})`);expect(d.stacked,'actions aide non empilées');expect(d.overflow<=3,`overflow home ${d.overflow}px`);

    const t=Date.now();await page.locator('[data-cc-stage="3"]').click();await page.waitForSelector('#ccPreparationDeckV118 #horsNormePreparationV77',{state:'attached',timeout:1200});const elapsed=Date.now()-t;
    const prep=await page.evaluate(()=>({loader:Boolean(document.querySelector('#ccPreparationDeckV118 .cc-v118-prep-loading')),cards:document.querySelectorAll('#ccPreparationDeckV118 [data-preparation-card]').length,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth}));
    expect(elapsed<350,`préparation trop lente (${elapsed} ms)`);expect(!prep.loader,'loader préparation encore visible');expect(prep.cards===10,`${prep.cards} cartes au lieu de 10`);expect(prep.overflow<=3,`overflow préparation ${prep.overflow}px`);if(browserErrors.length)throw new Error(browserErrors.join(' | '));
    await page.screenshot({path:path.join(out,'home-preparation-desktop.png'),fullPage:true});
  }catch(e){errors.push(`home: ${e.message}`);}await context.close();
}

async function libraryAudit(viewport,name){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();const browserErrors=[];watch(page,browserErrors);await routes(page);
  try{
    await okGoto(page,`${baseUrl}/espace-client/videos/?passage=${order.id}&v1183=${Date.now()}`);await page.waitForSelector('.media-folder-selector',{timeout:10000});
    let d=await libDiag(page);expect(d.labels.join('|')==='Format long|Format court',`${name}: dossiers ${d.labels.join(',')}`);expect(d.active==='final',`${name}: long non actif`);expect(d.cards===2&&d.long===2&&d.short===0,`${name}: mélange dossier long`);expect(d.cursor==='pointer',`${name}: curseur ${d.cursor}`);expect(d.overflow<=3,`${name}: overflow ${d.overflow}px`);
    await page.locator('[data-media-folder="short"]').click();await page.waitForTimeout(40);d=await libDiag(page);expect(d.active==='short',`${name}: court non actif`);expect(d.cards===5&&d.long===0&&d.short===5,`${name}: mélange dossier court`);expect(d.overflow<=3,`${name}: overflow court ${d.overflow}px`);if(browserErrors.length)throw new Error(browserErrors.join(' | '));
    await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});
  }catch(e){errors.push(`${name}: ${e.message}`);}await context.close();
}

async function libDiag(page){return page.evaluate(()=>{const f=[...document.querySelectorAll('[data-media-folder]')],c=[...document.querySelectorAll('.compact-media-card')],a=f.find(n=>n.getAttribute('aria-pressed')==='true');return{labels:f.map(n=>n.querySelector('.media-format-folder-copy strong')?.textContent?.trim()||''),active:a?.dataset.mediaFolder||'',cursor:f[0]?getComputedStyle(f[0].querySelector('strong')).cursor:'',cards:c.length,long:c.filter(n=>n.classList.contains('compact-media-card--final')).length,short:c.filter(n=>n.classList.contains('compact-media-card--short')).length,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};});}
async function routes(page){await page.route('**/api/client/**',r=>new URL(r.request().url()).pathname==='/api/client/session'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)}):r.fulfill({status:200,contentType:'application/json',body:'{}'}));await page.route('**/api/reservation/catalog-v96',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));await page.route('**/api/public/connexio-availability',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false,"event":null}'}));await page.route('https://drive.google.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html>'}));}
function watch(page,out){page.on('pageerror',e=>out.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/compute-pressure|Failed to load resource/iu.test(m.text()))out.push(m.text());});}
async function okGoto(page,url){const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});expect(r&&r.status()<400,`HTTP ${r?.status()||0}`);}
function expect(v,m){if(!v)throw new Error(m);}
