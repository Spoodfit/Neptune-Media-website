const V1184_RELEASE='neptune-client-ux-20260814-v118.4';
const PLATFORM_LABELS={youtube:'YouTube',tiktok:'TikTok',instagram:'Instagram'};

document.documentElement.dataset.clientUxV1184='1';
document.documentElement.dataset.clientUxReleaseV1184=V1184_RELEASE;

start();

function start(){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
}

function boot(){
  if(isClientHome())setupCollapsibleJourneyDetail();
  if(isCalendar())setupPublicationPlanner();
}

function isClientHome(){return ['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname);}
function isCalendar(){return location.pathname==='/espace-client/calendrier'||location.pathname.startsWith('/espace-client/calendrier/');}

/* --------------------------------------------------------------------------
 * Journey details
 * ----------------------------------------------------------------------- */
function setupCollapsibleJourneyDetail(){
  let collapsedIdentity='';
  let queued=false;

  const queue=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;reconcile();});
  };

  function reconcile(){
    const region=document.querySelector('#ccDetailRegion');
    if(!region)return;
    const identity=String(region.dataset.v118Identity||'');
    if(collapsedIdentity&&identity&&identity!==collapsedIdentity)collapsedIdentity='';
    const collapsed=Boolean(collapsedIdentity&&identity===collapsedIdentity);
    if(collapsed)region.dataset.v1184Collapsed='1';
    else delete region.dataset.v1184Collapsed;
    ensureToggle(region,collapsed);
  }

  function ensureToggle(region,collapsed){
    let button=document.querySelector('[data-v1184-detail-toggle]');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='cc-v1184-detail-toggle';
      button.dataset.v1184DetailToggle='1';
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg><span>Afficher le détail de l’étape</span>';
      region.before(button);
    }
    button.classList.toggle('is-visible',collapsed);
    button.hidden=!collapsed;
    button.setAttribute('aria-expanded',String(!collapsed));
    button.setAttribute('aria-controls','ccDetailRegion');
    const stageLabel=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-copy strong')?.textContent?.trim();
    const span=button.querySelector('span');
    if(span)span.textContent=stageLabel?`Afficher le détail · ${stageLabel}`:'Afficher le détail de l’étape';
  }

  document.addEventListener('click',(event)=>{
    const region=document.querySelector('#ccDetailRegion');
    if(!region)return;
    if(event.target.closest?.('[data-v118-close]')){
      collapsedIdentity=String(region.dataset.v118Identity||'current');
      region.dataset.v1184Collapsed='1';
      queue();
      return;
    }
    if(event.target.closest?.('[data-v1184-detail-toggle]')){
      collapsedIdentity='';
      delete region.dataset.v1184Collapsed;
      region.hidden=false;
      queue();
      requestAnimationFrame(()=>region.scrollIntoView({block:'nearest',behavior:reducedMotion()?'auto':'smooth'}));
      return;
    }
    if(event.target.closest?.('[data-cc-stage],[data-cc-track]')){
      collapsedIdentity='';
      delete region.dataset.v1184Collapsed;
      queue();
    }
  },true);

  new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
  queue();
}

/* --------------------------------------------------------------------------
 * Calendar = actionable publication planner
 * ----------------------------------------------------------------------- */
