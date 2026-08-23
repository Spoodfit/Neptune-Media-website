const RELEASE='neptune-studio-zero-flash-20260823-v136';
const root=document.documentElement;
const SHELL_READY='neptuneStudioShellReady';
const studioRoutes=['/studio/clients','/studio/webtv.html','/studio/video-ai.html','/studio/advanced.html#programs'];
let revealed=false;
let fallbackTimer=0;

root.dataset.neptuneStudioZeroFlash=RELEASE;

function reveal(reason='canonical'){
  if(revealed)return;
  revealed=true;
  clearTimeout(fallbackTimer);
  root.removeAttribute('data-neptune-studio-boot');
  root.removeAttribute('data-neptune-studio-navigating');
  root.dataset.neptuneStudioReady='v136';
  root.dataset.neptuneStudioRevealReason=reason;
  requestAnimationFrame(()=>prefetchStudio());
}

function shellReady(){return Boolean(root.dataset[SHELL_READY]);}
function inspect(){if(shellReady())reveal('canonical');}

const observer=new MutationObserver(inspect);
observer.observe(root,{attributes:true,attributeFilter:['data-neptune-studio-shell-ready']});
inspect();

fallbackTimer=window.setTimeout(()=>{
  if(revealed)return;
  console.warn('[Neptune Studio] v136 canonical shell readiness timeout; revealing safe fallback');
  reveal('bounded-fallback');
},5000);

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
