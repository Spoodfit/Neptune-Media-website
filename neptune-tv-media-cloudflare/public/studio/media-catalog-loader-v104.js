const CATALOG_HASH='programs';
const CATALOG_CSS='/studio/media-catalog-manager-v98.css?v=1';
const CATALOG_MANAGER='/studio/media-catalog-manager-v98.js?v=1';
const CATALOG_UX='/studio/media-catalog-ux-v99.js?v=1';
let loading=null;

loadForRoute();
window.addEventListener('hashchange',loadForRoute);

function currentTab(){
  return decodeURIComponent(location.hash.slice(1)).trim();
}

function loadForRoute(){
  if(currentTab()!==CATALOG_HASH)return;
  loading??=loadCatalog().catch(error=>{
    loading=null;
    console.error('[Neptune Studio] Catalogue Media non chargé',error);
  });
}

async function loadCatalog(){
  if(!document.querySelector('link[data-neptune-media-catalog-v104]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=CATALOG_CSS;
    link.dataset.neptuneMediaCatalogV104='1';
    document.head.append(link);
  }
  await import(CATALOG_MANAGER);
  await import(CATALOG_UX);
  document.documentElement.dataset.neptuneMediaCatalog='v104';
}
