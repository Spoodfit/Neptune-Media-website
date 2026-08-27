const RELEASE='neptune-webtv-monitor-controls-20260827-v146';

document.documentElement.dataset.webtvMonitorControlsV135=RELEASE;

if(location.pathname.includes('/studio/webtv')){
  ensureLandscapeMonitor();
  ensureControls();
  new MutationObserver(()=>{ensureLandscapeMonitor();ensureControls();}).observe(document.body,{childList:true,subtree:true});
}

function ensureLandscapeMonitor(){
  if(document.getElementById('neptuneWebTvLandscapeV146'))return;
  const style=document.createElement('style');
  style.id='neptuneWebTvLandscapeV146';
  style.textContent=`
    .webtv-v125-mounted .v125-monitor-slot{display:grid!important;min-height:0!important;place-items:center!important;overflow:hidden!important}
    .webtv-v125-mounted .v125-monitor-slot .antenna-monitor{width:100%!important;height:100%!important;min-height:0!important;grid-template-rows:auto minmax(0,1fr) auto!important}
    .webtv-v125-mounted .v125-monitor-slot .antenna-screen{width:min(100%,calc((100dvh - 240px) * 16 / 9))!important;height:auto!important;max-width:100%!important;max-height:100%!important;aspect-ratio:16/9!important;align-self:center!important;justify-self:center!important}
    .webtv-v125-mounted .v125-monitor-slot .antenna-screen iframe,.webtv-v125-mounted .v125-monitor-slot .antenna-screen video{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:contain!important}
    @media(max-width:900px){.webtv-v125-mounted .v125-monitor-slot .antenna-screen{width:100%!important;max-height:none!important}}
  `;
  document.head.append(style);
}

function ensureControls(){
  const screen=document.getElementById('antennaScreen');
  if(!screen)return;

  let video=document.getElementById('antennaPreview');
  if(!video){
    video=document.createElement('video');
    video.id='antennaPreview';
    video.playsInline=true;
    video.muted=true;
    video.preload='metadata';
    video.hidden=true;
    video.setAttribute('aria-label','Prévisualisation de secours du programme actuellement diffusé');
    const anchor=document.getElementById('antennaPlaceholder')||document.getElementById('antennaOverlayStatus')?.closest('.antenna-overlay')||screen.firstChild;
    screen.insertBefore(video,anchor||null);
    hydrateFallbackSource(video).catch(()=>{});
  }

  video.controls=false;
  video.removeAttribute('controls');
  if(document.getElementById('v125MonitorControls'))return;

  const controls=document.createElement('div');
  controls.id='v125MonitorControls';
  controls.className='v125-player-controls';
  controls.innerHTML='<button type="button" data-v125-play aria-label="Lecture ou pause">▶</button><button type="button" data-v125-mute aria-label="Activer ou couper le son">Son</button><span class="v125-live-chip"><i></i> LIVE</span><button type="button" data-v125-fullscreen aria-label="Plein écran">⛶</button>';
  screen.append(controls);

  const play=controls.querySelector('[data-v125-play]');
  const mute=controls.querySelector('[data-v125-mute]');
  const fullscreen=controls.querySelector('[data-v125-fullscreen]');
  const sync=()=>{
    video.controls=false;
    if(play)play.textContent=video.paused?'▶':'Ⅱ';
    if(mute)mute.textContent=video.muted?'Son coupé':'Son';
    controls.classList.toggle('is-hidden',video.hidden);
  };

  play?.addEventListener('click',async()=>{
    if(video.paused){try{await video.play();}catch{}}
    else video.pause();
    sync();
  });
  mute?.addEventListener('click',()=>{video.muted=!video.muted;sync();});
  fullscreen?.addEventListener('click',()=>{
    if(document.fullscreenElement)document.exitFullscreen?.();
    else screen.requestFullscreen?.();
  });
  for(const name of ['play','pause','volumechange','loadedmetadata'])video.addEventListener(name,sync);
  new MutationObserver(sync).observe(video,{attributes:true,attributeFilter:['hidden','controls','src']});
  sync();
}

async function hydrateFallbackSource(video){
  try{
    const response=await fetch('/api/admin/webtv/state',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)return;
    const state=await response.json();
    const current=state?.encoder?.currentItem||{};
    const playlist=Array.isArray(state?.playlist)?state.playlist:[];
    const match=playlist.find(item=>String(item?.id||'')===String(current?.id||''))||null;
    const raw=String(current?.mediaUrl||current?.playbackUrl||match?.mediaUrl||match?.playbackUrl||'').trim();
    if(!raw)return;
    const resolved=new URL(raw,location.origin);
    if(resolved.protocol!=='https:'&&resolved.origin!==location.origin)return;
    video.src=resolved.origin===location.origin?`${resolved.pathname}${resolved.search}`:resolved.toString();
    video.hidden=false;
    document.getElementById('antennaPlaceholder')?.setAttribute('hidden','');
  }catch{}
}
