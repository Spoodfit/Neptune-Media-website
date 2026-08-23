const RELEASE='neptune-studio-zero-flash-20260823-v138.4';
const SHELL_CSS='/studio/studio-zero-flash-v136.css?v=1';
const SHELL_JS='/studio/studio-zero-flash-v136.js?v=1';
const CANONICAL_CSS='/studio/studio-shell-v105.css?v=4';
const CANONICAL_CSS_PATH='/studio/studio-shell-v105.css';
const CANONICAL_SHELL='/studio/studio-information-architecture-v65-1.js?v=109';
const CANONICAL_PATH='/studio/studio-information-architecture-v65-1.js';
const COMPAT_PATH='/studio/studio-information-architecture-v65.js';
const NAVIGATION_GUARD='/studio/studio-navigation-guard-v138.js?v=1';
const NAVIGATION_GUARD_PATH='/studio/studio-navigation-guard-v138.js';
const CLIENT_OPERATIONS_PATH='/studio/studio-client-operations-v76.js';

const SHELL_PATHS=new Set([
  '/studio/clients',
  '/studio/clients.html',
  '/studio/video-ai',
  '/studio/video-ai.html',
  '/studio/webtv',
  '/studio/webtv.html',
  '/studio/advanced',
  '/studio/advanced.html',
]);

export function isStudioZeroFlashDocumentV136(pathname){
  return SHELL_PATHS.has(normalize(pathname));
}

export async function injectStudioZeroFlashV136(response,pathname){
  if(!isStudioZeroFlashDocumentV136(pathname))return response;
  let body=await response.text();
  body=removeAsset(body,'link',SHELL_CSS.split('?')[0]);
  body=removeAsset(body,'link',CANONICAL_CSS_PATH);
  body=removeAsset(body,'script',SHELL_JS.split('?')[0]);
  body=removeAsset(body,'script',CANONICAL_PATH);
  body=removeAsset(body,'script',COMPAT_PATH);
  body=removeAsset(body,'script',NAVIGATION_GUARD_PATH);
  // v76 was an already-broken legacy enhancement: it redeclared global helpers and
  // removed the Production destination. Keep it out of the final canonical shell.
  if(isClients(pathname))body=removeAsset(body,'script',CLIENT_OPERATIONS_PATH);
  body=body.replace(/<html\b([^>]*)>/iu,(match,attrs)=>{
    if(/\bdata-neptune-studio-boot=/iu.test(attrs))return match.replace(/data-neptune-studio-boot=["'][^"']*["']/iu,'data-neptune-studio-boot="v136"');
    return `<html${attrs} data-neptune-studio-boot="v136">`;
  });
  body=body.replace(/<head>/iu,`<head><link rel="stylesheet" href="${SHELL_CSS}" data-neptune-zero-flash="v136"><link rel="stylesheet" href="${CANONICAL_CSS}" data-neptune-canonical-shell-css="v138">`);
  body=body.replace(/<\/body>/iu,`<script type="module" src="${CANONICAL_SHELL}" data-neptune-canonical-shell="v138"></script><script type="module" src="${NAVIGATION_GUARD}" data-neptune-navigation-guard="v138"></script><script type="module" src="${SHELL_JS}" data-neptune-zero-flash="v136"></script></body>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Studio-Zero-Flash',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export function augmentStudioZeroFlashReleaseV136(payload={}){
  return {...payload,studioZeroFlash:RELEASE};
}

function normalize(pathname){
  const clean=String(pathname||'').replace(/\/+$/u,'');
  return clean||'/';
}
function isClients(pathname){
  const path=normalize(pathname);
  return path==='/studio/clients'||path==='/studio/clients.html';
}
function removeAsset(body,type,path){
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  return type==='link'
    ?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),'')
    :body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');
}
