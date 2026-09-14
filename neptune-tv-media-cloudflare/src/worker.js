import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v47.js';
import {isSameOrigin,json} from './security.js';
import {
  EFFECTIVE_OFFER_V181_RELEASE,
  enhanceEffectiveOfferCatalogV181,
  validateEffectiveOfferV181,
} from './effective-offer-v181.js';
import {
  NEPTUNE_JT_RELEASE,
  handleNeptuneJtStore,
  handleNeptuneJtStripeWebhook,
  reconcileNeptuneJtCheckoutSession,
  runNeptuneJtScheduled,
  sendNeptuneJtReservationEmails,
} from './neptune-jt-v182.js';

export {WebTvEncoder};

const RELEASE='neptune-effective-offer-runtime-20260905-v181.1';
const CLIENT_CATALOG_CLICK_RELEASE='neptune-client-catalog-click-20260913-v181.5-single-owner-native-anchor';
const CLIENT_VISUAL_ASSET='/espace-client/client-visual-coherence-v118-2.js?v=20260913-4';
const CLIENT_INTERACTION_ASSET='/espace-client/client-catalog-interaction-v118-7.js?v=20260913-2';
const LEGACY_SALES_ASSET='/espace-client/sales-catalog-v96.js?v=20260913-1';
const LEGACY_MEDIA_ASSET='/espace-client/media-catalog-v95.js?v=20260913-1';

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    const url=new URL(request.url),method=request.method.toUpperCase();
    if(url.pathname.startsWith('/neptune-jt-v182/')){
      const handled=await handleNeptuneJtStore(this,request);
      if(handled)return handled;
    }
    if(method==='POST'&&isCommercialSelection(url.pathname)){
      const body=await request.clone().json().catch(()=>({}));
      const gate=await validateEffectiveOfferV181(this,body);
      if(!gate.ok)return json({
        error:gate.error,
        effectiveOfferId:gate.effectiveOfferId||'',
        effectiveTierCode:gate.effectiveTierCode||'',
        effectivePriceCents:Number(gate.effectivePriceCents||0),
        remainingPlaces:gate.remainingPlaces??null,
        effectiveOfferRelease:EFFECTIVE_OFFER_V181_RELEASE,
      },gate.status||409);
    }
    let response=await super.fetch(request);
    if(method==='GET'&&url.pathname.endsWith('/catalog-v96')&&response.ok){
      response=await enhanceEffectiveOfferCatalogV181(this,response);
    }
    if(method==='POST'&&url.pathname==='/api/admin/media-catalog-v143/policies'&&response.ok){
      response=await alignStudioPolicySemantics(response);
    }
    return response;
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(request.method==='GET'&&url.pathname==='/api/neptune-jt/status'){
      return markNeptuneJt(await callNeptuneJtStore(env,'/neptune-jt-v182/status',null,'GET'));
    }
    if(request.method==='POST'&&url.pathname==='/api/neptune-jt/pre-register'){
      if(!isSameOrigin(request))return markNeptuneJt(json({error:'origin_forbidden'},403));
      const payload=await request.json().catch(()=>({}));
      const response=await callNeptuneJtStore(env,'/neptune-jt-v182/pre-register',payload);
      const data=await response.clone().json().catch(()=>({}));
      if(response.ok&&data.internal){
        ctx?.waitUntil?.(sendNeptuneJtReservationEmails(env,data.internal).catch((error)=>console.error('neptune_jt_reservation_email_failed',safeError(error))));
      }
      delete data.internal;
      return markNeptuneJt(json(data,response.status));
    }
    if(request.method==='GET'&&url.pathname==='/api/neptune-jt/payment-status'){
      const sessionId=url.searchParams.get('session_id')||'';
      return markNeptuneJt(await reconcileNeptuneJtCheckoutSession(env,sessionId,(path,body)=>callNeptuneJtStore(env,path,body)));
    }
    if(request.method==='POST'&&url.pathname==='/api/webhooks/stripe'){
      const handled=await handleNeptuneJtStripeWebhook(request,env,(path,body)=>callNeptuneJtStore(env,path,body));
      if(handled)return markNeptuneJt(handled);
    }

    let response=await base.fetch(request,env,ctx);
    const type=response.headers.get('Content-Type')||'';
    if(request.method==='GET'&&response.ok&&type.includes('text/html')&&isClientHome(url.pathname)){
      response=await pinClientCatalogRuntime(response);
    }
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      const data=await response.json().catch(()=>({}));
      const headers=new Headers(response.headers);
      headers.delete('Content-Length');
      headers.set('Content-Type','application/json; charset=utf-8');
      headers.set('Cache-Control','no-store');
      response=new Response(JSON.stringify({...data,effectiveOffer:EFFECTIVE_OFFER_V181_RELEASE,clientCatalogClick:CLIENT_CATALOG_CLICK_RELEASE,neptuneJt:NEPTUNE_JT_RELEASE}),{status:response.status,statusText:response.statusText,headers});
    }
    const headers=new Headers(response.headers);
    headers.set('X-Neptune-Effective-Offer',EFFECTIVE_OFFER_V181_RELEASE);
    headers.set('X-Neptune-Effective-Offer-Runtime',RELEASE);
    headers.set('X-Neptune-Client-Catalog-Click',CLIENT_CATALOG_CLICK_RELEASE);
    headers.set('X-Neptune-JT',NEPTUNE_JT_RELEASE);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
  scheduled(controller,env,ctx){
    const baseResult=typeof base.scheduled==='function'?base.scheduled(controller,env,ctx):undefined;
    ctx?.waitUntil?.(runNeptuneJtScheduled(env,(path,body)=>callNeptuneJtStore(env,path,body)).catch((error)=>console.error('neptune_jt_scheduled_failed',safeError(error))));
    return baseResult;
  },
};

