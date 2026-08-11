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
const ADMIN_JS='/studio/media-catalog-manager-v98.js?v=1';
const ADMIN_NAV_JS='/studio/media-catalog-nav-v98.js?v=1';
const ADMIN_CSS='/studio/media-catalog-manager-v98.css?v=1';

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
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
    if(request.method==='GET'&&response.ok&&isAdvancedPath(url.pathname)&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await inject(response,ADMIN_CSS,[ADMIN_JS,ADMIN_NAV_JS]);
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
async function inject(response,css,scripts){
  let body=await response.text(),cssPath=css.split('?')[0];
  body=body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escapeRegExp(cssPath)}[^"']*["'][^>]*>\\s*`,'giu'),'');
  for(const js of scripts){const jsPath=js.split('?')[0];body=body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escapeRegExp(jsPath)}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');}
  body=body.replace('</head>',`<link rel="stylesheet" href="${css}"></head>`);
  body=body.replace('</body>',`${scripts.map(js=>`<script type="module" src="${js}"></script>`).join('')}</body>`);
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store, max-age=0');headers.set('X-Neptune-Media-Catalog',MEDIA_CATALOG_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');}
async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,mediaCatalogManager:MEDIA_CATALOG_RELEASE,salesCatalog:SALES_CATALOG_RELEASE}),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
