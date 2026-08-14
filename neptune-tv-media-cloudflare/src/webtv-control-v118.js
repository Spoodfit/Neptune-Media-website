import { Container, getContainer } from '@cloudflare/containers';
import { isSameOrigin, json } from './security.js';

const STATE_KEY='webtv/control/state-v118.json';
const LEGACY_STATE_KEY='webtv/control/state-v1.json';
const RUNTIME_KEY='webtv/runtime/status-v118.json';
const LEGACY_RUNTIME_KEY='webtv/runtime/status-v1.json';
const INSTANCE='neptune-webtv-primary';
const STATE_PATH='/api/admin/webtv/state';
const ENCODER_PATH='/api/admin/webtv/encoder';
const ALLOWED_ROLES=new Set(['admin','editor']);
const DEFAULT_YOUTUBE='https://youtube.com/live/-k3rG7R8gtc';
export const WEBTV_V118_RELEASE='neptune-native-webtv-20260814-v118';

export class WebTvEncoder extends Container{
  defaultPort=8080;
  requiredPorts=[8080];
  sleepAfter='5m';
  enableInternet=true;
  onStart(){console.log('webtv_v118_encoder_started');}
  onStop({exitCode,reason}){console.log('webtv_v118_encoder_stopped',{exitCode,reason});}
  onError(error){console.error('webtv_v118_encoder_error',String(error?.message||error));throw error;}
  async onActivityExpired(){
    try{
      const response=await this.containerFetch('http://localhost/health');
      const runtime=await response.json().catch(()=>({}));
      if(response.ok&&['starting','streaming','running','live','reconnecting'].includes(String(runtime.status||''))){this.renewActivityTimeout();return;}
    }catch{}
    await this.stop();
  }
}

export async function handleWebTvV118(request,env,ctx,delegateFetch){
  const url=new URL(request.url);
  if(url.pathname!==STATE_PATH&&url.pathname!==ENCODER_PATH)return null;
  const auth=await verifyStudio(request,env,ctx,delegateFetch);if(!auth.ok)return auth.response;
  if(url.pathname===STATE_PATH){
    if(request.method==='GET')return secure(json(await readState(env)));
    if(request.method!=='PUT')return secure(json({error:'method_not_allowed'},405));
    if(!isSameOrigin(request))return secure(json({error:'origin_forbidden'},403));
    const raw=await request.json().catch(()=>({})),previous=await readState(env),state=normalizeState(raw,auth.user,env);
    if(state.enabled&&!state.playlist.some(item=>item.enabled!==false))return secure(json({error:'webtv_playlist_empty'},409));
    if(state.output.youtube.enabled&&!state.output.youtube.configured)return secure(json({error:'youtube_not_configured',requiredSecrets:['YOUTUBE_RTMPS_URL','YOUTUBE_STREAM_KEY']},409));
    await writeState(env,state);
    if(state.enabled)ctx.waitUntil(maintainWebTvV118(env,{forceRestart:previous.updatedAt!==state.updatedAt}));
    else if(previous.enabled)ctx.waitUntil(stopEncoder(env,'disabled_from_studio'));
    return secure(json(await readState(env)));
  }
  if(request.method!=='POST')return secure(json({error:'method_not_allowed'},405));
  if(!isSameOrigin(request))return secure(json({error:'origin_forbidden'},403));
  const payload=await request.json().catch(()=>({})),action=String(payload.action||'refresh').trim().toLowerCase();
  let state=await readState(env);
  if(action==='stop'){const encoder=await stopEncoder(env,'manual_stop');return secure(json({ok:true,encoder}));}
  if(['youtube_start','youtube_stop'].includes(action)){
    if(action==='youtube_start'&&!youtubeConfigured(env))return secure(json({error:'youtube_not_configured'},409));
    state={...state,output:{...state.output,youtube:{...state.output.youtube,enabled:action==='youtube_start'}},updatedAt:new Date().toISOString(),updatedBy:clean(auth.user?.fullName||auth.user?.email,180)||'Studio Admin'};
    await writeState(env,state);
    if(state.enabled){const encoder=await syncEncoder(env,state,{forceRestart:true});return secure(json({ok:true,state:await readState(env),encoder}));}
    return secure(json({ok:true,state:await readState(env),encoder:state.encoder}));
  }
  if(!state.enabled)return secure(json({error:'webtv_disabled'},409));
  if(!state.playlist.some(item=>item.enabled!==false))return secure(json({error:'webtv_playlist_empty'},409));
  if(!['refresh','restart'].includes(action))return secure(json({error:'invalid_encoder_action'},400));
  const encoder=await syncEncoder(env,state,{forceRestart:action==='restart'});
  return secure(json({ok:true,encoder}));
}

