import base,{WebTvEncoder} from './entry-v35.js';
import { StudioStore } from './store-v29.js';
import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json } from './security.js';
import { MEDIA_CATALOG_RELEASE } from './portal-media-catalog-v98.js';
import { SALES_CATALOG_RELEASE } from './portal-sales-tunnel-v98.js';

export {StudioStore,WebTvEncoder};

const ADMIN_PREFIX='/api/admin/media-catalog-v98/';
const ROUTES=new Map([
  ['context','/portal/media-catalog-v98/context'],
  ['format/save','/portal/media-catalog-v98/format-save'],
  ['supplier/save','/portal/media-catalog-v98/supplier-save'],
  ['city/save','/portal/media-catalog-v98/city-save'],
  ['family/save','/portal/media-catalog-v98/family-save'],
  ['configuration-visual/save','/portal/media-catalog-v98/configuration-visual-save'],
]);
const STUDIO_NAV_JS='/studio/studio-information-architecture-v65-1.js?v=105';
const STUDIO_SHELL_CSS='/studio/studio-shell-v105.css?v=1';
const RELEASE_TAG='neptune-media-catalog-ux-20260811-v99';
const STUDIO_UI_RELEASE='neptune-studio-ui-20260812-v105-three-tab-canonical-shell';
const LEGACY_CLIENT_OPERATIONS='/studio/studio-client-operations-v76.js';
const MEDIA_CATALOG_MANAGER='/studio/media-catalog-manager-v98.js';

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));

    if(request.method==='GET'&&isLegacyStudioPath(url.pathname)&&url.searchParams.has('studio_embed')){
      const target=new URL(request.url);target.searchParams.delete('studio_embed');
      return Response.redirect(target.toString(),302);
    }
    if(request.method==='GET'&&url.pathname===LEGACY_CLIENT_OPERATIONS){
      return neutralizeLegacyStudioClientOperations(await base.fetch(request,env,ctx));
    }
    if(request.method==='GET'&&url.pathname===MEDIA_CATALOG_MANAGER){
      return stabilizeMediaCatalogManager(await base.fetch(request,env,ctx));
    }
    if(request.method==='GET'&&url.pathname.startsWith('/media/catalog-v98/'))return catalogAsset(request,env);
    if(request.method==='POST'&&url.pathname.startsWith(ADMIN_PREFIX)){
      if(!isSameOrigin(request))return secure(json({error:'origin_forbidden'},403));
      const key=url.pathname.slice(ADMIN_PREFIX.length);
      if(key==='asset/upload')return secure(await uploadCatalogAsset(request,env,ctx));
      if(!ROUTES.has(key))return secure(json({error:'not_found'},404));
      const payload=await request.json().catch(()=>({}));
      return secure(await callStore(studio,ROUTES.get(key),{...adminAuth(request),payload}));
    }
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)response=await augmentRelease(response);
    if(request.method==='GET'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      if(isCatalogPreviewRequest(url))response=allowSameOriginFrame(response,'X-Neptune-Studio-Preview');
      else if(isLegacyStudioPath(url.pathname))response=secureStudioDocument(await injectStudioNavigation(response));
      else if(isStudioAppPath(url.pathname))response=secureStudioDocument(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);},
};

async function uploadCatalogAsset(request,env,ctx){
  const auth=await studioAuth(request,env,ctx);
  if(!auth.ok)return json({error:'unauthorized'},401);
  const form=await request.formData().catch(()=>null),file=form?.get('file');
  if(!file||typeof file.arrayBuffer!=='function')return json({error:'image_required'},400);
  const type=String(file.type||'').toLowerCase(),extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const ext=extensions[type];
  if(!ext)return json({error:'image_type_not_supported'},415);
  if(Number(file.size||0)>5*1024*1024)return json({error:'image_too_large'},413);
  const key=`catalog-v98/${crypto.randomUUID()}.${ext}`;
  await env.MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'},customMetadata:{source:'studio-media-catalog-v98',uploadedBy:String(auth.user?.email||auth.user?.id||'studio')}});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,url:`/media/catalog-v98/${key.slice('catalog-v98/'.length)}`});
}

