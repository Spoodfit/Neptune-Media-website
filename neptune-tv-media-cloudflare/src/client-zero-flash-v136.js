const RELEASE='neptune-client-zero-flash-20260823-v136';
const CSS='/espace-client/session-zero-flash-v136.css?v=1';
const JS='/espace-client/session-zero-flash-v136.js?v=1';
const PATHS=new Set(['/espace-client','/espace-client/','/espace-client/index.html']);

export function isClientZeroFlashDocumentV136(pathname){return PATHS.has(String(pathname||''));}

export async function injectClientZeroFlashV136(response,pathname){
  if(!isClientZeroFlashDocumentV136(pathname))return response;
  let body=await response.text();
  body=removeAsset(body,'link',CSS.split('?')[0]);
  body=removeAsset(body,'script',JS.split('?')[0]);
  body=body.replace(/<html\b([^>]*)>/iu,(match,attrs)=>/\bdata-neptune-client-boot=/iu.test(attrs)?match:`<html${attrs} data-neptune-client-boot="v136">`);
  body=body.replace(/<header id="publicHeader" class="auth-header"(?![^>]*\bhidden\b)([^>]*)>/iu,'<header id="publicHeader" class="auth-header" hidden$1>');
  body=body.replace(/<section id="auth" class="auth-shell"(?![^>]*\bhidden\b)([^>]*)>/iu,'<section id="auth" class="auth-shell" hidden$1>');
  body=body.replace(/<head>/iu,`<head><link rel="stylesheet" href="${CSS}" data-neptune-client-zero-flash="v136">`);
  body=body.replace(/<\/body>/iu,`<script type="module" src="${JS}" data-neptune-client-zero-flash="v136"></script></body>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Client-Zero-Flash',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function removeAsset(body,type,path){
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  return type==='link'
    ?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),'')
    :body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');
}
