import {spawn} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';

class Cdp{
  constructor(url){this.url=url;this.socket=null;this.seq=0;this.pending=new Map();this.listeners=new Map();}
  async connect(){this.socket=new WebSocket(this.url);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Connexion CDP timeout')),5000);this.socket.onopen=()=>{clearTimeout(timer);resolve();};this.socket.onerror=()=>{clearTimeout(timer);reject(new Error('Connexion CDP impossible'));};});this.socket.onmessage=event=>this.handle(event.data);}
  handle(raw){const message=JSON.parse(String(raw));if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);if(message.error)pending.reject(new Error(message.error.message));else pending.resolve(message.result||{});return;}for(const listener of this.listeners.get(message.method)||[])Promise.resolve(listener(message.params||{})).catch(error=>console.error('cdp_event_error',message.method,error.message));}
  on(method,listener){if(!this.listeners.has(method))this.listeners.set(method,[]);this.listeners.get(method).push(listener);}
  send(method,params={}){const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},10000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  close(){try{this.socket?.close();}catch{}}
}

const baseURL=process.env.STUDIO_BASE_URL||'http://127.0.0.1:8787';
const release='neptune-studio-catalog-cockpit-20260820-v131';
const timeout=30000;
const family={key:'city-toulouse|format-hors-norme|supplier-recbox',cityId:'city-toulouse',cityName:'Toulouse',formatId:'format-hors-norme',formatName:'Hors Norme',supplierId:'supplier-recbox',supplierName:'RecBox',active:true,publicOrder:10,supplierNetCents:60000,tiers:{launch:{clientPriceCents:89000},promo:{clientPriceCents:149000},base:{clientPriceCents:199000}},configurationOptions:['Chaise','Canapé'],configurationVisuals:[{label:'Chaise'},{label:'Canapé'}]};
const catalog={ok:true,formats:[{id:'format-hors-norme',name:'Hors Norme',concept:'Émission Neptune Business',active:true}],suppliers:[{id:'supplier-recbox',name:'RecBox',active:true,defaultNetCents:60000}],cities:[{id:'city-toulouse',name:'Toulouse',country:'France',active:true,publicOrder:10}],families:[family],services:[],supplierRates:[],rateUnits:[],durationOptions:[]};
const user={id:'admin-1',email:'contact@neptunebusiness.com',fullName:'Neptune Media',role:'admin'};
const admin={user,programs:[],episodes:[],ads:[],users:[user],audit:[],settings:{},stats:{views:0,watchSeconds:0,uniqueViewers:0,bookingClicks:0,byEpisode:{},conversions:{count:0,revenueCents:0}}};

await main();

