import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v43.js';
import {CATALOG_COMMERCE_V143_RELEASE,handleCatalogCommerceV143Store,enhanceCatalogCommerceV143Store} from './catalog-commerce-v143.js';
import {adminAuth} from './portal-http-utils.js';
import {isSameOrigin,json} from './security.js';

export {WebTvEncoder};

const STUDIO_CSS='/studio/studio-catalog-commerce-v143.css?v=2';
const STUDIO_JS='/studio/studio-catalog-commerce-v143.js?v=1';
const BOOKING_JS='/reserver/assets/catalog-commerce-v143.js?v=1';

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    const handled=await handleCatalogCommerceV143Store(this,request);
    if(handled)return handled;
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
    const response=await base.fetch(request,env,ctx);
    return maybeEnhance(request,response);
  },
  async scheduled(controller,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);},
};

async function forwardCatalogAdmin(request,env,url){
  if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
  const payload=await request.json().catch(()=>({})),studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  return studio.fetch(`https://store${url.pathname}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...adminAuth(request),payload})});
}
async function maybeEnhance(request,response){
  if(!response?.ok)return response;
  const url=new URL(request.url),type=response.headers.get('Content-Type')||'';
  if(request.method==='GET'&&type.includes('text/html')&&isStudio(url.pathname))return inject(response,STUDIO_CSS,STUDIO_JS,'studio');
  if(request.method==='GET'&&type.includes('text/html')&&(url.pathname==='/reserver'||url.pathname==='/reserver/'))return inject(response,'',BOOKING_JS,'booking');
  return mark(response);
}
function isStudio(path){return path==='/studio'||path==='/studio/'||path.startsWith('/studio/');}
async function inject(response,css,js,kind){
  let body=await response.text();
  if(css&&!body.includes(css.split('?')[0]))body=body.replace('</head>',`<link rel="stylesheet" href="${css}"></head>`);
  if(!body.includes(js.split('?')[0])){
    if(kind==='booking'&&body.includes('/reserver/assets/app-v96.js'))body=body.replace(/<script\b[^>]*src=["'][^"']*\/reserver\/assets\/app-v96\.js[^"']*["'][^>]*>\s*<\/script>/iu,match=>`<script type="module" src="${js}"></script>${match}`);
    else body=body.replace('</body>',`<script type="module" src="${js}"></script></body>`);
  }
  const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);headers.set('Cache-Control','private, no-store, max-age=0');headers.set('X-Neptune-Catalog-Commerce',CATALOG_COMMERCE_V143_RELEASE);return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
function mark(response){const headers=new Headers(response.headers);headers.set('X-Neptune-Catalog-Commerce',CATALOG_COMMERCE_V143_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