export async function maintainWebTvV118(env,options={}){
  const state=await readState(env);if(!state.enabled)return null;
  if(!state.playlist.some(item=>item.enabled!==false))return writeRuntime(env,runtimeError('webtv_playlist_empty'));
  try{return await syncEncoder(env,state,options);}catch(error){console.error('webtv_v118_maintain_failed',String(error?.message||error));return writeRuntime(env,runtimeError(clean(error?.message||error,500)||'encoder_unreachable'));}
}

export async function publicWebTvStateV118(env){
  const state=await readState(env),active=(state.playlist||[]).filter(item=>item.enabled!==false),current=state.encoder?.currentItem||null;
  let currentIndex=current?active.findIndex(item=>String(item.id)===String(current.id)):-1;if(currentIndex<0)currentIndex=0;
  const next=active.length?active[(currentIndex+1)%active.length]:null;
  const startedAt=current?.startedAt||null,nowMs=Date.now();
  const currentItem=active[currentIndex]||null;
  const durationSeconds=Number(currentItem?.durationSeconds||0);
  const estimatedEndAt=startedAt&&durationSeconds?new Date(Date.parse(startedAt)+durationSeconds*1000).toISOString():null;
  const schedule=[];let cursor=estimatedEndAt?Date.parse(estimatedEndAt):nowMs;
  for(let offset=1;offset<=Math.min(active.length,8);offset+=1){const item=active[(currentIndex+offset)%active.length];if(!item)break;schedule.push({id:item.id,title:item.title,type:item.type,startsAt:new Date(cursor).toISOString(),durationSeconds:Number(item.durationSeconds||0)});cursor+=Number(item.durationSeconds||0)*1000;}
  return {ok:true,release:WEBTV_V118_RELEASE,enabled:state.enabled,mode:'loop',stream:{protocol:'hls',manifestUrl:'/direct/live/index.m3u8',watchUrl:'/direct/'},current:current?{...current,estimatedEndAt}:null,next:next?{id:next.id,title:next.title,type:next.type,durationSeconds:Number(next.durationSeconds||0)}:null,schedule,youtube:{configured:Boolean(state.output?.youtube?.configured),enabled:Boolean(state.output?.youtube?.enabled),watchUrl:state.output?.youtube?.watchUrl||''},encoder:{status:state.encoder?.status||'not_connected',lastHeartbeatAt:state.encoder?.lastHeartbeatAt||null,lastError:state.encoder?.lastError||null,youtubeStatus:state.encoder?.youtubeStatus||'off'}};
}

export async function proxyLiveAssetV118(request,env){
  const url=new URL(request.url),suffix=url.pathname.replace(/^\/direct\/live\/?/u,'');
  if(!/^(index\.m3u8|segment-\d+\.ts)$/u.test(suffix))return new Response('Not found',{status:404});
  const container=getContainer(env.WEBTV_ENCODER,INSTANCE);
  try{
    const upstream=await container.fetch(`http://encoder/live/${suffix}`);
    const headers=new Headers(upstream.headers);headers.set('Access-Control-Allow-Origin','*');headers.set('X-Content-Type-Options','nosniff');headers.set('X-Neptune-WebTV',WEBTV_V118_RELEASE);
    headers.set('Cache-Control',suffix.endsWith('.m3u8')?'no-store, max-age=0':'public, max-age=8');
    return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers});
  }catch{return new Response('Antenne en cours de démarrage',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'2'}});}
}

