import base,{StudioStore,WebTvEncoder} from './entry-v39.js';
import {maintainWebTvV118} from './webtv-control-v118.js';

export {StudioStore,WebTvEncoder};

const PLAYBACK_RELEASE='neptune-webtv-playback-20260815-v119.5';
const PLAYER_SELECTION_RELEASE='neptune-webtv-player-selection-20260815-v119.6';
const MANIFEST_RECOVERY_RELEASE='neptune-webtv-manifest-recovery-20260815-v119.7';
const MANIFEST_RECOVERY_DELAYS=[250,500,900,1400,2200];
const NATIVE_FIRST="if(video.canPlayType('application/vnd.apple.mpegurl'))";
const HLS_FIRST="if((!window.Hls||!window.Hls.isSupported())&&video.canPlayType('application/vnd.apple.mpegurl'))";

export default{
  async fetch(request,env,ctx){
    let response=await base.fetch(request,env,ctx);
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/direct/live/index.m3u8'&&response.status===503){
      response=await recoverLiveManifest(request,env,ctx,response);
    }
    if(request.method==='GET'&&url.pathname==='/direct/'&&response.ok)return normalizeDirectPlayback(response);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)return augmentRelease(response);
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

async function recoverLiveManifest(request,env,ctx,initialResponse){
  let response=initialResponse;
  await maintainWebTvV118(env).catch(()=>null);
  for(let index=0;index<MANIFEST_RECOVERY_DELAYS.length;index+=1){
    await sleep(MANIFEST_RECOVERY_DELAYS[index]);
    response=await base.fetch(request,env,ctx).catch(()=>new Response('Antenne en cours de démarrage',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'1'}}));
    if(response.status!==503)return markRecovery(response,'recovered');
    if(index===1)await maintainWebTvV118(env).catch(()=>null);
  }
  return markRecovery(response,'retry-exhausted');
}

function markRecovery(response,status){
  const headers=new Headers(response.headers);
  headers.set('X-Neptune-WebTV-Recovery',`${MANIFEST_RECOVERY_RELEASE}; ${status}`);
  if(response.status===503){headers.set('Cache-Control','no-store, max-age=0');headers.set('Retry-After','1');}
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

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
  headers.set('X-Neptune-WebTV-Recovery',MANIFEST_RECOVERY_RELEASE);
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
  headers.set('X-Neptune-WebTV-Recovery',MANIFEST_RECOVERY_RELEASE);
  return new Response(JSON.stringify({...current,webTvPlayback:PLAYBACK_RELEASE,webTvPlayerSelection:PLAYER_SELECTION_RELEASE,webTvManifestRecovery:MANIFEST_RECOVERY_RELEASE}),{status:response.status,statusText:response.statusText,headers});
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
