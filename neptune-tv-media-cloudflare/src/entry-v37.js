import base,{StudioStore,WebTvEncoder} from './entry-v36.js';

export {StudioStore,WebTvEncoder};

const WEBTV_UI='/studio/webtv-v1.js';
const RELEASE='neptune-studio-runtime-recovery-20260813-v115';

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname===WEBTV_UI){
      return hardenWebTvUi(await base.fetch(request,env,ctx));
    }
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&isWebTvPage(url.pathname)&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await rewriteWebTvPage(response);
    }
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      response=await augmentRelease(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

async function hardenWebTvUi(response){
  if(!response.ok)return response;
  const contentType=response.headers.get('Content-Type')||'';
  if(!contentType.includes('javascript')&&!contentType.includes('text/plain'))return response;

  let body=await response.text();
  body=required(body,'let importedMedia=[];',`let importedMedia=[];\nlet controlDegraded=false;`,'degraded state');
  body=required(body,'\ninit();\n','\ninitV115();\n','v115 init');
  body=required(body,'if(!item?.mediaUrl||!control)return false;','if(!item?.mediaUrl||!control||controlDegraded)return false;','import guard');
  body=required(body,"$('#restartEncoder').disabled=!control.enabled||!control.output?.configured||list.length===0;","$('#restartEncoder').disabled=controlDegraded||!control.enabled||!control.output?.configured||list.length===0;",'encoder guard');
  body=required(body,"function updateApplyState(){\n  const button=$('#save');if(!button||!control)return;",`function updateApplyState(){\n  const button=$('#save');if(!button||!control)return;\n  if(controlDegraded){button.disabled=true;button.textContent='Régie à reconnecter';$('#syncState').textContent='Régie indisponible';return;}`,'apply guard');
  body=required(body,"async function save(){\n  const button=$('#save');",`async function save(){\n  if(controlDegraded){toast('La régie doit être reconnectée avant de publier un programme.',true);return;}\n  const button=$('#save');`,'save guard');
  body=required(body,"  hydrateThumbnails($('#library'));\n  $$('[data-add]').forEach(button=>button.addEventListener('click',()=>{",`  hydrateThumbnails($('#library'));\n  if(controlDegraded){\n    $('#libraryHint').textContent+=' La régie doit être reconnectée avant de modifier le programme.';\n    $$('[data-add]').forEach(button=>{button.disabled=true;button.title='Reconnectez la régie avant de modifier le programme';});\n  }\n  $$('[data-add]').forEach(button=>button.addEventListener('click',()=>{`,'degraded library guard');
  body=required(body,"window.addEventListener('beforeunload',()=>{if(runtimePoll)clearInterval(runtimePoll);});",`${recoveryRuntime()}\nwindow.addEventListener('beforeunload',()=>{if(runtimePoll)clearInterval(runtimePoll);});`,'recovery runtime');

  const requiredMarkers=['initV115();','Promise.allSettled','controlDegraded','retryWebTvStateV115','refreshRuntimeV115','Régie indisponible','Reconnectez la régie avant de modifier le programme'];
  for(const marker of requiredMarkers)if(!body.includes(marker))throw new Error(`webtv_v115_transform_missing:${marker}`);

  const headers=rewrittenHeaders(response);
  headers.set('Content-Type','application/javascript; charset=utf-8');
  headers.set('X-Neptune-WebTV-Runtime',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function rewriteWebTvPage(response){
  let body=await response.text();
  body=required(body,'/studio/webtv-v1.js?v=6','/studio/webtv-v1.js?v=7','webtv cache bust');
  const headers=rewrittenHeaders(response);
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('X-Neptune-WebTV-Runtime',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function recoveryRuntime(){
  return String.raw`
async function initV115(){
  try{
    const auth=await api('/api/auth/status',{},false);
    if(auth.authenticated===false||!['admin','editor'].includes(String(auth.user?.role||'')))throw new Error('http_403');
    csrfToken=auth.csrfToken||csrfToken;
    if(csrfToken)sessionStorage.setItem('neptune_csrf',csrfToken);

    const [studioResult,webtvResult]=await Promise.allSettled([
      api('/api/admin/state',{},false),
      retryWebTvStateV115(),
    ]);

    studioState=studioResult.status==='fulfilled'
      ? studioResult.value
      : {user:auth.user||{},episodes:[],ads:[]};

    if(webtvResult.status==='fulfilled'){
      control=webtvResult.value;
      controlDegraded=false;
    }else{
      control=degradedControlV115();
      controlDegraded=true;
      console.error('[Neptune Studio] Régie WebTV indisponible',webtvResult.reason);
    }

    const user=studioState.user||auth.user||{};
    const accountName=$('#accountName');
    const accountRole=$('#accountRole');
    if(accountName)accountName.textContent=user.fullName||user.email||'Compte Studio';
    if(accountRole)accountRole.textContent=user.displayRole||user.role||'Admin';
    bind();
    installRefreshRecoveryV115();
    render();
    setDirty(false);

    if(studioResult.status==='rejected'){
      toast('Le catalogue Studio est temporairement indisponible. La régie reste accessible.',true);
    }
    if(controlDegraded){
      $('#syncState').textContent='Régie indisponible · réessayer';
      toast('La régie ne répond pas. Les contenus Studio restent accessibles ; utilisez Actualiser pour vous reconnecter.',true);
    }

    if(runtimePoll)clearInterval(runtimePoll);
    runtimePoll=setInterval(refreshRuntimeV115,15000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshRuntimeV115();});
  }catch(error){
    const authError=error.message==='http_401'||error.message==='http_403'||error.message==='studio_forbidden';
    $('#syncState').textContent=authError?'Connexion requise':'Régie indisponible';
    toast(authError?'Accès Studio requis.':'Impossible de charger le Studio.',true);
    console.error('[Neptune Studio] Initialisation Diffusion impossible',error);
  }
}

async function retryWebTvStateV115(){
  let lastError=null;
  for(const delay of [0,350,900]){
    if(delay)await waitV115(delay);
    try{return await api('/api/admin/webtv/state',{},false);}catch(error){lastError=error;}
  }
  throw lastError||new Error('webtv_state_unavailable');
}

function installRefreshRecoveryV115(){
  const current=$('#refreshState');
  if(!current||current.dataset.runtimeV115==='1')return;
  const replacement=current.cloneNode(true);
  replacement.dataset.runtimeV115='1';
  current.replaceWith(replacement);
  replacement.addEventListener('click',refreshRuntimeV115);
}

async function refreshRuntimeV115(){
  if(!control)return;
  const button=$('#refreshState');
  if(button){button.disabled=true;button.textContent='Actualisation…';}
  try{
    const latest=await retryWebTvStateV115();
    const recovered=controlDegraded;
    controlDegraded=false;
    if(dirty){
      control={...control,output:latest.output||control.output,encoder:latest.encoder||control.encoder};
      renderSummary();renderEncoder();
    }else{
      control=latest;
      render();
      setDirty(false);
    }
    if(recovered)toast('Régie reconnectée. Le programme enregistré est de nouveau synchronisé.');
  }catch(error){
    controlDegraded=true;
    $('#syncState').textContent='Régie indisponible · réessayer';
    updateApplyState();
    console.error('[Neptune Studio] Actualisation WebTV impossible',error);
  }finally{
    if(button){button.disabled=false;button.textContent='Actualiser';}
  }
}

function degradedControlV115(){
  return {
    release:'degraded-v115',
    enabled:false,
    mode:'loop',
    output:{provider:'youtube',protocol:'rtmps',configured:false,watchUrl:'',videoId:''},
    playlist:[],
    fallback:{title:'Neptune Media — La suite arrive dans un instant',mediaUrl:''},
    encoder:{status:'not_connected',lastHeartbeatAt:null,lastError:'webtv_state_unavailable',currentItem:null},
  };
}

function waitV115(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
`;
}

function required(body,needle,replacement,label){
  if(!body.includes(needle))throw new Error(`webtv_v115_source_contract_changed:${label}`);
  return body.replace(needle,replacement);
}

function rewrittenHeaders(response){
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified','Content-Range','Accept-Ranges'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  return headers;
}

function isWebTvPage(path){return path==='/studio/webtv'||path==='/studio/webtv/'||path==='/studio/webtv.html';}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,studioRuntimeRecovery:RELEASE}),{
    status:response.status,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
  });
}
