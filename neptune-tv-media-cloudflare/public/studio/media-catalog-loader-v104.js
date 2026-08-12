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
  await waitForAdvancedInitialRender();
  if(currentTab()!==CATALOG_HASH)return;
  if(!document.querySelector('link[data-neptune-media-catalog-v104]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=CATALOG_CSS;
    link.dataset.neptuneMediaCatalogV104='1';
    document.head.append(link);
  }
  await import(CATALOG_MANAGER);
  await importUxWithoutObserverFeedbackLoop();
  document.documentElement.dataset.neptuneMediaCatalog='v104';
}

async function waitForAdvancedInitialRender(){
  const app=document.getElementById('app');
  const content=document.getElementById('content');
  if(!app||!content)return;
  if(app.hidden){
    await new Promise(resolve=>{
      const observer=new MutationObserver(()=>{
        if(app.hidden)return;
        observer.disconnect();
        resolve();
      });
      observer.observe(app,{attributes:true,attributeFilter:['hidden']});
      setTimeout(()=>{observer.disconnect();resolve();},12000);
    });
  }
  if(currentTab()===CATALOG_HASH)await waitForProgramsActivation();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}

async function waitForProgramsActivation(){
  const active=()=>{
    const legacy=document.querySelector('#studioLegacyTabControlsV105 [data-tab="programs"]')||document.querySelector('[data-tab="programs"]');
    return Boolean(legacy?.classList.contains('active'));
  };
  if(active())return;
  await new Promise(resolve=>{
    const observer=new MutationObserver(()=>{
      if(!active())return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve();
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    const timeout=setTimeout(()=>{
      observer.disconnect();
      resolve();
    },4000);
  });
}

async function importUxWithoutObserverFeedbackLoop(){
  const NativeMutationObserver=window.MutationObserver;
  if(typeof NativeMutationObserver!=='function'){
    await import(CATALOG_UX);
    return;
  }

  class StableMutationObserver{
    constructor(callback){
      this.callback=callback;
      this.target=null;
      this.options=null;
      this.connected=false;
      this.native=new NativeMutationObserver((records)=>{
        if(!this.connected)return;
        this.native.disconnect();
        this.connected=false;
        try{this.callback(records,this);}finally{
          queueMicrotask(()=>{
            if(this.target&&!this.connected){
              this.native.observe(this.target,this.options);
              this.connected=true;
            }
          });
        }
      });
    }
    observe(target,options){
      this.target=target;
      this.options=options;
      this.native.observe(target,options);
      this.connected=true;
    }
    disconnect(){
      this.native.disconnect();
      this.connected=false;
      this.target=null;
      this.options=null;
    }
    takeRecords(){return this.native.takeRecords();}
  }

  window.MutationObserver=StableMutationObserver;
  try{await import(CATALOG_UX);}finally{window.MutationObserver=NativeMutationObserver;}
}