async function catalogAsset(request,env){
  const url=new URL(request.url),name=url.pathname.slice('/media/catalog-v98/'.length);
  if(!/^[a-zA-Z0-9._-]{8,180}$/u.test(name))return new Response('Not found',{status:404});
  const object=await env.MEDIA.get(`catalog-v98/${name}`);
  if(!object)return new Response('Not found',{status:404});
  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control','public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options','nosniff');
  if(object.httpEtag)headers.set('ETag',object.httpEtag);
  return new Response(object.body,{headers});
}

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
function secure(response){const h=new Headers(response.headers);h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');h.set('X-Neptune-Media-Catalog',MEDIA_CATALOG_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});}
function isAdvancedPath(path){return path==='/studio/advanced'||path==='/studio/advanced/'||path==='/studio/advanced.html';}
function isStudioAppPath(path){return path==='/studio/app'||path==='/studio/app/'||path==='/studio/app.html';}
function isLegacyStudioPath(path){return path==='/studio/clients'||path==='/studio/clients/'||path==='/studio/clients.html'||path==='/studio/video-ai'||path==='/studio/video-ai/'||path==='/studio/video-ai.html'||path==='/studio/webtv'||path==='/studio/webtv/'||path==='/studio/webtv.html'||isAdvancedPath(path);}
function isCatalogPreviewRequest(url){return (url.pathname==='/reserver'||url.pathname==='/reserver/')&&url.searchParams.get('catalog_preview')==='studio';}
function secureStudioDocument(response){
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store, max-age=0');headers.set('X-Content-Type-Options','nosniff');headers.set('X-Frame-Options','DENY');headers.set('Referrer-Policy','same-origin');headers.set('Content-Security-Policy',studioTopLevelCsp(headers.get('Content-Security-Policy')||''));headers.set('X-Neptune-Studio-UI',STUDIO_UI_RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function allowSameOriginFrame(response,marker='X-Neptune-Studio-Preview'){
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store, max-age=0');headers.set('X-Content-Type-Options','nosniff');headers.set('X-Frame-Options','SAMEORIGIN');headers.set('Referrer-Policy','same-origin');headers.set('Content-Security-Policy',studioPreviewCsp(headers.get('Content-Security-Policy')||''));headers.set(marker,STUDIO_UI_RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function studioTopLevelCsp(value){return setCspDirective(value,'frame-ancestors',["'none'"]);}
function studioPreviewCsp(value){return setCspDirective(value,'frame-ancestors',["'self'"]);}
function setCspDirective(value,name,sources){
  const directives=String(value||"default-src 'self'").split(';').map(item=>item.trim()).filter(Boolean),prefix=`${name} `;
  const next=`${name} ${sources.join(' ')}`;let replaced=false;
  for(let index=0;index<directives.length;index+=1){if(directives[index]===name||directives[index].startsWith(prefix)){directives[index]=next;replaced=true;break;}}
  if(!replaced)directives.push(next);return directives.join('; ');
}
function rewrittenHeaders(response){
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified','Content-Range','Accept-Ranges'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  return headers;
}
async function neutralizeLegacyStudioClientOperations(response){
  if(!response.ok)return response;
  const contentType=response.headers.get('Content-Type')||'';
  if(!contentType.includes('javascript')&&!contentType.includes('text/plain'))return response;
  let body=await response.text();
  body=body.replaceAll('cleanObsoleteVideoWorkspace();','void 0;');
  const headers=rewrittenHeaders(response);headers.set('X-Neptune-Studio-Legacy-Navigation','neutralized-v105');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
async function stabilizeMediaCatalogManager(response){
  if(!response.ok)return response;
  const contentType=response.headers.get('Content-Type')||'';
  if(!contentType.includes('javascript')&&!contentType.includes('text/plain'))return response;
  let body=await response.text();
  body=body.replace("function rename(){document.querySelectorAll('[data-tab=\"programs\"] strong,[data-go=\"programs\"] strong').forEach(x=>x.textContent='Catalogue Media')}","function rename(){document.querySelectorAll('[data-tab=\"programs\"] strong,[data-go=\"programs\"] strong').forEach(x=>{if(x.textContent!=='Catalogue Media')x.textContent='Catalogue Media'})}");
  const headers=rewrittenHeaders(response);headers.set('X-Neptune-Media-Catalog-Manager','stabilized-v105');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
async function injectStudioNavigation(response){
  let body=await response.text();
  body=body.replace(/<script\b[^>]*src=["'][^"']*studio-information-architecture-v65(?:-1)?\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  body=body.replace(/<script\b[^>]*src=["'][^"']*webtv-nav-compat-v1\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  body=body.replace(/<script\b[^>]*src=["'][^"']*studio-hash-advanced-v36\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  body=body.replace(/<link\b[^>]*href=["'][^"']*studio-shell-v105\.css[^"']*["'][^>]*>\s*/giu,'');
  body=body.replace('</head>',`<link rel="stylesheet" href="${STUDIO_SHELL_CSS}"></head>`);
  body=body.replace('</body>',`<script type="module" src="${STUDIO_NAV_JS}"></script></body>`);
  const headers=rewrittenHeaders(response);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,mediaCatalogManager:MEDIA_CATALOG_RELEASE,salesCatalog:SALES_CATALOG_RELEASE,mediaCatalogUx:RELEASE_TAG,studioUi:STUDIO_UI_RELEASE,studioShell:STUDIO_UI_RELEASE}),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
