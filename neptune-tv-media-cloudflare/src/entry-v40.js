import base,{WebTvEncoder} from './entry-v39.js';
import { StudioStore } from './store-v30.js';
import { clientToken } from './portal-http-utils.js';
import { isSameOrigin, json } from './security.js';
import { CLIENT_DIRECT_BOOKING_RELEASE } from './portal-client-direct-booking-v118-5.js';

export {StudioStore,WebTvEncoder};

const RELEASE='neptune-client-direct-reservation-20260815-v118.5';
const PREPARE_PAYMENT='/api/client/reservation/prepare-payment';

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname===PREPARE_PAYMENT){
      return preparePayment(request,env);
    }

    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      response=await augmentRelease(response);
    }
    if(request.method==='GET'&&isClientHome(url.pathname)&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await refreshClientCatalogAssets(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

async function preparePayment(request,env){
  if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
  const token=clientToken(request);
  if(!token)return json({error:'unauthorized'},401);
  const payload=await request.json().catch(()=>({}));
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const response=await studio.fetch('https://store/portal/client-direct-booking-v1185/prepare-payment',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token,payload}),
  });
  const result=await response.json().catch(()=>({}));
  return json(result,response.status);
}

async function refreshClientCatalogAssets(response){
  let body=await response.text();
  body=body
    .replace('/espace-client/client-visual-coherence-v118-2.css?v=1','/espace-client/client-visual-coherence-v118-2.css?v=2')
    .replace('/espace-client/client-visual-coherence-v118-2.js?v=1','/espace-client/client-visual-coherence-v118-2.js?v=2');
  const headers=rewritten(response);
  headers.set('X-Neptune-Client-Direct-Booking',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,clientDirectBooking:RELEASE,clientDirectBookingStore:CLIENT_DIRECT_BOOKING_RELEASE,clientCatalogInteraction:'single-target-hover-focus-v118.5'}),{
    status:response.status,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Neptune-Client-Direct-Booking':RELEASE},
  });
}

function isClientHome(path){return path==='/espace-client'||path==='/espace-client/'||path==='/espace-client/index.html';}
function rewritten(response){
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  return headers;
}
