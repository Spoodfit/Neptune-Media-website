const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
let studioState=null;
let control=null;
let csrfToken=sessionStorage.getItem('neptune_csrf')||'';
let runtimePoll=null;
let libraryMode='playlist';

init();

async function init(){
  try{
    const auth=await api('/api/auth/status',{},false);
    if(auth.authenticated===false||!['admin','editor'].includes(String(auth.user?.role||'')))throw new Error('http_403');
    csrfToken=auth.csrfToken||csrfToken;
    if(csrfToken)sessionStorage.setItem('neptune_csrf',csrfToken);
    const [studio,webtv]=await Promise.all([
      api('/api/admin/state',{},false),
      api('/api/admin/webtv/state',{},false),
    ]);
    studioState=studio;control=webtv;
    const user=studio.user||auth.user||{};
    $('#accountName').textContent=user.fullName||user.email||'Compte Studio';
    $('#accountRole').textContent=user.displayRole||user.role||'Admin';
    bind();render();
    $('#syncState').innerHTML='<i></i> Synchronisé';
    runtimePoll=setInterval(refreshRuntime,15000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshRuntime();});
  }catch(error){
    $('#syncState').textContent='Connexion requise';
    toast(error.message==='http_401'||error.message==='http_403'||error.message==='studio_forbidden'?'Accès Studio requis.':'Impossible de charger la régie.',true);
  }
}

function bind(){
  $('#save').addEventListener('click',save);
  $('#refreshState').addEventListener('click',refreshRuntime);
  $('#restartEncoder').addEventListener('click',restartEncoder);
  $('#addFromLibrary').addEventListener('click',()=>openLibrary('playlist'));
  $('#chooseFallback').addEventListener('click',()=>openLibrary('fallback'));
  $('#clearFallback').addEventListener('click',()=>{control.fallback.mediaUrl='';renderFallback();});
  $('#closeLibrary').addEventListener('click',()=>$('#libraryDialog').close());
  $('#enabled').addEventListener('change',()=>{control.enabled=$('#enabled').checked;renderSummary();renderEncoder();});
  $('#fallbackTitle').addEventListener('input',()=>{control.fallback.title=$('#fallbackTitle').value;});
  $('#youtubeLiveUrl').addEventListener('input',()=>{control.output={...(control.output||{}),watchUrl:$('#youtubeLiveUrl').value.trim()};});
}

function render(){
  $('#enabled').checked=control.enabled===true;
  $('#mode').value='loop';
  $('#fallbackTitle').value=control.fallback?.title||'';
  $('#youtubeLiveUrl').value=control.output?.watchUrl||'';
  renderPlaylist();renderFallback();renderSummary();renderEncoder();
}

function renderPlaylist(){
  const list=control.playlist||[];
  $('#emptyPlaylist').hidden=list.length>0;
  $('#playlist').innerHTML=list.map((item,index)=>`<article class="playlist-item" draggable="true" data-index="${index}">
    <div class="drag" title="Déplacer">⋮⋮</div>
    <div class="playlist-copy"><b>${escapeHtml(item.title)}</b><small>${duration(item.durationSeconds)} · ${escapeHtml(item.mediaUrl)}</small><div class="playlist-meta"><label><span>Type</span><select data-type="${index}">${typeOptions(item.type)}</select></label><label class="mini-switch"><input type="checkbox" data-enabled="${index}" ${item.enabled!==false?'checked':''}><span>Actif</span></label></div></div>
    <div class="playlist-actions"><button class="icon-button" type="button" data-up="${index}" aria-label="Monter">↑</button><button class="icon-button" type="button" data-down="${index}" aria-label="Descendre">↓</button><button class="icon-button" type="button" data-remove="${index}" aria-label="Retirer">×</button></div>
  </article>`).join('');
  $$('[data-remove]').forEach(b=>b.addEventListener('click',()=>{control.playlist.splice(Number(b.dataset.remove),1);render();}));
  $$('[data-up]').forEach(b=>b.addEventListener('click',()=>move(Number(b.dataset.up),-1)));
  $$('[data-down]').forEach(b=>b.addEventListener('click',()=>move(Number(b.dataset.down),1)));
  $$('[data-type]').forEach(select=>select.addEventListener('change',()=>{const item=control.playlist[Number(select.dataset.type)];if(item)item.type=select.value;renderSummary();}));
  $$('[data-enabled]').forEach(input=>input.addEventListener('change',()=>{const item=control.playlist[Number(input.dataset.enabled)];if(item)item.enabled=input.checked;renderSummary();}));
  let dragged=null;
  $$('.playlist-item').forEach(el=>{
    el.addEventListener('dragstart',()=>{dragged=Number(el.dataset.index);});
    el.addEventListener('dragover',e=>e.preventDefault());
    el.addEventListener('drop',e=>{e.preventDefault();const target=Number(el.dataset.index);if(Number.isInteger(dragged)&&dragged!==target){const [item]=control.playlist.splice(dragged,1);control.playlist.splice(target,0,item);render();}});
  });
}

