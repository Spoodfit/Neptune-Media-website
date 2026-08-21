import {getContainer} from '@cloudflare/containers';
import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v39.js';
import {maintainWebTvV118} from './webtv-control-v118.js';

export {WebTvEncoder};

const PLAYBACK_RELEASE='neptune-webtv-playback-20260815-v119.5';
const PLAYER_SELECTION_RELEASE='neptune-webtv-player-selection-20260815-v119.6';
const CONTAINER_READINESS_RELEASE='neptune-webtv-container-readiness-20260817-v119.7';
const WEBTV_EMBED_RELEASE='neptune-webtv-external-embed-20260817-v121';
const PRODUCTION_READINESS_RELEASE='neptune-production-readiness-20260817-v121';
const STUDIO_V122_RELEASE='neptune-studio-webtv-20260818-v122';
const WEBTV_ANALYTICS_RELEASE='neptune-webtv-analytics-20260818-v122';
const CATALOG_RUNTIME_RELEASE='neptune-studio-catalog-cockpit-20260820-v131';
const CATALOG_VISUAL_RELEASE='neptune-studio-catalog-visual-20260820-v132';
const STUDIO_READINESS_JS='/studio/production-readiness-v121.js?v=1';
const STUDIO_READINESS_CSS='/studio/production-readiness-v121.css?v=1';
const STUDIO_OVERVIEW_JS='/studio/studio-overview-v122.js?v=1';
const STUDIO_OVERVIEW_CSS='/studio/studio-overview-v122.css?v=1';
const WEBTV_CONTROL_JS='/studio/webtv-control-room-v122.js?v=1';
const WEBTV_CONTROL_CSS='/studio/webtv-control-room-v122.css?v=1';
const WEBTV_ANALYTICS_JS='/direct/webtv-analytics-v122.js?v=1';
const CATALOG_RUNTIME_JS='/studio/studio-catalog-visual-v132.js?v=1';
const CATALOG_CSS='/studio/studio-catalog-visual-v132.css?v=1';
const CATALOG_COMPAT_JS='/studio/studio-catalog-cockpit-v131.js?v=1';
const CATALOG_COMPAT_CSS='/studio/studio-catalog-cockpit-v131.css?v=1';
const LEGACY_CATALOG_ASSETS=['/studio/studio-catalog-ux-v122-1.js','/studio/studio-catalog-runtime-v130.js','/studio/studio-catalog-visibility-v130-1.js','/studio/studio-catalog-cockpit-v131.js'];
const LEGACY_CATALOG_CSS=['/studio/studio-catalog-ux-v122-1.css','/studio/studio-catalog-cockpit-v131.css'];
const WEBTV_INSTANCE='neptune-webtv-primary';
const NATIVE_FIRST="if(video.canPlayType('application/vnd.apple.mpegurl'))";
const HLS_FIRST="if((!window.Hls||!window.Hls.isSupported())&&video.canPlayType('application/vnd.apple.mpegurl'))";

