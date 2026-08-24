import base,{StudioStore,WebTvEncoder} from './entry-v41.js';
import {handleHorsNormePersonalizationV139,HORS_NORME_PERSONALIZATION_RELEASE} from './hors-norme-personalization-v139.js';

export {StudioStore,WebTvEncoder};

const CLIENT_JS='/espace-client/client-hors-norme-personalization-v139.js?v=1';
const CLIENT_CSS='/espace-client/client-hors-norme-personalization-v139.css?v=1';
const STUDIO_JS='/studio/studio-hors-norme-personalization-v139.js?v=1';
const STUDIO_CSS='/studio/studio-hors-norme-personalization-v139.css?v=1';

export default{
  async fetch(request,env,ctx){
    const handled=await handleHorsNormePersonalizationV139(request,env,ctx,(probe)=>base.fetch(probe,env,ctx));
    if(handled)return handled;
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      if(isClientHome(url.pathname))response=await injectAssets(response,CLIENT_CSS,CLIENT_JS,'X-Neptune-Hors-Norme-Personalization');
      if(isStudioClients(url.pathname))response=await injectAssets(response,STUDIO_CSS,STUDIO_JS,'X-Neptune-Studio-Hors-Norme-Personalization');
    }
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)response=await augmentRelease(response);
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

function isClientHome(path){return path==='/espace-client'||path==='/espace-client/'||path==='/espace-client/index.html';}
function isStudioClients(path){return path==='/studio/clients'||path==='/studio/clients/'||path==='/studio/clients.html';}

async function injectAssets(response,css,js,headerName){
  let body=await response.text();
  body=removeAsset(body,'link',css.split('?')[0]);
  body=removeAsset(body,'script',js.split('?')[0]);
  body=body.replace('</head>',`<link rel="stylesheet" href="${css}"></head>`).replace('</body>',`<script src="${js}" defer></script></body>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set(headerName,HORS_NORME_PERSONALIZATION_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-Hors-Norme-Personalization',HORS_NORME_PERSONALIZATION_RELEASE);
  return new Response(JSON.stringify({...current,horsNormePersonalization:HORS_NORME_PERSONALIZATION_RELEASE}),{status:response.status,statusText:response.statusText,headers});
}

function removeAsset(body,type,path){
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  return type==='link'
    ? body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),'')
    : body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');
}