async function setupPublicationPlanner(){
  document.documentElement.dataset.clientPlanningV1184='1';
  const grid=document.querySelector('#calendarGrid');
  if(!grid)return;

  const state={
    data:{assets:[],occurrences:[],publications:[],minimumReuseDays:30},
    mode:'week',
    cursor:startOfWeek(new Date()),
  };

  preparePlannerShell();
  grid.innerHTML='<div class="planning-v1184-empty">Chargement de votre planning…</div>';

  try{
    const response=await fetch('/api/client/content-calendar',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`http_${response.status}`);
    state.data=normalizeCalendar(payload);
    const next=nextOccurrence(state.data.occurrences);
    state.cursor=startOfWeek(next?new Date(next.publishAt):new Date());
    renderPlanner(state);
  }catch(error){
    if(['unauthorized','http_401'].includes(String(error.message||''))){location.href='/espace-client/';return;}
    grid.innerHTML='<div class="planning-v1184-empty"><strong>Impossible de charger le planning.</strong><br>Réessayez dans quelques instants.</div>';
  }

  document.addEventListener('click',(event)=>{
    const modeButton=event.target.closest?.('[data-v1184-mode]');
    if(modeButton){
      state.mode=modeButton.dataset.v1184Mode==='month'?'month':'week';
      state.cursor=state.mode==='week'?startOfWeek(state.cursor):new Date(state.cursor.getFullYear(),state.cursor.getMonth(),1);
      renderPlanner(state);
      return;
    }
    const nav=event.target.closest?.('[data-v1184-nav]');
    if(nav){
      const delta=Number(nav.dataset.v1184Nav||0);
      if(state.mode==='week')state.cursor=addDays(state.cursor,delta*7);
      else state.cursor=new Date(state.cursor.getFullYear(),state.cursor.getMonth()+delta,1);
      renderPlanner(state);
      return;
    }
    if(event.target.closest?.('[data-v1184-today]')){
      state.cursor=state.mode==='week'?startOfWeek(new Date()):new Date(new Date().getFullYear(),new Date().getMonth(),1);
      renderPlanner(state);
      return;
    }
    const occurrenceButton=event.target.closest?.('[data-v1184-occurrence]');
    if(occurrenceButton){
      const occurrence=state.data.occurrences.find(item=>String(item.occurrenceId)===String(occurrenceButton.dataset.v1184Occurrence));
      if(occurrence)openPublicationSheet(state,occurrence);
    }
  });
}

function preparePlannerShell(){
  const intro=document.querySelector('.calendar-intro');
  const title=intro?.querySelector('h1');
  const description=intro?.querySelector('div>p:last-child');
  if(title)title.textContent='Que dois-je publier ?';
  if(description)description.textContent='Visualisez le contenu prévu, le bon jour et les bons canaux. Passez de la semaine au mois selon le niveau de détail dont vous avez besoin.';

  document.querySelector('.reuse-guide')?.setAttribute('hidden','');
  document.querySelector('#libraryView')?.setAttribute('hidden','');
  const viewSwitch=document.querySelector('.view-switch');
  if(viewSwitch)viewSwitch.hidden=true;

  const heading=document.querySelector('.calendar-toolbar');
  const headingTitle=heading?.querySelector('h2');
  const headingCopy=heading?.querySelector('div>p:last-child');
  if(headingTitle)headingTitle.textContent='Planning de publication';
  if(headingCopy)headingCopy.textContent='Chaque carte correspond à la vidéo réellement prévue. Cliquez dessus pour vérifier la date et les canaux.';

  const oldControls=heading?.querySelector('.month-controls');
  if(oldControls){
    const controls=document.createElement('div');
    controls.className='planning-v1184-controls';
    controls.innerHTML=`<div class="planning-v1184-mode" role="group" aria-label="Vue du planning"><button type="button" data-v1184-mode="week">Semaine</button><button type="button" data-v1184-mode="month">Mois</button></div><div class="planning-v1184-nav"><button type="button" data-v1184-nav="-1" aria-label="Période précédente">←</button><button type="button" data-v1184-nav="1" aria-label="Période suivante">→</button><button type="button" data-v1184-today>Aujourd’hui</button></div><strong class="planning-v1184-label" data-v1184-label></strong>`;
    oldControls.replaceWith(controls);
  }

  const calendarView=document.querySelector('#calendarView');
  if(calendarView){calendarView.hidden=false;calendarView.classList.add('active');}
  const grid=document.querySelector('#calendarGrid');
  if(grid)grid.className='planning-v1184-root';
}

function normalizeCalendar(response){
  const assets=Array.isArray(response.assets)?response.assets:[];
  const occurrences=Array.isArray(response.occurrences)?response.occurrences:[];
  const publications=Array.isArray(response.publications)?response.publications:[];
  return {...response,assets,occurrences,publications,minimumReuseDays:Number(response.minimumReuseDays||30)};
}

function nextOccurrence(occurrences){
  const now=Date.now();
  return [...occurrences]
    .filter(item=>validDate(item.publishAt))
    .sort((a,b)=>new Date(a.publishAt)-new Date(b.publishAt))
    .find(item=>new Date(item.publishAt).getTime()>=now)
    || [...occurrences].filter(item=>validDate(item.publishAt)).sort((a,b)=>new Date(b.publishAt)-new Date(a.publishAt))[0]
    || null;
}

