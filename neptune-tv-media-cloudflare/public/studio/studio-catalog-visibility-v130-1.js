const RELEASE='neptune-studio-catalog-visibility-20260820-v130.2';
let scheduled=false;

boot();

function boot(){
  document.body.dataset.studioCatalogVisibility=RELEASE;
  applySoon();
  new MutationObserver(applySoon).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','style']});
  window.addEventListener('hashchange',applySoon);
}

function applySoon(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;applyVisibility();});
}

function applyVisibility(){
  const market=document.getElementById('studioCatalogMarketplaceV128');
  const page=document.querySelector('.c98-page');
  const tabs=page?.querySelector('.c98-tabs');
  const layout=page?.querySelector('.c98-layout');
  const adminBar=document.getElementById('studioCatalogAdminV128');
  if(!market||!page||!tabs||!layout)return;

  const hero=page.querySelector('.c98-hero');
  hero?.querySelectorAll('p:not(.c98-eyebrow)').forEach(node=>forceHidden(node,true));

  const adminOpen=document.body.classList.contains('v128-catalog-admin-open');
  forceHidden(tabs,true);
  forceHidden(market,adminOpen);
  forceHidden(layout,!adminOpen);
  if(adminBar)forceHidden(adminBar,!adminOpen,'flex');
  page.dataset.catalogVisibility='v130.2';
}

function forceHidden(node,hidden,visibleDisplay=''){
  if(node.hidden!==hidden)node.hidden=hidden;
  if(hidden){
    if(node.style.getPropertyValue('display')!=='none'||node.style.getPropertyPriority('display')!=='important')node.style.setProperty('display','none','important');
    node.setAttribute('aria-hidden','true');
    return;
  }
  if(visibleDisplay){
    if(node.style.getPropertyValue('display')!==visibleDisplay||node.style.getPropertyPriority('display')!=='important')node.style.setProperty('display',visibleDisplay,'important');
  }else if(node.style.getPropertyValue('display'))node.style.removeProperty('display');
  node.removeAttribute('aria-hidden');
}
