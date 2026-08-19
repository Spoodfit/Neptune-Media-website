const RELEASE='neptune-webtv-cockpit-20260819-v125';
const LIBRARY_API='/api/admin/webtv/library';
const CONTROL_API='/api/admin/webtv/state';
const AUTH_API='/api/auth/status';
const STUDIO_API='/api/admin/state';
const VALID_TABS=new Set(['antenna','library','configuration','analysis']);
const state={tab:VALID_TABS.has(sessionStorage.getItem('neptune_webtv_tab'))?sessionStorage.getItem('neptune_webtv_tab'):'antenna',studio:null,control:null,library:[],selectedId:'',query:'',dirty:false,csrf:'',mounted:false};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

if(location.pathname.includes('/studio/webtv'))boot();

async function boot(){
  document.documentElement.dataset.webtvCockpitV125=RELEASE;
  try{
    const auth=await api(AUTH_API,{},false);
    if(auth.authenticated===false||!['admin','editor'].includes(String(auth.user?.role||'')))return;
    state.csrf=auth.csrfToken||sessionStorage.getItem('neptune_csrf')||'';
    if(state.csrf)sessionStorage.setItem('neptune_csrf',state.csrf);
    await waitFor(()=>$('#antennaScreen')&&$('#programPanel')&&$('.metrics'),6000);
    const [studio,control,library]=await Promise.all([api(STUDIO_API,{},false),api(CONTROL_API,{},false),api(LIBRARY_API,{},false)]);
    state.studio=studio;state.control=normalizeControl(control);state.library=Array.isArray(library.items)?library.items:[];
    state.selectedId=state.library[0]?.id||'';
    mount();renderAll();bindGlobal();observeLegacy();
  }catch(error){console.warn('webtv_cockpit_v125_boot_failed',error);}
}

function mount(){
  if(state.mounted||$('#webtvCockpitV125'))return;
  const main=$('main.main');if(!main)return;
  state.mounted=true;document.body.classList.add('webtv-v125-mounted');
  const shell=document.createElement('section');shell.id='webtvCockpitV125';shell.className='v125-cockpit';
  shell.innerHTML=`
    <div class="v125-summary">
      <div class="v125-live-slot"></div>
      <div class="v125-metrics-slot"></div>
      <div class="v125-summary-actions"><a class="v125-button v125-button-quiet" href="/direct/" target="_blank" rel="noopener">Voir la Web TV ↗</a><button class="v125-button v125-button-primary" id="v125Apply" type="button" disabled>Appliquer</button></div>
    </div>
    <nav class="v125-tabs" aria-label="Diffusion"><button data-v125-tab="antenna">Antenne</button><button data-v125-tab="library">Bibliothèque</button><button data-v125-tab="configuration">Configuration</button><button data-v125-tab="analysis">Analyse</button></nav>
    <div class="v125-workspace">
      <section class="v125-pane" data-v125-pane="antenna"><div class="v125-antenna-grid"><div class="v125-monitor-slot"></div><section class="v125-program"><header><div><span class="v125-kicker">PROGRAMME</span><h2>À l’antenne</h2></div><button class="v125-button" id="v125AddMedia" type="button">+ Ajouter</button></header><div id="v125ProgramList" class="v125-program-list"></div></section></div></section>
      <section class="v125-pane" data-v125-pane="library"><div class="v125-library"><header class="v125-section-head"><div><span class="v125-kicker">CLOUDFLARE R2</span><h2>Bibliothèque</h2></div><div class="v125-library-tools"><label class="v125-search"><span>⌕</span><input id="v125LibrarySearch" type="search" placeholder="Rechercher"></label><button class="v125-button v125-button-primary" id="v125Import" type="button">Importer</button></div></header><div class="v125-library-grid"><div id="v125LibraryList" class="v125-library-list"></div><aside id="v125LibraryEditor" class="v125-library-editor"></aside></div></div></section>
      <section class="v125-pane" data-v125-pane="configuration"><div id="v125Configuration" class="v125-config"></div></section>
      <section class="v125-pane" data-v125-pane="analysis"><div id="v125Analysis" class="v125-analysis"></div></section>
    </div>`;
  main.prepend(shell);
  const live=$('#liveCard'),metrics=$('.metrics'),monitor=$('.antenna-monitor');
  if(live)$('.v125-live-slot',shell).append(live);
  if(metrics)$('.v125-metrics-slot',shell).append(metrics);
  if(monitor)$('.v125-monitor-slot',shell).append(monitor);
  for(const node of ['.hero','.layout']){const element=$(node,main);if(element)element.hidden=true;}
  $('#save')?.setAttribute('hidden','');$('#refreshState')?.setAttribute('hidden','');
  installMonitorControls();
}

