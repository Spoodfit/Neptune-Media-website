const RELEASE='neptune-studio-passage-session-20260823-v141';
const PROTECTED_PASSAGE_ENDPOINTS=new Set([
  '/api/admin/media-catalog-v98/context',
  '/api/admin/client-order',
]);

document.documentElement.dataset.neptunePassageSessionGuard=RELEASE;

if(!window.__neptunePassageSessionGuardV141){
  window.__neptunePassageSessionGuardV141=true;
  // Prevent the older v140 compatibility guard from wrapping fetch a second time.
  window.__neptunePassageSessionGuardV140=true;
  installPassageSessionGuard();
  installPassageLoadingGuard();
}

function installPassageSessionGuard(){
  const nativeFetch=window.fetch.bind(window);
  let refreshPromise=null;

  window.fetch=async(input,init={})=>{
    const url=requestUrl(input);
    const method=String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase();
    if(!url||url.origin!==location.origin||method!=='POST'||!PROTECTED_PASSAGE_ENDPOINTS.has(url.pathname)){
      return nativeFetch(input,init);
    }

    const replayInput=input instanceof Request?input.clone():input;
    let csrf=String(sessionStorage.getItem('neptune_csrf')||'').trim();
    if(!csrf)csrf=await refreshStudioCsrf();

    const first=await nativeFetch(input,withCsrf(input,init,csrf));
    if(first.status!==403)return first;

    const problem=await first.clone().json().catch(()=>({}));
    if(problem?.error!=='csrf_failed')return first;

    sessionStorage.removeItem('neptune_csrf');
    csrf=await refreshStudioCsrf(true);
    if(!csrf)return first;

    return nativeFetch(replayInput,withCsrf(replayInput,init,csrf));
  };

  function refreshStudioCsrf(force=false){
    if(!force){
      const cached=String(sessionStorage.getItem('neptune_csrf')||'').trim();
      if(cached)return Promise.resolve(cached);
    }
    if(refreshPromise)return refreshPromise;

    refreshPromise=(async()=>{
      try{
        const response=await nativeFetch('/api/auth/status',{
          method:'GET',
          headers:{Accept:'application/json'},
          credentials:'same-origin',
          cache:'no-store',
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok||data?.authenticated===false||!data?.user)return'';
        const token=String(data?.csrfToken||'').trim();
        if(token)sessionStorage.setItem('neptune_csrf',token);
        return token;
      }catch(error){
        console.warn('[Neptune Studio] renouvellement de la session Passage impossible',error);
        return'';
      }finally{
        refreshPromise=null;
      }
    })();
    return refreshPromise;
  }
}

function withCsrf(input,init,csrf){
  const headers=new Headers(input instanceof Request?input.headers:undefined);
  new Headers(init?.headers||{}).forEach((value,key)=>headers.set(key,value));
  if(csrf)headers.set('X-CSRF-Token',csrf);
  return {...init,headers,credentials:'same-origin'};
}

function requestUrl(input){
  try{
    const raw=input instanceof Request?input.url:input instanceof URL?input.href:String(input||'');
    return new URL(raw,location.href);
  }catch{return null;}
}

function installPassageLoadingGuard(){
  let observer=null;
  let queued=false;

  const sync=()=>{
    queued=false;
    const wizard=document.getElementById('passageWizardV118');
    if(!wizard)return;

    const next=document.getElementById('wizardNextV118');
    const create=document.getElementById('wizardCreateV118');
    const steps=document.getElementById('wizardStepsV118');
    const empty=document.querySelector('#wizardBodyV118 .wizard-empty');
    const failed=Boolean(empty);
    const ready=Boolean(steps?.children?.length)&&!failed;

    // Do not disable navigation while the wizard is merely between render states.
    // Only change controls when the UI state is unambiguous.
    if(failed){
      if(next)next.disabled=true;
      if(create)create.disabled=true;
    }else if(ready){
      if(next)next.disabled=false;
      if(create&&!create.hidden)create.disabled=false;
    }

    if(!failed)return;
    if(empty.querySelector('[data-passage-retry-v141]'))return;

    const retry=document.createElement('button');
    retry.type='button';
    retry.className='secondary';
    retry.dataset.passageRetryV141='1';
    retry.textContent='Réessayer';
    retry.addEventListener('click',()=>location.reload());
    empty.append(retry);
  };

  const schedule=()=>{
    if(queued)return;
    queued=true;
    queueMicrotask(sync);
  };

  const start=()=>{
    if(observer)return;
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
    schedule();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
