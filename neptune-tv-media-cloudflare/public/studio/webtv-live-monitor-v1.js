const monitor={
  state:null,
  itemKey:'',
  youtubeKey:'',
  timer:null,
  lastSyncAt:0,
  ytPlayer:null,
  ytReady:false,
  ytApiPromise:null,
  ytAttachPromise:null,
  ytErrorCode:0,
  ytFallbackUntil:0,
  ytBufferTimer:null,
  ytLiveSeekTimer:null,
};

const els={
  youtube:document.getElementById('youtubeLivePreview'),
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

if(els.screen){
  els.video?.addEventListener('loadedmetadata',()=>syncVideo(true));
  els.video?.addEventListener('canplay',()=>{els.video.play().catch(()=>{});});
  els.video?.addEventListener('error',()=>showVideoError());
  els.resync?.addEventListener('click',()=>resyncLive());
  refresh(true);
  monitor.timer=setInterval(()=>refresh(false),5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(false);});
  window.addEventListener('beforeunload',cleanup);
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

async function resyncLive(){
  els.resync.disabled=true;
  els.resync.textContent='Resynchronisation…';
  try{
    await refresh(false);
    const state=monitor.state||{};
    const youtubeId=String(state?.output?.videoId||'').trim();
    const encoder=state?.encoder||{};
    const live=state?.enabled===true&&['running','live','streaming'].includes(String(encoder.status||''));
    monitor.ytFallbackUntil=0;
    monitor.ytErrorCode=0;

    if(youtubeId&&live){
      showYoutube(youtubeId,false);
      const ready=await ensureYoutubePlayer();
      if(ready&&syncYoutubeToLiveEdge(true)){
        els.sync.textContent='Retour YouTube · recollé au direct';
        return;
      }
      // Do not tear down/recreate the iframe here. Repeated iframe reloads are
      // exactly what caused transient YouTube playback IDs and endless spinners.
      // Give the existing player a short window to become ready, then fall back
      // to the source Neptune if YouTube still cannot provide a usable return.
      armYoutubeBufferFallback(7000,'YouTube met trop de temps à rejoindre le direct.');
      els.sync.textContent='Retour YouTube · reconnexion au direct…';
      return;
    }

    const current=encoder.currentItem||null;
    const source=resolveSource(state,current);
    if(live&&current&&source){
      clearYoutube(false);
      showSource(source,current,true);
      els.sync.textContent='Retour source Neptune · synchronisé';
      return;
    }

    render(state,true);
  }finally{
    setTimeout(()=>{
      els.resync.disabled=false;
      els.resync.textContent='Resynchroniser';
    },500);
  }
}

function render(state,forceSync){
  const encoder=state?.encoder||{};
  const status=String(encoder.status||'not_connected');
  const live=state?.enabled===true&&['running','live','streaming'].includes(status);
  const current=encoder.currentItem||null;
  const youtubeId=String(state?.output?.videoId||'').trim();

  setBadge(live,live?'EN DIRECT':state?.enabled?'EN ATTENTE':'HORS LIGNE');
  els.screen.classList.toggle('is-live',live);
  els.program.textContent=current?.title||'Aucun programme';
  els.overlay.textContent=live?'NEPTUNE · EN DIRECT':'NEPTUNE · ANTENNE';

  if(youtubeId&&Date.now()>=monitor.ytFallbackUntil){
    showYoutube(youtubeId,false);
    if(forceSync&&live)ensureYoutubePlayer().then(ready=>{if(ready)syncYoutubeToLiveEdge(true);});
    els.sync.textContent=live?'Retour YouTube · direct':'Retour YouTube chargé';
    return;
  }

  if(youtubeId&&Date.now()<monitor.ytFallbackUntil){
    const source=resolveSource(state,current);
    if(live&&current&&source){
      showSource(source,current,forceSync);
      els.sync.textContent='Retour source Neptune · YouTube en reprise automatique';
      return;
    }
  }

  clearYoutube(false);
  const source=resolveSource(state,current);
  if(!live||!current){
    clearVideo();
    showPlaceholder(
      state?.enabled?'Aucun programme diffusé':'Web TV hors ligne',
      state?.enabled?'Le moniteur démarrera dès que l’encodeur prendra un programme.':'Renseignez le lien du live YouTube ou activez la Web TV pour afficher le retour source.'
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

  showSource(source,current,forceSync);
  els.sync.textContent=`Retour source · ${heartbeatLabel(encoder.lastHeartbeatAt||encoder.heartbeatAt)}`;
}

function showYoutube(videoId,forceLoad=false){
  clearVideo();
  hidePlaceholder();
  els.screen.classList.remove('has-error');
  els.youtube.hidden=false;

  const changed=monitor.youtubeKey!==videoId;
  monitor.youtubeKey=videoId;
  if(changed||!els.youtube.getAttribute('src')){
    monitor.ytReady=false;
    monitor.ytErrorCode=0;
    const src=`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    els.youtube.src=src;
  }else if(forceLoad&&monitor.ytPlayer&&monitor.ytReady){
    try{monitor.ytPlayer.loadVideoById(videoId);}catch{}
  }

  ensureYoutubePlayer().then(ready=>{
    if(!ready)return;
    if(monitor.state?.enabled===true&&['running','live','streaming'].includes(String(monitor.state?.encoder?.status||''))){
      scheduleYoutubeLiveSeek();
    }
  });
}

async function ensureYoutubePlayer(){
  if(monitor.ytPlayer&&monitor.ytReady)return true;
  if(monitor.ytAttachPromise)return monitor.ytAttachPromise;
  monitor.ytAttachPromise=(async()=>{
    try{
      await loadYoutubeApi();
      if(!window.YT?.Player||!els.youtube)return false;
      if(!monitor.ytPlayer){
        monitor.ytPlayer=new window.YT.Player(els.youtube,{
          events:{
            onReady:()=>{
              monitor.ytReady=true;
              monitor.ytErrorCode=0;
              clearYoutubeBufferFallback();
              try{monitor.ytPlayer.mute();}catch{}
              scheduleYoutubeLiveSeek();
            },
            onStateChange:event=>onYoutubeStateChange(event?.data),
            onError:event=>onYoutubeError(Number(event?.data||0)),
          },
        });
      }
      const started=Date.now();
      while(!monitor.ytReady&&Date.now()-started<5000)await wait(120);
      return monitor.ytReady;
    }catch{
      return false;
    }finally{
      monitor.ytAttachPromise=null;
    }
  })();
  return monitor.ytAttachPromise;
}

function loadYoutubeApi(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(monitor.ytApiPromise)return monitor.ytApiPromise;
  monitor.ytApiPromise=new Promise((resolve,reject)=>{
    const previous=window.onYouTubeIframeAPIReady;
    let settled=false;
    const finish=()=>{
      if(settled)return;
      settled=true;
      try{if(typeof previous==='function')previous();}catch{}
      resolve(window.YT);
    };
    window.onYouTubeIframeAPIReady=finish;
    let script=document.querySelector('script[data-neptune-youtube-api]');
    if(!script){
      script=document.createElement('script');
      script.src='https://www.youtube.com/iframe_api';
      script.async=true;
      script.dataset.neptuneYoutubeApi='1';
      script.onerror=()=>{if(!settled){settled=true;reject(new Error('youtube_api_load_failed'));}};
      document.head.append(script);
    }
    const started=Date.now();
    const poll=()=>{
      if(window.YT?.Player)return finish();
      if(Date.now()-started>7000){if(!settled){settled=true;reject(new Error('youtube_api_timeout'));}return;}
      setTimeout(poll,120);
    };
    poll();
  });
  return monitor.ytApiPromise;
}

function onYoutubeStateChange(state){
  // YT.PlayerState: PLAYING=1, BUFFERING=3, CUED=5.
  if(state===1){
    clearYoutubeBufferFallback();
    monitor.ytFallbackUntil=0;
    els.screen.classList.remove('has-error');
    els.sync.textContent='Retour YouTube · direct';
    return;
  }
  if(state===3){
    armYoutubeBufferFallback(9000,'Le retour YouTube reste bloqué en chargement.');
  }
}

function onYoutubeError(code){
  monitor.ytErrorCode=code;
  const labels={
    2:'identifiant vidéo invalide',
    5:'lecteur HTML5 indisponible',
    100:'vidéo privée, supprimée ou introuvable',
    101:'lecture intégrée désactivée par YouTube',
    150:'lecture intégrée désactivée par YouTube',
    153:'identification du lecteur intégrée refusée par YouTube',
  };
  fallbackFromYoutube(labels[code]||`erreur lecteur YouTube ${code||'inconnue'}`);
}

function syncYoutubeToLiveEdge(force=false){
  if(!monitor.ytPlayer||!monitor.ytReady)return false;
  try{
    const duration=Number(monitor.ytPlayer.getDuration?.()||0);
    monitor.ytPlayer.mute?.();
    if(duration>0){
      // For a live event YouTube documents getDuration() as the elapsed live
      // stream time. Seeking to its end therefore rejoins the live edge without
      // reloading the iframe and creating a new playback session.
      monitor.ytPlayer.seekTo?.(Math.max(0,duration-1.25),true);
    }
    monitor.ytPlayer.playVideo?.();
    if(force)armYoutubeBufferFallback(9000,'YouTube n’a pas rejoint le direct après la resynchronisation.');
    return true;
  }catch{return false;}
}

function scheduleYoutubeLiveSeek(){
  if(monitor.ytLiveSeekTimer)clearTimeout(monitor.ytLiveSeekTimer);
  let attempt=0;
  const seek=()=>{
    attempt+=1;
    if(syncYoutubeToLiveEdge(false)){
      const duration=Number(monitor.ytPlayer?.getDuration?.()||0);
      if(duration>0||attempt>=6)return;
    }
    if(attempt<6)monitor.ytLiveSeekTimer=setTimeout(seek,Math.min(1500,250*attempt));
  };
  seek();
}

function armYoutubeBufferFallback(delayMs,reason){
  clearYoutubeBufferFallback();
  monitor.ytBufferTimer=setTimeout(()=>{
    const state=Number(monitor.ytPlayer?.getPlayerState?.());
    if(state===1)return;
    fallbackFromYoutube(reason);
  },delayMs);
}

function clearYoutubeBufferFallback(){
  if(monitor.ytBufferTimer)clearTimeout(monitor.ytBufferTimer);
  monitor.ytBufferTimer=null;
}

function fallbackFromYoutube(reason){
  clearYoutubeBufferFallback();
  monitor.ytFallbackUntil=Date.now()+30000;
  const state=monitor.state||{};
  const encoder=state?.encoder||{};
  const current=encoder.currentItem||null;
  const live=state?.enabled===true&&['running','live','streaming'].includes(String(encoder.status||''));
  const source=resolveSource(state,current);
  els.youtube.hidden=true;
  if(live&&current&&source){
    showSource(source,current,true);
    els.sync.textContent=`Retour source Neptune · ${reason}`;
    return;
  }
  clearVideo();
  els.screen.classList.add('has-error');
  showPlaceholder('Retour YouTube indisponible',`${reason}. Le direct RTMPS peut continuer normalement ; Neptune réessaiera automatiquement.`);
  els.sync.textContent='YouTube indisponible · reprise automatique';
}

function clearYoutube(resetPlayer=false){
  if(!els.youtube)return;
  els.youtube.hidden=true;
  clearYoutubeBufferFallback();
  if(resetPlayer){
    if(els.youtube.getAttribute('src'))els.youtube.removeAttribute('src');
    monitor.youtubeKey='';
    monitor.ytReady=false;
  }
}

function showSource(source,current,forceSync){
  els.youtube.hidden=true;
  els.video.hidden=false;
  const nextKey=`${current.id||''}|${source}|${current.startedAt||''}`;
  if(monitor.itemKey!==nextKey){
    monitor.itemKey=nextKey;
    els.video.src=source;
    els.video.load();
  }
  hidePlaceholder();
  els.screen.classList.remove('has-error');
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
  if(!current?.startedAt||!els.video?.src)return;
  const started=new Date(current.startedAt).getTime();
  if(!Number.isFinite(started))return;
  let target=Math.max(0,(Date.now()-started)/1000);
  const duration=Number(els.video.duration);
  if(Number.isFinite(duration)&&duration>0)target=Math.min(target,Math.max(0,duration-.35));
  const drift=Math.abs((Number(els.video.currentTime)||0)-target);
  if(force||drift>4){try{els.video.currentTime=target;}catch{}}
  monitor.lastSyncAt=Date.now();
  els.video.play().catch(()=>{});
}

function clearVideo(){
  if(!els.video)return;
  els.video.hidden=true;
  if(els.video.getAttribute('src')){
    els.video.pause();
    els.video.removeAttribute('src');
    els.video.load();
  }
  monitor.itemKey='';
}

function showVideoError(){
  els.screen.classList.add('has-error');
  showPlaceholder('Prévisualisation indisponible','Le flux peut continuer vers YouTube. Vérifiez le lien du live ou cliquez sur Resynchroniser.');
  els.sync.textContent='Erreur de lecture locale';
}

function showPlaceholder(title,text){
  els.placeholder.hidden=false;
  els.placeholderTitle.textContent=title;
  els.placeholderText.textContent=text;
}
function hidePlaceholder(){els.placeholder.hidden=true;}
function setBadge(live,label){els.badge.classList.toggle('is-live',live);els.badge.textContent=label;}
function heartbeatLabel(value){
  if(!value)return'Signal reçu';
  const timestamp=new Date(value).getTime();
  if(!Number.isFinite(timestamp))return'Signal reçu';
  const seconds=Math.max(0,Math.round((Date.now()-timestamp)/1000));
  if(seconds<20)return'Synchronisé maintenant';
  if(seconds<60)return`Signal il y a ${seconds} s`;
  return`Signal il y a ${Math.floor(seconds/60)} min`;
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function cleanup(){
  if(monitor.timer)clearInterval(monitor.timer);
  if(monitor.ytBufferTimer)clearTimeout(monitor.ytBufferTimer);
  if(monitor.ytLiveSeekTimer)clearTimeout(monitor.ytLiveSeekTimer);
}
