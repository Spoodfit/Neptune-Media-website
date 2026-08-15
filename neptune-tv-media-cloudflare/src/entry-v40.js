import base,{StudioStore,WebTvEncoder} from './entry-v39.js';

export {StudioStore,WebTvEncoder};

const PLAYBACK_RELEASE='neptune-webtv-playback-20260815-v119.5';

export default{
  async fetch(request,env,ctx){
    const response=await base.fetch(request,env,ctx);
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/direct/'&&response.ok)return allowHlsWorker(response);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)return augmentRelease(response);
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

function allowHlsWorker(response){
  const headers=new Headers(response.headers);
  const directives=(headers.get('Content-Security-Policy')||"default-src 'self'")
    .split(';')
    .map(value=>value.trim())
    .filter(Boolean);
  upsertDirective(directives,'worker-src',["'self'",'blob:']);
  upsertDirective(directives,'child-src',["'self'",'blob:']);
  headers.set('Content-Security-Policy',directives.join('; '));
  headers.set('X-Neptune-WebTV-Playback',PLAYBACK_RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
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
  return new Response(JSON.stringify({...current,webTvPlayback:PLAYBACK_RELEASE}),{status:response.status,statusText:response.statusText,headers});
}
