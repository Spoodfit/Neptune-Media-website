const RELEASE='neptune-studio-advanced-navigation-guard-v159';
const ROUTE_TO_TAB={diffusion:'episodes',catalog:'programs',finance:'finances','settings-main':'settings'};
let reconcileTimer=0;
let previousHash=location.hash;
let activating=false;

document.documentElement.dataset.neptuneAdvancedNavigationGuard='v159';
boot();

function boot(){
  const start=()=>{
    document.addEventListener('click',capturePrimaryNavigation,true);
    window.addEventListener('hashchange',handleHashChange);
    new MutationObserver(()=>scheduleReconcile(20)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-current']});
    scheduleReconcile(0);
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
}

function capturePrimaryNavigation(event){
  const contextCatalog=event.target.closest?.('[data-context-tab="programs"]');
  if(contextCatalog){
    event.preventDefault();
    event.stopImmediatePropagation();
    activateInPlace('programs');
    return;
  }

  const link=event.target.closest?.('[data-studio-route]');
  if(!link)return;
  const tab=ROUTE_TO_TAB[link.dataset.studioRoute];
  if(!tab)return;

  // Catalogue, Diffusion, Finance and Settings all live in the same advanced Studio shell.
  // Never reload/navigate the document for these primary routes: switch the existing
  // legacy control in-place and let the current renderers refresh their data in background.
  event.preventDefault();
  event.stopImmediatePropagation();
  activateInPlace(tab);
}

function activateInPlace(tab){
  if(activating)return;
  activating=true;
  const previous=location.hash;
  const wanted=`#${tab}`;
  if(previous!==wanted){
    history.replaceState(history.state,'',`${location.pathname}${location.search}${wanted}`);
    previousHash=wanted;
  }

  const control=document.querySelector(`#studioLegacyTabControlsV105 [data-tab="${cssEscape(tab)}"]`);
  if(control&&!control.hidden)control.click();

  // replaceState does not emit hashchange. Current Catalogue layers use hashchange as a
  // cheap invalidation signal, so emit one without causing a document navigation.
  if(previous!==wanted)window.dispatchEvent(new Event('hashchange'));
  scheduleReconcile(0);
  queueMicrotask(()=>{activating=false;});
}

function handleHashChange(){
  previousHash=location.hash;
  scheduleReconcile(0);
}

function setHashSilently(tab){
  const wanted=`#${tab}`;
  if(location.hash===wanted)return;
  history.replaceState(history.state,'',`${location.pathname}${location.search}${wanted}`);
  previousHash=wanted;
}

function scheduleReconcile(delay=20){
  clearTimeout(reconcileTimer);
  reconcileTimer=setTimeout(reconcile,delay);
}

function reconcile(){
  const activeControl=document.querySelector('#studioLegacyTabControlsV105 [data-tab].active');
  const activeTab=String(activeControl?.dataset.tab||decodeURIComponent(location.hash.slice(1))||'').trim();
  if(activeTab)setHashSilently(activeTab);

  setRouteState(document.querySelector('[data-studio-route="diffusion"]'),['episodes','ads','insights'].includes(activeTab));
  setRouteState(document.querySelector('[data-studio-route="catalog"]'),activeTab==='programs');
  setRouteState(document.querySelector('[data-studio-route="finance"]'),activeTab==='finances');
  setRouteState(document.querySelector('[data-studio-route="settings-main"]'),['settings','users','audit'].includes(activeTab));

  if(activeTab!=='programs')closeCatalogueOverlays();
}

function setRouteState(node,active){
  if(!node)return;
  node.classList.toggle('active',Boolean(active));
  if(active)node.setAttribute('aria-current','page');
  else node.removeAttribute('aria-current');
}

function closeCatalogueOverlays(){
  document.body.classList.remove('v145-catalog-active');
  document.querySelectorAll('.v145-menu,.v147-dialog,.v148-dialog,.v149-dialog').forEach(node=>node.remove());
}

function cssEscape(value){
  return window.CSS?.escape?window.CSS.escape(String(value)):String(value).replace(/[^a-z0-9_-]/gi,'\\$&');
}

window.__neptuneStudioAdvancedNavigationGuardV156={release:RELEASE,reconcile,activateInPlace};
