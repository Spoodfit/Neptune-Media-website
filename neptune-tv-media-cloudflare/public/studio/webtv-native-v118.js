const RELEASE='neptune-native-webtv-ui-20260814-v118';
let v118State=null,v118Timer=null,busy=false;
document.body.dataset.webtvNativeV118=RELEASE;
boot();

async function boot(){
  installUi();
  await refresh();
  v118Timer=setInterval(refresh,10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
}
function installUi(){
  const hero=document.querySelector('.hero > div:first-child p:last-child');if(hero)hero.textContent='La chaîne Neptune diffuse en continu sur son propre lecteur. YouTube est un simulcast facultatif que vous pouvez activer à la demande.';
  const title=document.getElementById('monitorTitle');if(title)title.textContent='Retour de la chaîne Neptune';
  const screen=document.getElementById('antennaScreen');if(screen){screen.innerHTML='<iframe id="neptuneNativePreview" src="/direct/?embed=1" title="Retour antenne Neptune" allow="autoplay; fullscreen" style="width:100%;height:100%;border:0;background:#020617"></iframe><div class="antenna-overlay"><span class="antenna-live-dot"></span><b id="antennaOverlayStatus">NEPTUNE · ANTENNE NATIVE</b></div>';}
  const settings=[...document.querySelectorAll('.settings-card')].find(x=>x.querySelector('#enabled'));if(settings){
    const youtubeField=document.getElementById('youtubeLiveUrl')?.closest('label');if(youtubeField)youtubeField.hidden=true;
    const destination=settings.querySelector('.readonly-row');if(destination)destination.innerHTML='<span><b>Destination principale</b><small>Flux HLS Neptune · indépendant de YouTube</small></span><strong>/direct/</strong>';
    const controls=document.createElement('div');controls.className='native-v118-controls';controls.innerHTML='<a class="button" href="/direct/" target="_blank" rel="noopener">Ouvrir le direct Neptune</a><button class="button" id="youtubeSimulcastV118" type="button">Charger YouTube…</button><small id="youtubeSimulcastHelpV118">YouTube est une sortie secondaire. La chaîne Neptune continue même si YouTube est arrêté.</small>';settings.append(controls);
    document.getElementById('youtubeSimulcastV118')?.addEventListener('click',toggleYoutube);
  }
  const metric=document.getElementById('youtubeStatus')?.closest('article');if(metric)metric.querySelector('span').textContent='simulcast YouTube';
  const ready=document.getElementById('youtubeReady');if(ready)ready.textContent='YouTube facultatif';
  const programText=document.querySelector('#programPanel .panel-head p');if(programText)programText.innerHTML='La vidéo marquée <strong>EN DIRECT</strong> est celle diffusée sur la chaîne Neptune. L’ordre constitue la grille continue et calcule automatiquement le programme « À suivre ».';
  const style=document.createElement('style');style.textContent='.native-v118-controls{display:grid;gap:9px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(148,163,184,.22)}.native-v118-controls .button{width:100%;justify-content:center;text-align:center}.native-v118-controls small{color:#7c879c;line-height:1.45}#neptuneNativePreview{display:block;min-height:360px}@media(max-width:760px){#neptuneNativePreview{min-height:230px}}';document.head.append(style);
}
async function refresh(){
  try{v118State=await api('/api/admin/webtv/state');renderState();}catch(error){console.warn('[WebTV v118]',error);}
}
function renderState(){if(!v118State)return;const yt=v118State.output?.youtube||{},button=document.getElementById('youtubeSimulcastV118'),metric=document.getElementById('youtubeStatus'),ready=document.getElementById('youtubeReady'),help=document.getElementById('youtubeSimulcastHelpV118');if(button){button.disabled=busy||!v118State.enabled||!yt.configured;button.textContent=yt.enabled?'Arrêter le direct YouTube':yt.configured?'Démarrer aussi sur YouTube':'Configurer YouTube dans Cloudflare';}if(metric)metric.textContent=yt.enabled?'En direct':yt.configured?'Prêt':'Non configuré';if(ready){ready.classList.toggle('ok',yt.configured);ready.textContent=yt.enabled?'YouTube : simulcast actif':yt.configured?'YouTube : prêt, facultatif':'YouTube : secrets RTMPS non configurés';}if(help)help.textContent=yt.enabled?'YouTube reçoit actuellement le même programme que la chaîne Neptune. Arrêter YouTube ne coupe pas Neptune.':'YouTube reste arrêté tant que vous ne lancez pas explicitement le simulcast.';const monitor=document.getElementById('monitorSync');if(monitor)monitor.textContent=v118State.enabled?'Flux Neptune natif':'Antenne arrêtée';const badge=document.getElementById('monitorBadge');if(badge)badge.textContent=v118State.enabled?'NEPTUNE LIVE':'HORS LIGNE';}
async function toggleYoutube(){if(!v118State||busy)return;busy=true;renderState();try{const action=v118State.output?.youtube?.enabled?'youtube_stop':'youtube_start',result=await api('/api/admin/webtv/encoder',{method:'POST',body:JSON.stringify({action})},true);v118State=result.state||await api('/api/admin/webtv/state');renderState();toast(action==='youtube_start'?'Simulcast YouTube démarré. La chaîne Neptune reste la diffusion principale.':'YouTube arrêté. La chaîne Neptune continue normalement.');}catch(error){toast(error.message==='youtube_not_configured'?'Configurez d’abord YOUTUBE_RTMPS_URL et YOUTUBE_STREAM_KEY dans Cloudflare.':'Impossible de modifier le simulcast YouTube.',true);}finally{busy=false;renderState();}}
async function api(url,options={},csrf=false){const headers={Accept:'application/json',...(options.headers||{})};if(options.body)headers['Content-Type']='application/json';if(csrf){const token=sessionStorage.getItem('neptune_csrf')||'';if(token)headers['X-CSRF-Token']=token;}const response=await fetch(url,{...options,headers,credentials:'same-origin'}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;}
function toast(text,error=false){if(window.NeptuneWebTvProgram?.toast)return window.NeptuneWebTvProgram.toast(text,error);console[error?'error':'log'](text);}
