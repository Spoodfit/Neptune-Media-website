const CATALOG_HASH='programs';
const CATALOG_CSS='/studio/media-catalog-manager-v98.css?v=1';
const CATALOG_MANAGER='/studio/media-catalog-manager-v98.js?v=2';
const CATALOG_UX='/studio/media-catalog-ux-v99.js?v=1';
const ADMIN_TIMEOUT_MS=10000;
const AUTH_TIMEOUT_MS=5000;
const PUBLIC_PREVIEW_TIMEOUT_MS=3500;
const MANAGER_SETTLE_TIMEOUT_MS=12000;
let loading=null;
let catalogFetchGuardInstalled=false;

loadForRoute();
window.addEventListener('hashchange',loadForRoute);

function currentTab(){
  return decodeURIComponent(location.hash.slice(1)).trim();
}

function loadForRoute(){
  if(currentTab()!==CATALOG_HASH)return;
  loading??=loadCatalog().catch(error=>{
    loading=null;
    showBootstrapError(error);
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

  installCatalogFetchGuard();
  await import(CATALOG_MANAGER);
  const state=await waitForManagerState();
  if(state!=='ready')return;
  await importUxWithoutObserverFeedbackLoop();
  document.documentElement.dataset.neptuneMediaCatalog='v108';
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
        clearTimeout(timeout);
        resolve();
      });
      observer.observe(app,{attributes:true,attributeFilter:['hidden']});
      const timeout=setTimeout(()=>{observer.disconnect();resolve();},15000);
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
    },5000);
  });
}

function installCatalogFetchGuard(){
  if(catalogFetchGuardInstalled)return;
  catalogFetchGuardInstalled=true;
  const nativeFetch=window.fetch.bind(window);

  window.fetch=async(input,init={})=>{
    const raw=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'');
    const url=new URL(raw||location.href,location.href);

    if(url.pathname==='/api/reservation/catalog-v96'){
      try{
        return await timedFetch(nativeFetch,input,init,PUBLIC_PREVIEW_TIMEOUT_MS);
      }catch(error){
        console.warn('[Neptune Studio] Aperçu public indisponible, catalogue admin conservé',error);
        return new Response(JSON.stringify({ok:false,cities:[],pricing:{},previewUnavailable:true}),{
          status:200,
          headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
        });
      }
    }

    if(url.pathname.startsWith('/api/admin/media-catalog-v98/')){
      return catalogAdminFetch(nativeFetch,input,init);
    }

    return nativeFetch(input,init);
  };
}

async function catalogAdminFetch(nativeFetch,input,init={}){
  const first=await timedFetch(nativeFetch,input,withCsrf(init),ADMIN_TIMEOUT_MS);
  if(first.status!==403)return first;

  const payload=await first.clone().json().catch(()=>({}));
  if(payload?.error!=='csrf_failed')return first;

  const csrf=await refreshStudioCsrf(nativeFetch);
  if(!csrf)return first;
  return timedFetch(nativeFetch,input,withCsrf(init,csrf),ADMIN_TIMEOUT_MS);
}

function withCsrf(init={},forcedToken=''){
  const headers=new Headers(init.headers||{});
  const csrf=forcedToken||sessionStorage.getItem('neptune_csrf')||'';
  if(csrf)headers.set('X-CSRF-Token',csrf);
  return {...init,headers,credentials:'same-origin'};
}

async function refreshStudioCsrf(nativeFetch){
  try{
    const response=await timedFetch(nativeFetch,'/api/auth/status',{method:'GET',credentials:'same-origin'},AUTH_TIMEOUT_MS);
    if(!response.ok)return '';
    const data=await response.json().catch(()=>({}));
    const csrf=String(data?.csrfToken||'');
    if(csrf)sessionStorage.setItem('neptune_csrf',csrf);
    return csrf;
  }catch(error){
    console.warn('[Neptune Studio] Impossible de renouveler le jeton Catalogue Media',error);
    return '';
  }
}

async function timedFetch(nativeFetch,input,init,timeoutMs){
  const controller=new AbortController();
  const upstream=init?.signal;
  const relay=()=>controller.abort(upstream?.reason);
  if(upstream){
    if(upstream.aborted)relay();
    else upstream.addEventListener('abort',relay,{once:true});
  }
  const timeout=setTimeout(()=>controller.abort('catalog_timeout'),timeoutMs);
  try{
    return await nativeFetch(input,{...init,signal:controller.signal,credentials:init?.credentials||'same-origin'});
  }catch(error){
    if(controller.signal.aborted&&!upstream?.aborted)throw new Error('Le catalogue met trop de temps à répondre. Réessayez.');
    throw error;
  }finally{
    clearTimeout(timeout);
    upstream?.removeEventListener?.('abort',relay);
  }
}

function waitForManagerState(){
  const content=document.getElementById('content');
  if(!content)return Promise.resolve('missing');
  const state=()=>content.dataset.c98==='ready'?'ready':content.querySelector('.c98-error')?'error':'';
  const immediate=state();
  if(immediate)return Promise.resolve(immediate);
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(value);
    };
    const observer=new MutationObserver(()=>{
      const value=state();
      if(value)finish(value);
    });
    observer.observe(content,{subtree:true,childList:true,attributes:true,attributeFilter:['data-c98']});
    const timeout=setTimeout(()=>{
      if(state())return finish(state());
      content.dataset.c98='';
      content.innerHTML='<div class="c98-error"><strong>Le catalogue ne répond pas.</strong><p>Le chargement a été interrompu pour éviter de laisser Réglages bloqué.</p><button class="c98-button" id="catalogBootstrapRetry" type="button">Réessayer</button></div>';
      content.querySelector('#catalogBootstrapRetry')?.addEventListener('click',()=>location.reload());
      finish('timeout');
    },MANAGER_SETTLE_TIMEOUT_MS);
  });
}

function showBootstrapError(error){
  const content=document.getElementById('content');
  if(!content||content.querySelector('.c98-error'))return;
  const message=String(error?.message||'Une erreur est survenue.');
  content.innerHTML=`<div class="c98-error"><strong>Le catalogue ne peut pas être chargé.</strong><p>${escapeHtml(message)}</p><button class="c98-button" id="catalogBootstrapRetry" type="button">Réessayer</button></div>`;
  content.querySelector('#catalogBootstrapRetry')?.addEventListener('click',()=>location.reload());
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/gu,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
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
