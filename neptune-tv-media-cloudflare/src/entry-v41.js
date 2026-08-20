import base,{StudioStore,WebTvEncoder} from './entry-v40.js';

export {StudioStore,WebTvEncoder};

const CATALOG_COMPAT_RELEASE='neptune-studio-catalog-cockpit-20260820-v131';
const CATALOG_VISUAL_RELEASE='neptune-studio-catalog-visual-20260820-v132';
const V131_JS='/studio/studio-catalog-cockpit-v131.js';
const V131_CSS='/studio/studio-catalog-cockpit-v131.css';
const V132_JS='/studio/studio-catalog-visual-v132.js?v=1';
const V132_CSS='/studio/studio-catalog-visual-v132.css?v=1';

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)return augmentRelease(response);
    if(request.method==='GET'&&response.ok&&isStudioDocument(url.pathname)&&(response.headers.get('Content-Type')||'').includes('text/html'))return injectVisualCatalog(response);
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

function isStudioDocument(pathname){return pathname==='/studio'||pathname==='/studio/'||pathname.startsWith('/studio/');}

async function injectVisualCatalog(response){
  let body=await response.text();
  body=removeAsset(body,'script',V131_JS);
  body=removeAsset(body,'link',V131_CSS);
  body=removeAsset(body,'script',V132_JS.split('?')[0]);
  body=removeAsset(body,'link',V132_CSS.split('?')[0]);
  body=body.replace('</head>',`<link rel="preload" as="style" data-neptune-compat="v131" href="${V131_CSS}?v=1"><link rel="stylesheet" href="${V132_CSS}"></head>`);
  body=body.replace('</body>',`<script type="application/x-neptune-compat" data-neptune-compat="v131" src="${V131_JS}?v=1"></script><script type="module" src="${V132_JS}"></script></body>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Catalog-Runtime',CATALOG_COMPAT_RELEASE);
  headers.set('X-Neptune-Catalog-Visual',CATALOG_VISUAL_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-Catalog-Runtime',CATALOG_COMPAT_RELEASE);
  headers.set('X-Neptune-Catalog-Visual',CATALOG_VISUAL_RELEASE);
  return new Response(JSON.stringify({...current,catalogRuntime:CATALOG_COMPAT_RELEASE,catalogVisual:CATALOG_VISUAL_RELEASE}),{status:response.status,statusText:response.statusText,headers});
}

function removeAsset(body,type,path){
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  return type==='link'
    ?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),'')
    :body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');
}