async function syncEncoder(env,state,{forceRestart=false}={}){
  const container=getContainer(env.WEBTV_ENCODER,INSTANCE);
  const response=await container.fetch('http://encoder/control/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(encoderConfig(env,state,forceRestart))});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`encoder_http_${response.status}`);
  return writeRuntime(env,runtimeFromContainer(data));
}
async function stopEncoder(env,reason){
  const container=getContainer(env.WEBTV_ENCODER,INSTANCE);let runtime={status:'stopped',lastHeartbeatAt:new Date().toISOString(),lastError:null,currentItem:null};
  try{const response=await container.fetch('http://encoder/control/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})}),data=await response.json().catch(()=>({}));runtime=runtimeFromContainer({...data,status:'stopped',lastError:null});}catch{}
  try{await container.stop();}catch{}return writeRuntime(env,runtime);
}
function encoderConfig(env,state,forceRestart){
  return {release:WEBTV_V118_RELEASE,revision:state.updatedAt||new Date().toISOString(),enabled:state.enabled===true,forceRestart:forceRestart===true,mode:'loop',playlist:state.playlist.filter(item=>item.enabled!==false).map(item=>({id:item.id,title:item.title,type:item.type,mediaUrl:absoluteMediaUrl(item.mediaUrl,env),durationSeconds:item.durationSeconds||0})),fallback:{title:state.fallback?.title||'Neptune Media',mediaUrl:absoluteMediaUrl(state.fallback?.mediaUrl,env)},output:{provider:'neptune',protocol:'hls',youtube:{enabled:Boolean(state.output?.youtube?.enabled),ingestUrl:youtubeRtmpsUrl(env),streamKey:String(env.YOUTUBE_STREAM_KEY||'').trim()}},encoding:{width:intEnv(env.WEBTV_WIDTH,1280,640,1920),height:intEnv(env.WEBTV_HEIGHT,720,360,1080),fps:intEnv(env.WEBTV_FPS,30,24,60),videoBitrateKbps:intEnv(env.WEBTV_VIDEO_BITRATE_KBPS,4000,1500,12000),audioBitrateKbps:intEnv(env.WEBTV_AUDIO_BITRATE_KBPS,128,96,320),preset:allowedPreset(env.WEBTV_X264_PRESET)}};
}

async function readState(env){
  const base=defaultState(env),runtime=await readRuntime(env);let object=await env.MEDIA.get(STATE_KEY),parsed=null;
  if(object)parsed=await object.json().catch(()=>null);
  if(!parsed){object=await env.MEDIA.get(LEGACY_STATE_KEY);const legacy=object?await object.json().catch(()=>null):null;if(legacy)parsed=migrateLegacy(legacy,env);}
  if(!parsed)return {...base,encoder:runtime};
  const youtube={...base.output.youtube,...(parsed.output?.youtube||{}),configured:youtubeConfigured(env)};
  return {...base,...parsed,output:{...base.output,...(parsed.output||{}),provider:'neptune',protocol:'hls',configured:true,watchUrl:'/direct/',manifestUrl:'/direct/live/index.m3u8',youtube},encoder:runtime,release:WEBTV_V118_RELEASE};
}
async function writeState(env,state){await env.MEDIA.put(STATE_KEY,JSON.stringify(stripRuntime(state)),{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{release:WEBTV_V118_RELEASE}});}
async function readRuntime(env){let object=await env.MEDIA.get(RUNTIME_KEY);if(!object)object=await env.MEDIA.get(LEGACY_RUNTIME_KEY);if(!object)return defaultRuntime();const parsed=await object.json().catch(()=>null);return parsed&&typeof parsed==='object'?{...defaultRuntime(),...parsed,currentItem:parsed.currentItem&&typeof parsed.currentItem==='object'?parsed.currentItem:null}:defaultRuntime();}
async function writeRuntime(env,runtime){const value={...defaultRuntime(),...runtime,lastHeartbeatAt:validIso(runtime.lastHeartbeatAt)||new Date().toISOString(),lastError:clean(runtime.lastError,500)||null,currentItem:runtime.currentItem&&typeof runtime.currentItem==='object'?{id:clean(runtime.currentItem.id,100),title:clean(runtime.currentItem.title,180),type:clean(runtime.currentItem.type,30),startedAt:validIso(runtime.currentItem.startedAt)}:null};await env.MEDIA.put(RUNTIME_KEY,JSON.stringify(value),{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{release:WEBTV_V118_RELEASE}});return value;}
function runtimeFromContainer(data){return {status:clean(data.status,40)||'starting',lastHeartbeatAt:validIso(data.heartbeatAt)||new Date().toISOString(),lastError:clean(data.lastError,500)||null,currentItem:data.currentItem||null,revision:clean(data.revision,120)||null,ffmpegPid:Number.isFinite(Number(data.ffmpegPid))?Number(data.ffmpegPid):null,uptimeSeconds:Number.isFinite(Number(data.uptimeSeconds))?Number(data.uptimeSeconds):0,youtubeStatus:clean(data.youtubeStatus,40)||'off',youtubeLastError:clean(data.youtubeLastError,500)||null};}
function runtimeError(lastError){return {status:'error',lastHeartbeatAt:new Date().toISOString(),lastError,currentItem:null};}
function defaultRuntime(){return {status:'not_connected',lastHeartbeatAt:null,lastError:null,currentItem:null,revision:null,ffmpegPid:null,uptimeSeconds:0,youtubeStatus:'off',youtubeLastError:null};}
function defaultState(env){const viewer=youtubeViewer(DEFAULT_YOUTUBE);return {release:WEBTV_V118_RELEASE,enabled:false,mode:'loop',output:{provider:'neptune',protocol:'hls',configured:true,watchUrl:'/direct/',manifestUrl:'/direct/live/index.m3u8',youtube:{configured:youtubeConfigured(env),enabled:false,...viewer}},playlist:[],fallback:{title:'Neptune Media — La suite arrive dans un instant',mediaUrl:''},encoder:defaultRuntime(),updatedAt:null,updatedBy:null};}
function migrateLegacy(legacy,env){const viewer=youtubeViewer(legacy.output?.watchUrl||DEFAULT_YOUTUBE);return {...legacy,output:{provider:'neptune',protocol:'hls',configured:true,watchUrl:'/direct/',manifestUrl:'/direct/live/index.m3u8',youtube:{configured:youtubeConfigured(env),enabled:false,...viewer}}};}
function normalizeState(raw,user,env){
  const playlist=Array.isArray(raw.playlist)?raw.playlist.slice(0,250).map((item,index)=>({id:clean(item.id,100)||`item-${index+1}`,title:clean(item.title,180)||`Programme ${index+1}`,mediaUrl:safeMediaUrl(item.mediaUrl,env),durationSeconds:clampNumber(item.durationSeconds,0,12*60*60),type:['episode','jingle','ad','fallback'].includes(item.type)?item.type:'episode',enabled:item.enabled!==false})).filter(item=>item.mediaUrl):[];
  const existingYoutube=raw.output?.youtube||{},viewer=youtubeViewer(existingYoutube.watchUrl||raw.output?.watchUrl||DEFAULT_YOUTUBE);
  return {release:WEBTV_V118_RELEASE,enabled:raw.enabled===true,mode:'loop',output:{provider:'neptune',protocol:'hls',configured:true,watchUrl:'/direct/',manifestUrl:'/direct/live/index.m3u8',youtube:{configured:youtubeConfigured(env),enabled:existingYoutube.enabled===true,...viewer}},playlist,fallback:{title:clean(raw.fallback?.title,180)||'Neptune Media — La suite arrive dans un instant',mediaUrl:safeMediaUrl(raw.fallback?.mediaUrl,env)},encoder:defaultRuntime(),updatedAt:new Date().toISOString(),updatedBy:clean(user.fullName||user.email,180)||'Studio Admin'};
}
function stripRuntime(state){const {encoder,...control}=state;return control;}
async function verifyStudio(request,env,ctx,delegateFetch){const url=new URL(request.url);url.pathname='/api/auth/status';url.search='';const response=await delegateFetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env,ctx);if(!response.ok)return {ok:false,response:secure(json({error:'studio_forbidden'},response.status===401?401:403))};const data=await response.json().catch(()=>({})),user=data.user||{};if(data.authenticated===false||!ALLOWED_ROLES.has(String(user.role||'')))return {ok:false,response:secure(json({error:'studio_forbidden'},403))};return {ok:true,user};}
function youtubeConfigured(env){return Boolean(youtubeRtmpsUrl(env)&&String(env.YOUTUBE_STREAM_KEY||'').trim());}
function youtubeRtmpsUrl(env){const raw=String(env.YOUTUBE_RTMPS_URL||'').trim().replace(/\/$/u,'');if(!raw)return'';try{return new URL(raw).protocol==='rtmps:'?raw:'';}catch{return'';}}
function youtubeViewer(value){const raw=clean(value,500);if(!raw)return{watchUrl:'',videoId:''};try{const url=new URL(raw),host=url.hostname.toLowerCase().replace(/^www\./u,'');let id='';if(host==='youtu.be')id=url.pathname.split('/').filter(Boolean)[0]||'';else if(host==='youtube.com'||host.endsWith('.youtube.com')){if(url.pathname.startsWith('/live/'))id=url.pathname.split('/').filter(Boolean)[1]||'';else if(url.pathname==='/watch')id=url.searchParams.get('v')||'';else if(url.pathname.startsWith('/embed/'))id=url.pathname.split('/').filter(Boolean)[1]||'';}id=clean(id,32);return /^[A-Za-z0-9_-]{11}$/u.test(id)?{watchUrl:`https://youtube.com/live/${id}`,videoId:id}:{watchUrl:'',videoId:''};}catch{return{watchUrl:'',videoId:''};}}
function safeMediaUrl(value,env){const raw=clean(value,2000);if(!raw)return'';const origin=String(env.PUBLIC_ORIGIN||'https://tv.neptunebusiness.com').replace(/\/$/u,'');try{const base=new URL(origin),url=new URL(raw,base);if(url.protocol!=='https:')return'';return url.origin===base.origin?`${url.pathname}${url.search}`:url.toString();}catch{return'';}}
function absoluteMediaUrl(value,env){const raw=safeMediaUrl(value,env);if(!raw)return'';if(/^https:\/\//u.test(raw))return raw;return `${String(env.PUBLIC_ORIGIN||'https://tv.neptunebusiness.com').replace(/\/$/u,'')}${raw.startsWith('/')?'':'/'}${raw}`;}
function intEnv(value,fallback,min,max){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;}
function allowedPreset(value){return ['ultrafast','superfast','veryfast','faster','fast'].includes(String(value||''))?String(value):'superfast';}
function clampNumber(value,min,max){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;}
function clean(value,max=500){return String(value??'').replace(/[\r\n]+/gu,' ').trim().slice(0,max);}
function validIso(value){const d=new Date(value||'');return Number.isNaN(d.getTime())?null:d.toISOString();}
function secure(response){const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('X-Neptune-WebTV',WEBTV_V118_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
