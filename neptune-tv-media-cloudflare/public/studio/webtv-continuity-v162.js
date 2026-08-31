const RELEASE='neptune-webtv-continuity-v162';
const LIVE_STATUSES=new Set(['running','live','streaming']);
const CHECK_MS=20000;
const RESTART_COOLDOWN_MS=120000;
const HEARTBEAT_STALE_MS=90000;
let csrfToken=sessionStorage.getItem('neptune_csrf')||'';
let lastRestartAt=0;
let checking=false;

document.documentElement.dataset.neptuneWebtvContinuity='v162';
if(location.pathname.includes('/studio/webtv'))boot();

function boot(){
  const start=()=>{
    ensurePreviewPlayback();
    checkContinuity().catch(()=>{});
    setInterval(()=>checkContinuity().catch(()=>{}),CHECK_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){ensurePreviewPlayback();checkContinuity().catch(()=>{});}});
    new MutationObserver(ensurePreviewPlayback).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','src']});
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
}

function ensurePreviewPlayback(){
  const video=document.getElementById('antennaPreview');
  if(!video||video.hidden||!video.src)return;
  video.muted=true;
  video.playsInline=true;
  video.autoplay=true;
  if(video.paused&&video.readyState>=2)video.play().catch(()=>{});
  else if(video.paused)video.addEventListener('canplay',()=>video.play().catch(()=>{}),{once:true});
}

async function checkContinuity(){
  if(checking)return;
  checking=true;
  try{
    const state=await request('/api/admin/webtv/state',{method:'GET'},false);
    const enabled=state?.enabled===true;
    const configured=state?.output?.configured===true;
    const active=(Array.isArray(state?.playlist)?state.playlist:[]).filter(item=>item?.enabled!==false);
    const status=String(state?.encoder?.status||'not_connected').toLowerCase();
    const heartbeat=Date.parse(state?.encoder?.lastHeartbeatAt||'');
    const stale=Number.isFinite(heartbeat)?Date.now()-heartbeat>HEARTBEAT_STALE_MS:true;
    const shouldRun=enabled&&configured&&active.length>0;
    const healthy=LIVE_STATUSES.has(status)&&!stale;

    document.documentElement.dataset.webtvContinuityState=shouldRun?(healthy?'healthy':'recovering'):'idle';
    if(!shouldRun||healthy)return;
    if(Date.now()-lastRestartAt<RESTART_COOLDOWN_MS)return;

    lastRestartAt=Date.now();
    await ensureCsrf();
    await request('/api/admin/webtv/encoder',{method:'POST',body:JSON.stringify({action:'restart'})},true);
    const sync=document.getElementById('syncState');
    if(sync)sync.innerHTML='<i></i> Reprise automatique…';
    setTimeout(ensurePreviewPlayback,2500);
  }finally{checking=false;}
}

async function ensureCsrf(){
  if(csrfToken)return;
  const auth=await request('/api/auth/status',{method:'GET'},false);
  csrfToken=String(auth?.csrfToken||'');
  if(csrfToken)sessionStorage.setItem('neptune_csrf',csrfToken);
}

async function request(url,options={},needsCsrf=false){
  const headers={Accept:'application/json',...(options.headers||{})};
  if(options.body)headers['Content-Type']='application/json';
  if(needsCsrf&&csrfToken)headers['x-csrf-token']=csrfToken;
  let response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers});
  if(needsCsrf&&response.status===403){
    csrfToken='';
    sessionStorage.removeItem('neptune_csrf');
    await ensureCsrf();
    if(csrfToken)headers['x-csrf-token']=csrfToken;
    response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers});
  }
  if(!response.ok)throw new Error(`http_${response.status}`);
  return response.json().catch(()=>({}));
}

window.__neptuneWebtvContinuityV162={release:RELEASE,checkContinuity,ensurePreviewPlayback};
