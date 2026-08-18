const RELEASE='neptune-webtv-control-room-20260818-v122';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const PUBLIC_URL=`${location.origin}/direct/`;
const EMBED_URL=`${location.origin}/direct/?embed=1`;

if(location.pathname.includes('/studio/webtv'))boot();

async function boot(){
  document.documentElement.dataset.webTvControlRoomV122=RELEASE;
  try{
    const auth=await api('/api/auth/status');
    if(auth.authenticated===false)return;
    const [studio,control]=await Promise.all([api('/api/admin/state'),api('/api/admin/webtv/state')]);
    installCommandCenter(studio,control);
    installAudience(studio,control);
    simplifyLegacyCopy(control);
  }catch(error){console.warn('webtv_v122_boot_failed',error);}
}

function installCommandCenter(studio,control){
  if($('#webTvCommandV122'))return;
  const anchor=$('.metrics')||$('#programPanel');
  if(!anchor)return;
  const episodes=usableEpisodes(studio);
  const ads=usableAds(studio);
  const active=(control.playlist||[]).filter(item=>item.enabled!==false);
  const duration=active.reduce((sum,item)=>sum+Number(item.durationSeconds||0),0);
  const live=['running','streaming','live'].includes(String(control.encoder?.status||''))&&control.enabled===true;
  const sourceCount=countCloudflareItems(control,episodes);
  const section=document.createElement('section');
  section.id='webTvCommandV122';
  section.className='v122-tv-command';
  section.innerHTML=`
    <div class="v122-tv-head">
      <div><p class="eyebrow">CHAÎNE NEPTUNE · H24</p><h2>Construisez la WebTV depuis vos émissions Cloudflare.</h2><p>La boucle Neptune tourne en continu dans Cloudflare. Ajoutez ou réordonnez émissions et publicités, puis publiez l’antenne.</p></div>
      <div class="v122-tv-live ${live?'is-live':''}"><i></i><div><small>ANTENNE</small><strong>${live?'EN DIRECT':control.enabled?'DÉMARRAGE':'ARRÊTÉE'}</strong></div></div>
    </div>
    <div class="v122-tv-kpis">
      ${kpi(episodes.length,'Émissions Cloudflare','Disponibles pour la grille')}
      ${kpi(active.length,'Éléments en boucle',`${formatDuration(duration)} avant rebouclage`)}
      ${kpi(ads.length,'Publicités actives','Insérables où vous voulez')}
      ${kpi(sourceCount,'Émissions synchronisées',`${Math.max(episodes.length-sourceCount,0)} manquante${episodes.length-sourceCount>1?'s':''}`)}
    </div>
    <div class="v122-tv-actions">
      <button type="button" class="v122-primary" data-v122-sync>${sourceCount<episodes.length?'Synchroniser les émissions':'Resynchroniser Cloudflare'}</button>
      <button type="button" class="v122-secondary" data-v122-toggle>${control.enabled?'Arrêter la chaîne':'Activer la chaîne H24'}</button>
      <button type="button" class="v122-secondary" data-v122-copy="public">Copier le lien</button>
      <button type="button" class="v122-secondary" data-v122-copy="embed">Copier le code d’intégration</button>
      <a class="v122-secondary" href="/direct/" target="_blank" rel="noopener">Voir la WebTV ↗</a>
    </div>
    <div class="v122-tv-source">
      <div class="v122-source-head"><div><strong>Bibliothèque Cloudflare</strong><span>Ajoutez un contenu sans quitter la régie.</span></div><button type="button" data-v122-open-program>Voir le programme</button></div>
      <div class="v122-source-rail">${sourceCards(episodes,ads,control)}</div>
    </div>
    <div class="v122-tv-message" data-v122-message hidden></div>`;
  anchor.before(section);
  bindCommandCenter(section,studio,control);
}

function kpi(value,label,detail){return `<article><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span><small>${escapeHtml(detail)}</small></article>`;}

function sourceCards(episodes,ads,control){
  const playlist=control.playlist||[];
  const items=[...episodes.map(item=>({...item,_kind:'episode'})),...ads.map(item=>({...item,_kind:'ad'}))].slice(0,12);
  if(!items.length)return'<div class="v122-source-empty">Aucune émission ou publicité exploitable dans Cloudflare.</div>';
  return items.map(item=>{
    const media=mediaUrl(item);
    const already=playlist.some(entry=>sameMedia(entry.mediaUrl,media));
    const image=item.posterUrl||item.coverUrl||item.thumbnailUrl||'';
    return `<article class="v122-source-card"><div class="v122-source-visual">${image?`<img src="${escapeAttr(image)}" alt="">`:'<span>▶</span>'}</div><div><small>${item._kind==='ad'?'PUBLICITÉ':'ÉMISSION'}</small><strong>${escapeHtml(item.title||item.name||'Contenu Neptune')}</strong><span>${formatDuration(Number(item.durationSeconds||0))}</span></div><button type="button" data-v122-add data-kind="${item._kind}" data-id="${escapeAttr(item.id)}" ${already?'disabled':''}>${already?'Ajouté':'Ajouter'}</button></article>`;
  }).join('');
}

