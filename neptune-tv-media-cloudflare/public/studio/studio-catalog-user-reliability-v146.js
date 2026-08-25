const RELEASE='neptune-catalog-user-reliability-v146-20260825';
const nativeFetch=window.fetch.bind(window);
let catalogContext=null;
let catalogPolicies=null;
let patchTimer=0;

// Capture only read responses already requested by the cockpit. Never changes payloads.
window.fetch=async(...args)=>{
  const response=await nativeFetch(...args);
  try{
    const raw=typeof args[0]==='string'?args[0]:args[0]?.url||'';
    const path=new URL(raw,location.href).pathname;
    if(response.ok&&path==='/api/admin/media-catalog-v98/context')catalogContext=await response.clone().json();
    if(response.ok&&path==='/api/admin/media-catalog-v143/policies')catalogPolicies=await response.clone().json();
  }catch{}
  return response;
};

// This listener is deliberately registered before v145. Selecting “Masquées” must
// include inactive offers automatically instead of returning an apparently empty catalogue.
document.addEventListener('change',event=>{
  const status=event.target.closest?.('[data-v145-status]');
  if(!status||status.value!=='hidden')return;
  const inactive=document.querySelector('[data-v145-inactive]');
  if(inactive&&!inactive.checked){
    inactive.checked=true;
    inactive.dispatchEvent(new Event('change',{bubbles:true}));
  }
},true);

// If an alert points to an exhausted launch tier but the historical “warning” filter
// produces no card, fall back to the complete commercial view rather than a false empty state.
document.addEventListener('click',event=>{
  if(!event.target.closest?.('[data-v145-show-issues]'))return;
  queueMicrotask(()=>{
    const root=document.querySelector('#studioCatalogCommercialCockpitV145');
    if(!root||root.querySelector('.v145-offer'))return;
    const alert=root.querySelector('.v145-alert small')?.textContent||'';
    if(!/lancement épuisé/i.test(alert))return;
    const status=root.querySelector('[data-v145-status]');
    if(status&&status.value!=='all'){
      status.value='all';
      status.dispatchEvent(new Event('change',{bubbles:true}));
    }
  });
},true);

await import('/studio/studio-catalog-commercial-cockpit-v145.js?v=1');
window.__neptuneCatalogUserReliabilityV146=RELEASE;

document.body.dataset.neptuneCatalogReliability='v146';
new MutationObserver(schedulePatch).observe(document.body,{subtree:true,childList:true});
schedulePatch();

function schedulePatch(){
  clearTimeout(patchTimer);
  patchTimer=setTimeout(applyReliabilityPatch,20);
}

function applyReliabilityPatch(){
  const root=document.querySelector('#studioCatalogCommercialCockpitV145');
  if(!root)return;
  fixCommercialKpis(root);
  fixMenuAccessibility(root);
  fixRelativeVisuals(root);
  root.dataset.catalogUserReliability='v146';
}

function fixCommercialKpis(root){
  const kpis=[...root.querySelectorAll('.v145-kpi')];
  if(!kpis.length||!catalogContext)return;
  const policyMap=new Map((catalogPolicies?.offerPolicies||[]).map(p=>[String(p.offerId),p]));
  const families=(catalogContext.families||[]).filter(family=>family&&family.active!==false&&familyHasVisibleTier(family,policyMap));
  const cityIds=new Set(families.map(f=>String(f.cityId||'')).filter(Boolean));
  const supplierIds=new Set(families.map(f=>String(f.supplierId||'')).filter(Boolean));
  const cityKpi=kpis.find(k=>/Villes actives/i.test(k.textContent||''));
  const supplierKpi=kpis.find(k=>/Fournisseurs actifs/i.test(k.textContent||''));
  if(cityKpi)cityKpi.querySelector('strong').textContent=String(cityIds.size);
  if(supplierKpi)supplierKpi.querySelector('strong').textContent=String(supplierIds.size);
}

function familyHasVisibleTier(family,policyMap){
  return Object.values(family.tiers||{}).some(tier=>{
    if(!tier||tier.active===false)return false;
    const policy=tier.id?policyMap.get(String(tier.id)):null;
    return policy?.visible!==false;
  });
}

function fixMenuAccessibility(root){
  for(const button of root.querySelectorAll('[data-v145-menu="supplier"]')){
    if(!button.hasAttribute('aria-label')){
      const name=button.closest('.v145-supplier')?.querySelector('.v145-supplier-id strong')?.textContent?.trim()||'le fournisseur';
      button.setAttribute('aria-label',`Actions pour ${name}`);
    }
  }
  for(const button of root.querySelectorAll('[data-v145-menu="offer"]')){
    if(!button.hasAttribute('aria-label')){
      const name=button.closest('.v145-offer')?.querySelector('h3')?.textContent?.trim()||'l’offre';
      button.setAttribute('aria-label',`Actions pour ${name}`);
    }
  }
  for(const popover of document.querySelectorAll('.v145-popover')){
    popover.setAttribute('role','menu');
    for(const action of popover.querySelectorAll('button,a'))action.setAttribute('role','menuitem');
  }
}

function fixRelativeVisuals(root){
  if(!catalogContext)return;
  const formatMap=new Map((catalogContext.formats||[]).map(format=>[String(format.id),format]));
  const families=(catalogContext.families||[]).filter(f=>f&&f.active!==false&&familyHasVisibleTier(f,new Map((catalogPolicies?.offerPolicies||[]).map(p=>[String(p.offerId),p]))));
  const cards=[...root.querySelectorAll('.v145-offer')];
  for(const card of cards){
    if(!card.querySelector('.v145-art-fallback'))continue;
    const name=card.querySelector('h3')?.textContent?.trim();
    const family=families.find(f=>(f.formatName||formatMap.get(String(f.formatId))?.name||'')===name);
    const format=family?formatMap.get(String(family.formatId)):null;
    const candidate=[family?.imageUrl,family?.visualUrl,family?.coverUrl,family?.posterUrl,format?.imageUrl,format?.visualUrl,format?.coverUrl,format?.posterUrl,format?.image].find(v=>typeof v==='string'&&v.trim());
    if(!candidate)continue;
    let src='';try{src=new URL(candidate,location.origin).href;}catch{continue;}
    const art=card.querySelector('.v145-art');
    const fallback=card.querySelector('.v145-art-fallback');
    if(!art||!fallback)continue;
    const image=document.createElement('img');image.src=src;image.alt='';image.loading='lazy';
    fallback.replaceWith(image);
  }
}