function renderPlanner(state){
  const grid=document.querySelector('#calendarGrid');
  if(!grid)return;
  syncPlannerSummary(state.data);
  syncPlannerControls(state);

  const scheduled=state.data.occurrences.filter(item=>validDate(item.publishAt));
  const unscheduled=Math.max(0,state.data.assets.length-new Set(scheduled.map(item=>String(item.fileId))).size);
  const context=`<div class="planning-v1184-context"><span><strong>${scheduled.length}</strong> programmation${scheduled.length>1?'s':''} enregistrée${scheduled.length>1?'s':''}</span><span>${unscheduled?`${unscheduled} contenu${unscheduled>1?'s':''} encore à planifier`:'Tous les contenus disponibles ont une programmation'}</span></div>`;

  if(state.mode==='month')grid.innerHTML=context+monthMarkup(state);
  else grid.innerHTML=context+weekMarkup(state);
}

function syncPlannerSummary(data){
  const shortCount=document.querySelector('#shortCount');
  const scheduledCount=document.querySelector('#scheduledCount');
  const publishedCount=document.querySelector('#publishedCount');
  if(shortCount)shortCount.textContent=String(data.assets.length);
  if(scheduledCount)scheduledCount.textContent=String(data.occurrences.length);
  if(publishedCount)publishedCount.textContent=String(data.publications.filter(item=>item.status==='published').length);
  const spans=document.querySelectorAll('.calendar-summary span');
  if(spans[0])spans[0].textContent='contenus courts';
  if(spans[1])spans[1].textContent='à publier';
  if(spans[2])spans[2].textContent='publiés';
}

