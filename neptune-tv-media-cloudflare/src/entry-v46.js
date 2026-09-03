import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v45.js';
import {json} from './security.js';
import {
  ZERO_TOUCH_V168_RELEASE,
  activateSupplierTokenForEmailV168,
  materializePaidOrderV168,
  reconcilePaidOrdersV168,
  supplierContextV168,
  supplierRespondV168,
} from './portal-zero-touch-v168.js';

export {WebTvEncoder};

const RESERVATION_LOGO='/assets/logo-neptune.svg?v=20260902';
const RESERVATION_BRAND_RELEASE='neptune-reservation-brand-20260903-v1';

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    const url=new URL(request.url),method=request.method.toUpperCase();

    if(method==='POST'&&url.pathname==='/portal/workflow-supplier-context'){
      const body=await request.clone().json().catch(()=>({}));
      return supplierContextV168(this,body.token||'');
    }
    if(method==='POST'&&url.pathname==='/portal/workflow-supplier-respond'){
      const body=await request.clone().json().catch(()=>({}));
      return supplierRespondV168(this,body);
    }
    if(method==='POST'&&url.pathname==='/portal/zero-touch-order-v168'){
      const body=await request.clone().json().catch(()=>({}));
      return json(await materializePaidOrderV168(this,body));
    }
    if(method==='POST'&&url.pathname==='/portal/zero-touch-reconcile-v168'){
      const body=await request.clone().json().catch(()=>({}));
      return json(await reconcilePaidOrdersV168(this,body));
    }
    if(method==='POST'&&url.pathname==='/portal/zero-touch-activate-email-v168'){
      const body=await request.clone().json().catch(()=>({}));
      return json(await activateSupplierTokenForEmailV168(this,body));
    }
    if(method==='POST'&&url.pathname==='/portal/workflow-reconcile'){
      const response=await super.fetch(request);
      if(response.ok){
        try{
          await reconcilePaidOrdersV168(this,{limit:40});
        }catch(error){
          console.error('zero_touch_reconcile_v168_failed',safeError(error));
        }
      }
      return response;
    }
    if(method==='POST'&&url.pathname==='/portal/stripe-apply-v90'){
      const response=await super.fetch(request);
      if(!response.ok)return response;
      const data=await response.clone().json().catch(()=>({}));
      if(data.orderId){
        try{await materializePaidOrderV168(this,{orderId:data.orderId});}
        catch(error){console.error('zero_touch_stripe_v168_failed',safeError(error));}
      }
      return response;
    }
    return super.fetch(request);
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);

    if(request.method==='POST'&&url.pathname==='/api/webhooks/stripe'&&response.ok){
      const data=await response.clone().json().catch(()=>({}));
      if(data.orderId){
        ctx?.waitUntil?.(callStore(env,'/portal/zero-touch-order-v168',{orderId:data.orderId})
          .then(async(result)=>{if(!result.ok)throw new Error(`zero_touch_http_${result.status}`);})
          .catch(error=>console.error('zero_touch_webhook_followup_v168_failed',safeError(error))));
      }
    }

    if(request.method==='GET'&&isReservationDocument(url.pathname)&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await enforceReservationBrand(response);
    }

    const headers=new Headers(response.headers);
    headers.set('X-Neptune-Zero-Touch',ZERO_TOUCH_V168_RELEASE);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
  scheduled:base.scheduled,
};

async function enforceReservationBrand(response){
  let body=await response.text();
  body=body.replace(/<link\b(?=[^>]*\brel=["'][^"']*\bicon\b[^"']*["'])[^>]*>\s*/giu,'');
  body=body.replace(/\/reserver\/favicon\.svg(?:\?[^"'<> ]*)?/giu,RESERVATION_LOGO);
  const icon=`<link rel="icon" href="${RESERVATION_LOGO}" type="image/svg+xml" sizes="any">`;
  if(body.includes('</head>'))body=body.replace('</head>',`${icon}</head>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','no-store, max-age=0');
  headers.set('X-Neptune-Reservation-Brand',RESERVATION_BRAND_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function isReservationDocument(pathname){return pathname==='/reserver'||pathname==='/reserver/';}

function callStore(env,path,body){
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  return studio.fetch(`https://store${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
}

function safeError(error){return{name:String(error?.name||'Error').slice(0,120),message:String(error?.message||error||'unknown').slice(0,500)};}
