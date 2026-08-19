import base,{StudioStore,WebTvEncoder} from './entry-v40.js';

export {StudioStore,WebTvEncoder};

const CATALOG_MARKETPLACE_RELEASE='neptune-studio-catalog-marketplace-20260820-v129-worker-enforced';
const CATALOG_MARKETPLACE_JS='/studio/studio-catalog-marketplace-v129.js?v=1';
const CATALOG_MARKETPLACE_CSS='/studio/studio-catalog-ux-v122-1.css?v=4';
const LEGACY_CATALOG_JS=[
  '/studio/studio-catalog-ux-v122-1.js',
  '/studio/studio-catalog-marketplace-v126.js',
];
const LEGACY_CATALOG_CSS=[
  '/studio/studio-catalog-ux-v122-1.css',
  '/studio/studio-catalog-marketplace-v126.css',
];

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      response=await augmentRelease(response);
    }
    if(request.method==='GET'&&response.ok&&isCatalogDocument(url.pathname)&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await enforceCatalogMarketplace(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

function isCatalogDocument(pathname){
  return pathname==='/studio/advanced'
    ||pathname==='/studio/advanced/'
    ||pathname==='/studio/advanced.html'
    ||pathname==='/studio/settings/catalogue'
    ||pathname==='/studio/settings/catalogue/';
}

async function enforceCatalogMarketplace(response){
  let body=await response.text();
  for(const asset of LEGACY_CATALOG_CSS)body=removeAsset(body,'link',asset);
  for(const asset of LEGACY_CATALOG_JS)body=removeAsset(body,'script',asset);
  body=removeAsset(body,'link',CATALOG_MARKETPLACE_CSS.split('?')[0]);
  body=removeAsset(body,'script',CATALOG_MARKETPLACE_JS.split('?')[0]);
  body=body.replace('</head>',`<link rel="stylesheet" href="${CATALOG_MARKETPLACE_CSS}"></head>`);
  body=body.replace('</body>',`<script type="module" src="${CATALOG_MARKETPLACE_JS}"></script></body>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Catalog-Marketplace',CATALOG_MARKETPLACE_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-Catalog-Marketplace',CATALOG_MARKETPLACE_RELEASE);
  return new Response(JSON.stringify({...current,catalogMarketplace:CATALOG_MARKETPLACE_RELEASE}),{
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

function removeAsset(body,type,path){
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  return type==='link'
    ?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),'')
    :body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');
}