function move(index,delta){
  const next=index+delta;
  if(next<0||next>=control.playlist.length)return;
  [control.playlist[index],control.playlist[next]]=[control.playlist[next],control.playlist[index]];
  render();
}

function renderFallback(){
  const url=control.fallback?.mediaUrl||'';
  $('#fallbackSource').textContent=url?'Média de secours sélectionné':'Mire technique automatique';
  $('#fallbackUrlLabel').textContent=url||'Aucun média de secours sélectionné';
  $('#clearFallback').disabled=!url;
}

function renderSummary(){
  const list=(control.playlist||[]).filter(x=>x.enabled!==false);
  const seconds=list.reduce((sum,item)=>sum+Number(item.durationSeconds||0),0);
  $('#playlistCount').textContent=String(list.length);
  $('#playlistDuration').textContent=seconds?duration(seconds):'0 h';
  $('#modeLabel').textContent='Boucle';
  $('#youtubeStatus').textContent=control.output?.configured?'Configuré':'À configurer';
  $('#youtubeReady').classList.toggle('ok',control.output?.configured===true);
  $('#youtubeReady').textContent=control.output?.configured?'YouTube RTMPS configuré':'URL RTMPS + clé de flux à configurer';
  $('#restartEncoder').disabled=!control.enabled||!control.output?.configured||list.length===0;
}

function renderEncoder(){
  const status=control.encoder?.status||'not_connected';
  const live=['running','live','streaming'].includes(status)&&control.enabled;
  $('#liveCard').classList.toggle('is-live',live);
  $('#liveLabel').textContent=live?'EN DIRECT':control.enabled?'En attente':'Hors ligne';
  $('#encoderStatus').textContent=encoderLabel(status);
  const current=control.encoder?.currentItem;
  $('#nowPlaying').textContent=current?.title?`À l’antenne : ${current.title}`:'Aucun programme à l’antenne';
  $('#heartbeat').textContent=control.encoder?.lastHeartbeatAt?`Dernier signal ${relative(control.encoder.lastHeartbeatAt)}`:'Aucun signal reçu';
  $('#encoderReady').classList.toggle('ok',status!=='not_connected'&&status!=='error');
  $('#encoderReady').textContent=status==='error'?`Encodeur : ${humanError(control.encoder?.lastError||'erreur')}`:status!=='not_connected'?'Encodeur FFmpeg connecté':'Encodeur FFmpeg à connecter';
}

async function refreshRuntime(){
  if(!control)return;
  const button=$('#refreshState');
  if(button){button.disabled=true;button.textContent='Actualisation…';}
  try{
    const latest=await api('/api/admin/webtv/state',{},false);
    control={...control,output:latest.output||control.output,encoder:latest.encoder||control.encoder};
    renderSummary();renderEncoder();
    $('#syncState').innerHTML='<i></i> Synchronisé';
  }catch{
    $('#syncState').textContent='État indisponible';
  }finally{
    if(button){button.disabled=false;button.textContent='Actualiser';}
  }
}

function openLibrary(mode='playlist'){
  libraryMode=mode;
  const usable=libraryItems();
  $('#libraryTitle').textContent=mode==='fallback'?'Choisir le secours antenne':'Ajouter à l’antenne';
  $('#libraryHint').textContent=mode==='fallback'?'Choisissez le média à afficher si un programme échoue.':'Sélectionnez une émission, une publicité ou un autre contenu disponible.';
  $('#library').innerHTML=usable.length?usable.map((item,index)=>`<article class="library-item"><div><b>${escapeHtml(item.title)} <span class="type-tag">${escapeHtml(typeLabel(item.type))}</span></b><small>${duration(item.durationSeconds)} · ${escapeHtml(item.mediaUrl)}</small></div><button class="button" type="button" data-add="${index}">${mode==='fallback'?'Choisir':'Ajouter'}</button></article>`).join(''):'<div class="empty"><strong>Aucun média exploitable trouvé.</strong><span>Ajoutez une URL vidéo HTTPS à une émission ou à une publicité dans Diffusion.</span></div>';
  $$('[data-add]').forEach(button=>button.addEventListener('click',()=>{
    const item=usable[Number(button.dataset.add)];if(!item)return;
    if(libraryMode==='fallback'){
      control.fallback.mediaUrl=item.mediaUrl;
      if(!control.fallback.title)control.fallback.title='Neptune Media — La suite arrive dans un instant';
      renderFallback();$('#libraryDialog').close();return;
    }
    control.playlist.push({...item});render();button.textContent='Ajouté';button.disabled=true;
  }));
  $('#libraryDialog').showModal();
}