function bindGlobal(){
  $$('[data-v125-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.v125Tab)));
  $('#v125Apply')?.addEventListener('click',()=>saveControl());
  $('#v125AddMedia')?.addEventListener('click',()=>setTab('library'));
  $('#v125Import')?.addEventListener('click',openImport);
  $('#v125LibrarySearch')?.addEventListener('input',event=>{state.query=event.currentTarget.value.trim().toLowerCase();renderLibraryList();});
  window.addEventListener('neptune:webtv-library-changed',async()=>{await refreshLibrary();setTab('library');toast('Vidéo importée dans la bibliothèque.');});
}

function observeLegacy(){
  const clean=()=>{
    $('#webTvCommandV122')?.setAttribute('hidden','');$('#webTvAudienceV122')?.setAttribute('hidden','');
    const audienceLink=$('#webTvAudienceV122 a[href*="#insights"]');audienceLink?.setAttribute('hidden','');
  };
  clean();new MutationObserver(clean).observe(document.body,{subtree:true,childList:true});
}

function setTab(tab){if(!VALID_TABS.has(tab))return;state.tab=tab;sessionStorage.setItem('neptune_webtv_tab',tab);renderTabs();if(tab==='library')refreshLibrary().catch(()=>{});if(tab==='analysis')refreshStudioStats().catch(()=>{});}
function renderTabs(){$$('[data-v125-tab]').forEach(button=>{const active=button.dataset.v125Tab===state.tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});$$('[data-v125-pane]').forEach(pane=>pane.hidden=pane.dataset.v125Pane!==state.tab);}
function renderAll(){renderTabs();renderProgram();renderLibraryList();renderLibraryEditor();renderConfiguration();renderAnalysis();renderApply();simplifyMonitorCopy();}

function renderProgram(){
  const host=$('#v125ProgramList');if(!host||!state.control)return;
  const list=state.control.playlist||[],currentId=String(state.control.encoder?.currentItem?.id||'');
  host.innerHTML=list.length?list.map((item,index)=>`<article class="v125-program-row ${currentId&&String(item.id)===currentId?'is-live':''}" draggable="true" data-v125-index="${index}"><span class="v125-drag" title="Déplacer">⋮⋮</span><div class="v125-program-copy"><div><strong>${escapeHtml(item.title||'Contenu Neptune')}</strong>${currentId&&String(item.id)===currentId?'<em>EN DIRECT</em>':''}</div><small>${formatDuration(item.durationSeconds)} · ${typeLabel(item.type)}</small></div><label class="v125-mini-switch"><input type="checkbox" data-v125-enabled="${index}" ${item.enabled!==false?'checked':''}><span></span></label><select class="v125-type" data-v125-type="${index}"><option value="episode" ${item.type==='episode'?'selected':''}>Émission</option><option value="jingle" ${item.type==='jingle'?'selected':''}>Jingle</option><option value="ad" ${item.type==='ad'?'selected':''}>Pub</option></select><button class="v125-icon" data-v125-remove="${index}" type="button" aria-label="Retirer">×</button></article>`).join(''):'<div class="v125-empty"><strong>Aucun contenu programmé</strong><button class="v125-button" type="button" data-v125-open-library>Ajouter depuis la bibliothèque</button></div>';
  $$('[data-v125-open-library]',host).forEach(button=>button.addEventListener('click',()=>setTab('library')));
  $$('[data-v125-remove]',host).forEach(button=>button.addEventListener('click',()=>{state.control.playlist.splice(Number(button.dataset.v125Remove),1);markDirty();renderProgram();renderLibraryList();}));
  $$('[data-v125-enabled]',host).forEach(input=>input.addEventListener('change',()=>{const item=state.control.playlist[Number(input.dataset.v125Enabled)];if(item){item.enabled=input.checked;markDirty();}}));
  $$('[data-v125-type]',host).forEach(select=>select.addEventListener('change',()=>{const item=state.control.playlist[Number(select.dataset.v125Type)];if(item){item.type=select.value;markDirty();}}));
  let dragged=null;
  $$('.v125-program-row',host).forEach(row=>{row.addEventListener('dragstart',()=>{dragged=Number(row.dataset.v125Index);row.classList.add('is-dragging');});row.addEventListener('dragend',()=>{row.classList.remove('is-dragging');dragged=null;});row.addEventListener('dragover',event=>event.preventDefault());row.addEventListener('drop',event=>{event.preventDefault();const target=Number(row.dataset.v125Index);if(!Number.isInteger(dragged)||dragged===target)return;const [item]=state.control.playlist.splice(dragged,1);state.control.playlist.splice(target,0,item);markDirty();renderProgram();});});
}

function renderLibraryList(){
  const host=$('#v125LibraryList');if(!host)return;
  const items=filteredLibrary();
  host.innerHTML=items.length?items.map(item=>{const inProgram=isMediaInProgram(item.mediaUrl),selected=item.id===state.selectedId;return `<article class="v125-media-row ${selected?'is-selected':''}" data-v125-media="${escapeAttr(item.id)}"><button class="v125-media-main" type="button" data-v125-select="${escapeAttr(item.id)}"><span class="v125-media-icon">▶</span><span><strong>${escapeHtml(item.title)}</strong><small>${formatDuration(item.durationSeconds)} · ${formatBytes(item.size)}</small></span></button><span class="v125-source">R2</span><button class="v125-button ${inProgram?'v125-button-quiet':''}" type="button" data-v125-program="${escapeAttr(item.id)}">${inProgram?'Retirer':'Ajouter'}</button></article>`;}).join(''):'<div class="v125-empty"><strong>Aucune vidéo</strong><span>Importez votre premier média Cloudflare.</span></div>';
  $$('[data-v125-select]',host).forEach(button=>button.addEventListener('click',()=>{state.selectedId=button.dataset.v125Select;renderLibraryList();renderLibraryEditor();}));
  $$('[data-v125-program]',host).forEach(button=>button.addEventListener('click',()=>toggleProgramMedia(button.dataset.v125Program)));
}

function renderLibraryEditor(){
  const host=$('#v125LibraryEditor');if(!host)return;
  const item=selectedLibraryItem();
  if(!item){host.innerHTML='<div class="v125-empty"><strong>Sélectionnez une vidéo</strong></div>';return;}
  host.innerHTML=`<div class="v125-preview"><video id="v125LibraryPreview" src="${escapeAttr(item.mediaUrl)}" muted playsinline preload="metadata"></video><button class="v125-preview-play" type="button" data-v125-preview-play>▶</button></div><form id="v125MediaForm"><label><span>Titre</span><input name="title" maxlength="180" value="${escapeAttr(item.title)}" required></label><label><span>Durée</span><input name="durationSeconds" type="number" min="0" max="43200" value="${Number(item.durationSeconds||0)}"></label><div class="v125-media-details"><span>${formatBytes(item.size)}</span><span>${escapeHtml(item.contentType||'video/mp4')}</span></div><div class="v125-editor-actions"><button class="v125-button v125-button-primary" type="submit">Enregistrer</button><button class="v125-button" type="button" data-v125-set-fallback>Secours</button><button class="v125-button v125-danger" type="button" data-v125-delete>Supprimer</button></div></form>`;
  const video=$('#v125LibraryPreview',host),play=$('[data-v125-preview-play]',host);play?.addEventListener('click',async()=>{if(video.paused){try{await video.play();play.textContent='Ⅱ';}catch{}}else{video.pause();play.textContent='▶';}});video?.addEventListener('ended',()=>play.textContent='▶');
  $('#v125MediaForm',host)?.addEventListener('submit',event=>{event.preventDefault();saveLibraryItem(item,new FormData(event.currentTarget));});
  $('[data-v125-delete]',host)?.addEventListener('click',()=>deleteLibraryItem(item));
  $('[data-v125-set-fallback]',host)?.addEventListener('click',()=>{state.control.fallback={...(state.control.fallback||{}),mediaUrl:item.mediaUrl,title:state.control.fallback?.title||'Neptune Media'};markDirty();renderConfiguration();toast('Vidéo définie comme secours. Appliquez pour confirmer.');});
}

function renderConfiguration(){
  const host=$('#v125Configuration');if(!host||!state.control)return;
  const fallback=String(state.control.fallback?.mediaUrl||''),options=state.library.map(item=>`<option value="${escapeAttr(item.mediaUrl)}" ${sameMedia(item.mediaUrl,fallback)?'selected':''}>${escapeHtml(item.title)}</option>`).join('');
  const encoder=state.control.encoder||{},status=String(encoder.status||'not_connected');
  host.innerHTML=`<header class="v125-section-head"><div><span class="v125-kicker">RÉGLAGES</span><h2>Configuration</h2></div><button class="v125-button" id="v125Restart" type="button">Redémarrer l’encodeur</button></header><div class="v125-config-grid"><article class="v125-config-card"><h3>Antenne</h3><label class="v125-config-switch"><span><strong>Web TV active</strong><small>${state.control.enabled?'La boucle est diffusée.':'L’encodeur est arrêté.'}</small></span><input id="v125Enabled" type="checkbox" ${state.control.enabled?'checked':''}><i></i></label></article><article class="v125-config-card"><h3>Retour YouTube</h3><label><span>Lien du live</span><input id="v125YoutubeUrl" type="url" value="${escapeAttr(state.control.output?.watchUrl||'')}" placeholder="https://youtube.com/live/…"></label><div class="v125-readonly"><span>RTMPS</span><strong>${state.control.output?.configured?'Configuré':'À configurer'}</strong></div></article><article class="v125-config-card"><h3>Secours</h3><label><span>Vidéo de secours</span><select id="v125Fallback"><option value="">Mire technique automatique</option>${options}</select></label><label><span>Titre</span><input id="v125FallbackTitle" maxlength="180" value="${escapeAttr(state.control.fallback?.title||'Neptune Media')}"></label></article><article class="v125-config-card"><h3>État technique</h3><div class="v125-tech"><div><span>Encodeur</span><strong>${escapeHtml(encoderLabel(status))}</strong></div><div><span>Signal</span><strong>${encoder.lastHeartbeatAt?escapeHtml(relative(encoder.lastHeartbeatAt)):'Aucun signal'}</strong></div><div><span>Dernière erreur</span><strong>${escapeHtml(encoder.lastError||'Aucune')}</strong></div></div></article></div>`;
  $('#v125Enabled',host)?.addEventListener('change',event=>{state.control.enabled=event.currentTarget.checked;markDirty();renderConfiguration();});
  $('#v125YoutubeUrl',host)?.addEventListener('input',event=>{state.control.output={...(state.control.output||{}),watchUrl:event.currentTarget.value.trim()};markDirty();});
  $('#v125Fallback',host)?.addEventListener('change',event=>{state.control.fallback={...(state.control.fallback||{}),mediaUrl:event.currentTarget.value};markDirty();});
  $('#v125FallbackTitle',host)?.addEventListener('input',event=>{state.control.fallback={...(state.control.fallback||{}),title:event.currentTarget.value};markDirty();});
  $('#v125Restart',host)?.addEventListener('click',restartEncoder);
}

function renderAnalysis(){
  const host=$('#v125Analysis');if(!host)return;
  const stats=state.studio?.stats?.webTv||{},episodes=Array.isArray(state.studio?.episodes)?state.studio.episodes:[],byEpisode=stats.byEpisode||{};
  const rows=episodes.map(episode=>({id:String(episode.id||''),title:episode.title||'Émission',...(byEpisode[episode.id]||{})})).filter(row=>Number(row.views||0)>0||Number(row.watchSeconds||0)>0).sort((a,b)=>Number(b.views||0)-Number(a.views||0)).slice(0,12);
  const maxViews=Math.max(1,...rows.map(row=>Number(row.views||0)));
  host.innerHTML=`<header class="v125-section-head"><div><span class="v125-kicker">WEB TV</span><h2>Analyse</h2></div><button class="v125-button" id="v125RefreshAnalysis" type="button">Actualiser</button></header><div class="v125-analysis-kpis">${analysisKpi(formatNumber(stats.views),'Vues')}${analysisKpi(formatWatch(stats.watchSeconds),'Temps regardé')}${analysisKpi(formatNumber(stats.uniqueViewers),'Spectateurs')}${analysisKpi(formatNumber(stats.bookingClicks),'Clics réservation')}</div><div class="v125-analysis-grid"><section class="v125-analysis-panel"><h3>Performance des émissions</h3><div class="v125-bars">${rows.length?rows.map(row=>`<article><div><strong>${escapeHtml(row.title)}</strong><span>${formatNumber(row.views||0)} vues</span></div><i><b style="width:${Math.max(3,Math.round(Number(row.views||0)/maxViews*100))}%"></b></i><small>${formatWatch(row.watchSeconds||0)}</small></article>`).join(''):'<div class="v125-empty"><strong>Pas encore de données</strong></div>'}</div></section><section class="v125-analysis-panel"><h3>30 derniers jours</h3><div class="v125-daily">${renderDaily(stats.daily||[])}</div></section></div>`;
  $('#v125RefreshAnalysis',host)?.addEventListener('click',()=>refreshStudioStats());
}

function renderDaily(daily){const rows=(Array.isArray(daily)?daily:[]).slice(-14);if(!rows.length)return'<div class="v125-empty"><strong>Aucune donnée récente</strong></div>';const max=Math.max(1,...rows.map(row=>Number(row.views||0)));return rows.map(row=>`<div title="${escapeAttr(row.day||'')}: ${formatNumber(row.views||0)} vues"><i style="height:${Math.max(8,Math.round(Number(row.views||0)/max*100))}%"></i><span>${escapeHtml(String(row.day||'').slice(5))}</span></div>`).join('');}
function analysisKpi(value,label){return `<article><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`;}

async function saveLibraryItem(item,form){
  const payload={id:item.id,mediaUrl:item.mediaUrl,title:String(form.get('title')||'').trim(),durationSeconds:Number(form.get('durationSeconds')||0),originalName:item.originalName||''};
  try{
    const result=await api(LIBRARY_API,{method:'PATCH',body:JSON.stringify(payload)});const updated=result.item||payload;
    state.library=state.library.map(entry=>entry.id===item.id?{...entry,...updated}:entry);
    for(const entry of state.control.playlist||[])if(sameMedia(entry.mediaUrl,item.mediaUrl)){entry.title=updated.title;entry.durationSeconds=updated.durationSeconds;markDirty();}
    renderLibraryList();renderLibraryEditor();renderProgram();toast('Vidéo mise à jour.');
  }catch(error){toast('Modification impossible : '+humanError(error.message),true);}
}

async function deleteLibraryItem(item){
  if(!confirm(`Supprimer définitivement « ${item.title} » de Cloudflare ?`))return;
  try{
    const used=(state.control.playlist||[]).some(entry=>sameMedia(entry.mediaUrl,item.mediaUrl));const fallback=sameMedia(state.control.fallback?.mediaUrl,item.mediaUrl);
    if(used||fallback){state.control.playlist=(state.control.playlist||[]).filter(entry=>!sameMedia(entry.mediaUrl,item.mediaUrl));if(fallback)state.control.fallback={...(state.control.fallback||{}),mediaUrl:''};markDirty();await saveControl({silent:true});}
    await api(LIBRARY_API,{method:'DELETE',body:JSON.stringify({id:item.id,mediaUrl:item.mediaUrl})});
    state.library=state.library.filter(entry=>entry.id!==item.id);state.selectedId=state.library[0]?.id||'';renderProgram();renderLibraryList();renderLibraryEditor();renderConfiguration();toast('Vidéo supprimée de Cloudflare.');
  }catch(error){toast('Suppression impossible : '+humanError(error.message),true);}
}

function toggleProgramMedia(id){const item=state.library.find(entry=>entry.id===id);if(!item)return;if(isMediaInProgram(item.mediaUrl))state.control.playlist=(state.control.playlist||[]).filter(entry=>!sameMedia(entry.mediaUrl,item.mediaUrl));else state.control.playlist=[...(state.control.playlist||[]),{id:instanceId(item.id),title:item.title,mediaUrl:item.mediaUrl,durationSeconds:Number(item.durationSeconds||0),type:'episode',enabled:true}];markDirty();renderProgram();renderLibraryList();}
function isMediaInProgram(url){return (state.control?.playlist||[]).some(entry=>sameMedia(entry.mediaUrl,url));}

async function saveControl({silent=false}={}){
  if(!state.control)return;
  const button=$('#v125Apply');if(button){button.disabled=true;button.textContent='Application…';}
  try{state.control=normalizeControl(await api(CONTROL_API,{method:'PUT',body:JSON.stringify(state.control)}));state.dirty=false;renderApply();renderProgram();renderConfiguration();if(!silent)toast(state.control.enabled?'Antenne mise à jour.':'Programme enregistré.');setTimeout(refreshControl,1800);}catch(error){state.dirty=true;renderApply();if(!silent)toast('Mise à jour impossible : '+humanError(error.message),true);throw error;}
}
function markDirty(){state.dirty=true;renderApply();}
function renderApply(){const button=$('#v125Apply');if(!button)return;button.disabled=!state.dirty;button.textContent=state.dirty?(state.control?.enabled?'Appliquer à l’antenne':'Enregistrer'):(state.control?.enabled?'Antenne à jour':'Programme enregistré');if(state.dirty)$('#syncState').textContent='Modifications à appliquer';}

async function refreshControl(){try{const latest=normalizeControl(await api(CONTROL_API,{},false));if(!state.dirty)state.control=latest;else state.control.encoder=latest.encoder||state.control.encoder;renderProgram();renderConfiguration();}catch{}}
async function refreshLibrary(){try{const data=await api(LIBRARY_API,{},false);state.library=Array.isArray(data.items)?data.items:[];if(!state.library.some(item=>item.id===state.selectedId))state.selectedId=state.library[0]?.id||'';window.NeptuneWebTvProgram?.setImportedMedia?.(state.library);renderLibraryList();renderLibraryEditor();renderConfiguration();}catch(error){toast('Bibliothèque indisponible : '+humanError(error.message),true);}}
async function refreshStudioStats(){try{state.studio=await api(STUDIO_API,{},false);renderAnalysis();}catch(error){toast('Analyse indisponible : '+humanError(error.message),true);}}
async function restartEncoder(){const button=$('#v125Restart');if(button){button.disabled=true;button.textContent='Redémarrage…';}try{const result=await api('/api/admin/webtv/encoder',{method:'POST',body:JSON.stringify({action:'restart'})});state.control.encoder=result.encoder||state.control.encoder;renderConfiguration();toast('Redémarrage demandé.');setTimeout(refreshControl,2200);}catch(error){toast('Redémarrage impossible : '+humanError(error.message),true);}finally{if(button){button.disabled=false;button.textContent='Redémarrer l’encodeur';}}}

async function openImport(){const ready=await waitFor(()=>$('#importVideo'),2500);if(ready)$('#importVideo').click();else toast('Import vidéo indisponible.',true);}

function installMonitorControls(){
  const screen=$('#antennaScreen'),video=$('#antennaPreview');if(!screen||!video||$('#v125MonitorControls'))return;video.controls=false;video.removeAttribute('controls');
  const controls=document.createElement('div');controls.id='v125MonitorControls';controls.className='v125-player-controls';controls.innerHTML='<button type="button" data-v125-play aria-label="Lecture ou pause">▶</button><button type="button" data-v125-mute aria-label="Activer ou couper le son">Son</button><span class="v125-live-chip"><i></i> LIVE</span><button type="button" data-v125-fullscreen aria-label="Plein écran">⛶</button>';screen.append(controls);
  const play=$('[data-v125-play]',controls),mute=$('[data-v125-mute]',controls);const sync=()=>{video.controls=false;play.textContent=video.paused?'▶':'Ⅱ';mute.textContent=video.muted?'Son coupé':'Son';controls.classList.toggle('is-hidden',video.hidden);};
  play.addEventListener('click',async()=>{if(video.paused){try{await video.play();}catch{}}else video.pause();sync();});mute.addEventListener('click',()=>{video.muted=!video.muted;sync();});$('[data-v125-fullscreen]',controls).addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else screen.requestFullscreen?.();});for(const event of ['play','pause','volumechange','loadedmetadata'])video.addEventListener(event,sync);new MutationObserver(sync).observe(video,{attributes:true,attributeFilter:['hidden','controls']});sync();
}

