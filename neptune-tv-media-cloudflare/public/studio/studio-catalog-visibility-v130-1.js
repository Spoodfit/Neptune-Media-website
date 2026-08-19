const RELEASE='neptune-studio-catalog-visibility-20260820-v130.2';
const HERO_COPY='Toutes les offres, classées par ville.';
let scheduled=false;

boot();

function boot(){
  document.body.dataset.studioCatalogVisibility=RELEASE;
  applySoon();
  new MutationObserver(applySoon).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','style']});
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

  enforceHero(page);
  const adminOpen=document.body.classList.contains('v128-catalog-admin-open');
  forceHidden(tabs,true);
  forceHidden(market,adminOpen);
  forceHidden(layout,!adminOpen);
  if(adminBar)forceHidden(adminBar,!adminOpen,'flex');
  page.dataset.catalogVisibility='v130.2';
}

function enforceHero(page){
  const hero=page.querySelector('.c98-hero');
  const copy=hero?.firstElementChild;
  if(!hero||!copy)return;
  const eyebrow=hero.querySelector('.c98-eyebrow');
  const title=hero.querySelector('h2');
  if(eyebrow&&eyebrow.textContent!=='MARKETPLACE DE PRODUCTION')eyebrow.textContent='MARKETPLACE DE PRODUCTION';
  if(title&&title.textContent!=='Catalogue Média')title.textContent='Catalogue Média';
  [...copy.querySelectorAll('p:not(.c98-eyebrow):not(.v128-catalog-description)')].forEach(node=>forceHidden(node,true));
  let description=copy.querySelector('.v128-catalog-description');
  if(!description){
    description=document.createElement('p');
    description.className='v128-catalog-description';
    copy.append(description);
  }
  if(description.textContent!==HERO_COPY)description.textContent=HERO_COPY;
  forceHidden(description,false);
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
