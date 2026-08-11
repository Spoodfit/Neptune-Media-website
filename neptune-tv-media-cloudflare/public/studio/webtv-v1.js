const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
let studioState=null;
let control=null;
let csrfToken=sessionStorage.getItem('neptune_csrf')||'';
let runtimePoll=null;
let libraryMode='playlist';
let dirty=false;
let importedMedia=[];

window.NeptuneWebTvProgram={
  setImportedMedia(items){importedMedia=Array.isArray(items)?items.filter(item=>item&&item.mediaUrl):[];},
  addImportedMedia(item){
    if(!item?.mediaUrl||!control)return false;
    importedMedia=[item,...importedMedia.filter(existing=>existing.mediaUrl!==item.mediaUrl)];
    control.playlist.push({...item,id:playlistInstanceId(item.id),type:item.type||'episode',enabled:true});
    markDirty();renderPlaylist();renderSummary();return true;
  },
  toast(message,error=false){toast(message,error);},
};

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
    bind();render();setDirty(false);
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
  $('#clearFallback').addEventListener('click',()=>{control.fallback.mediaUrl='';markDirty();renderFallback();});
  $('#closeLibrary').addEventListener('click',()=>$('#libraryDialog').close());
  $('#enabled').addEventListener('change',()=>{control.enabled=$('#enabled').checked;markDirty();renderSummary();renderEncoder();});
  $('#fallbackTitle').addEventListener('input',()=>{control.fallback.title=$('#fallbackTitle').value;markDirty();});
  $('#youtubeLiveUrl').addEventListener('input',()=>{control.output={...(control.output||{}),watchUrl:$('#youtubeLiveUrl').value.trim()};markDirty();});
}

function render(){
  $('#enabled').checked=control.enabled===true;
  $('#mode').value='loop';
  $('#fallbackTitle').value=control.fallback?.title||'';
  $('#youtubeLiveUrl').value=control.output?.watchUrl||'';
  renderPlaylist();renderFallback();renderSummary();renderEncoder();updateApplyState();
}

function renderPlaylist(){
  const list=control.playlist||[];
  $('#emptyPlaylist').hidden=list.length>0;
  $('#playlist').innerHTML=list.map((item,index)=>{
    const onAir=isOnAir(item);
    return `<article class="playlist-item ${onAir?'is-on-air':''}" draggable="true" data-index="${index}">
      <div class="drag" title="Déplacer" aria-hidden="true">⋮⋮</div>
      ${thumbnailMarkup(item,'playlist')}
      <div class="playlist-copy">
        <div class="playlist-title-row"><b>${escapeHtml(item.title)}</b><span class="on-air-tag" data-on-air-badge ${onAir?'':'hidden'}><i></i> EN DIRECT</span></div>
        <small>${duration(item.durationSeconds)} · ${escapeHtml(item.mediaUrl)}</small>
        <div class="playlist-meta"><label><span>Type</span><select data-type="${index}">${typeOptions(item.type)}</select></label><label class="mini-switch"><input type="checkbox" data-enabled="${index}" ${item.enabled!==false?'checked':''}><span>Actif</span></label></div>
      </div>
      <div class="playlist-actions"><button class="icon-button" type="button" data-up="${index}" aria-label="Monter">↑</button><button class="icon-button" type="button" data-down="${index}" aria-label="Descendre">↓</button><button class="icon-button" type="button" data-remove="${index}" aria-label="Retirer">×</button></div>
    </article>`;
  }).join('');
  hydrateThumbnails($('#playlist'));
  $$('[data-remove]').forEach(b=>b.addEventListener('click',()=>{control.playlist.splice(Number(b.dataset.remove),1);markDirty();renderPlaylist();renderSummary();}));
  $$('[data-up]').forEach(b=>b.addEventListener('click',()=>move(Number(b.dataset.up),-1)));
  $$('[data-down]').forEach(b=>b.addEventListener('click',()=>move(Number(b.dataset.down),1)));
  $$('[data-type]').forEach(select=>select.addEventListener('change',()=>{const item=control.playlist[Number(select.dataset.type)];if(item){item.type=select.value;markDirty();renderSummary();}}));
  $$('[data-enabled]').forEach(input=>input.addEventListener('change',()=>{const item=control.playlist[Number(input.dataset.enabled)];if(item){item.enabled=input.checked;markDirty();renderSummary();}}));
  let dragged=null;
  $$('.playlist-item').forEach(el=>{
    el.addEventListener('dragstart',()=>{dragged=Number(el.dataset.index);el.classList.add('is-dragging');});
    el.addEventListener('dragend',()=>el.classList.remove('is-dragging'));
    el.addEventListener('dragover',e=>e.preventDefault());
    el.addEventListener('drop',e=>{e.preventDefault();const target=Number(el.dataset.index);if(Number.isInteger(dragged)&&dragged!==target){const [item]=control.playlist.splice(dragged,1);control.playlist.splice(target,0,item);markDirty();renderPlaylist();}});
  });
}