function simplifyMonitorCopy(){const head=$('.antenna-monitor-head');if(head){const p=$('p',head);if(p)p.hidden=true;const title=$('h3',head);if(title)title.textContent='Retour antenne';}const foot=$('.antenna-monitor-foot');if(foot){$('p',foot)?.setAttribute('hidden','');}$('#monitorResync')?.classList.add('v125-monitor-resync');}
function filteredLibrary(){const query=state.query;if(!query)return state.library;return state.library.filter(item=>`${item.title} ${item.originalName||''}`.toLowerCase().includes(query));}
function selectedLibraryItem(){return state.library.find(item=>item.id===state.selectedId)||null;}
function normalizeControl(value){return {...(value||{}),playlist:Array.isArray(value?.playlist)?value.playlist:[],fallback:{title:'Neptune Media',mediaUrl:'',...(value?.fallback||{})},output:{...(value?.output||{})},encoder:{...(value?.encoder||{})}};}
function instanceId(base){return`${String(base||'media').replace(/[^a-z0-9_-]+/giu,'-').slice(0,56)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;}
function sameMedia(a,b){try{const x=new URL(String(a||''),location.origin),y=new URL(String(b||''),location.origin);return `${x.origin}${x.pathname}${x.search}`===`${y.origin}${y.pathname}${y.search}`;}catch{return String(a||'')===String(b||'');}}
function formatDuration(seconds){const total=Math.max(0,Math.round(Number(seconds)||0));if(!total)return'—';const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h?`${h} h ${String(m).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
function formatWatch(seconds){const n=Math.max(0,Number(seconds||0));return n>=3600?`${Math.round(n/360)/10} h`:`${Math.round(n/60)} min`;}
function formatNumber(value){return new Intl.NumberFormat('fr-FR').format(Number(value||0));}
function formatBytes(bytes){let n=Number(bytes||0),i=0;const units=['o','Ko','Mo','Go','To'];while(n>=1024&&i<units.length-1){n/=1024;i+=1;}return`${n>=10||i===0?n.toFixed(0):n.toFixed(1)} ${units[i]}`;}
function typeLabel(type){return({episode:'Émission',jingle:'Jingle',ad:'Publicité',fallback:'Secours'})[type]||'Émission';}
function encoderLabel(status){return({idle:'Prêt',running:'Opérationnel',live:'Opérationnel',streaming:'Diffusion active',starting:'Démarrage',stopped:'Arrêté',error:'Erreur',not_connected:'Non connecté'})[status]||status;}
function relative(value){const delta=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/1000));if(delta<60)return'À l’instant';if(delta<3600)return`Il y a ${Math.floor(delta/60)} min`;return`Il y a ${Math.floor(delta/3600)} h`;}
function humanError(code){return String(code||'erreur').replaceAll('_',' ');}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[char]));}
function escapeAttr(value){return escapeHtml(value).replace(/`/gu,'&#096;');}
function toast(message,error=false){window.NeptuneWebTvProgram?.toast?.(message,error);if(!window.NeptuneWebTvProgram){const node=$('#toast');if(node){node.textContent=message;node.hidden=false;node.classList.toggle('error',error);setTimeout(()=>node.hidden=true,3600);}}}
async function api(url,options={},addCsrf=true){const headers={Accept:'application/json',...(options.headers||{})};if(options.body)headers['Content-Type']='application/json';if(addCsrf&&options.method&&options.method!=='GET'&&state.csrf)headers['X-CSRF-Token']=state.csrf;const response=await fetch(url,{...options,headers,credentials:'same-origin',cache:'no-store'}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.code||`http_${response.status}`);return data;}
function waitFor(predicate,timeout=4000){return new Promise(resolve=>{const start=Date.now();const tick=()=>{try{if(predicate())return resolve(true);}catch{}if(Date.now()-start>=timeout)return resolve(false);setTimeout(tick,50);};tick();});}
