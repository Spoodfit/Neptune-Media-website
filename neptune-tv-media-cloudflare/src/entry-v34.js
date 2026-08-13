import base from './entry-v33.js';
import { StudioStore } from './store-v28.js';
import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json } from './security.js';
import { SALES_TUNNEL_RELEASE } from './portal-sales-tunnel-v96.js';
import { stripeConfiguration } from './stripe-journey-v90.js';

export { StudioStore };
export { WebTvEncoder } from './entry-v33.js';

const ADMIN_PREFIX='/api/admin/sales-config-v96/';
const ADMIN_ROUTES=new Map([
  ['context','/portal/sales-tunnel-v96/configuration'],
  ['city/save','/portal/sales-tunnel-v96/city-save'],
  ['offer/save','/portal/sales-tunnel-v96/offer-save'],
  ['order-sales','/portal/sales-tunnel-v96/order-sales'],
]);
const STUDIO_JS='/studio/sales-configuration-v96.js?v=1';
const STUDIO_CSS='/studio/sales-configuration-v96.css?v=1';
const CLIENT_JS='/espace-client/sales-catalog-v96.js?v=1';
const CLIENT_CSS='/espace-client/sales-catalog-v96.css?v=1';

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if(request.method==='GET'&&isMediaHost(url.hostname)&&url.pathname==='/')return Response.redirect(`${url.origin}/reserver`,302);
    if(request.method==='GET'&&isMediaHost(url.hostname)&&url.pathname==='/conditions')return Response.redirect(`${url.origin}/reserver/conditions`,302);
    if(request.method==='GET'&&(url.pathname==='/reserver'||url.pathname==='/reserver/'))return env.ASSETS.fetch(assetRequest(request,'/reserver/'));
    if(request.method==='GET'&&(url.pathname==='/reserver/conditions'||url.pathname==='/reserver/conditions/'))return env.ASSETS.fetch(assetRequest(request,'/reserver/conditions/'));

    if(request.method==='GET'&&url.pathname==='/api/reservation/catalog-v96')return publicJson(await studio.fetch('https://store/portal/sales-tunnel-v96/catalog',{method:'GET'}),env);
    if(request.method==='POST'&&url.pathname==='/api/reservation/prospect/start')return publicJson(await callStore(studio,'/portal/sales-tunnel-v96/prospect-start',await request.json().catch(()=>({}))),env);
    if(request.method==='GET'&&url.pathname==='/api/reservation/prospect/context')return publicJson(await callStore(studio,'/portal/sales-tunnel-v96/prospect-context',{token:url.searchParams.get('reservation_token')||url.searchParams.get('token')||''}),env);
    if(request.method==='POST'&&url.pathname==='/api/reservation/selection-v96')return publicJson(await callStore(studio,'/portal/sales-tunnel-v96/selection',await request.json().catch(()=>({}))),env);

    if(request.method==='POST'&&url.pathname.startsWith(ADMIN_PREFIX)){
      if(!isSameOrigin(request))return secure(json({error:'origin_forbidden'},403));
      const key=url.pathname.slice(ADMIN_PREFIX.length);
      if(key==='stripe-links'){
        const auth=await studioAuth(request,env,ctx);
        if(!auth.ok)return secure(json({error:'unauthorized'},401));
        return secure(await activeStripeLinks(env));
      }
      if(!ADMIN_ROUTES.has(key))return secure(json({error:'not_found'},404));
      const payload=await request.json().catch(()=>({}));
      return secure(await callStore(studio,ADMIN_ROUTES.get(key),{...adminAuth(request),payload}));
    }

    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)response=await augmentRelease(response);
    if(request.method==='GET'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      if(isStudioClientsPath(url.pathname))response=await inject(response,STUDIO_CSS,STUDIO_JS,'X-Neptune-Sales-Tunnel',SALES_TUNNEL_RELEASE);
      else if(isClientSpacePath(url.pathname))response=await inject(response,CLIENT_CSS,CLIENT_JS,'X-Neptune-Sales-Catalog',SALES_TUNNEL_RELEASE);
    }
    return response;
  },
  async scheduled(controller,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);},
};

