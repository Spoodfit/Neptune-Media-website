import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v46.js';
import {CLIENT_RESERVATION_TRUTH_V179_RELEASE,projectClientReservationTruthV179} from './reservation-client-projection-v179.js';

export {WebTvEncoder};

const RELEASE='neptune-reservation-finalization-20260904-v179';
const TUNNEL_RUNTIME='/reserver/assets/tunnel-runtime-v179.js?v=20260904-1';
const CLIENT_TRUTH='/espace-client/client-reservation-truth-v179.js?v=20260904-1';
const LEGACY_TUNNEL_SCRIPTS=[
  '/reserver/assets/sales-experience-v165.js',
  '/reserver/assets/sales-experience-v166.js',
  '/reserver/assets/tunnel-copy-v175.js',
  '/reserver/assets/tunnel-conversion-v176.js',
];
const LEGACY_TUNNEL_STYLES=['/reserver/assets/sales-experience-v165.css'];

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    const response=await super.fetch(request);
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/portal/session'&&response.ok)return projectClientReservationTruthV179(response);
    return response;
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    const type=response.headers.get('Content-Type')||'';
    if(request.method==='GET'&&response.ok&&type.includes('text/html')){
      if(isReservation(url.pathname))response=await finalizeReservationDocument(response);
      else if(isClient(url.pathname))response=await injectClientTruth(response);
    }
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)response=await augmentRelease(response);
    return mark(response);
  },
  scheduled(controller,env,ctx){return typeof base.scheduled==='function'?base.scheduled(controller,env,ctx):undefined;},
};

async function finalizeReservationDocument(response){
  let body=await response.text();
  for(const asset of LEGACY_TUNNEL_SCRIPTS)body=removeAsset(body,'script',asset);
  for(const asset of LEGACY_TUNNEL_STYLES)body=removeAsset(body,'link',asset);
  body=removeAsset(body,'script',TUNNEL_RUNTIME.split('?')[0]);
  body=body.replace('</body>',`<script src="${TUNNEL_RUNTIME}"></script></body>`);
  const headers=rewritten(response);
  headers.set('X-Neptune-Reservation-Finalization',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function injectClientTruth(response){
  let body=await response.text();
  body=removeAsset(body,'script',CLIENT_TRUTH.split('?')[0]);
  body=body.replace('</body>',`<script src="${CLIENT_TRUTH}"></script></body>`);
  const headers=rewritten(response);
  headers.set('X-Neptune-Client-Reservation-Truth',CLIENT_RESERVATION_TRUTH_V179_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function augmentRelease(response){
  const data=await response.json().catch(()=>({}));
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-Reservation-Finalization',RELEASE);
  headers.set('X-Neptune-Client-Reservation-Truth',CLIENT_RESERVATION_TRUTH_V179_RELEASE);
  return new Response(JSON.stringify({...data,reservationFinalization:RELEASE,clientReservationTruth:CLIENT_RESERVATION_TRUTH_V179_RELEASE,reservationTunnelRuntime:'v179'}),{status:response.status,statusText:response.statusText,headers});
}

function mark(response){
  const headers=new Headers(response.headers);
  headers.set('X-Neptune-Reservation-Finalization',RELEASE);
  headers.set('X-Neptune-Client-Reservation-Truth',CLIENT_RESERVATION_TRUTH_V179_RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function rewritten(response){const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);headers.set('Cache-Control','private, no-store, max-age=0');return headers;}
function isReservation(path){return path==='/reserver'||path==='/reserver/';}
function isClient(path){return path==='/espace-client'||path==='/espace-client/'||path==='/espace-client/index.html';}
function removeAsset(body,type,path){const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');return type==='link'?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),''):body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');}
