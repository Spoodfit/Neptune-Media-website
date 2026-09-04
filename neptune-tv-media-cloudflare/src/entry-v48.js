import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v47.js';
import {json} from './security.js';
import {
  EFFECTIVE_OFFER_V181_RELEASE,
  enhanceEffectiveOfferCatalogV181,
  validateEffectiveOfferV181,
} from './effective-offer-v181.js';

export {WebTvEncoder};

const RELEASE='neptune-effective-offer-runtime-20260905-v181.1';

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    const url=new URL(request.url),method=request.method.toUpperCase();
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

function isCommercialSelection(pathname){
  return pathname.endsWith('/selection-v96')||pathname==='/sales-v173/validate-selection'||pathname==='/sales-v172/hold';
}

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

export default{
  async fetch(request,env,ctx){
    let response=await base.fetch(request,env,ctx);
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      const data=await response.json().catch(()=>({}));
      const headers=new Headers(response.headers);
      headers.delete('Content-Length');
      headers.set('Content-Type','application/json; charset=utf-8');
      headers.set('Cache-Control','no-store');
      response=new Response(JSON.stringify({...data,effectiveOffer:EFFECTIVE_OFFER_V181_RELEASE}),{status:response.status,statusText:response.statusText,headers});
    }
    const headers=new Headers(response.headers);
    headers.set('X-Neptune-Effective-Offer',EFFECTIVE_OFFER_V181_RELEASE);
    headers.set('X-Neptune-Effective-Offer-Runtime',RELEASE);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
  scheduled(controller,env,ctx){return typeof base.scheduled==='function'?base.scheduled(controller,env,ctx):undefined;},
};