function move(index,delta){
  const next=index+delta;
  if(next<0||next>=control.playlist.length)return;
  [control.playlist[index],control.playlist[next]]=[control.playlist[next],control.playlist[index]];
  markDirty();renderPlaylist();
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
  updateApplyState();
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
  updateOnAirState();
  updateProgramNotice();
  if(!dirty)$('#syncState').innerHTML=live?'<i></i> Antenne synchronisée':'<i></i> Synchronisé';
}

function updateOnAirState(){
  const currentId=String(control.encoder?.currentItem?.id||'');
  $$('.playlist-item').forEach(card=>{
    const item=control.playlist?.[Number(card.dataset.index)];
    const onAir=Boolean(currentId&&item&&String(item.id||'')===currentId);
    card.classList.toggle('is-on-air',onAir);
    const badge=card.querySelector('[data-on-air-badge]');
    if(badge)badge.hidden=!onAir;
  });
}

function isOnAir(item){return Boolean(control.encoder?.currentItem?.id&&String(control.encoder.currentItem.id)===String(item?.id||''));}

async function refreshRuntime(){
  if(!control)return;
  const button=$('#refreshState');
  if(button){button.disabled=true;button.textContent='Actualisation…';}
  try{
    const latest=await api('/api/admin/webtv/state',{},false);
    control={...control,output:latest.output||control.output,encoder:latest.encoder||control.encoder};
    renderSummary();renderEncoder();
  }catch{
    if(!dirty)$('#syncState').textContent='État indisponible';
  }finally{
    if(button){button.disabled=false;button.textContent='Actualiser';}
  }
}

function openLibrary(mode='playlist'){
  libraryMode=mode;
  const usable=libraryItems();
  $('#libraryTitle').textContent=mode==='fallback'?'Choisir le secours antenne':'Ajouter à l’antenne';
  $('#libraryHint').textContent=mode==='fallback'?'Choisissez le média à afficher si un programme échoue.':'Ajoutez une vidéo au programme. Elle peut être réutilisée plusieurs fois dans la grille.';
  $('#library').innerHTML=usable.length?usable.map((item,index)=>`<article class="library-item">
    ${thumbnailMarkup(item,'library')}
    <div class="library-copy"><b>${escapeHtml(item.title)} <span class="type-tag">${escapeHtml(typeLabel(item.type))}</span></b><small>${duration(item.durationSeconds)} · ${escapeHtml(item.mediaUrl)}</small></div>
    <button class="button" type="button" data-add="${index}">${mode==='fallback'?'Choisir':'Ajouter'}</button>
  </article>`).join(''):'<div class="empty"><strong>Aucun média exploitable trouvé.</strong><span>Importez une vidéo ou ajoutez une émission depuis Neptune Media.</span></div>';
  hydrateThumbnails($('#library'));
  $$('[data-add]').forEach(button=>button.addEventListener('click',()=>{
    const item=usable[Number(button.dataset.add)];if(!item)return;
    if(libraryMode==='fallback'){
      control.fallback.mediaUrl=item.mediaUrl;
      if(!control.fallback.title)control.fallback.title='Neptune Media — La suite arrive dans un instant';
      markDirty();renderFallback();$('#libraryDialog').close();return;
    }
    control.playlist.push({...item,id:playlistInstanceId(item.id)});markDirty();renderPlaylist();renderSummary();button.textContent='Ajouté';
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
        thumbnailUrl:thumbnailUrlForEntry(entry),
        durationSeconds:Number(entry.durationSeconds||entry.duration||entry.lengthSeconds||0),
        type,
        enabled:true,
      });
    });
  };
  push(studioState?.episodes,'episode');
  push(studioState?.ads,'ad');
  push(importedMedia,'episode');
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

function thumbnailUrlForEntry(entry){
  const candidates=[entry?.thumbnailUrl,entry?.posterUrl,entry?.coverUrl,entry?.imageUrl,entry?.previewImageUrl,entry?.thumbnail?.url,entry?.poster?.url,entry?.image?.url];
  return safePreviewUrl(candidates.find(Boolean)||'');
}

function thumbnailFor(item){
  if(item?.thumbnailUrl)return safePreviewUrl(item.thumbnailUrl);
  const entries=[...(studioState?.episodes||[]),...(studioState?.ads||[]),...importedMedia];
  const itemUrl=safePreviewUrl(item?.mediaUrl);
  const source=entries.find(entry=>String(entry?.id||'')===String(item?.id||'')||(itemUrl&&safePreviewUrl(mediaUrlFor(entry))===itemUrl));
  return thumbnailUrlForEntry(source);
}

