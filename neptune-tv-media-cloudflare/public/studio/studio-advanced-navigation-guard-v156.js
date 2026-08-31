const RELEASE='neptune-studio-advanced-navigation-guard-v157';
const ROUTE_TO_TAB={catalog:'programs',finance:'finances','settings-main':'settings'};
let reconcileTimer=0;
let previousHash=location.hash;
let catalogReloading=false;

document.documentElement.dataset.neptuneAdvancedNavigationGuard='v157';
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
  const catalogTarget=event.target.closest?.('[data-studio-route="catalog"],[data-context-tab="programs"]');
  if(catalogTarget && location.hash!=='#programs'){
    // The modern Catalogue cockpit is bootstrapped once at document load. Legacy Studio
    // renderers replace #content when Finance/Settings are opened, so returning to programs
    // inside the same document would expose the old Formats screen. Reload this route
    // automatically to rebuild the current Catalogue runtime instead of asking for F5.
    event.preventDefault();
    event.stopImmediatePropagation();
    reloadCatalogue();
    return;
  }

  const link=event.target.closest?.('[data-studio-route]');
  if(!link)return;
  const tab=ROUTE_TO_TAB[link.dataset.studioRoute];
  if(!tab)return;
  setHashSilently(tab);
  scheduleReconcile(0);
}

function handleHashChange(){
  const oldHash=previousHash;
  previousHash=location.hash;
  if(location.hash==='#programs' && oldHash && oldHash!=='#programs'){
    reloadCatalogue();
    return;
  }
  scheduleReconcile(0);
}

function reloadCatalogue(){
  if(catalogReloading)return;
  catalogReloading=true;
  location.assign(`${location.pathname}${location.search}#programs`);
  // assign() with only a hash normally performs in-document navigation. Force an actual
  // document reload so every current Catalogue layer (v145+) boots again cleanly.
  setTimeout(()=>location.reload(),0);
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

  const catalogActive=activeTab==='programs';
  const catalogRoute=document.querySelector('[data-studio-route="catalog"]');
  const financeRoute=document.querySelector('[data-studio-route="finance"]');
  const settingsRoute=document.querySelector('[data-studio-route="settings-main"]');

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

window.__neptuneStudioAdvancedNavigationGuardV156={release:RELEASE,reconcile,reloadCatalogue};