function syncPlannerControls(state){
  document.querySelectorAll('[data-v1184-mode]').forEach(button=>{
    const active=button.dataset.v1184Mode===state.mode;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  const label=document.querySelector('[data-v1184-label]');
  if(!label)return;
  if(state.mode==='month'){
    label.textContent=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(state.cursor);
  }else{
    const end=addDays(startOfWeek(state.cursor),6);
    const sameMonth=state.cursor.getMonth()===end.getMonth();
    label.textContent=sameMonth
      ? `${state.cursor.getDate()}–${end.getDate()} ${new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(end)}`
      : `${new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(state.cursor)} – ${new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(end)}`;
  }
}

function weekMarkup(state){
  const start=startOfWeek(state.cursor);
  const days=Array.from({length:7},(_,index)=>addDays(start,index));
  return `<div class="planning-v1184-week">${days.map(day=>weekDayMarkup(state,day)).join('')}</div>`;
}

function weekDayMarkup(state,day){
  const entries=state.data.occurrences
    .filter(item=>sameDay(item.publishAt,day))
    .sort((a,b)=>new Date(a.publishAt)-new Date(b.publishAt));
  const today=sameDay(new Date(),day);
  const weekday=new Intl.DateTimeFormat('fr-FR',{weekday:'short'}).format(day).replace('.','');
  return `<section class="planning-v1184-day${today?' is-today':''}"><header class="planning-v1184-day-head"><span>${esc(weekday)}</span><strong>${day.getDate()}</strong></header><div class="planning-v1184-items">${entries.length?entries.map(item=>planningItemMarkup(state,item)).join(''):'<div class="planning-v1184-empty-day">Rien à publier</div>'}</div></section>`;
}

function planningItemMarkup(state,occurrence){
  const asset=assetFor(state.data,occurrence.fileId);
  const identity=groundedTitle(asset);
  const project=asset?.orderTitle||asset?.format||'Passage Neptune Media';
  const status=publicationStatus(state.data,occurrence);
  const networks=normalizeNetworks(occurrence.networks||occurrence.network);
  return `<button type="button" class="planning-v1184-item" data-v1184-occurrence="${esc(occurrence.occurrenceId)}"><span class="planning-v1184-item-top"><b class="planning-v1184-time">${esc(clock(occurrence.publishAt))}</b><em class="planning-v1184-status" data-status="${status.key}">${esc(status.label)}</em></span><strong>${esc(identity)}</strong><small>${esc(project)}</small><span class="planning-v1184-networks">${networks.map(network=>`<span>${esc(PLATFORM_LABELS[network]||network)}</span>`).join('')}</span></button>`;
}

function monthMarkup(state){
  const year=state.cursor.getFullYear();
  const month=state.cursor.getMonth();
  const first=new Date(year,month,1);
  const offset=(first.getDay()+6)%7;
  const start=addDays(first,-offset);
  const days=Array.from({length:42},(_,index)=>addDays(start,index));
  const heads=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(label=>`<div class="planning-v1184-month-head">${label}</div>`).join('');
  const cells=days.map(day=>monthDayMarkup(state,day,month)).join('');
  return `<div class="planning-v1184-month-wrap"><div class="planning-v1184-month">${heads}${cells}</div></div>`;
}

function monthDayMarkup(state,day,month){
  const entries=state.data.occurrences.filter(item=>sameDay(item.publishAt,day)).sort((a,b)=>new Date(a.publishAt)-new Date(b.publishAt));
  const visible=entries.slice(0,3);
  const outside=day.getMonth()!==month;
  const today=sameDay(new Date(),day);
  return `<section class="planning-v1184-month-day${outside?' is-outside':''}${today?' is-today':''}"><span class="planning-v1184-month-date">${day.getDate()}</span>${visible.map(item=>{const asset=assetFor(state.data,item.fileId);return `<button type="button" class="planning-v1184-month-item" data-v1184-occurrence="${esc(item.occurrenceId)}" title="${esc(groundedTitle(asset))}">${esc(clock(item.publishAt))} · ${esc(groundedTitle(asset))}</button>`;}).join('')}${entries.length>visible.length?`<small class="planning-v1184-more">+ ${entries.length-visible.length} autre${entries.length-visible.length>1?'s':''}</small>`:''}</section>`;
}

function openPublicationSheet(state,occurrence){
  const editor=document.querySelector('#editor');
  const backdrop=document.querySelector('#editorBackdrop');
  const body=document.querySelector('#editorBody');
  const title=document.querySelector('#editorTitle');
  const eyebrow=document.querySelector('#editorEyebrow');
  if(!editor||!backdrop||!body)return;

  const asset=assetFor(state.data,occurrence.fileId);
  const identity=groundedTitle(asset);
  const networks=normalizeNetworks(occurrence.networks||occurrence.network);
  const status=publicationStatus(state.data,occurrence);
  if(eyebrow)eyebrow.textContent='CONTENU À PUBLIER';
  if(title)title.textContent=identity;
  body.innerHTML=`<section class="v1184-publication-sheet"><div class="v1184-publication-identity"><small>VIDÉO RÉELLEMENT PLANIFIÉE</small><strong>${esc(identity)}</strong><span>${esc(asset?.orderTitle||'Passage Neptune Media')} · ${esc(asset?.format||'Neptune Media')}</span></div><div class="v1184-publication-meta"><div><span>Date prévue</span><strong>${esc(dateTime(occurrence.publishAt))}</strong></div><div><span>Statut</span><strong>${esc(status.label)}</strong></div><div><span>Utilisation</span><strong>${Number(occurrence.useIndex||1)}</strong></div><div><span>Fichier</span><strong>${esc(asset?.name||identity)}</strong></div></div><div class="v1184-note">Le planning affiche volontairement l’identité réelle de la vidéo. Les anciens titres ou descriptions IA non fondés sur le contenu ne sont plus utilisés comme source de vérité.</div><form class="v1184-publication-form" data-v1184-publication-form><label>Date et heure<input name="publishAt" type="datetime-local" value="${esc(toLocalInput(occurrence.publishAt))}" required></label><div><label>Canaux</label><div class="v1184-network-options">${networkChoices(networks)}</div></div><div class="v1184-publication-actions"><button class="v1184-primary" type="submit">Enregistrer le planning</button>${asset?.downloadUrl?`<a class="v1184-secondary" href="${esc(asset.downloadUrl)}">Télécharger la vidéo</a>`:''}</div></form></section>`;

  const form=body.querySelector('[data-v1184-publication-form]');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=form.querySelector('button[type="submit"]');
    const values=new FormData(form);
    const selected=values.getAll('networks');
    if(!selected.length)return plannerToast('Choisissez au moins un canal.',true);
    submit.disabled=true;
    submit.textContent='Enregistrement…';
    try{
      const result=await plannerApi('/api/client/content-calendar/update',{
        method:'POST',
        body:JSON.stringify({
          occurrenceId:occurrence.occurrenceId,
          title:occurrence.title||'',
          description:occurrence.description||'',
          hashtags:occurrence.hashtags||[],
          publishAt:new Date(values.get('publishAt')).toISOString(),
          networks:selected,
        }),
      });
      Object.assign(occurrence,{publishAt:result.publishAt,networks:result.networks,title:result.title,description:result.description,hashtags:result.hashtags});
      state.cursor=state.mode==='week'?startOfWeek(new Date(result.publishAt)):new Date(new Date(result.publishAt).getFullYear(),new Date(result.publishAt).getMonth(),1);
      renderPlanner(state);
      closePublicationSheet();
      plannerToast('Planning mis à jour.');
    }catch(error){
      plannerToast(plannerError(error),true);
      submit.disabled=false;
      submit.textContent='Enregistrer le planning';
    }
  });

  showPublicationSheet();
}

