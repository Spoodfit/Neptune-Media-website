import base,{StudioStore,WebTvEncoder} from './entry-v40.js';

export {StudioStore,WebTvEncoder};

const RELEASE='neptune-webtv-smoothness-20260819-v124';
const OLD_HLS="hls=new Hls({liveSyncDurationCount:3,liveMaxLatencyDurationCount:8,maxBufferLength:20});";
const NEW_HLS="hls=new Hls({enableWorker:true,lowLatencyMode:false,liveSyncDurationCount:5,liveMaxLatencyDurationCount:12,maxBufferLength:36,maxMaxBufferLength:60,backBufferLength:24,maxBufferHole:.7,nudgeOffset:.15,nudgeMaxRetry:5,highBufferWatchdogPeriod:3,startFragPrefetch:true});";
const OLD_ERROR="hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal){setTimeout(()=>{try{hls.destroy()}catch{}hls=null;player();},1800);}});";
const NEW_ERROR="hls.on(Hls.Events.ERROR,(_,data)=>{if(!data.fatal)return;if(data.type===Hls.ErrorTypes.NETWORK_ERROR){try{hls.startLoad()}catch{}return;}if(data.type===Hls.ErrorTypes.MEDIA_ERROR){try{hls.recoverMediaError()}catch{}return;}setTimeout(()=>{try{hls.destroy()}catch{}hls=null;player();},1600);});";
const OLD_EVENTS="video.addEventListener('playing',()=>state.hidden=true);video.addEventListener('waiting',()=>{if(first)state.hidden=false;});";
const NEW_EVENTS="video.addEventListener('playing',()=>state.hidden=true);video.addEventListener('stalled',()=>{if(hls){try{hls.startLoad(-1)}catch{}}});video.addEventListener('waiting',()=>{if(first)state.hidden=false;});";

export default{
  async fetch(request,env,ctx){
    const response=await base.fetch(request,env,ctx);
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/direct/'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html'))return tuneDirect(response);
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

async function tuneDirect(response){
  let body=await response.text();
  const applied=[];
  if(body.includes(OLD_HLS)){body=body.replace(OLD_HLS,NEW_HLS);applied.push('buffer');}
  if(body.includes(OLD_ERROR)){body=body.replace(OLD_ERROR,NEW_ERROR);applied.push('recovery');}
  if(body.includes(OLD_EVENTS)){body=body.replace(OLD_EVENTS,NEW_EVENTS);applied.push('stall');}
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','no-store, max-age=0');
  headers.set('X-Neptune-WebTV-Smoothness',`${RELEASE}; ${applied.join(',')||'upstream-player'}`);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