function bindCommandCenter(root,studio,initialControl){
  const message=$('[data-v122-message]',root);
  $('[data-v122-sync]',root)?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='Synchronisation…';
    try{
      const control=await api('/api/admin/webtv/state');
      const result=synchronizeEpisodes(control,usableEpisodes(studio));
      if(!result.changed){showMessage(message,'Toutes les émissions Cloudflare sont déjà dans la boucle.');return;}
      await putControl(result.control);
      showMessage(message,`${result.added} émission${result.added>1?'s':''} ajoutée${result.added>1?'s':''}. Ordre et publicités existants conservés.`);
      setTimeout(()=>location.reload(),700);
    }catch(error){showMessage(message,`Synchronisation impossible : ${humanError(error)}`,true);button.disabled=false;button.textContent='Réessayer';}
  });
  $('[data-v122-toggle]',root)?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{
      const control=await api('/api/admin/webtv/state');
      if(!control.enabled&&!(control.playlist||[]).some(item=>item.enabled!==false))throw new Error('Ajoutez au moins une émission avant d’activer la chaîne.');
      control.enabled=!control.enabled;
      await putControl(control);
      showMessage(message,control.enabled?'Chaîne H24 activée. Le watchdog Cloudflare maintient l’antenne.':'Chaîne arrêtée.');
      setTimeout(()=>location.reload(),650);
    }catch(error){showMessage(message,humanError(error),true);button.disabled=false;}
  });
  $$('[data-v122-copy]',root).forEach(button=>button.addEventListener('click',async()=>{
    const type=button.dataset.v122Copy;
    const value=type==='embed'?embedCode():PUBLIC_URL;
    try{await navigator.clipboard.writeText(value);button.textContent='Copié ✓';setTimeout(()=>button.textContent=type==='embed'?"Copier le code d’intégration":'Copier le lien',1400);}catch{showMessage(message,'Copie impossible. Utilisez la zone Configuration.',true);}
  }));
  $$('[data-v122-add]',root).forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;button.textContent='Ajout…';
    try{
      const control=await api('/api/admin/webtv/state');
      const source=button.dataset.kind==='ad'?usableAds(studio):usableEpisodes(studio);
      const item=source.find(entry=>String(entry.id)===String(button.dataset.id));
      if(!item)throw new Error('Contenu introuvable.');
      const url=mediaUrl(item);if(!url)throw new Error('Média Cloudflare indisponible.');
      if(!(control.playlist||[]).some(entry=>sameMedia(entry.mediaUrl,url))){
        control.playlist=[...(control.playlist||[]),playlistItem(item,button.dataset.kind)];
        await putControl(control);
      }
      button.textContent='Ajouté ✓';
      showMessage(message,'Contenu ajouté à la fin de la boucle. Vous pouvez maintenant le déplacer dans Programme.');
      setTimeout(()=>location.reload(),650);
    }catch(error){showMessage(message,humanError(error),true);button.disabled=false;button.textContent='Réessayer';}
  }));
  $('[data-v122-open-program]',root)?.addEventListener('click',()=>{
    const tab=$('[data-webtv-section="program"],button[data-webtv-section="program"]');
    if(tab)tab.click();
    $('#programPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
}

function synchronizeEpisodes(control,episodes){
  const playlist=[...(control.playlist||[])];
  let added=0,changed=false;
  const usedIds=new Set();
  for(const item of playlist){
    const source=episodes.find(ep=>sameMedia(item.mediaUrl,mediaUrl(ep))||String(item.title||'').trim()===String(ep.title||'').trim());
    if(!source||String(item.type||'episode')!=='episode')continue;
    if(!usedIds.has(String(source.id))&&String(item.id)!==String(source.id)){
      item.id=String(source.id);changed=true;
    }
    usedIds.add(String(item.id));
  }
  for(const episode of episodes){
    const url=mediaUrl(episode);if(!url)continue;
    if(playlist.some(item=>sameMedia(item.mediaUrl,url)))continue;
    playlist.push(playlistItem(episode,'episode'));added+=1;changed=true;
  }
  return {changed,added,control:{...control,playlist}};
}

function playlistItem(item,kind){
  return {id:String(item.id||`${kind}-${Date.now()}`),title:String(item.title||item.name||'Contenu Neptune'),mediaUrl:mediaUrl(item),durationSeconds:Number(item.durationSeconds||item.duration||0),type:kind==='ad'?'ad':'episode',enabled:true};
}

function installAudience(studio,control){
  if($('#webTvAudienceV122'))return;
  const panel=$('#programPanel');if(!panel)return;
  const stats=studio.stats||{};
  const episodes=usableEpisodes(studio);
  const programmedEpisodeIds=new Set();
  for(const item of control.playlist||[]){
    const source=episodes.find(ep=>String(ep.id)===String(item.id)||sameMedia(mediaUrl(ep),item.mediaUrl)||String(ep.title||'')===String(item.title||''));
    if(source)programmedEpisodeIds.add(String(source.id));
  }
  const byEpisode=stats.byEpisode||{};
  let views=0,watch=0,clicks=0;
  for(const id of programmedEpisodeIds){const row=byEpisode[id]||{};views+=Number(row.views||0);watch+=Number(row.watchSeconds||0);clicks+=Number(row.bookingClicks||0);}
  if(!programmedEpisodeIds.size){views=Number(stats.views||0);watch=Number(stats.watchSeconds||0);clicks=Number(stats.bookingClicks||0);}
  const rate=views?Math.round((clicks/views)*1000)/10:0;
  const section=document.createElement('section');
  section.id='webTvAudienceV122';section.className='v122-tv-audience';
  section.innerHTML=`<div class="v122-audience-head"><div><p class="eyebrow">AUDIENCE</p><h3>Performance des émissions programmées</h3></div><a href="/studio/advanced.html#insights">Analyse détaillée ↗</a></div><div class="v122-audience-grid">${kpi(views,'Vues','Émissions présentes dans la boucle')}${kpi(formatWatch(watch),'Temps regardé','Cumul des lectures mesurées')}${kpi(clicks,'Clics réservation',`${rate}% des vues`)}${kpi(Number(stats.uniqueViewers||0),'Spectateurs uniques','Audience connue Neptune')}</div>`;
  const head=$('.panel-head',panel);if(head)head.after(section);else panel.prepend(section);
}

function simplifyLegacyCopy(control){
  const hero=$('.hero');if(hero){const p=$('p:last-child',hero);if(p)p.textContent='Une chaîne continue gérée dans Cloudflare : émissions, publicités, ordre de passage, sécurité antenne et intégration externe.';}
  const mode=$('#mode');if(mode)mode.closest('label')?.setAttribute('hidden','');
  const youtube=$('#youtubeLiveUrl');if(youtube){
    const label=youtube.closest('label');
    const title=$('span',label);if(title)title.textContent='Retour YouTube (facultatif)';
    const help=$('.field-help',label);if(help)help.textContent='Optionnel : la WebTV Neptune fonctionne directement sur /direct/. Ajoutez ici un live YouTube uniquement si vous voulez son retour dans le moniteur.';
  }
  const destination=$('.settings-card .readonly-row strong');if(destination)destination.textContent='Neptune HLS · H24';
}

function usableEpisodes(studio){return (Array.isArray(studio.episodes)?studio.episodes:[]).filter(item=>String(item.status||'').toLowerCase()==='published'&&mediaUrl(item)).sort((a,b)=>Number(a.displayOrder||0)-Number(b.displayOrder||0));}
function usableAds(studio){return (Array.isArray(studio.ads)?studio.ads:[]).filter(item=>item.active!==false&&mediaUrl(item));}
function mediaUrl(item){return String(item?.mediaUrl||item?.videoUrl||item?.assetUrl||item?.playbackUrl||item?.publicUrl||item?.url||'').trim();}
function sameMedia(a,b){try{const x=new URL(String(a||''),location.origin),y=new URL(String(b||''),location.origin);return `${x.origin}${x.pathname}${x.search}`===`${y.origin}${y.pathname}${y.search}`;}catch{return String(a||'')===String(b||'');}}
function countCloudflareItems(control,episodes){return episodes.filter(ep=>(control.playlist||[]).some(item=>sameMedia(item.mediaUrl,mediaUrl(ep)))).length;}
function embedCode(){return `<iframe src="${EMBED_URL}" title="Neptune Business · Direct" allow="autoplay; fullscreen" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen></iframe>`;}
async function putControl(control){return api('/api/admin/webtv/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(control)});}
async function api(path,options={}){const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;}
function showMessage(node,text,error=false){if(!node)return;node.hidden=false;node.textContent=text;node.classList.toggle('is-error',error);}
function formatDuration(seconds){const total=Math.max(0,Math.round(Number(seconds)||0));if(!total)return'—';if(total>=3600){const h=Math.floor(total/3600),m=Math.round((total%3600)/60);return`${h} h${m?` ${m} min`:''}`;}return`${Math.max(1,Math.round(total/60))} min`;}
function formatWatch(seconds){const n=Number(seconds||0);return n>=3600?`${Math.round(n/360)/10} h`:`${Math.round(n/60)} min`;}
function humanError(error){const value=String(error?.message||error||'Erreur inconnue');const map={webtv_playlist_empty:'Ajoutez au moins une émission avant d’activer la chaîne.',youtube_not_configured:'YouTube n’est pas configuré. La diffusion Neptune reste disponible via le lien /direct/.'};return map[value]||value.replaceAll('_',' ');}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function escapeAttr(value){return escapeHtml(value).replace(/`/gu,'&#096;');}
