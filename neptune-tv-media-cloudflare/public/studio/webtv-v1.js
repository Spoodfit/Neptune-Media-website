const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
let studioState=null;
let control=null;
let csrfToken=sessionStorage.getItem('neptune_csrf')||'';
let runtimePoll=null;

init();

async function init(){
  try{
    const [studio,webtv]=await Promise.all([
      api('/api/v1/media/studio/state',{},false),
      api('/api/admin/webtv/state',{},false),
    ]);
    studioState=studio;control=webtv;
    $('#accountName').textContent=studio.user?.fullName||studio.user?.email||'Compte Studio';
    $('#accountRole').textContent=studio.user?.displayRole||studio.user?.role||'Admin';
    bind();render();
    $('#syncState').innerHTML='<i></i> Synchronisé';
    runtimePoll=setInterval(refreshRuntime,15000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshRuntime();});
  }catch(error){
    $('#syncState').textContent='Connexion requise';
    toast(error.message==='http_401'||error.message==='http_403'?'Accès Studio requis.':'Impossible de charger la régie.',true);
  }
}

function bind(){
  $('#save').addEventListener('click',save);
  $('#addFromLibrary').addEventListener('click',openLibrary);
  $('#closeLibrary').addEventListener('click',()=>$('#libraryDialog').close());
  $('#enabled').addEventListener('change',()=>{control.enabled=$('#enabled').checked;renderSummary();});
  $('#mode').addEventListener('change',()=>{control.mode=$('#mode').value;renderSummary();});
  $('#fallbackTitle').addEventListener('input',()=>{control.fallback.title=$('#fallbackTitle').value;});
  $('#fallbackUrl').addEventListener('input',()=>{control.fallback.mediaUrl=$('#fallbackUrl').value;});
}

function render(){
  $('#enabled').checked=control.enabled===true;
  $('#mode').value=control.mode==='schedule'?'schedule':'loop';
  $('#fallbackTitle').value=control.fallback?.title||'';
  $('#fallbackUrl').value=control.fallback?.mediaUrl||'';
  renderPlaylist();renderSummary();renderEncoder();
}

function renderPlaylist(){
  const list=control.playlist||[];
  $('#emptyPlaylist').hidden=list.length>0;
  $('#playlist').innerHTML=list.map((item,index)=>`<article class="playlist-item" draggable="true" data-index="${index}">
    <div class="drag" title="Déplacer">⋮⋮</div>
    <div class="playlist-copy"><b>${escapeHtml(item.title)} <span class="type-tag">${escapeHtml(typeLabel(item.type))}</span></b><small>${duration(item.durationSeconds)} · ${escapeHtml(item.mediaUrl)}</small></div>
    <div class="playlist-actions"><button class="icon-button" type="button" data-up="${index}" aria-label="Monter">↑</button><button class="icon-button" type="button" data-down="${index}" aria-label="Descendre">↓</button><button class="icon-button" type="button" data-remove="${index}" aria-label="Retirer">×</button></div>
  </article>`).join('');
  $$('[data-remove]').forEach(b=>b.addEventListener('click',()=>{control.playlist.splice(Number(b.dataset.remove),1);render();}));
  $$('[data-up]').forEach(b=>b.addEventListener('click',()=>move(Number(b.dataset.up),-1)));
  $$('[data-down]').forEach(b=>b.addEventListener('click',()=>move(Number(b.dataset.down),1)));
  let dragged=null;
  $$('.playlist-item').forEach(el=>{
    el.addEventListener('dragstart',()=>{dragged=Number(el.dataset.index);});
    el.addEventListener('dragover',e=>e.preventDefault());
    el.addEventListener('drop',e=>{e.preventDefault();const target=Number(el.dataset.index);if(Number.isInteger(dragged)&&dragged!==target){const [item]=control.playlist.splice(dragged,1);control.playlist.splice(target,0,item);render();}});
  });
}

function move(index,delta){const next=index+delta;if(next<0||next>=control.playlist.length)return;[control.playlist[index],control.playlist[next]]=[control.playlist[next],control.playlist[index]];render();}

function renderSummary(){
  const list=(control.playlist||[]).filter(x=>x.enabled!==false);
  const seconds=list.reduce((sum,item)=>sum+Number(item.durationSeconds||0),0);
  $('#playlistCount').textContent=String(list.length);
  $('#playlistDuration').textContent=seconds?duration(seconds):'0 h';
  $('#modeLabel').textContent=control.mode==='schedule'?'Planning':'Boucle';
  $('#youtubeStatus').textContent=control.output?.configured?'Configuré':'À configurer';
  $('#youtubeReady').classList.toggle('ok',control.output?.configured===true);
  $('#youtubeReady').textContent=control.output?.configured?'YouTube RTMPS configuré':'URL RTMPS + clé de flux à configurer';
}

function renderEncoder(){
  const status=control.encoder?.status||'not_connected';
  const live=['running','live','streaming'].includes(status)&&control.enabled;
  $('#liveCard').classList.toggle('is-live',live);
  $('#liveLabel').textContent=live?'EN DIRECT':control.enabled?'En attente':'Hors ligne';
  $('#encoderStatus').textContent=encoderLabel(status);
  $('#heartbeat').textContent=control.encoder?.lastHeartbeatAt?`Dernier signal ${relative(control.encoder.lastHeartbeatAt)}`:'Aucun heartbeat reçu';
  $('#encoderReady').classList.toggle('ok',status!=='not_connected'&&status!=='error');
  $('#encoderReady').textContent=status==='error'?`Encodeur : ${humanError(control.encoder?.lastError||'erreur')}`:status!=='not_connected'?'Encodeur FFmpeg connecté':'Encodeur FFmpeg à connecter';
}