function showPublicationSheet(){
  const editor=document.querySelector('#editor');
  const backdrop=document.querySelector('#editorBackdrop');
  if(!editor||!backdrop)return;
  backdrop.hidden=false;
  editor.hidden=false;
  document.body.classList.add('editor-open');
  requestAnimationFrame(()=>{backdrop.classList.add('is-open');editor.classList.add('is-open');});
}

function closePublicationSheet(){
  const editor=document.querySelector('#editor');
  const backdrop=document.querySelector('#editorBackdrop');
  if(!editor||!backdrop)return;
  editor.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  document.body.classList.remove('editor-open');
  window.setTimeout(()=>{editor.hidden=true;backdrop.hidden=true;},reducedMotion()?0:280);
}

function networkChoices(selected){
  return ['youtube','tiktok','instagram'].map(network=>`<label class="v1184-network-option"><input name="networks" type="checkbox" value="${network}" ${selected.includes(network)?'checked':''}><span>${PLATFORM_LABELS[network]}</span></label>`).join('');
}

function assetFor(data,fileId){return data.assets.find(asset=>String(asset.fileId)===String(fileId));}
function groundedTitle(asset){return cleanName(asset?.name)||asset?.orderTitle||'Contenu Neptune Media';}
function cleanName(value){return String(value||'').replace(/\.[a-z0-9]{2,5}$/iu,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim();}
function normalizeNetworks(value){
  const values=Array.isArray(value)?value:String(value||'').split(/[\s,]+/u);
  return [...new Set(values.map(item=>String(item||'').trim().toLowerCase()).filter(Boolean))];
}
function publicationStatus(data,occurrence){
  const pubs=data.publications.filter(item=>String(item.occurrenceId)===String(occurrence.occurrenceId));
  if(pubs.some(item=>item.status==='published'))return {key:'published',label:'Publié'};
  if(pubs.some(item=>item.status==='prepared'))return {key:'prepared',label:'Préparé'};
  if(new Date(occurrence.publishAt).getTime()<Date.now()-60*60*1000)return {key:'late',label:'À vérifier'};
  return {key:'todo',label:'À publier'};
}
function validDate(value){const date=new Date(value||'');return !Number.isNaN(date.getTime());}
function sameDay(value,date){const first=new Date(value||'');return validDate(first)&&first.getFullYear()===date.getFullYear()&&first.getMonth()===date.getMonth()&&first.getDate()===date.getDate();}
function startOfWeek(value){const date=new Date(value);date.setHours(0,0,0,0);const day=(date.getDay()+6)%7;date.setDate(date.getDate()-day);return date;}
function addDays(value,days){const date=new Date(value);date.setDate(date.getDate()+days);return date;}
function clock(value){const date=new Date(value);return validDate(date)?new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(date):'—';}
function dateTime(value){const date=new Date(value);return validDate(date)?new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeStyle:'short'}).format(date):'À planifier';}
function toLocalInput(value){const date=new Date(value);if(!validDate(date))return '';const pad=number=>String(number).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
function reducedMotion(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;}
function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}

async function plannerApi(url,options={}){
  const headers={Accept:'application/json',...(options.headers||{})};
  if(options.body)headers['Content-Type']='application/json';
  const response=await fetch(url,{...options,headers,credentials:'same-origin'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(payload.error||`http_${response.status}`);error.payload=payload;throw error;}
  return payload;
}
function plannerError(error){
  if(error?.message==='reuse_too_soon')return `Cette vidéo doit rester espacée d’au moins ${error.payload?.minimumDays||30} jours.`;
  return 'La modification n’a pas pu être enregistrée.';
}
function plannerToast(message,isError=false){
  const toast=document.querySelector('#toast');
  if(!toast)return;
  toast.textContent=message;
  toast.hidden=false;
  toast.classList.toggle('error',Boolean(isError));
  clearTimeout(plannerToast.timer);
  plannerToast.timer=window.setTimeout(()=>{toast.hidden=true;},3200);
}