async function alignStudioPolicySemantics(response){
  const data=await response.json().catch(()=>null);if(!data)return response;
  data.offerPolicies=(data.offerPolicies||[]).map(row=>{
    const tierCode=String(row.tierCode||'');
    const capacity=Math.max(0,Number(row.capacity||0));
    const usedPlaces=Math.max(0,Number(row.usedPlaces||0));
    const unlimited=tierCode==='base'&&capacity===0;
    const zeroCapacitySoldOut=(tierCode==='launch'||tierCode==='promo')&&capacity===0;
    const remainingPlaces=unlimited?null:Math.max(0,capacity-usedPlaces);
    const soldOut=zeroCapacitySoldOut||(!unlimited&&capacity>0&&usedPlaces>=capacity);
    return{...row,capacity,usedPlaces,unlimited,remainingPlaces,soldOut,effectiveOfferRelease:EFFECTIVE_OFFER_V181_RELEASE};
  });
  data.effectiveOfferRelease=EFFECTIVE_OFFER_V181_RELEASE;
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Effective-Offer',EFFECTIVE_OFFER_V181_RELEASE);
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

async function pinClientCatalogRuntime(response){
  let body=await response.text();
  body=body.replace(/\/espace-client\/client-visual-coherence-v118-2\.js(?:\?[^"'<> ]*)?/gu,CLIENT_VISUAL_ASSET);
  body=body.replace(/\/espace-client\/client-catalog-interaction-v118-7\.js(?:\?[^"'<> ]*)?/gu,CLIENT_INTERACTION_ASSET);
  body=body.replace(/\/espace-client\/sales-catalog-v96\.js(?:\?[^"'<> ]*)?/gu,LEGACY_SALES_ASSET);
  body=body.replace(/\/espace-client\/media-catalog-v95\.js(?:\?[^"'<> ]*)?/gu,LEGACY_MEDIA_ASSET);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Client-Catalog-Click',CLIENT_CATALOG_CLICK_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function isCommercialSelection(pathname){
  return pathname.endsWith('/selection-v96')||pathname==='/sales-v173/validate-selection'||pathname==='/sales-v172/hold';
}
function isClientHome(pathname){
  return pathname==='/espace-client'||pathname==='/espace-client/'||pathname==='/espace-client/index.html';
}
function callNeptuneJtStore(env,path,body,method='POST'){
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  return studio.fetch(`https://store${path}`,{
    method,
    headers:{'Content-Type':'application/json'},
    body:method==='GET'?undefined:JSON.stringify(body||{}),
  });
}
function markNeptuneJt(response){
  const headers=new Headers(response.headers);
  headers.set('X-Neptune-JT',NEPTUNE_JT_RELEASE);
  headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function safeError(error){return{name:String(error?.name||'Error').slice(0,120),message:String(error?.message||error||'unknown').slice(0,500)};}
