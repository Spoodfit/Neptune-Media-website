const $=(selector,root=document)=>root.querySelector(selector);
let workflowAdminState=null;
let controlState=null;
let rendering=false;
let activeStage='confirm';

const STAGES=[
  {id:'confirm',label:'À confirmer',statuses:['payment_confirmed','reservation_confirmed','preparation_booking_pending','appointment_confirmed','appointment_booked','studio_date_confirmation_pending']},
  {id:'prepare',label:'Préparation',statuses:['preparation','preparation_complete']},
  {id:'studio',label:'Passage studio',statuses:['filming_scheduled','filming_confirmed']},
  {id:'sources',label:'Sources',statuses:['filmed','videos_pending','videos_received']},
  {id:'editing',label:'Montage',statuses:['editing','approval']},
  {id:'broadcast',label:'Diffusion',statuses:['delivered']},
  {id:'done',label:'Terminé',statuses:['completed']},
];

boot();

function boot(){
  document.body.classList.add('studio-minimal-workflow');
  prepareShell();
  const detail=$('#clientDetail');
  if(detail)new MutationObserver(()=>scheduleEnhance()).observe(detail,{childList:true,subtree:true});
  const pipeline=$('#pipeline');
  if(pipeline)new MutationObserver(()=>scheduleEnhance()).observe(pipeline,{childList:true,subtree:true});
  window.addEventListener('focus',refreshState);
  $('#refresh')?.addEventListener('click',()=>setTimeout(refreshState,120));
  $('#search')?.addEventListener('input',()=>setTimeout(()=>{renderStageTabs();scheduleEnhance();},30));
  refreshState();
}

function prepareShell(){
  const topTitle=$('.clients-topbar h1');if(topTitle)topTitle.textContent='Parcours clients';
  const topEyebrow=$('.clients-topbar .eyebrow');if(topEyebrow)topEyebrow.textContent='PILOTAGE DE PRODUCTION';
  $('.clients-hero')?.setAttribute('hidden','');
  $('.view-links')?.setAttribute('hidden','');
  const details=$('.full-monitoring');if(details){details.open=true;$('summary',details)?.setAttribute('hidden','');}
  document.querySelectorAll('.studio-nav-label').forEach((item)=>item.hidden=true);
  document.querySelectorAll('.studio-nav-link').forEach((item)=>{
    const label=item.textContent.trim().toLowerCase();
    const keep=['surveillance clients','contenus','calendrier','video studio','programme','réglages avancés'].some((value)=>label.includes(value));
    item.hidden=!keep;
    if(label.includes('surveillance clients'))$('strong',item).textContent='Parcours clients';
    if(label.includes('programme'))$('strong',item).textContent='Diffusion';
    if(label.includes('réglages avancés'))$('strong',item).textContent='Réglages';
  });
  const main=$('.clients-main');
  if(main&&!$('#workflowFocusBar')){
    const focus=document.createElement('section');focus.id='workflowFocusBar';focus.className='workflow-focus-bar';
    const tabs=document.createElement('nav');tabs.id='workflowStageTabs';tabs.className='workflow-stage-tabs';tabs.setAttribute('aria-label','Étapes des parcours clients');
    const anchor=$('.full-monitoring')||$('.controls')||$('#pipeline');
    anchor?.before(focus,tabs);
  }
}

async function refreshState(){
  try{
    [workflowAdminState,controlState]=await Promise.all([api('/api/admin/clients'),api('/api/admin/control-room').catch(()=>({actions:[],summary:{}}))]);
    chooseInitialStage();
    renderFocus();
    renderStageTabs();
    scheduleEnhance();
  }catch{}
}

function chooseInitialStage(){
  const action=(controlState?.actions||[]).find((item)=>item.type==='order');
  const order=action?(workflowAdminState?.orders||[]).find((item)=>item.id===action.orderId):null;
  if(order)activeStage=stageFor(order);
}

function renderFocus(){
  prepareShell();
  const focus=$('#workflowFocusBar');if(!focus)return;
  const actions=(controlState?.actions||[]).filter((item)=>item.type==='order');
  const first=actions[0];
  if(!first){
    focus.className='workflow-focus-bar is-clear';
    focus.innerHTML='<div><i></i><span><small>ÉTAT DU STUDIO</small><strong>Aucune action requise</strong></span></div><p>Les parcours avancent automatiquement.</p>';
    return;
  }
  focus.className='workflow-focus-bar has-action';
  focus.innerHTML=`<div><i></i><span><small>${actions.length} ACTION${actions.length>1?'S':''} REQUISE${actions.length>1?'S':''}</small><strong>${esc(first.title||'Vérification nécessaire')}</strong></span></div><p>${esc(first.reason||first.subtitle||'Ouvrez le dossier concerné.')}</p><button type="button" data-focus-order="${esc(first.orderId||'')}">Ouvrir</button>`;
  focus.querySelector('[data-focus-order]')?.addEventListener('click',()=>openFocusedOrder(first.orderId));
}

