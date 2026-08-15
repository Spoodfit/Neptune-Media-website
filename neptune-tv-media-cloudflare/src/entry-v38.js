import base,{StudioStore,WebTvEncoder} from './entry-v37.js';
import {clientToken} from './portal-http-utils.js';
import {isSameOrigin,json} from './security.js';

export {StudioStore,WebTvEncoder};

const BASE_CLIENT_EXPERIENCE='neptune-client-experience-20260814-v118.2';
const RELEASE='neptune-client-experience-20260814-v118.4';
const DIRECT_BOOKING_RELEASE='neptune-client-direct-reservation-20260815-v118.5';
const CLIENT_CSS='/espace-client/client-experience-v117.css?v=1';
const CLIENT_JS='/espace-client/client-experience-v117.js?v=1';
const COMMAND_CSS='/espace-client/client-command-center-v118.css?v=1';
const CATALOG_RAIL_CSS='/espace-client/client-catalog-rail-v118.css?v=1';
const VISUAL_CSS='/espace-client/client-visual-coherence-v118-2.css?v=2';
const POLISH_CSS='/espace-client/client-ux-polish-v118-3.css?v=1';
const UX_V1184_CSS='/espace-client/client-ux-v118-4.css?v=1';
const COMMAND_JS='/espace-client/client-command-center-v118-1.js?v=1';
const PREPARATION_CONTEXT_JS='/espace-client/client-preparation-context-v118.js?v=3';
const PASSAGE_JS='/espace-client/client-passage-deeplink-v118.js?v=1';
const VISUAL_JS='/espace-client/client-visual-coherence-v118-2.js?v=2';
const UX_V1184_JS='/espace-client/client-ux-v118-4.js?v=1';
const CALENDAR_CHROME_JS='/espace-client/client-calendar-chrome-v118-4-1.js?v=1';

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/api/client/content-calendar/reuse'){
      return fastGroundedReuse(request,env);
    }
    if(request.method==='POST'&&url.pathname==='/api/client/reservation/prepare-payment'){
      return prepareDirectBookingPayment(request,env);
    }
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      response=await augmentRelease(response);
    }
    if(request.method==='GET'&&isClientDocument(url.pathname)&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await injectClientExperience(response,url.pathname);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

async function fastGroundedReuse(request,env){
  if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
  const payload=await request.json().catch(()=>({}));
  const token=clientToken(request);
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const contextResponse=await callStore(studio,'/portal/content-reuse-context',{token,payload:{fileId:payload.fileId}});
  const context=await contextResponse.json().catch(()=>({}));
  if(!contextResponse.ok||!context.item)return json(context,contextResponse.status);
  const item=context.item;
  const response=await callStore(studio,'/portal/content-reuse-create',{
    token,
    payload:{
      fileId:payload.fileId,
      publishAt:payload.publishAt||item.nextAllowedAt,
      networks:payload.networks,
      title:String(payload.title||cleanFileTitle(item.name)||item.orderTitle||'Contenu Neptune Media').slice(0,140),
      description:String(payload.description||'').slice(0,1800),
      hashtags:Array.isArray(payload.hashtags)?payload.hashtags:[],
    },
  });
  const result=await response.json().catch(()=>({}));
  return json(result,response.status);
}

async function prepareDirectBookingPayment(request,env){
  if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
  const token=clientToken(request);
  if(!token)return json({error:'unauthorized'},401);
  const payload=await request.json().catch(()=>({}));
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const response=await callStore(studio,'/portal/client-direct-booking-v1185/prepare-payment',{token,payload});
  const result=await response.json().catch(()=>({}));
  return json(result,response.status);
}

function isClientDocument(path){
  return path==='/espace-client'||path==='/espace-client/'||path==='/espace-client/index.html'||path.startsWith('/espace-client/videos')||path.startsWith('/espace-client/calendrier');
}

async function injectClientExperience(response,pathname=''){
  let body=await response.text();
  body=body.replace(/<link\b[^>]*href=["'][^"']*\/espace-client\/(?:client-experience-v117|client-command-center-v118|client-catalog-rail-v118|client-visual-coherence-v118-2|client-ux-polish-v118-3|client-ux-v118-4)\.css[^"']*["'][^>]*>\s*/giu,'');
  body=body.replace(/<script\b[^>]*src=["'][^"']*\/espace-client\/(?:client-experience-v117|client-command-center-v118(?:-1)?|client-preparation-context-v118|client-passage-deeplink-v118|client-visual-coherence-v118-2|client-ux-v118-4|client-calendar-chrome-v118-4-1)\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  if(pathname.startsWith('/espace-client/calendrier')){
    body=body.replace(/<script\b[^>]*src=["'][^"']*\/espace-client\/calendrier\/(?:calendar|calendar-compact-v5)\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  }
  body=body.replace('</head>',`<link rel="stylesheet" href="${CLIENT_CSS}"><link rel="stylesheet" href="${COMMAND_CSS}"><link rel="stylesheet" href="${CATALOG_RAIL_CSS}"><link rel="stylesheet" href="${VISUAL_CSS}"><link rel="stylesheet" href="${POLISH_CSS}"><link rel="stylesheet" href="${UX_V1184_CSS}"></head>`);
  const calendarChrome=pathname.startsWith('/espace-client/calendrier')?`<script type="module" src="${CALENDAR_CHROME_JS}"></script>`:'';
  body=body.replace('</body>',`<script type="module" src="${CLIENT_JS}"></script><script type="module" src="${COMMAND_JS}"></script><script type="module" src="${PREPARATION_CONTEXT_JS}"></script><script type="module" src="${PASSAGE_JS}"></script><script type="module" src="${VISUAL_JS}"></script><script type="module" src="${UX_V1184_JS}"></script>${calendarChrome}</body>`);
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Client-Experience',RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,clientExperience:RELEASE,clientExperienceBase:BASE_CLIENT_EXPERIENCE,clientCommandCenter:'compact-selection-persistent-collapsible-stage-details-v118.4',clientPreparation:'step-local-reading-ack-v118',clientPreparationBridge:'v77-state-context-bridge-v118.3.1',clientCatalogVisuals:'studio-synced-v118',clientCatalogLayout:'city-first-horizontal-rail-v118.2',clientVisualCoherence:'icon-halo-selected-stage-v118.4',clientUxPolish:'stable-stage-hitboxes-preloaded-preparation-compact-support-v118.3',clientLibraryLayout:'full-width-responsive-long-short-workspaces-v118.4',clientContentPlanning:'week-month-grounded-video-identity-no-blocking-ai-v118.4',clientCalendarChrome:'persistent-publication-planner-copy-v118.4.1',clientContentReuse:'instant-grounded-file-identity-no-ai-wait-v118.4',clientDirectBooking:DIRECT_BOOKING_RELEASE,clientCatalogInteraction:'single-target-hover-focus-v118.5',clientLoadingStates:'skeleton-error-retry-reduced-motion-v117'}),{
    status:response.status,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
  });
}

function callStore(studio,path,body){
  return studio.fetch(`https://store${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
}
function cleanFileTitle(value){return String(value||'').replace(/\.[a-z0-9]{2,5}$/iu,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim();}
