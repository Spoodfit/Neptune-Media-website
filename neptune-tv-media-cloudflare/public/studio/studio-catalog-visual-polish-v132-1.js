const RELEASE='neptune-studio-catalog-visual-polish-20260820-v132.1';

boot();

function boot(){
  window.__neptuneStudioCatalogVisualPolishV1321=RELEASE;
  clean();
  let scheduled=false;
  new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;clean();});
  }).observe(document.body,{subtree:true,childList:true});
}

function clean(){
  document.querySelectorAll('.v132-city-overlay>span,.v132-city-badge').forEach(node=>{
    for(const child of node.childNodes){
      if(child.nodeType===Node.TEXT_NODE&&child.textContent.includes('⌖'))child.textContent=child.textContent.replaceAll('⌖','').trimStart();
    }
  });
  document.querySelectorAll('.v132-structure-title>i,.v132-place-item>i').forEach(node=>{
    if(node.textContent.includes('⌖'))node.textContent='•';
  });
}