async function main(){
  const chrome=findChrome();const port=9222;
  const chromeProcess=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--user-data-dir=/tmp/neptune-catalog-v131-chrome','about:blank'],{stdio:['ignore','ignore','pipe']});
  let chromeError='';chromeProcess.stderr.on('data',chunk=>{chromeError+=String(chunk);});let cdp;
  try{
    await waitForChrome(port,chromeProcess,()=>chromeError);
    const targetResponse=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});assert(targetResponse.ok,`Création onglet CDP impossible: HTTP ${targetResponse.status}`);const target=await targetResponse.json();
    cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*://*/api/*',requestStage:'Request'}]});await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    cdp.on('Fetch.requestPaused',async event=>{const body=mockApi(new URL(event.request.url).pathname);await cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json; charset=utf-8'},{name:'Cache-Control',value:'no-store'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});});
    let documentHeaders={};cdp.on('Network.responseReceived',event=>{if(event.type==='Document'&&event.response.url.includes('/studio/advanced.html'))documentHeaders=event.response.headers||{};});
    await cdp.send('Page.navigate',{url:`${baseURL}/studio/advanced.html#programs`});
    await waitFor(async()=>Boolean(await evaluate(cdp,"document.querySelector('#studioCatalogCockpitV131 .v131-table tbody tr')")),timeout,'Cockpit v131 non monté');
    const header=Object.entries(documentHeaders).find(([name])=>name.toLowerCase()==='x-neptune-catalog-runtime')?.[1]||'';assert(header===release,`Header Catalogue incorrect: ${header||'absent'}`);
    const snapshot=await evaluate(cdp,`(()=>({release:document.body.dataset.studioCatalogCockpit||'',hero:getComputedStyle(document.querySelector('.c98-hero')).display,tabs:getComputedStyle(document.querySelector('.c98-tabs')).display,layout:getComputedStyle(document.querySelector('.c98-layout')).display,oldConcept:Boolean(document.querySelector('.c98-layout:not([hidden])')),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,text:document.querySelector('#studioCatalogCockpitV131')?.textContent||'',viewButtons:[...document.querySelectorAll('[data-v131-view]')].map(n=>n.textContent.trim())}))()`);
    assert(snapshot.release===release,`Runtime exécuté incorrect: ${snapshot.release}`);assert(snapshot.hero==='none'&&snapshot.tabs==='none'&&snapshot.layout==='none','Ancien catalogue visible par défaut');assert(!snapshot.oldConcept,'Bloc Concepts historique visible');assert(snapshot.overflow<=1,`Débordement horizontal: ${snapshot.overflow}px`);
    for(const text of ['Vue d’ensemble','Offres','Éléments du catalogue','Toulouse','Hors Norme','RecBox','600','890','1 990','Modifier'])assert(snapshot.text.includes(text),`Cockpit v131 sans « ${text} »`);
    assert(snapshot.viewButtons.join('|')==='Vue d’ensemble|Offres|Éléments du catalogue','Navigation v131 incorrecte');
    await evaluate(cdp,"document.querySelector('[data-v131-view=offers]').click();true");await waitFor(async()=>Boolean(await evaluate(cdp,"document.querySelector('.v131-offer')")),5000,'Vue Offres inaccessible');
    await evaluate(cdp,"document.querySelector('[data-v131-view=elements]').click();true");await waitFor(async()=>Boolean(await evaluate(cdp,"document.querySelector('.v131-elements-grid')")),5000,'Vue Éléments inaccessible');
    const elementsText=await evaluate(cdp,"document.querySelector('.v131-elements-grid').textContent");for(const text of ['Concepts','Fournisseurs','Configurations','Villes'])assert(elementsText.includes(text),`Éléments sans « ${text} »`);
    await evaluate(cdp,"document.querySelector('[data-v131-manage-category=suppliers]').click();true");await waitFor(async()=>Boolean(await evaluate(cdp,"document.body.classList.contains('v131-admin-open')")),5000,'Éditeur fournisseur inaccessible');assert((await evaluate(cdp,"getComputedStyle(document.querySelector('.c98-layout')).display"))!=='none','CRUD historique non accessible à la demande');
    await evaluate(cdp,"document.querySelector('[data-v131-back]').click();true");await waitFor(async()=>Boolean(await evaluate(cdp,"getComputedStyle(document.querySelector('#studioCatalogCockpitV131')).display!=='none'")),5000,'Retour cockpit impossible');
    const screenshot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(process.env.CATALOG_SCREENSHOT||'/tmp/catalog-cockpit-v131.png',Buffer.from(screenshot.data,'base64'));
    console.log('Catalogue cockpit v131 browser audit: OK');
  }finally{cdp?.close();chromeProcess.kill('SIGTERM');}
}

function mockApi(pathname){if(pathname==='/api/auth/status')return{authenticated:true,csrfToken:'test-csrf',user};if(pathname==='/api/admin/state')return admin;if(pathname==='/api/admin/clients')return{clients:[],orders:[],supplierPayments:[],refundRequests:[],deletionRequests:[],finance:{}};if(pathname==='/api/admin/media-catalog-v98/context')return catalog;if(pathname==='/api/reservation/catalog-v96')return{ok:true,cities:[],pricing:{}};if(pathname.startsWith('/api/admin/sales-config-v96/'))return{ok:true,services:[],supplierRates:[],rateUnits:[],durationOptions:[]};return{ok:true};}
function findChrome(){for(const file of ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'])if(existsSync(file))return file;throw new Error('Chrome système introuvable');}
async function waitForChrome(port,process,getError){const started=Date.now();while(Date.now()-started<15000){if(process.exitCode!==null)throw new Error(`Chrome arrêté: ${getError().slice(-1000)}`);try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok)return;}catch{}await sleep(150);}throw new Error(`Chrome DevTools indisponible: ${getError().slice(-1000)}`);}
async function evaluate(cdp,expression){const response=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text||'Erreur JavaScript navigateur');return response.result?.value;}
async function waitFor(check,limit,message){const started=Date.now();while(Date.now()-started<limit){try{if(await check())return;}catch{}await sleep(100);}throw new Error(message);}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function assert(condition,message){if(!condition)throw new Error(message);}
