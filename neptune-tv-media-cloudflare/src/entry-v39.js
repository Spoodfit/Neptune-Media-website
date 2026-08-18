import base,{StudioStore} from './entry-v38.js';
import {WebTvEncoder,WEBTV_V118_RELEASE,handleWebTvV118,maintainWebTvV118,publicWebTvStateV118,proxyLiveAssetV118} from './webtv-control-v118.js';

export {StudioStore,WebTvEncoder};

const RELEASE='neptune-media-native-webtv-20260819-v119.8';
const WIZARD_JS='/studio/client-passage-wizard-v118.js?v=2';
const WIZARD_CSS='/studio/client-passage-wizard-v118.css?v=2';
const WEBTV_NATIVE_JS='/studio/webtv-native-v118.js?v=2';

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const control=await handleWebTvV118(request,env,ctx,(probe)=>base.fetch(probe,env,ctx));
    if(control)return control;
    if(request.method==='GET'&&url.pathname==='/api/public/webtv/state')return publicResponse(await publicWebTvStateV118(env));
    if(request.method==='GET'&&url.pathname.startsWith('/direct/live/'))return proxyLiveAssetV118(request,env);
    if(request.method==='GET'&&url.pathname==='/direct')return Response.redirect(`${url.origin}/direct/`,308);
    if(request.method==='GET'&&url.pathname==='/direct/')return directPage(url);

    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok)response=await augmentRelease(response);
    if(request.method==='GET'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')){
      if(isClients(url.pathname))response=await injectClientWizard(response);
      else if(isWebTvStudio(url.pathname))response=await injectWebTvNative(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(controller?.cron==='* * * * *')return maintainWebTvV118(env);
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};

async function injectClientWizard(response){
  let body=await response.text();
  body=removeAsset(body,'link',WIZARD_CSS.split('?')[0]);
  body=removeAsset(body,'script',WIZARD_JS.split('?')[0]);
  body=body.replace('</head>',`<link rel="stylesheet" href="${WIZARD_CSS}"></head>`).replace('</body>',`<script type="module" src="${WIZARD_JS}"></script></body>`);
  const headers=rewritten(response);headers.set('X-Neptune-Passage-Wizard',RELEASE);allowFrame(headers,'https://calendar.google.com');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function injectWebTvNative(response){
  let body=await response.text();
  body=removeAsset(body,'script',WEBTV_NATIVE_JS.split('?')[0]);
  body=body.replace('</body>',`<script type="module" src="${WEBTV_NATIVE_JS}"></script></body>`);
  const headers=rewritten(response);headers.set('X-Neptune-WebTV-Native',WEBTV_V118_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function directPage(url){
  const embed=url.searchParams.get('embed')==='1';
  const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#020617"><title>Direct · Neptune Business</title><link rel="icon" href="/assets/logo-neptune.svg"><style>${directCss(embed)}</style></head><body class="${embed?'embed':''}"><main class="channel"><header class="brand"><a href="/direct/" aria-label="Neptune Business"><img src="/assets/logo-neptune.svg" alt=""><span><b>NEPTUNE</b><small>BUSINESS · DIRECT</small></span></a><div id="liveBadge" class="live-badge"><i></i><span>CONNEXION</span></div></header><section class="player-shell"><video id="player" controls autoplay muted playsinline preload="auto"></video><div id="playerState" class="player-state"><span class="loader"></span><b>Connexion à l’antenne Neptune…</b><small>Le direct démarre automatiquement.</small></div></section><section class="now"><div><p>À L’ANTENNE</p><h1 id="currentTitle">Neptune Business</h1><span id="currentTime">Diffusion continue</span></div><div class="next"><p>À SUIVRE</p><b id="nextTime">—</b><strong id="nextTitle">Chargement du programme…</strong></div></section><section class="schedule"><div class="schedule-head"><div><p>PROGRAMME</p><h2>À suivre sur Neptune</h2></div><span>Heure de Paris</span></div><div id="scheduleList" class="schedule-list"></div></section></main><script src="https://cdn.jsdelivr.net/npm/hls.js@1.6.16/dist/hls.min.js"></script><script>${directJs()}</script></body></html>`;
  const headers=new Headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",'X-Neptune-WebTV':WEBTV_V118_RELEASE});
  return new Response(html,{status:200,headers});
}

function directCss(embed){return `*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#020617;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{background:radial-gradient(circle at 20% 0,rgba(78,63,180,.22),transparent 32rem),#020617}.channel{width:min(1320px,100%);margin:auto;padding:22px 24px 56px}.brand{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:18px}.brand a{display:flex;align-items:center;gap:11px;color:#fff;text-decoration:none}.brand img{width:34px;height:34px}.brand span{display:grid;line-height:1}.brand b{font-size:16px;letter-spacing:.12em}.brand small{margin-top:5px;color:#8690a9;font-size:9px;letter-spacing:.18em}.live-badge{display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid #24304e;border-radius:999px;background:#0b1328;color:#aeb8d0;font-size:10px;font-weight:900;letter-spacing:.12em}.live-badge i{width:7px;height:7px;border-radius:50%;background:#64748b}.live-badge.on{border-color:rgba(239,68,68,.45);color:#fff}.live-badge.on i{background:#ef4444;box-shadow:0 0 0 5px rgba(239,68,68,.12)}.player-shell{position:relative;overflow:hidden;aspect-ratio:16/9;border:1px solid #1e293b;border-radius:20px;background:#000;box-shadow:0 28px 80px rgba(0,0,0,.38)}video{width:100%;height:100%;object-fit:contain;background:#000}.player-state{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:10px;background:linear-gradient(140deg,#050b18,#10183a);text-align:center;padding:20px}.player-state[hidden]{display:none}.player-state small{color:#93a0ba}.loader{width:28px;height:28px;border:3px solid #39435b;border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.now{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,360px);gap:16px;margin-top:16px}.now>div{padding:19px 21px;border:1px solid #1d2944;border-radius:16px;background:rgba(10,18,39,.83)}.now p,.schedule p{margin:0 0 7px;color:#818ca5;font-size:10px;font-weight:900;letter-spacing:.15em}.now h1{margin:0 0 8px;font-size:clamp(22px,3vw,35px);line-height:1.05}.now span{color:#99a5bd}.next{display:grid;align-content:center}.next b{color:#8b7cf6;font-size:13px}.next strong{margin-top:5px;font-size:18px}.schedule{margin-top:28px}.schedule-head{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:12px}.schedule h2{margin:0;font-size:24px}.schedule-head>span{color:#75819a;font-size:12px}.schedule-list{display:grid;gap:8px}.schedule-row{display:grid;grid-template-columns:72px 1fr auto;gap:14px;align-items:center;padding:13px 15px;border:1px solid #18233b;border-radius:12px;background:#081020}.schedule-row time{font-weight:900;color:#9b8dff}.schedule-row b{font-size:14px}.schedule-row span{color:#6f7b94;font-size:11px;text-transform:uppercase}.empty{padding:26px;border:1px dashed #283550;border-radius:14px;color:#8591aa;text-align:center}@media(max-width:720px){.channel{padding:14px 12px 32px}.player-shell{border-radius:12px}.now{grid-template-columns:1fr}.schedule-row{grid-template-columns:58px 1fr}.schedule-row span{display:none}}${embed?'.channel{padding:0;width:100%}.brand,.now,.schedule{display:none}.player-shell{border:0;border-radius:0;box-shadow:none;min-height:100vh;aspect-ratio:auto}video{min-height:100vh}body{overflow:hidden}':''}`;}

function directJs(){return `(()=>{const video=document.getElementById('player'),state=document.getElementById('playerState'),badge=document.getElementById('liveBadge');let hls=null,first=true,restartTimer=null;function destroy(){if(restartTimer){clearTimeout(restartTimer);restartTimer=null;}if(hls){try{hls.destroy()}catch{}hls=null;}}function hardRestart(){destroy();restartTimer=setTimeout(()=>{restartTimer=null;player();},1600);}function player(){const src='/direct/live/index.m3u8';if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=src;video.addEventListener('loadedmetadata',()=>video.play().catch(()=>{}),{once:true});}else if(window.Hls&&window.Hls.isSupported()){hls=new Hls({enableWorker:true,lowLatencyMode:false,liveSyncDurationCount:4,liveMaxLatencyDurationCount:10,maxBufferLength:36,maxMaxBufferLength:60,backBufferLength:24,maxBufferHole:.7,nudgeOffset:.15,nudgeMaxRetry:5,highBufferWatchdogPeriod:3,startFragPrefetch:true});hls.loadSource(src);hls.attachMedia(video);hls.on(Hls.Events.MANIFEST_PARSED,()=>video.play().catch(()=>{}));hls.on(Hls.Events.ERROR,(_,data)=>{if(!data.fatal)return;if(data.type===Hls.ErrorTypes.NETWORK_ERROR){try{hls.startLoad()}catch{hardRestart()}return;}if(data.type===Hls.ErrorTypes.MEDIA_ERROR){try{hls.recoverMediaError()}catch{hardRestart()}return;}hardRestart();});}else{state.querySelector('b').textContent='Lecteur HLS non disponible';state.querySelector('small').textContent='Utilisez un navigateur récent.';}}video.addEventListener('playing',()=>state.hidden=true);video.addEventListener('stalled',()=>{if(hls){try{hls.startLoad(-1)}catch{}}});video.addEventListener('waiting',()=>{if(first)state.hidden=false;});window.addEventListener('beforeunload',destroy,{once:true});async function status(){try{const r=await fetch('/api/public/webtv/state',{cache:'no-store'}),d=await r.json();render(d);if(first&&d.enabled){first=false;player();}}catch{badge.querySelector('span').textContent='SIGNAL INDISPONIBLE';}}function render(d){badge.classList.toggle('on',d.enabled&&['streaming','live','running'].includes(d.encoder?.status));badge.querySelector('span').textContent=d.enabled?'EN DIRECT':'HORS LIGNE';document.getElementById('currentTitle').textContent=d.current?.title||'Neptune Business';document.getElementById('currentTime').textContent=d.current?.startedAt?'Depuis '+clock(d.current.startedAt):'Diffusion continue';document.getElementById('nextTitle').textContent=d.next?.title||'Programme à venir';document.getElementById('nextTime').textContent=d.current?.estimatedEndAt?clock(d.current.estimatedEndAt):'À suivre';const list=document.getElementById('scheduleList');list.innerHTML=(d.schedule||[]).length?(d.schedule||[]).map(x=>'<article class="schedule-row"><time>'+clock(x.startsAt)+'</time><b>'+esc(x.title)+'</b><span>'+esc(type(x.type))+'</span></article>').join(''):'<div class="empty">La prochaine grille sera affichée dès que l’antenne sera programmée.</div>';if(!d.enabled){state.hidden=false;state.querySelector('b').textContent='La chaîne est momentanément hors antenne';state.querySelector('small').textContent='Le prochain programme sera affiché ici automatiquement.';}}function clock(v){const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(d)}function type(v){return({episode:'Émission',ad:'Publicité',jingle:'Jingle',fallback:'Antenne'})[v]||'Programme'}function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}status();setInterval(status,10000);})();`;}

async function augmentRelease(response){
  const current=await response.json().catch(()=>({}));
  return new Response(JSON.stringify({...current,nativeWebTv:RELEASE,webTvControlRoom:WEBTV_V118_RELEASE,webTvBroadcastEngine:'neptune-native-hls-with-optional-youtube-rtmps',webTvPublicDirect:'/direct/',clientPassageWizard:'catalog-driven-step-by-step-v118'}),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Neptune-Release':RELEASE}});
}
function publicResponse(data){return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*','X-Neptune-WebTV':WEBTV_V118_RELEASE}});}
function rewritten(response){const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);headers.set('Cache-Control','private, no-store, max-age=0');return headers;}
function allowFrame(headers,source){const csp=headers.get('Content-Security-Policy')||"default-src 'self'";if(csp.includes(source))return;const parts=csp.split(';').map(x=>x.trim()).filter(Boolean);const index=parts.findIndex(x=>x==='frame-src'||x.startsWith('frame-src '));if(index>=0)parts[index]=`${parts[index]} ${source}`;else parts.push(`frame-src 'self' ${source}`);headers.set('Content-Security-Policy',parts.join('; '));}
function removeAsset(body,type,path){const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');return type==='link'?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),''):body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');}
function isClients(path){return path==='/studio/clients'||path==='/studio/clients/'||path==='/studio/clients.html';}
function isWebTvStudio(path){return path==='/studio/webtv'||path==='/studio/webtv/'||path==='/studio/webtv.html';}
