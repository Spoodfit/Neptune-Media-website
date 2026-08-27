import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v42.js';
import {
  BUSINESS_V142_RELEASE,
  augmentBusinessReleaseV142,
  handleBusinessV142Http,
  handleBusinessV142Store,
  sendDuePreparationPacksV142,
} from './catalog-booking-cost-v142.js';
import {CATALOG_COMMERCE_V143_RELEASE,handleCatalogCommerceV143Store,enhanceCatalogCommerceV143Store} from './catalog-commerce-v143.js';
import {ensurePortalLifecycleV144} from './portal-lifecycle-v144.js';
import {adminAuth} from './portal-http-utils.js';
import {isSameOrigin,json} from './security.js';

export {WebTvEncoder};

const BOOKING_V142_JS='/reserver/assets/booking-slots-v142.js?v=1';
const BOOKING_V142_CSS='/reserver/assets/booking-slots-v142.css?v=1';
const STUDIO_V142_JS='/studio/studio-business-v142.js?v=1';
const STUDIO_V142_CSS='/studio/studio-business-v142.css?v=1';
const STUDIO_V143_CSS='/studio/studio-catalog-commercial-cockpit-v145.css?v=1';
const STUDIO_V143_JS='/studio/studio-catalog-commercial-cockpit-v145.js?v=1';
const BOOKING_V143_JS='/reserver/assets/catalog-commerce-v143.js?v=1';

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    ensurePortalLifecycleV144(this);
    const commerceHandled=await handleCatalogCommerceV143Store(this,request);
    if(commerceHandled)return commerceHandled;
    const businessHandled=await handleBusinessV142Store(this,request);
    if(businessHandled)return businessHandled;
    const response=await super.fetch(request);
    const pathname=new URL(request.url).pathname;
    const probe=pathname.endsWith('/catalog-v96')?new Request('https://store/api/reservation/catalog-v96',{method:'GET'}):request;
    return enhanceCatalogCommerceV143Store(this,probe,response);
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname.startsWith('/api/admin/media-catalog-v143/'))return forwardCatalogAdmin(request,env,url);
    let response=await handleBusinessV142Http(request,env,ctx,(probe)=>base.fetch(probe,env,ctx));
    response=await maybeEnhanceBusinessV142(request,response);
    return maybeEnhanceCatalogV143(request,response);
  },
  async scheduled(controller,env,ctx){
    const tasks=[];
    if(typeof base.scheduled==='function')tasks.push(Promise.resolve(base.scheduled(controller,env,ctx)));
    if(controller?.cron==='* * * * *')tasks.push(sendDuePreparationPacksV142(env));
    if(tasks.length)await Promise.allSettled(tasks);
  },
};

async function forwardCatalogAdmin(request,env,url){
  if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
  const payload=await request.json().catch(()=>({})),studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  return studio.fetch(`https://store${url.pathname}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...adminAuth(request),payload})});
}

async function maybeEnhanceBusinessV142(request,response){
  const url=new URL(request.url);
  if(request.method==='GET'&&response.ok&&url.pathname==='/api/public/release')return augmentBusinessReleaseV142(response);
  if(request.method==='GET'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
    if(url.pathname==='/reserver'||url.pathname==='/reserver/')return injectBusinessAssets(response,BOOKING_V142_CSS,BOOKING_V142_JS,'X-Neptune-Booking-Slots');
    if(isStudio(url.pathname))return injectBusinessAssets(response,STUDIO_V142_CSS,STUDIO_V142_JS,'X-Neptune-Business-Engine');
  }
  return markBusiness(response);
}

async function maybeEnhanceCatalogV143(request,response){
  if(!response?.ok)return response;
  const url=new URL(request.url),type=response.headers.get('Content-Type')||'';
  if(request.method==='GET'&&type.includes('text/html')&&isStudio(url.pathname))return injectCatalogAssets(response,STUDIO_V143_CSS,STUDIO_V143_JS,'studio');
  if(request.method==='GET'&&type.includes('text/html')&&(url.pathname==='/reserver'||url.pathname==='/reserver/'))return injectCatalogAssets(response,'',BOOKING_V143_JS,'booking');
  return markCatalog(response);
}

function isStudio(path){return path==='/studio'||path==='/studio/'||path.startsWith('/studio/');}

async function injectBusinessAssets(response,css,js,headerName){
  let body=await response.text();
  body=removeAsset(body,'link',css.split('?')[0]);
  body=removeAsset(body,'script',js.split('?')[0]);
  if(body.includes('/reserver/assets/app-v96.js'))body=body.replace(/<script\b[^>]*src=["'][^"']*\/reserver\/assets\/app-v96\.js[^"']*["'][^>]*>\s*<\/script>/iu,match=>`<link rel="stylesheet" href="${css}"><script type="module" src="${js}"></script>${match}`);
  else body=body.replace('</head>',`<link rel="stylesheet" href="${css}"></head>`).replace('</body>',`<script type="module" src="${js}"></script></body>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set(headerName,BUSINESS_V142_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function markBusiness(response){
  const headers=new Headers(response.headers);
  headers.set('X-Neptune-Business-Engine',BUSINESS_V142_RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function injectCatalogAssets(response,css,js,kind){
  let body=await response.text();
  if(css&&!body.includes(css.split('?')[0]))body=body.replace('</head>',`<link rel="stylesheet" href="${css}"></head>`);
  if(!body.includes(js.split('?')[0])){
    if(kind==='booking'&&body.includes('/reserver/assets/app-v96.js'))body=body.replace(/<script\b[^>]*src=["'][^"']*\/reserver\/assets\/app-v96\.js[^"']*["'][^>]*>\s*<\/script>/iu,match=>`<script type="module" src="${js}"></script>${match}`);
    else body=body.replace('</body>',`<script type="module" src="${js}"></script></body>`);
  }
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Catalog-Commerce',CATALOG_COMMERCE_V143_RELEASE);
  headers.set('X-Neptune-City-Drawer','v143.4');
  headers.set('X-Neptune-Catalog-Cockpit','v145');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function markCatalog(response){
  const headers=new Headers(response.headers);
  headers.set('X-Neptune-Catalog-Commerce',CATALOG_COMMERCE_V143_RELEASE);
  headers.set('X-Neptune-City-Drawer','v143.4');
  headers.set('X-Neptune-Catalog-Cockpit','v145');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function removeAsset(body,type,path){
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  return type==='link'
    ? body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),'')
    : body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');
}
