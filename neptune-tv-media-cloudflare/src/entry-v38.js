import base,{StudioStore,WebTvEncoder} from './entry-v37.js';

export {StudioStore,WebTvEncoder};

const RELEASE='neptune-client-experience-20260814-v118';
const CLIENT_CSS='/espace-client/client-experience-v117.css?v=1';
const CLIENT_JS='/espace-client/client-experience-v117.js?v=1';
const COMMAND_CSS='/espace-client/client-command-center-v118.css?v=1';
const COMMAND_JS='/espace-client/client-command-center-v118-1.js?v=1';
const PASSAGE_JS='/espace-client/client-passage-deeplink-v118.js?v=1';

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      response=await augmentRelease(response);
    }
    if(request.method==='GET'&&isClientDocument(url.pathname)&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await injectClientExperience(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

function isClientDocument(path){
  return path==='/espace-client'||path==='/espace-client/'||path==='/espace-client/index.html'||path.startsWith('/espace-client/videos')||path.startsWith('/espace-client/calendrier');
}

async function injectClientExperience(response){
  let body=await response.text();
  body=body.replace(/<link\b[^>]*href=["'][^"']*\/espace-client\/(?:client-experience-v117|client-command-center-v118)\.css[^"']*["'][^>]*>\s*/giu,'');
  body=body.replace(/<script\b[^>]*src=["'][^"']*\/espace-client\/(?:client-experience-v117|client-command-center-v118(?:-1)?|client-passage-deeplink-v118)\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  body=body.replace('</head>',`<link rel="stylesheet" href="${CLIENT_CSS}"><link rel="stylesheet" href="${COMMAND_CSS}"></head>`);
  body=body.replace('</body>',`<script type="module" src="${CLIENT_JS}"></script><script type="module" src="${COMMAND_JS}"></script><script type="module" src="${PASSAGE_JS}"></script></body>`);
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Client-Experience',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,clientExperience:RELEASE,clientCommandCenter:'contextual-stage-details-content-folders-v118.1',clientPreparation:'step-local-reading-ack-v118',clientCatalogVisuals:'studio-synced-v118',clientLoadingStates:'skeleton-error-retry-reduced-motion-v117'}),{
    status:response.status,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
  });
}