async function studioAuth(request,env,ctx){
  const url=new URL(request.url);url.pathname='/api/auth/status';url.search='';
  const probe=new Request(url.toString(),{method:'GET',headers:request.headers});
  const response=await base.fetch(probe,env,ctx);
  if(!response.ok)return{ok:false};
  const data=await response.json().catch(()=>({})),user=data.user||{};
  if(data.authenticated===false||!['admin','editor'].includes(String(user.role||'')))return{ok:false};
  return{ok:true,user};
}
function callStore(studio,path,body){return studio.fetch(`https://store${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});}
async function publicJson(response,env){
  const data=await response.json().catch(()=>({}));
  if(response.ok)data.preparationBookingUrl=env.PREPARATION_BOOKING_URL||'https://calendar.app.google/X9q1T5JT9ngMfZY67';
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Neptune-Sales-Tunnel':SALES_TUNNEL_RELEASE});
  return new Response(JSON.stringify(data),{status:response.status,headers});
}
function secure(response){const h=new Headers(response.headers);h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');h.set('X-Neptune-Sales-Tunnel',SALES_TUNNEL_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});}
function assetRequest(request,path){const u=new URL(request.url);u.pathname=path;u.search='';return new Request(u.toString(),request);}
function isMediaHost(host){return host==='media.neptunebusiness.com';}
function isStudioClientsPath(path){return path==='/studio/clients'||path==='/studio/clients/'||path==='/studio/clients.html';}
function isClientSpacePath(path){return path==='/espace-client'||path==='/espace-client/'||path==='/espace-client/index.html';}
async function inject(response,css,js,headerName,release){
  let body=await response.text();
  if(js.includes('sales-catalog-v96')){
    body=body.replace(/<link\b[^>]*href=["'][^"']*\/espace-client\/media-catalog-v95\.css[^"']*["'][^>]*>\s*/giu,'');
    body=body.replace(/<script\b[^>]*src=["'][^"']*\/espace-client\/media-catalog-v95\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  }
  const cssPath=css.split('?')[0].replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  const jsPath=js.split('?')[0].replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  body=body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${cssPath}[^"']*["'][^>]*>\\s*`,'giu'),'');
  body=body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${jsPath}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');
  body=body.replace('</head>',`<link rel="stylesheet" href="${css}"></head>`);
  body=body.replace('</body>',`<script type="module" src="${js}"></script></body>`);
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store, max-age=0');headers.set(headerName,release);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
async function activeStripeLinks(env){
  const config=stripeConfiguration(env);
  if(!config.configured)return json({ok:false,error:'stripe_not_configured'},503);
  try{
    const query=new URLSearchParams({active:'true',limit:'100'});query.append('expand[]','data.line_items');
    const response=await fetch(`https://api.stripe.com/v1/payment_links?${query}`,{headers:{Authorization:`Bearer ${config.secretKey}`,Accept:'application/json','User-Agent':'Neptune-Media-Worker/6.0.0'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return json({ok:false,error:data.error?.message||`stripe_http_${response.status}`},response.status);
    const links=(data.data||[]).filter(x=>x?.active!==false&&x?.url).map(link=>{
      const items=link.line_items?.data||[];
      const amountTotal=items.reduce((sum,item)=>sum+Number(item.amount_total??(Number(item.price?.unit_amount||0)*Number(item.quantity||1))),0);
      const currency=String(items[0]?.currency||items[0]?.price?.currency||'eur').toLowerCase();
      const label=items.map(item=>item.description||item.price?.nickname||'').filter(Boolean).join(' · ')||link.metadata?.label||link.id;
      return {id:link.id,url:link.url,label,amountTotal,currency};
    });
    return json({ok:true,release:SALES_TUNNEL_RELEASE,links});
  }catch(error){return json({ok:false,error:String(error?.message||'stripe_unavailable')},502);}
}
async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,salesTunnel:SALES_TUNNEL_RELEASE,salesCatalog:'city-format-offer-supplier-v96',salesProspect:'contact-first-phone-v96',salesStudioConfig:'cities-offers-stripe-v96'}),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
