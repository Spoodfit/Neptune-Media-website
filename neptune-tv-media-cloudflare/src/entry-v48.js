import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v47.js';
import {json} from './security.js';
import {
  EFFECTIVE_OFFER_V181_RELEASE,
  enhanceEffectiveOfferCatalogV181,
  validateEffectiveOfferV181,
} from './effective-offer-v181.js';

export {WebTvEncoder};

const RELEASE='neptune-effective-offer-runtime-20260905-v181';

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    const url=new URL(request.url),method=request.method.toUpperCase();
    if(method==='POST'&&(url.pathname==='/sales-v173/validate-selection'||url.pathname==='/sales-v172/hold')){
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
    return response;
  }
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
