import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v42.js';
import {
  BUSINESS_V142_RELEASE,
  augmentBusinessReleaseV142,
  handleBusinessV142Http,
  handleBusinessV142Store,
  sendDuePreparationPacksV142,
} from './catalog-booking-cost-v142.js';

export {WebTvEncoder};

const BOOKING_JS='/reserver/assets/booking-slots-v142.js?v=1';
const BOOKING_CSS='/reserver/assets/booking-slots-v142.css?v=1';
const STUDIO_JS='/studio/studio-business-v142.js?v=1';
const STUDIO_CSS='/studio/studio-business-v142.css?v=1';

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    const handled=await handleBusinessV142Store(this,request);
    if(handled)return handled;
    return super.fetch(request);
  }
}

export default{
  async fetch(request,env,ctx){
    const response=await handleBusinessV142Http(request,env,ctx,(probe)=>base.fetch(probe,env,ctx));
    return maybeEnhance(request,response);
  },
  async scheduled(controller,env,ctx){
    const tasks=[];
    if(typeof base.scheduled==='function')tasks.push(Promise.resolve(base.scheduled(controller,env,ctx)));
    if(controller?.cron==='* * * * *')tasks.push(sendDuePreparationPacksV142(env));
    if(tasks.length)await Promise.allSettled(tasks);
  },
};

async function maybeEnhance(request,response){
  const url=new URL(request.url);
  if(request.method==='GET'&&response.ok&&url.pathname==='/api/public/release')return augmentBusinessReleaseV142(response);
  if(request.method==='GET'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
    if(url.pathname==='/reserver'||url.pathname==='/reserver/')return injectAssets(response,BOOKING_CSS,BOOKING_JS,'X-Neptune-Booking-Slots');
    if(isStudio(url.pathname))return injectAssets(response,STUDIO_CSS,STUDIO_JS,'X-Neptune-Business-Engine');
  }
  return mark(response);
}
function isStudio(path){return path==='/studio'||path==='/studio/'||path.startsWith('/studio/');}
async function injectAssets(response,css,js,headerName){
  let body=await response.text();
  body=removeAsset(body,'link',css.split('?')[0]);
  body=removeAsset(body,'script',js.split('?')[0]);
  if(body.includes('/reserver/assets/app-v96.js'))body=body.replace(/<script\b[^>]*src=["'][^"']*\/reserver\/assets\/app-v96\.js[^"']*["'][^>]*>\s*<\/script>/iu,match=>`<link rel="stylesheet" href="${css}"><script type="module" src="${js}"></script>${match}`);
  else body=body.replace('</head>',`<link rel="stylesheet" href="${css}"></head>`).replace('</body>',`<script type="module" src="${js}"></script></body>`);
  const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);headers.set('Cache-Control','private, no-store, max-age=0');headers.set(headerName,BUSINESS_V142_RELEASE);return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
function mark(response){const headers=new Headers(response.headers);headers.set('X-Neptune-Business-Engine',BUSINESS_V142_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function removeAsset(body,type,path){const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');return type==='link'?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),''):body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');}