async function refreshRuntime(){
  if(!control)return;
  try{
    const latest=await api('/api/admin/webtv/state',{},false);
    control={...control,...latest,playlist:control.playlist,fallback:control.fallback,mode:control.mode,enabled:control.enabled};
    control.output=latest.output||control.output;
    control.encoder=latest.encoder||control.encoder;
    renderSummary();renderEncoder();
    $('#syncState').innerHTML='<i></i> Synchronisé';
  }catch{
    $('#syncState').textContent='État indisponible';
  }
}

function openLibrary(){
  const episodes=Array.isArray(studioState?.episodes)?studioState.episodes:[];
  const usable=episodes.map((episode,index)=>({
    id:String(episode.id||`episode-${index+1}`),
    title:String(episode.title||'Émission Neptune Media'),
    mediaUrl:mediaUrlFor(episode),
    durationSeconds:Number(episode.durationSeconds||episode.duration||0),
    type:'episode',
    enabled:true,
  })).filter(item=>item.mediaUrl);
  $('#library').innerHTML=usable.length?usable.map((item,index)=>`<article class="library-item"><div><b>${escapeHtml(item.title)}</b><small>${duration(item.durationSeconds)} · ${escapeHtml(item.mediaUrl)}</small></div><button class="button" type="button" data-add="${index}">Ajouter</button></article>`).join(''):'<div class="empty"><strong>Aucun média exploitable trouvé.</strong><span>Publiez d’abord une vidéo dans la bibliothèque Neptune Media.</span></div>';
  $$('[data-add]').forEach(button=>button.addEventListener('click',()=>{const item=usable[Number(button.dataset.add)];if(!item)return;control.playlist.push(item);render();button.textContent='Ajouté';button.disabled=true;}));
  $('#libraryDialog').showModal();
}

function mediaUrlFor(episode){
  const candidates=[episode.mediaUrl,episode.videoUrl,episode.playbackUrl,episode.assetUrl,episode.url];
  const raw=String(candidates.find(Boolean)||'').trim();
  if(!raw)return'';
  try{const url=new URL(raw,location.origin);return url.origin===location.origin?`${url.pathname}${url.search}`:'';}catch{return'';}
}

async function save(){
  const button=$('#save');button.disabled=true;button.textContent='Enregistrement…';
  control.enabled=$('#enabled').checked;control.mode=$('#mode').value;control.fallback={title:$('#fallbackTitle').value.trim(),mediaUrl:$('#fallbackUrl').value.trim()};
  try{control=await api('/api/admin/webtv/state',{method:'PUT',body:JSON.stringify(control)});render();toast(control.enabled?'Programmation enregistrée. Démarrage de l’antenne demandé.':'Programmation Web TV enregistrée.');setTimeout(refreshRuntime,2500);}
  catch(error){toast('Enregistrement impossible : '+humanError(error.message),true);}
  finally{button.disabled=false;button.textContent='Enregistrer';}
}

async function api(url,options={},addCsrf=true){
  const headers={Accept:'application/json',...(options.headers||{})};
  if(options.body)headers['Content-Type']='application/json';
  if(addCsrf&&options.method&&options.method!=='GET'&&csrfToken)headers['X-CSRF-Token']=csrfToken;
  const response=await fetch(url,{...options,headers,credentials:'same-origin'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||data.code||`http_${response.status}`);
  return data;
}

function duration(seconds){seconds=Math.max(0,Number(seconds||0));if(!seconds)return'Durée inconnue';const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=Math.floor(seconds%60);if(h)return`${h} h ${String(m).padStart(2,'0')}`;return`${m}:${String(s).padStart(2,'0')}`;}
function typeLabel(type){return({episode:'Émission',jingle:'Jingle',ad:'Pub',fallback:'Secours'})[type]||'Émission';}
function encoderLabel(status){return({idle:'Encodeur prêt',running:'Encodeur opérationnel',live:'Encodeur opérationnel',streaming:'Diffusion active',starting:'Démarrage de l’encodeur',stopped:'Encodeur arrêté',error:'Erreur encodeur',not_connected:'Encodeur non connecté'})[status]||status;}
function relative(value){const delta=Math.round((Date.now()-new Date(value).getTime())/1000);if(delta<60)return'il y a moins d’une minute';if(delta<3600)return`il y a ${Math.floor(delta/60)} min`;return`il y a ${Math.floor(delta/3600)} h`;}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));}
function humanError(code){return({studio_forbidden:'accès Studio refusé',origin_forbidden:'origine refusée',youtube_not_configured:'configurez l’URL RTMPS et la clé YouTube',webtv_playlist_empty:'ajoutez au moins un contenu à la playlist',webtv_disabled:'activez d’abord la Web TV',playlist_empty:'playlist vide',encoder_unreachable:'encodeur indisponible',http_401:'connexion requise',http_403:'accès refusé'})[code]||code;}
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.hidden=false;el.style.background=error?'#7d1930':'#081a40';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true;},4200);}
window.addEventListener('beforeunload',()=>{if(runtimePoll)clearInterval(runtimePoll);});
