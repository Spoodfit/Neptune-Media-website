const RELEASE='neptune-media-catalog-nav-20260811-v98';
document.body.dataset.mediaCatalogNav=RELEASE;
const sync=()=>{
  document.querySelectorAll('[data-tab="programs"] strong,[data-go="programs"] strong,[data-context-tab="programs"]').forEach((node)=>{node.textContent='Catalogue Media';});
};
sync();
new MutationObserver(sync).observe(document.body,{subtree:true,childList:true});