function thumbnailMarkup(item,scope){
  const image=thumbnailFor(item);
  const media=safePreviewUrl(item?.mediaUrl);
  const label=escapeAttr(item?.title||'Vidéo');
  return `<div class="media-thumbnail ${scope==='library'?'media-thumbnail-library':''}"><span class="media-thumbnail-fallback" aria-hidden="true">▶</span>${image?`<img data-thumb-image src="${escapeAttr(image)}" alt="Miniature de ${label}">`:media?`<video data-thumb-video src="${escapeAttr(media)}" muted playsinline preload="metadata" aria-label="Miniature vidéo de ${label}"></video>`:''}</div>`;
}

function hydrateThumbnails(root=document){
  $$('[data-thumb-image]',root).forEach(img=>img.addEventListener('error',()=>img.remove(),{once:true}));
  $$('[data-thumb-video]',root).forEach(video=>{
    const seek=()=>{
      if(video.dataset.thumbReady)return;
      video.dataset.thumbReady='1';
      const length=Number(video.duration);
      const target=Number.isFinite(length)&&length>1?Math.min(1,Math.max(.15,length*.03)):.15;
      try{video.currentTime=target;}catch{}
    };
    if(video.readyState>=1)seek();else video.addEventListener('loadedmetadata',seek,{once:true});
  });
}

function safePreviewUrl(value){
  const raw=String(value||'').trim();if(!raw)return'';
  try{const url=new URL(raw,location.origin);return url.protocol==='https:'?url.toString():'';}catch{return'';}
}

function playlistInstanceId(base){return`${String(base||'media').replace(/[^a-z0-9_-]+/giu,'-').slice(0,60)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;}

function markDirty(){setDirty(true);}
function setDirty(value){dirty=Boolean(value);updateApplyState();updateProgramNotice();}
function updateApplyState(){
  const button=$('#save');if(!button||!control)return;
  const activeItems=(control.playlist||[]).filter(item=>item.enabled!==false).length;
  if(dirty){
    button.disabled=false;
    button.textContent=control.enabled?'Appliquer à l’antenne':'Enregistrer le programme';
    $('#syncState').textContent='Modifications non appliquées';
  }else{
    button.disabled=true;
    button.textContent=control.enabled?'Antenne à jour':'Programme enregistré';
  }
  if(control.enabled&&(!control.output?.configured||activeItems===0))button.disabled=false;
}

function updateProgramNotice(){
  const notice=$('#programSyncNotice');if(!notice||!control)return;
  const status=String(control.encoder?.status||'not_connected');
  const live=control.enabled&&['running','live','streaming'].includes(status);
  notice.classList.toggle('is-dirty',dirty);
  notice.classList.toggle('is-live',!dirty&&live);
  const text=notice.querySelector('strong');
  if(dirty)text.textContent=control.enabled?'Modifications prêtes : cliquez sur « Appliquer à l’antenne » pour mettre à jour le direct et resynchroniser l’encodeur.':'Modifications non enregistrées : cliquez sur « Enregistrer le programme ».';
  else if(live)text.textContent='Programme synchronisé avec l’antenne en cours.';
  else text.textContent='Le programme affiché correspond à la dernière version enregistrée.';
}

async function save(){
  const button=$('#save');button.disabled=true;button.textContent=control.enabled?'Mise à jour de l’antenne…':'Enregistrement…';
  control.enabled=$('#enabled').checked;
  control.mode='loop';
  control.output={...(control.output||{}),watchUrl:$('#youtubeLiveUrl').value.trim()};
  control.fallback={title:$('#fallbackTitle').value.trim(),mediaUrl:control.fallback?.mediaUrl||''};
  try{
    control=await api('/api/admin/webtv/state',{method:'PUT',body:JSON.stringify(control)});
    setDirty(false);render();
    $('#syncState').textContent=control.enabled?'Synchronisation de l’antenne…':'Programme enregistré';
    toast(control.enabled?'Programme appliqué. Neptune resynchronise automatiquement le direct.':'Programme enregistré. Encodeur arrêté.');
    setTimeout(refreshRuntime,1200);setTimeout(refreshRuntime,3500);
  }catch(error){markDirty();toast('Mise à jour impossible : '+humanError(error.message),true);}
  finally{updateApplyState();}
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
function escapeAttr(value){return escapeHtml(value).replace(/`/g,'&#96;');}
function humanError(code){return({studio_forbidden:'accès Studio refusé',origin_forbidden:'origine refusée',youtube_not_configured:'configurez l’URL RTMPS et la clé YouTube',webtv_playlist_empty:'ajoutez au moins un contenu actif à la playlist',webtv_disabled:'activez d’abord la Web TV',playlist_empty:'playlist vide',encoder_unreachable:'encodeur indisponible',invalid_encoder_action:'action encodeur invalide',http_401:'connexion requise',http_403:'accès refusé'})[code]||code;}
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.hidden=false;el.style.background=error?'#7d1930':'#081a40';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true;},4200);}
window.addEventListener('beforeunload',()=>{if(runtimePoll)clearInterval(runtimePoll);});