function openFocusedOrder(orderId){
  const order=(workflowAdminState?.orders||[]).find((item)=>item.id===orderId);
  if(order){activeStage=stageFor(order);renderStageTabs();applyActiveStage();}
  const card=document.querySelector(`[data-order-card="${cssEsc(orderId)}"]`);
  if(card){card.click();return;}
  location.hash=encodeURIComponent(orderId||'');location.reload();
}

function renderStageTabs(){
  prepareShell();
  const tabs=$('#workflowStageTabs');if(!tabs||!workflowAdminState)return;
  const query=String($('#search')?.value||'').trim().toLowerCase();
  const orders=(workflowAdminState.orders||[]).filter((order)=>!query||[order.email,order.fullName,order.company,order.title,order.format].join(' ').toLowerCase().includes(query));
  tabs.innerHTML=STAGES.map((stage)=>{
    const count=orders.filter((order)=>stageFor(order)===stage.id).length;
    return `<button type="button" class="${activeStage===stage.id?'active':''}" data-workflow-stage="${stage.id}"><span>${esc(stage.label)}</span><b>${count}</b></button>`;
  }).join('');
  tabs.querySelectorAll('[data-workflow-stage]').forEach((button)=>button.addEventListener('click',()=>{activeStage=button.dataset.workflowStage;renderStageTabs();applyActiveStage();}));
}

function scheduleEnhance(){if(rendering)return;setTimeout(()=>{enhancePipeline();enhanceDrawer();},25);}

function enhancePipeline(){
  if(!workflowAdminState)return;
  prepareShell();
  const pipeline=$('#pipeline');if(!pipeline)return;
  const sourceCards=[...pipeline.querySelectorAll(':scope > .column [data-order-card]')];
  if(!sourceCards.length){applyActiveStage();return;}
  rendering=true;
  const shell=document.createElement('div');shell.className='workflow-stage-shell';
  STAGES.forEach((stage)=>{
    const panel=document.createElement('section');panel.className='workflow-stage-panel';panel.dataset.stagePanel=stage.id;
    const grid=document.createElement('div');grid.className='workflow-stage-grid';
    const cards=sourceCards.filter((card)=>{
      const order=(workflowAdminState.orders||[]).find((item)=>item.id===card.dataset.orderCard);
      return order&&stageFor(order)===stage.id;
    });
    cards.forEach((card)=>{decorateCard(card);grid.append(card);});
    if(!cards.length)grid.innerHTML='<p class="workflow-stage-empty">Aucun client à cette étape.</p>';
    panel.append(grid);shell.append(panel);
  });
  pipeline.replaceChildren(shell);
  rendering=false;
  applyActiveStage();
}

function applyActiveStage(){
  document.querySelectorAll('[data-stage-panel]').forEach((panel)=>panel.hidden=panel.dataset.stagePanel!==activeStage);
}

function decorateCard(card){
  const order=(workflowAdminState.orders||[]).find((item)=>item.id===card.dataset.orderCard);
  if(!order?.workflow)return;
  const w=order.workflow;
  const appointment=validDate(order.appointmentAt)?order.appointmentAt:null;
  const filming=validDate(order.filmingAt)?order.filmingAt:null;
  const requested=validDate(w.requestedFilmingAt)?w.requestedFilmingAt:null;
  const studioConfirmed=w.supplierStatus==='confirmed'&&filming;
  const title=$('h3',card);if(title)title.textContent=w.currentLabel||title.textContent;
  const next=card.querySelector('h3+p');if(next)next.textContent=w.nextAction||order.nextAction||'Aucune action manuelle.';
  card.querySelector('.workflow-card-dates')?.remove();
  const dates=document.createElement('div');dates.className='workflow-card-dates';
  dates.innerHTML=`<span><small>Visio</small><b>${esc(appointment?shortDate(appointment):'À réserver')}</b></span><span><small>Studio</small><b>${esc(studioConfirmed?shortDate(filming):requested?`${shortDate(requested)} · attente`:'À définir')}</b></span>`;
  card.querySelector('.card-actions')?.before(dates);
  const actions=card.querySelector('.card-actions');if(actions)actions.innerHTML='<button class="button workflow-open-button" type="button">Ouvrir</button>';
}

