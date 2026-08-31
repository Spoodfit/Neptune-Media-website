const RELEASE='neptune-studio-catalog-single-render-v158';
let observer=null;
let timeout=0;

document.documentElement.dataset.neptuneCatalogSingleRender='v158';

function isCatalogue(){
  return String(location.hash||'').toLowerCase()==='#programs';
}

function modernReady(){
  const root=document.getElementById('studioCatalogCommercialCockpitV145');
  return Boolean(root && root.isConnected && root.querySelector('.v145-city,.v145-empty,.v145-toolbar'));
}

function reveal(){
  document.documentElement.classList.remove('catalog-prepaint');
  document.documentElement.classList.add('catalog-modern-ready');
  clearTimeout(timeout);
}

function conceal(){
  if(!isCatalogue())return;
  document.documentElement.classList.add('catalog-prepaint');
  document.documentElement.classList.remove('catalog-modern-ready');
}

function reconcile(){
  if(!isCatalogue()){
    document.documentElement.classList.remove('catalog-prepaint','catalog-modern-ready');
    return;
  }
  if(modernReady())reveal();
  else conceal();
}

function start(){
  reconcile();
  observer?.disconnect();
  observer=new MutationObserver(()=>queueMicrotask(reconcile));
  observer.observe(document.body,{subtree:true,childList:true});
  window.addEventListener('hashchange',reconcile);
  // Safety valve: never leave a blank Studio if the modern renderer genuinely fails.
  clearTimeout(timeout);
  timeout=setTimeout(()=>{
    if(isCatalogue()&&!modernReady()){
      document.documentElement.classList.remove('catalog-prepaint');
      console.error('[Catalogue v158] modern renderer did not mount within 8s');
    }
  },8000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();

window.__neptuneStudioCatalogSingleRenderV158={release:RELEASE,reconcile};
