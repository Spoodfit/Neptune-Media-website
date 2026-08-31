const RELEASE='neptune-studio-advanced-navigation-guard-v156';
const ROUTE_TO_TAB={catalog:'programs',finance:'finances','settings-main':'settings'};
let reconcileTimer=0;

document.documentElement.dataset.neptuneAdvancedNavigationGuard='v156';
boot();

function boot(){
  const start=()=>{
    document.addEventListener('click',capturePrimaryNavigation,true);
    window.addEventListener('hashchange',()=>scheduleReconcile(0));
    new MutationObserver(()=>scheduleReconcile(20)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-current']});
    scheduleReconcile(0);
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
}

function capturePrimaryNavigation(event){
  const link=event.target.closest?.('[data-studio-route]');
  if(!link)return;
  const tab=ROUTE_TO_TAB[link.dataset.studioRoute];
  if(!tab)return;

  // The canonical shell intercepts these links and clicks the hidden legacy tab.
  // Keep the URL state in sync before that handler runs, otherwise Catalogue modules
  // keep seeing the stale #programs hash and remount underneath Finance/Settings.
  setHashSilently(tab);
  scheduleReconcile(0);
}

function setHashSilently(tab){
  const wanted=`#${tab}`;
  if(location.hash===wanted)return;
  history.replaceState(history.state,'',`${location.pathname}${location.search}${wanted}`);
}

function scheduleReconcile(delay=20){
  clearTimeout(reconcileTimer);
  reconcileTimer=setTimeout(reconcile,delay);
}

function reconcile(){
  const activeControl=document.querySelector('#studioLegacyTabControlsV105 [data-tab].active');
  const activeTab=String(activeControl?.dataset.tab||decodeURIComponent(location.hash.slice(1))||'').trim();
  if(activeTab)setHashSilently(activeTab);

  const catalogActive=activeTab==='programs';
  const catalogRoute=document.querySelector('[data-studio-route="catalog"]');
  const financeRoute=document.querySelector('[data-studio-route="finance"]');
  const settingsRoute=document.querySelector('[data-studio-route="settings-main"]');

  // Enforce a single primary active route even if a legacy renderer mutates classes later.
  setRouteState(catalogRoute,catalogActive);
  setRouteState(financeRoute,activeTab==='finances');
  setRouteState(settingsRoute,['settings','users','audit'].includes(activeTab));

  if(!catalogActive)teardownCatalogue();
}

function setRouteState(node,active){
  if(!node)return;
  node.classList.toggle('active',Boolean(active));
  if(active)node.setAttribute('aria-current','page');
  else node.removeAttribute('aria-current');
}

function teardownCatalogue(){
  document.body.classList.remove('v145-catalog-active');
  document.querySelector('#studioCatalogCommercialCockpitV145')?.remove();
  document.querySelectorAll('.v145-menu,.v147-dialog,.v148-dialog,.v149-dialog').forEach(node=>node.remove());
}

window.__neptuneStudioAdvancedNavigationGuardV156={release:RELEASE,reconcile};