function libraryItems(){
  const items=[];
  const push=(source,type)=>{
    (Array.isArray(source)?source:[]).forEach((entry,index)=>{
      const mediaUrl=mediaUrlFor(entry);if(!mediaUrl)return;
      items.push({
        id:String(entry.id||`${type}-${index+1}`),
        title:String(entry.title||entry.name||(type==='ad'?'Publicité Neptune Media':'Émission Neptune Media')),
        mediaUrl,
        durationSeconds:Number(entry.durationSeconds||entry.duration||entry.lengthSeconds||0),
        type,
        enabled:true,
      });
    });
  };
  push(studioState?.episodes,'episode');
  push(studioState?.ads,'ad');
  const seen=new Set();
  return items.filter(item=>{const key=`${item.id}|${item.mediaUrl}`;if(seen.has(key))return false;seen.add(key);return true;});
}

function mediaUrlFor(item){
  const candidates=[item.mediaUrl,item.videoUrl,item.playbackUrl,item.assetUrl,item.fileUrl,item.publicUrl,item.url,item.video?.url,item.media?.url];
  const raw=String(candidates.find(Boolean)||'').trim();
  if(!raw)return'';
  try{
    const url=new URL(raw,location.origin);
    if(url.protocol!=='https:')return'';
    return url.origin===location.origin?`${url.pathname}${url.search}`:url.toString();
  }catch{return'';}
}

async function save(){
  const button=$('#save');button.disabled=true;button.textContent='Enregistrement…';
  control.enabled=$('#enabled').checked;
  control.mode='loop';
  control.output={...(control.output||{}),watchUrl:$('#youtubeLiveUrl').value.trim()};
  control.fallback={title:$('#fallbackTitle').value.trim(),mediaUrl:control.fallback?.mediaUrl||''};
  try{
    control=await api('/api/admin/webtv/state',{method:'PUT',body:JSON.stringify(control)});
    render();
    toast(control.enabled?'Programmation enregistrée. Démarrage de l’antenne demandé.':'Programmation enregistrée. Encodeur arrêté.');
    setTimeout(refreshRuntime,2500);
  }catch(error){toast('Enregistrement impossible : '+humanError(error.message),true);}
  finally{button.disabled=false;button.textContent='Enregistrer';}
}

async function restartEncoder(){
  const button=$('#restartEncoder');button.disabled=true;button.textContent='Redémarrage…';
  try{
    const result=await api('/api/admin/webtv/encoder',{method:'POST',body:JSON.stringify({action:'restart'})});
    control.encoder=result.encoder||control.encoder;renderEncoder();toast('Redémarrage de l’encodeur demandé.');
    setTimeout(refreshRuntime,2500);
  }catch(error){toast('Redémarrage impossible : '+humanError(error.message),true);}
  finally{renderSummary();button.textContent='Redémarrer l’encodeur';}
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
function typeOptions(selected){return[['episode','Émission'],['jingle','Jingle'],['ad','Publicité']].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');}
function encoderLabel(status){return({idle:'Encodeur prêt',running:'Encodeur opérationnel',live:'Encodeur opérationnel',streaming:'Diffusion active',starting:'Démarrage de l’encodeur',stopped:'Encodeur arrêté',error:'Erreur encodeur',not_connected:'Encodeur non connecté'})[status]||status;}
function relative(value){const delta=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/1000));if(delta<60)return'il y a moins d’une minute';if(delta<3600)return`il y a ${Math.floor(delta/60)} min`;return`il y a ${Math.floor(delta/3600)} h`;}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function humanError(code){return({studio_forbidden:'accès Studio refusé',origin_forbidden:'origine refusée',youtube_not_configured:'configurez l’URL RTMPS et la clé YouTube',webtv_playlist_empty:'ajoutez au moins un contenu actif à la playlist',webtv_disabled:'activez d’abord la Web TV',playlist_empty:'playlist vide',encoder_unreachable:'encodeur indisponible',invalid_encoder_action:'action encodeur invalide',http_401:'connexion requise',http_403:'accès refusé'})[code]||code;}
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.hidden=false;el.style.background=error?'#7d1930':'#081a40';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true;},4200);}
window.addEventListener('beforeunload',()=>{if(runtimePoll)clearInterval(runtimePoll);});