function stageFor(order){
  const w=order.workflow||{};
  if(w.broadcastStatus==='published'||order.status==='completed')return'done';
  if(w.deliveredAt||order.status==='delivered')return'broadcast';
  if(w.editingStartedAt||['editing','approval'].includes(order.status))return'editing';
  if(w.sourceReceivedAt||['filmed','videos_pending','videos_received'].includes(order.status))return'sources';
  if(w.supplierStatus==='confirmed'||['filming_scheduled','filming_confirmed'].includes(order.status))return'studio';
  if(['preparation','preparation_complete'].includes(order.status)||w.preparationStatus==='completed')return'prepare';
  return'confirm';
}

async function enhanceDrawer(){
  const root=$('#clientDetail');
  if(!root||!root.children.length||!workflowAdminState)return;
  const activeTab=$('.tabs button.active',root)?.dataset.detailTab;
  const existing=$('#workflowCommandCenter',root);
  if(activeTab&&activeTab!=='tracking'){existing?.remove();return;}
  const orderId=decodeURIComponent(location.hash.slice(1));
  const order=(workflowAdminState.orders||[]).find((item)=>item.id===orderId);
  if(!order?.workflow)return;
  if(existing&&existing.dataset.version==='40')return;
  rendering=true;existing?.remove();
  const panel=document.createElement('section');panel.id='workflowCommandCenter';panel.dataset.version='40';panel.className='workflow-command-center';panel.innerHTML=commandMarkup(order);
  $('.tabs',root)?.after(panel);bindPanel(order,panel);loadEvents(order.id,panel);rendering=false;
}

function commandMarkup(order){
  const w=order.workflow,actions=[];
  if(w.supplierStatus==='pending')actions.push(button('resend_supplier_confirmation','Renvoyer la demande au studio','secondary'));
  if(['pending','alternate_proposed','rejected'].includes(w.supplierStatus))actions.push(`<form data-workflow-form="confirm_supplier_date" class="workflow-inline-form"><label><span>Date définitive</span><input name="filmingAt" type="datetime-local" value="${isoLocal(w.requestedFilmingAt)}" required></label><button type="submit">Confirmer la date</button></form>`);
  if(w.preparationStatus!=='completed')actions.push(button('preparation_completed','Marquer la visio comme réalisée'));
  if(['filming_scheduled','filming_confirmed'].includes(order.status))actions.push(button('filming_completed','Marquer le passage comme terminé'));
  if(order.status==='videos_pending'&&!w.sourceReceivedAt)actions.push(button('source_received','Confirmer la réception des sources'));
  if(w.sourceReceivedAt&&w.sourceQcStatus==='pending')actions.push(`${button('source_qc_passed','Sources conformes')}${button('source_qc_failed','Sources à corriger','danger')}`);
  if(['editing','approval','videos_received'].includes(order.status)&&!w.deliveredAt)actions.push(button('delivery_complete','Valider la livraison'));
  if(w.deliveredAt&&w.broadcastStatus==='not_scheduled')actions.push(`<form data-workflow-form="schedule_broadcast" class="workflow-inline-form"><label><span>Date de diffusion</span><input name="broadcastAt" type="datetime-local" required></label><label><span>Lien de diffusion</span><input name="broadcastUrl" type="url" placeholder="https://…"></label><button type="submit">Programmer</button></form>`);
  if(w.broadcastStatus==='scheduled')actions.push(button('mark_broadcast_published','Marquer comme diffusée'));
  const appointment=validDate(order.appointmentAt)?dateLabel(order.appointmentAt):'À réserver';
  const filming=validDate(order.filmingAt)?dateLabel(order.filmingAt):validDate(w.requestedFilmingAt)?`${dateLabel(w.requestedFilmingAt)} · provisoire`:'À définir';
  return `<header><div><p class="eyebrow">ÉTAPE ACTUELLE</p><h3>${esc(w.currentLabel||'Parcours client')}</h3><p>${esc(w.nextAction||order.nextAction||'Aucune action manuelle requise.')}</p></div><span class="workflow-live"><i></i> Synchronisé</span></header><div class="workflow-essential"><article><small>Visio</small><strong>${esc(appointment)}</strong></article><article><small>Studio</small><strong>${esc(filming)}</strong></article><article><small>Parcours</small><strong>${esc(STAGES.find((stage)=>stage.id===stageFor(order))?.label||'En cours')}</strong></article></div><div class="workflow-actions"><div><small>ACTION DISPONIBLE</small>${actions.length?actions.join(''):'<p class="workflow-clear">Aucune action. Le parcours continue automatiquement.</p>'}</div></div><details class="workflow-more"><summary>Historique et informations avancées</summary><div data-workflow-events><p>Chargement…</p></div></details><p class="workflow-message" aria-live="polite"></p>`;
}

