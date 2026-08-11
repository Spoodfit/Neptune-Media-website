const monitor={state:null,itemKey:'',timer:null,lastSyncAt:0};

const els={
  video:document.getElementById('antennaPreview'),
  screen:document.getElementById('antennaScreen'),
  placeholder:document.getElementById('antennaPlaceholder'),
  placeholderTitle:document.getElementById('antennaPlaceholderTitle'),
  placeholderText:document.getElementById('antennaPlaceholderText'),
  badge:document.getElementById('monitorBadge'),
  overlay:document.getElementById('antennaOverlayStatus'),
  program:document.getElementById('monitorProgram'),
  sync:document.getElementById('monitorSync'),
  resync:document.getElementById('monitorResync'),
};

if(els.video){
  els.video.addEventListener('loadedmetadata',()=>syncVideo(true));
  els.video.addEventListener('canplay',()=>{els.video.play().catch(()=>{});});
  els.video.addEventListener('error',()=>showVideoError());
  els.resync?.addEventListener('click',()=>refresh(true));
  refresh(true);
  monitor.timer=setInterval(()=>refresh(false),5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
  window.addEventListener('beforeunload',()=>{if(monitor.timer)clearInterval(monitor.timer);});
}

async function refresh(forceSync=false){
  try{
    const response=await fetch('/api/admin/webtv/state',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error(`http_${response.status}`);
    const state=await response.json();
    monitor.state=state;
    render(state,forceSync);
  }catch{
    setBadge(false,'INDISPONIBLE');
    els.sync.textContent='État indisponible';
  }
}

function render(state,forceSync){
  const encoder=state?.encoder||{};
  const status=String(encoder.status||'not_connected');
  const live=state?.enabled===true&&['running','live','streaming'].includes(status);
  const current=encoder.currentItem||null;
  const source=resolveSource(state,current);

  setBadge(live,live?'EN DIRECT':state?.enabled?'EN ATTENTE':'HORS LIGNE');
  els.screen.classList.toggle('is-live',live);
  els.program.textContent=current?.title||'Aucun programme';
  els.overlay.textContent=live?'NEPTUNE · EN DIRECT':'NEPTUNE · ANTENNE';

  if(!live||!current){
    clearVideo();
    showPlaceholder(
      state?.enabled?'Aucun programme diffusé':'Web TV hors ligne',
      state?.enabled?'Le moniteur démarrera dès que l’encodeur prendra un programme.':'Activez la Web TV et enregistrez la programmation pour lancer l’antenne.'
    );
    els.sync.textContent=state?.enabled?'En attente du signal':'Antenne arrêtée';
    return;
  }

  if(!source){
    clearVideo();
    showPlaceholder(
      current.id==='technical-slate'?'Mire technique en cours':'Source non prévisualisable',
      current.id==='technical-slate'?'Neptune diffuse actuellement la mire de secours.':'Le flux RTMPS continue, mais ce média ne possède pas de source lisible dans le navigateur.'
    );
    els.sync.textContent=heartbeatLabel(encoder.lastHeartbeatAt||encoder.heartbeatAt);
    return;
  }

  const nextKey=`${current.id||''}|${source}|${current.startedAt||''}`;
  if(monitor.itemKey!==nextKey){
    monitor.itemKey=nextKey;
    els.video.src=source;
    els.video.load();
  }
  hidePlaceholder();
  els.screen.classList.remove('has-error');
  els.sync.textContent=heartbeatLabel(encoder.lastHeartbeatAt||encoder.heartbeatAt);

  if(forceSync||Date.now()-monitor.lastSyncAt>12000)syncVideo(forceSync);
}

function resolveSource(state,current){
  if(!current)return'';
  if(current.id==='fallback')return safeMedia(state?.fallback?.mediaUrl);
  const playlist=Array.isArray(state?.playlist)?state.playlist:[];
  const item=playlist.find(entry=>String(entry?.id||'')===String(current.id||''));
  return safeMedia(item?.mediaUrl);
}

function safeMedia(value){
  const raw=String(value||'').trim();
  if(!raw)return'';
  try{
    const url=new URL(raw,location.origin);
    return url.protocol==='https:'?url.toString():'';
  }catch{return'';}
}

function syncVideo(force=false){
  const current=monitor.state?.encoder?.currentItem;
  if(!current?.startedAt||!els.video.src)return;
  const started=new Date(current.startedAt).getTime();
  if(!Number.isFinite(started))return;
  let target=Math.max(0,(Date.now()-started)/1000);
  const duration=Number(els.video.duration);
  if(Number.isFinite(duration)&&duration>0)target=Math.min(target,Math.max(0,duration-.35));
  const drift=Math.abs((Number(els.video.currentTime)||0)-target);
  if(force||drift>4){
    try{els.video.currentTime=target;}catch{}
  }
  monitor.lastSyncAt=Date.now();
  els.video.play().catch(()=>{});
}

function clearVideo(){
  if(!els.video)return;
  if(els.video.getAttribute('src')){
    els.video.pause();
    els.video.removeAttribute('src');
    els.video.load();
  }
  monitor.itemKey='';
}

function showVideoError(){
  els.screen.classList.add('has-error');
  showPlaceholder('Prévisualisation indisponible','Le flux peut continuer vers YouTube. Cliquez sur Resynchroniser ou vérifiez que la source vidéo est directement lisible en HTTPS.');
  els.sync.textContent='Erreur de lecture locale';
}

function showPlaceholder(title,text){
  els.placeholder.hidden=false;
  els.placeholderTitle.textContent=title;
  els.placeholderText.textContent=text;
}

function hidePlaceholder(){els.placeholder.hidden=true;}

function setBadge(live,label){
  els.badge.classList.toggle('is-live',live);
  els.badge.textContent=label;
}

function heartbeatLabel(value){
  if(!value)return'Signal reçu';
  const timestamp=new Date(value).getTime();
  if(!Number.isFinite(timestamp))return'Signal reçu';
  const seconds=Math.max(0,Math.round((Date.now()-timestamp)/1000));
  if(seconds<20)return'Synchronisé maintenant';
  if(seconds<60)return`Signal il y a ${seconds} s`;
  return`Signal il y a ${Math.floor(seconds/60)} min`;
}
