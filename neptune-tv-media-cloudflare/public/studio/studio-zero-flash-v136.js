const RELEASE='neptune-studio-zero-flash-20260823-v137.1';
const root=document.documentElement;
const SHELL_READY='neptuneStudioShellReady';
const studioRoutes=['/studio/clients','/studio/webtv.html','/studio/video-ai.html','/studio/advanced.html#programs'];
const path=location.pathname.replace(/\/+$/u,'')||'/';
const page=path==='/studio/clients'||path==='/studio/clients.html'?'clients':path==='/studio/webtv'||path==='/studio/webtv.html'?'webtv':path==='/studio/video-ai'||path==='/studio/video-ai.html'?'production':path==='/studio/advanced'||path==='/studio/advanced.html'?'advanced':'other';
let revealed=false;
let fallbackTimer=0;
let readinessPoll=0;
let inspectQueued=false;

root.dataset.neptuneStudioZeroFlash=RELEASE;

function reveal(reason='canonical'){
  if(revealed)return;
  revealed=true;
  clearTimeout(fallbackTimer);
  clearInterval(readinessPoll);
  root.removeAttribute('data-neptune-studio-boot');
  root.removeAttribute('data-neptune-studio-navigating');
  root.dataset.neptuneStudioReady='v136';
  root.dataset.neptuneStudioPageStable='v137';
  root.dataset.neptuneStudioRevealReason=reason;
  requestAnimationFrame(()=>prefetchStudio());
}

function shellReady(){return Boolean(root.dataset[SHELL_READY]);}
function clientsReady(){
  const pipeline=document.getElementById('pipeline');
  if(!pipeline)return false;
  const text=String(pipeline.textContent||'').trim().toLowerCase();
  if(!text||text.includes('chargement des parcours clients'))return false;
  return Boolean(pipeline.querySelector('.column,.empty'));
}
function webtvReady(){
  return document.body.classList.contains('webtv-v125-mounted')&&Boolean(document.getElementById('webtvCockpitV125'))&&Boolean(document.querySelector('#webtvCockpitV125 .v125-tabs'));
}
function pageReady(){
  if(page==='clients')return clientsReady();
  if(page==='webtv')return webtvReady();
  return true;
}
function ensureLegacyAccountAnchors(){
  if(page!=='webtv')return;
  const account=document.querySelector('.neptune-studio-account');
  if(!account)return;
  const name=account.querySelector('b');
  const role=account.querySelector('small');
  if(name&&!document.getElementById('accountName'))name.id='accountName';
  if(role&&!document.getElementById('accountRole'))role.id='accountRole';
}
function inspectNow(){
  if(!shellReady())return;
  ensureLegacyAccountAnchors();
  if(pageReady())reveal(page==='clients'?'clients-final':page==='webtv'?'diffusion-final':'canonical');
}
function inspect(){
  if(inspectQueued||revealed)return;
  inspectQueued=true;
  queueMicrotask(()=>{
    inspectQueued=false;
    inspectNow();
  });
}

const observer=new MutationObserver(inspect);
observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-neptune-studio-shell-ready','class','hidden']});
readinessPoll=window.setInterval(inspectNow,60);
inspect();

fallbackTimer=window.setTimeout(()=>{
  if(revealed)return;
  ensureLegacyAccountAnchors();
  console.warn('[Neptune Studio] v137 final-screen readiness timeout; revealing safe fallback');
  reveal('bounded-fallback');
},10000);

window.addEventListener('pageshow',()=>{root.removeAttribute('data-neptune-studio-navigating');inspect();});

document.addEventListener('pointerover',event=>{
  const link=event.target instanceof Element?event.target.closest('a[href]'):null;
  if(!link)return;
  const url=toStudioUrl(link.href);
  if(url)prefetch(url.pathname+url.search+url.hash);
},{passive:true});

document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target instanceof Element?event.target.closest('a[href]'):null;
  if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
  const url=toStudioUrl(link.href);
  if(!url||sameDocumentHash(url))return;
  root.dataset.neptuneStudioNavigating='v136';
},true);

function prefetchStudio(){for(const href of studioRoutes)prefetch(href);}
function prefetch(href){
  if(document.head.querySelector(`link[data-neptune-prefetch-v136="${cssEscape(href)}"]`))return;
  const link=document.createElement('link');
  link.rel='prefetch';link.href=href;link.as='document';link.dataset.neptunePrefetchV136=href;
  document.head.append(link);
}
function toStudioUrl(href){
  try{const url=new URL(href,location.href);return url.origin===location.origin&&url.pathname.startsWith('/studio/')?url:null}catch{return null}
}
function sameDocumentHash(url){return url.pathname===location.pathname&&url.search===location.search&&url.hash&&url.hash!==location.hash;}
function cssEscape(value){return globalThis.CSS?.escape?CSS.escape(value):String(value).replace(/["\\]/gu,'\\$&');}
