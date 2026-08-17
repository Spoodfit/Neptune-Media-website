import {getContainer} from '@cloudflare/containers';
import base,{StudioStore,WebTvEncoder} from './entry-v39.js';
import {maintainWebTvV118} from './webtv-control-v118.js';

export {StudioStore,WebTvEncoder};

const PLAYBACK_RELEASE='neptune-webtv-playback-20260815-v119.5';
const PLAYER_SELECTION_RELEASE='neptune-webtv-player-selection-20260815-v119.6';
const CONTAINER_READINESS_RELEASE='neptune-webtv-container-readiness-20260817-v119.7';
const WEBTV_INSTANCE='neptune-webtv-primary';
const NATIVE_FIRST="if(video.canPlayType('application/vnd.apple.mpegurl'))";
const HLS_FIRST="if((!window.Hls||!window.Hls.isSupported())&&video.canPlayType('application/vnd.apple.mpegurl'))";

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&isLiveAsset(url.pathname))return resilientLiveFetch(request,env,ctx,url.pathname);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/direct/'&&response.ok)return normalizeDirectPlayback(response);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)return augmentRelease(response);
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

async function resilientLiveFetch(request,env,ctx,pathname){
  const manifest=pathname.endsWith('/index.m3u8');
  let response=await base.fetch(request,env,ctx);
  let retries=0;
  if(!retryableLiveResponse(response,manifest))return markLiveResponse(response,retries);

  const container=getContainer(env.WEBTV_ENCODER,WEBTV_INSTANCE);
  try{
    await container.startAndWaitForPorts({
      cancellationOptions:{instanceGetTimeoutMS:3000,portReadyTimeoutMS:8000,waitInterval:200},
    });
  }catch(error){
    console.warn('webtv_v1197_container_readiness_failed',String(error?.message||error));
  }

  try{
    await maintainWebTvV118(env);
  }catch(error){
    console.warn('webtv_v1197_state_resync_failed',String(error?.message||error));
  }

  const delays=manifest?[150,300,600,1200,2000,3000]:[100,200,400,800];
  for(const delay of delays){
    await sleep(delay);
    retries+=1;
    response=await base.fetch(request,env,ctx);
    if(!retryableLiveResponse(response,manifest))return markLiveResponse(response,retries);
  }
  return markLiveResponse(response,retries);
}

function retryableLiveResponse(response,manifest){
  if([502,503,504].includes(response.status))return true;
  return manifest&&[404,425].includes(response.status);
}

function markLiveResponse(response,retries){
  const headers=new Headers(response.headers);
  headers.set('X-Neptune-WebTV-Readiness',CONTAINER_READINESS_RELEASE);
  headers.set('X-Neptune-WebTV-Retries',String(retries));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function isLiveAsset(pathname){return /^\/direct\/live\/(?:index\.m3u8|segment-\d+\.ts)$/u.test(pathname);}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function normalizeDirectPlayback(response){
  let body=await response.text();
  if(body.includes(NATIVE_FIRST))body=body.replace(NATIVE_FIRST,HLS_FIRST);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  const directives=(headers.get('Content-Security-Policy')||"default-src 'self'")
    .split(';')
    .map(value=>value.trim())
    .filter(Boolean);
  upsertDirective(directives,'worker-src',["'self'",'blob:']);
  upsertDirective(directives,'child-src',["'self'",'blob:']);
  headers.set('Content-Security-Policy',directives.join('; '));
  headers.set('Cache-Control','no-store, max-age=0');
  headers.set('X-Neptune-WebTV-Playback',PLAYBACK_RELEASE);
  headers.set('X-Neptune-WebTV-Player',PLAYER_SELECTION_RELEASE);
  headers.set('X-Neptune-WebTV-Readiness',CONTAINER_READINESS_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function upsertDirective(directives,name,values){
  const index=directives.findIndex(value=>value===name||value.startsWith(`${name} `));
  if(index<0){directives.push(`${name} ${values.join(' ')}`);return;}
  const tokens=directives[index].split(/\s+/u);
  for(const value of values)if(!tokens.includes(value))tokens.push(value);
  directives[index]=tokens.join(' ');
}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-WebTV-Playback',PLAYBACK_RELEASE);
  headers.set('X-Neptune-WebTV-Player',PLAYER_SELECTION_RELEASE);
  headers.set('X-Neptune-WebTV-Readiness',CONTAINER_READINESS_RELEASE);
  return new Response(JSON.stringify({...current,webTvPlayback:PLAYBACK_RELEASE,webTvPlayerSelection:PLAYER_SELECTION_RELEASE,webTvContainerReadiness:CONTAINER_READINESS_RELEASE}),{status:response.status,statusText:response.statusText,headers});
}
