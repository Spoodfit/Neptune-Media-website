const RELEASE='neptune-catalog-user-reliability-v146-20260825';

await import('/studio/studio-catalog-commercial-cockpit-v145.js?v=1');

window.__neptuneCatalogUserReliabilityV146=RELEASE;
document.body.dataset.neptuneCatalogReliability='v146';

const mark=()=>{
  const root=document.querySelector('#studioCatalogCommercialCockpitV145');
  if(root&&(root.querySelector('.v145-offer')||root.querySelector('.v145-empty')))root.dataset.catalogUserReliability='v146';
};

new MutationObserver(mark).observe(document.body,{subtree:true,childList:true});
mark();