export class StudioStore extends BaseStudioStore{
  getStats(){
    const stats=super.getStats();
    try{return {...stats,webTv:webTvStats(this.sql)};}catch(error){
      console.warn('webtv_v122_stats_failed',String(error?.message||error));
      return {...stats,webTv:emptyWebTvStats()};
    }
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&isLiveAsset(url.pathname))return resilientLiveFetch(request,env,ctx,url.pathname);
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/direct/'&&response.ok)return normalizeDirectPlayback(response,url);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)return augmentRelease(response);
    if(request.method==='GET'&&response.ok&&isStudioDocument(url.pathname)&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await injectStudioReadiness(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

function webTvStats(sql){
  const totals=sql.exec(`
    SELECT
      SUM(CASE WHEN event_name='view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN event_name='watch' THEN watch_delta_seconds ELSE 0 END) AS watchSeconds,
      SUM(CASE WHEN event_name='booking_click' THEN 1 ELSE 0 END) AS bookingClicks,
      SUM(CASE WHEN event_name='complete' THEN 1 ELSE 0 END) AS completions,
      COUNT(DISTINCT session_id) AS uniqueViewers
    FROM video_events WHERE session_id LIKE 'webtv:%'
  `).one();
  const byEpisode={};
  for(const row of sql.exec(`
    SELECT episode_id AS episodeId,
      SUM(CASE WHEN event_name='view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN event_name='watch' THEN watch_delta_seconds ELSE 0 END) AS watchSeconds,
      SUM(CASE WHEN event_name='booking_click' THEN 1 ELSE 0 END) AS bookingClicks,
      SUM(CASE WHEN event_name='complete' THEN 1 ELSE 0 END) AS completions,
      COUNT(DISTINCT session_id) AS uniqueViewers
    FROM video_events WHERE session_id LIKE 'webtv:%' GROUP BY episode_id
  `)){
    if(row.episodeId)byEpisode[row.episodeId]=metrics(row,['views','watchSeconds','bookingClicks','completions','uniqueViewers']);
  }
  const daily=[];
  for(const row of sql.exec(`
    SELECT day,
      SUM(CASE WHEN event_name='view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN event_name='watch' THEN watch_delta_seconds ELSE 0 END) AS watchSeconds,
      SUM(CASE WHEN event_name='booking_click' THEN 1 ELSE 0 END) AS bookingClicks
    FROM video_events
    WHERE session_id LIKE 'webtv:%' AND day >= date('now','-29 day')
    GROUP BY day ORDER BY day ASC
  `))daily.push({day:row.day,...metrics(row,['views','watchSeconds','bookingClicks'])});
  const adStats={};
  for(const row of sql.exec(`
    SELECT ad_id AS adId,
      SUM(CASE WHEN event_name='impression' THEN 1 ELSE 0 END) AS impressions,
      SUM(CASE WHEN event_name='play' THEN 1 ELSE 0 END) AS plays,
      SUM(CASE WHEN event_name='complete' THEN 1 ELSE 0 END) AS completions,
      SUM(CASE WHEN event_name='click' THEN 1 ELSE 0 END) AS clicks
    FROM ad_events WHERE session_id LIKE 'webtv:%' GROUP BY ad_id
  `)){
    if(row.adId)adStats[row.adId]=metrics(row,['impressions','plays','completions','clicks']);
  }
  return {...metrics(totals,['views','watchSeconds','bookingClicks','completions','uniqueViewers']),byEpisode,daily,adStats};
}

function metrics(row,keys){const out={};for(const key of keys)out[key]=Number(row?.[key]||0);return out;}
function emptyWebTvStats(){return{views:0,watchSeconds:0,bookingClicks:0,completions:0,uniqueViewers:0,byEpisode:{},daily:[],adStats:{}};}

async function resilientLiveFetch(request,env,ctx,pathname){
  const manifest=pathname.endsWith('/index.m3u8');
  let response=await base.fetch(request,env,ctx);
  let retries=0;
  if(!retryableLiveResponse(response,manifest))return markLiveResponse(response,retries);

  const container=getContainer(env.WEBTV_ENCODER,WEBTV_INSTANCE);
  try{
    await container.startAndWaitForPorts({cancellationOptions:{instanceGetTimeoutMS:3000,portReadyTimeoutMS:8000,waitInterval:200}});
  }catch(error){console.warn('webtv_v1197_container_readiness_failed',String(error?.message||error));}

  try{await maintainWebTvV118(env);}catch(error){console.warn('webtv_v1197_state_resync_failed',String(error?.message||error));}

  const delays=manifest?[150,300,600,1200,2000,3000]:[100,200,400,800];
  for(const delay of delays){
    await sleep(delay);
    retries+=1;
    response=await base.fetch(request,env,ctx);
    if(!retryableLiveResponse(response,manifest))return markLiveResponse(response,retries);
  }
  return markLiveResponse(response,retries);
}

function retryableLiveResponse(response,manifest){if([502,503,504].includes(response.status))return true;return manifest&&[404,425].includes(response.status);}
function markLiveResponse(response,retries){const headers=new Headers(response.headers);headers.set('X-Neptune-WebTV-Readiness',CONTAINER_READINESS_RELEASE);headers.set('X-Neptune-WebTV-Retries',String(retries));return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function isLiveAsset(pathname){return /^\/direct\/live\/(?:index\.m3u8|segment-\d+\.ts)$/u.test(pathname);}
function isStudioDocument(pathname){return pathname==='/studio'||pathname==='/studio/'||pathname.startsWith('/studio/');}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function normalizeDirectPlayback(response,url){
  let body=await response.text();
  if(body.includes(NATIVE_FIRST))body=body.replace(NATIVE_FIRST,HLS_FIRST);
  body=removeAsset(body,'script',WEBTV_ANALYTICS_JS.split('?')[0]);
  body=body.replace('</body>',`<script type="module" src="${WEBTV_ANALYTICS_JS}"></script></body>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  const directives=(headers.get('Content-Security-Policy')||"default-src 'self'").split(';').map(value=>value.trim()).filter(Boolean);
  upsertDirective(directives,'worker-src',["'self'",'blob:']);
  upsertDirective(directives,'child-src',["'self'",'blob:']);
  const embed=url.searchParams.get('embed')==='1';
  if(embed){headers.delete('X-Frame-Options');upsertDirective(directives,'frame-ancestors',["'self'",'https:']);headers.set('Cross-Origin-Resource-Policy','cross-origin');headers.set('X-Neptune-WebTV-Embed',WEBTV_EMBED_RELEASE);}
  else{headers.set('X-Frame-Options','SAMEORIGIN');upsertDirective(directives,'frame-ancestors',["'self'"]);}
  headers.set('Content-Security-Policy',directives.join('; '));
  headers.set('Cache-Control','no-store, max-age=0');
  headers.set('X-Neptune-WebTV-Playback',PLAYBACK_RELEASE);
  headers.set('X-Neptune-WebTV-Player',PLAYER_SELECTION_RELEASE);
  headers.set('X-Neptune-WebTV-Readiness',CONTAINER_READINESS_RELEASE);
  headers.set('X-Neptune-WebTV-Analytics',WEBTV_ANALYTICS_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function injectStudioReadiness(response){
  let body=await response.text();
  for(const asset of LEGACY_CATALOG_ASSETS)body=removeAsset(body,'script',asset);
  for(const asset of LEGACY_CATALOG_CSS)body=removeAsset(body,'link',asset);
  for(const asset of [STUDIO_READINESS_CSS,STUDIO_OVERVIEW_CSS,WEBTV_CONTROL_CSS,CATALOG_CSS])body=removeAsset(body,'link',asset.split('?')[0]);
  for(const asset of [STUDIO_READINESS_JS,STUDIO_OVERVIEW_JS,WEBTV_CONTROL_JS,CATALOG_RUNTIME_JS])body=removeAsset(body,'script',asset.split('?')[0]);
  body=body.replace('</head>',`<link rel="stylesheet" href="${STUDIO_READINESS_CSS}"><link rel="stylesheet" href="${STUDIO_OVERVIEW_CSS}"><link rel="stylesheet" href="${WEBTV_CONTROL_CSS}"><link rel="preload" as="style" data-neptune-compat="v131" href="${CATALOG_COMPAT_CSS}"><link rel="stylesheet" href="${CATALOG_CSS}"></head>`);
  body=body.replace('</body>',`<script type="module" src="${STUDIO_READINESS_JS}"></script><script type="module" src="${STUDIO_OVERVIEW_JS}"></script><script type="module" src="${WEBTV_CONTROL_JS}"></script><script type="application/x-neptune-compat" data-neptune-compat="v131" src="${CATALOG_COMPAT_JS}"></script><script type="module" src="${CATALOG_RUNTIME_JS}"></script></body>`);
  const headers=new Headers(response.headers);
  for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Production-Readiness',PRODUCTION_READINESS_RELEASE);
  headers.set('X-Neptune-Studio-WebTV',STUDIO_V122_RELEASE);
  headers.set('X-Neptune-Catalog-Runtime',CATALOG_RUNTIME_RELEASE);
  headers.set('X-Neptune-Catalog-Visual',CATALOG_VISUAL_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function upsertDirective(directives,name,values){const index=directives.findIndex(value=>value===name||value.startsWith(`${name} `));if(index<0){directives.push(`${name} ${values.join(' ')}`);return;}const tokens=directives[index].split(/\s+/u);for(const value of values)if(!tokens.includes(value))tokens.push(value);directives[index]=tokens.join(' ');}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-WebTV-Playback',PLAYBACK_RELEASE);
  headers.set('X-Neptune-WebTV-Player',PLAYER_SELECTION_RELEASE);
  headers.set('X-Neptune-WebTV-Readiness',CONTAINER_READINESS_RELEASE);
  headers.set('X-Neptune-WebTV-Embed',WEBTV_EMBED_RELEASE);
  headers.set('X-Neptune-Production-Readiness',PRODUCTION_READINESS_RELEASE);
  headers.set('X-Neptune-Studio-WebTV',STUDIO_V122_RELEASE);
  headers.set('X-Neptune-WebTV-Analytics',WEBTV_ANALYTICS_RELEASE);
  headers.set('X-Neptune-Catalog-Runtime',CATALOG_RUNTIME_RELEASE);
  headers.set('X-Neptune-Catalog-Visual',CATALOG_VISUAL_RELEASE);
  return new Response(JSON.stringify({...current,webTvPlayback:PLAYBACK_RELEASE,webTvPlayerSelection:PLAYER_SELECTION_RELEASE,webTvContainerReadiness:CONTAINER_READINESS_RELEASE,webTvExternalEmbed:WEBTV_EMBED_RELEASE,productionReadiness:PRODUCTION_READINESS_RELEASE,studioWebTv:STUDIO_V122_RELEASE,webTvAnalytics:WEBTV_ANALYTICS_RELEASE,catalogRuntime:CATALOG_RUNTIME_RELEASE,catalogVisual:CATALOG_VISUAL_RELEASE}),{status:response.status,statusText:response.statusText,headers});
}

function disableModuleAsset(body,path,label){const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');return body.replace(new RegExp(`<script\\b[^>]*src=["']([^"']*${escaped}[^"']*)["'][^>]*>\\s*<\\/script>\\s*`,'giu'),(_match,src)=>`<script type="application/x-neptune-disabled" data-neptune-disabled="${label}" src="${src}"></script>`);}
function removeAsset(body,type,path){const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');return type==='link'?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),''):body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');}