function bindPanel(order,panel){
  panel.querySelectorAll('[data-workflow-action]').forEach((buttonElement)=>buttonElement.addEventListener('click',()=>runAction(order,buttonElement.dataset.workflowAction,{},buttonElement,panel)));
  panel.querySelectorAll('[data-workflow-form]').forEach((form)=>form.addEventListener('submit',(event)=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));runAction(order,form.dataset.workflowForm,data,form.querySelector('button'),panel);}));
}
async function runAction(order,action,payload,buttonElement,panel){
  if(action==='source_qc_failed'){const note=prompt('Précisez les fichiers manquants ou non exploitables :','');if(note===null)return;payload.note=note;}
  if(!confirm(confirmText(action)))return;
  buttonElement.disabled=true;const original=buttonElement.textContent;buttonElement.textContent='Validation…';
  try{const result=await api('/api/admin/workflow/action',{method:'POST',body:JSON.stringify({orderId:order.id,action,...payload})});$('.workflow-message',panel).textContent=result.emailWarning?'Étape enregistrée. Certains e-mails seront réessayés.':'Étape enregistrée et notifications déclenchées.';await refreshState();setTimeout(()=>location.reload(),350);}catch(error){$('.workflow-message',panel).textContent=errorText(error.message);buttonElement.disabled=false;buttonElement.textContent=original;}
}
async function loadEvents(orderId,panel){try{const result=await api(`/api/admin/workflow/events?orderId=${encodeURIComponent(orderId)}`);const target=panel.querySelector('[data-workflow-events]');if(!target)return;target.innerHTML=(result.events||[]).slice(0,8).map((event)=>`<article><i></i><div><strong>${esc(eventLabel(event.eventKey))}</strong><small>${dateLabel(event.createdAt)} · ${esc(event.actorType||'system')}</small></div></article>`).join('')||'<p>Aucun événement enregistré.</p>';}catch{}}
function button(action,label,style=''){return `<button type="button" class="${style}" data-workflow-action="${action}">${esc(label)}</button>`;}
function confirmText(action){return({confirm_supplier_date:'Confirmer cette date et notifier toutes les parties ?',resend_supplier_confirmation:'Renvoyer la demande au studio ?',preparation_completed:'Confirmer que la visio a été réalisée ?',filming_completed:'Confirmer que le passage est terminé ?',source_received:'Confirmer la réception des sources ?',source_qc_passed:'Valider les sources et démarrer le montage ?',source_qc_failed:'Signaler une correction au fournisseur ?',delivery_complete:'Confirmer que les contenus sont disponibles ?',schedule_broadcast:'Programmer la diffusion et notifier les parties ?',mark_broadcast_published:'Confirmer la diffusion ?'})[action]||'Valider cette action ?';}
function eventLabel(value){return String(value||'').replaceAll('_',' ').replace(/^./u,(letter)=>letter.toUpperCase());}
function isoLocal(value){const date=new Date(value||'');if(Number.isNaN(date.getTime()))return'';const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
function validDate(value){return !Number.isNaN(new Date(value||'').getTime());}
function shortDate(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À définir':new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(date).replace(' à ',' · ');}
function dateLabel(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À définir':new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Paris'}).format(date);}
async function api(url,options={}){const headers={Accept:'application/json',...(options.headers||{}),'X-CSRF-Token':sessionStorage.getItem('neptune_csrf')||''};if(options.body)headers['Content-Type']='application/json';const response=await fetch(url,{...options,headers,credentials:'same-origin'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;}
function errorText(value){return({delivery_assets_incomplete:'Ajoutez une émission complète et au moins un contenu court.',filming_date_required:'Renseignez une date définitive.',broadcast_date_required:'Renseignez la date de diffusion.',forbidden:'Votre rôle ne permet pas cette action.',unauthorized:'Votre session a expiré.'})[value]||'L’action a échoué. Vérifiez le dossier et réessayez.';}
function cssEsc(value){return String(value||'').replace(/["\\]/gu,'\\$&');}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
