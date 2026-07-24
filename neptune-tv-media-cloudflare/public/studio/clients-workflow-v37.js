const $=(selector,root=document)=>root.querySelector(selector);
let workflowAdminState=null;
let rendering=false;

boot();

function boot(){
  const detail=$('#clientDetail');
  if(detail)new MutationObserver(()=>scheduleEnhance()).observe(detail,{childList:true,subtree:true});
  const pipeline=$('#pipeline');
  if(pipeline)new MutationObserver(()=>scheduleEnhance()).observe(pipeline,{childList:true,subtree:true});
  window.addEventListener('focus',refreshState);
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(refreshState,120));
  refreshState();
}

async function refreshState(){
  try{workflowAdminState=await api('/api/admin/clients');scheduleEnhance();}catch{}
}
function scheduleEnhance(){if(rendering)return;setTimeout(()=>{enhancePipeline();enhanceDrawer();},20);}

function enhancePipeline(){
  if(!workflowAdminState)return;
  document.querySelectorAll('[data-order-card]').forEach((card)=>{
    const order=(workflowAdminState.orders||[]).find((item)=>item.id===card.dataset.orderCard);
    if(!order?.workflow)return;
    const w=order.workflow;
    const appointment=validDate(order.appointmentAt)?order.appointmentAt:null;
    const filming=validDate(order.filmingAt)?order.filmingAt:null;
    const requested=validDate(w.requestedFilmingAt)?w.requestedFilmingAt:null;
    const studioConfirmed=w.supplierStatus==='confirmed'&&filming;
    const signature=[appointment||'',filming||'',requested||'',w.supplierStatus||'',w.preparationStatus||''].join('|');
    const existing=card.querySelector('.workflow-card-dates');
    if(existing?.dataset.signature===signature)return;
    existing?.remove();
    const block=document.createElement('div');
    block.className='workflow-card-dates';
    block.dataset.signature=signature;
    block.innerHTML=`
      <div class="${appointment?'ready':'pending'}"><small>PRÉPARATION</small><strong>${esc(appointment?dateLabel(appointment):'À réserver')}</strong><span>${esc(preparationLabel(w.preparationStatus))}</span></div>
      <div class="${studioConfirmed?'ready':'pending'}"><small>PASSAGE STUDIO</small><strong>${esc(studioConfirmed?dateLabel(filming):requested?dateLabel(requested):'À confirmer')}</strong><span>${esc(studioConfirmed?'Confirmé':requested?'Demandé · non confirmé':'Aucune date')}</span></div>`;
    card.querySelector('.card-actions')?.before(block);
  });
}

async function enhanceDrawer(){
  const root=$('#clientDetail');
  if(!root||!root.children.length||!workflowAdminState)return;
  const orderId=decodeURIComponent(location.hash.slice(1));
  const order=(workflowAdminState.orders||[]).find((item)=>item.id===orderId);
  if(!order?.workflow)return;
  const existing=$('#workflowCommandCenter',root);
  if(existing&&existing.dataset.version==='38')return;
  rendering=true;
  existing?.remove();
  const panel=document.createElement('section');
  panel.id='workflowCommandCenter';panel.dataset.version='38';panel.className='workflow-command-center';
  panel.innerHTML=commandMarkup(order);
  const tabs=$('.tabs',root);tabs?.after(panel);
  bindPanel(order,panel);
  loadEvents(order.id,panel);
  rendering=false;
}

function commandMarkup(order){
  const w=order.workflow,actions=[];
  if(w.supplierStatus==='pending')actions.push(button('resend_supplier_confirmation','Renvoyer la demande au studio','secondary'));
  if(['pending','alternate_proposed','rejected'].includes(w.supplierStatus))actions.push(`<form data-workflow-form="confirm_supplier_date" class="workflow-inline-form"><label><span>Date définitive</span><input name="filmingAt" type="datetime-local" value="${isoLocal(w.requestedFilmingAt)}" required></label><button type="submit">Confirmer la date</button></form>`);
  if(w.preparationStatus!=='completed')actions.push(button('preparation_completed','Préparation terminée'));
  if(['filming_scheduled','filming_confirmed'].includes(order.status))actions.push(button('filming_completed','Passage terminé'));
  if(order.status==='videos_pending'&&!w.sourceReceivedAt)actions.push(button('source_received','Fichiers reçus'));
  if(w.sourceReceivedAt&&w.sourceQcStatus==='pending')actions.push(`${button('source_qc_passed','Fichiers conformes')}${button('source_qc_failed','Fichiers à corriger','danger')}`);
  if(['editing','approval','videos_received'].includes(order.status)&&!w.deliveredAt)actions.push(button('delivery_complete','Valider la livraison'));
  if(w.deliveredAt&&w.broadcastStatus==='not_scheduled')actions.push(`<form data-workflow-form="schedule_broadcast" class="workflow-inline-form"><label><span>Date de diffusion</span><input name="broadcastAt" type="datetime-local" required></label><label><span>Lien de diffusion / replay</span><input name="broadcastUrl" type="url" placeholder="https://…"></label><button type="submit">Programmer et notifier</button></form>`);
  if(w.broadcastStatus==='scheduled')actions.push(button('mark_broadcast_published','Émission diffusée'));
  const requested=validDate(w.requestedFilmingAt)?dateLabel(w.requestedFilmingAt):'';
  const statusCards=[
    ['Préparation',preparationLabel(w.preparationStatus),order.appointmentAt?dateLabel(order.appointmentAt):'Aucun créneau'],
    ['Passage studio',supplierLabel(w.supplierStatus),order.filmingAt?dateLabel(order.filmingAt):requested?`${requested} · demandé`:'Aucune date'],
    ['Sources',w.sourceReceivedAt?'Reçues':w.sourceDeliveryDueAt?'Attendues':'Non déclenchées',w.sourceDeliveryDueAt?dateLabel(w.sourceDeliveryDueAt):''],
    ['Montage',w.deliveredAt?'Terminé':w.editingStartedAt?'En cours':'À venir',w.deliveryDueAt?dateLabel(w.deliveryDueAt):''],
    ['Diffusion',w.broadcastStatus==='published'?'Diffusée':w.broadcastStatus==='scheduled'?'Programmée':'À programmer',w.broadcastAt?dateLabel(w.broadcastAt):''],
  ];
  return `<header><div><p class="eyebrow">MOTEUR DE PARCOURS SYNCHRONISÉ</p><h3>${esc(w.currentLabel||'Parcours client')}</h3><p>${esc(w.nextAction||order.nextAction||'Aucune action client requise.')}</p></div><span class="workflow-live"><i></i> Automatisations actives</span></header><div class="workflow-date-explainer"><strong>Deux rendez-vous distincts</strong><span>La préparation en visio et le passage au studio sont affichés séparément pour éviter toute confusion.</span></div><div class="workflow-status-grid">${statusCards.map(([label,value,detail])=>`<article><small>${esc(label)}</small><strong>${esc(value)}</strong>${detail?`<span>${esc(detail)}</span>`:''}</article>`).join('')}</div><div class="workflow-actions"><div><small>ACTIONS DISPONIBLES</small>${actions.length?actions.join(''):'<p class="workflow-clear">Aucune action manuelle. Le système poursuit le parcours.</p>'}</div><aside><small>HISTORIQUE</small><div data-workflow-events><p>Chargement…</p></div></aside></div><p class="workflow-message" aria-live="polite"></p>`;
}

function bindPanel(order,panel){
  panel.querySelectorAll('[data-workflow-action]').forEach((button)=>button.addEventListener('click',()=>runAction(order,button.dataset.workflowAction,{},button,panel)));
  panel.querySelectorAll('[data-workflow-form]').forEach((form)=>form.addEventListener('submit',(event)=>{
    event.preventDefault();const data=Object.fromEntries(new FormData(form));runAction(order,form.dataset.workflowForm,data,form.querySelector('button'),panel);
  }));
}
async function runAction(order,action,payload,button,panel){
  if(action==='source_qc_failed'){const note=prompt('Précisez les fichiers manquants ou non exploitables :','');if(note===null)return;payload.note=note;}
  if(!confirm(confirmText(action)))return;
  button.disabled=true;const original=button.textContent;button.textContent='Validation…';
  try{
    const result=await api('/api/admin/workflow/action',{method:'POST',body:JSON.stringify({orderId:order.id,action,...payload})});
    $('.workflow-message',panel).textContent=result.emailWarning?'Étape enregistrée. Certains e-mails seront réessayés automatiquement.':'Étape enregistrée et notifications déclenchées.';
    await refreshState();
    setTimeout(()=>location.reload(),350);
  }catch(error){$('.workflow-message',panel).textContent=errorText(error.message);button.disabled=false;button.textContent=original;}
}
async function loadEvents(orderId,panel){
  try{const result=await api(`/api/admin/workflow/events?orderId=${encodeURIComponent(orderId)}`);const target=panel.querySelector('[data-workflow-events]');if(!target)return;target.innerHTML=(result.events||[]).slice(0,8).map((event)=>`<article><i></i><div><strong>${esc(eventLabel(event.eventKey))}</strong><small>${dateLabel(event.createdAt)} · ${esc(event.actorType||'system')}</small></div></article>`).join('')||'<p>Aucun événement enregistré.</p>';}catch{}
}
function button(action,label,style=''){return `<button type="button" class="${style}" data-workflow-action="${action}">${esc(label)}</button>`;}
function confirmText(action){return ({confirm_supplier_date:'Confirmer cette date comme date définitive et notifier toutes les parties ?',resend_supplier_confirmation:'Renvoyer une nouvelle demande sécurisée au studio ?',preparation_completed:'Confirmer que le rendez-vous de préparation a été réalisé ?',filming_completed:'Confirmer que le tournage est terminé ?',source_received:'Confirmer la réception des fichiers sources ?',source_qc_passed:'Valider le contrôle technique et démarrer le montage ?',source_qc_failed:'Signaler une correction nécessaire au fournisseur ?',delivery_complete:'Confirmer que l’émission et les shorts sont disponibles dans l’espace client ?',schedule_broadcast:'Programmer cette diffusion et notifier le client, Neptune et le fournisseur ?',mark_broadcast_published:'Confirmer que l’émission a été diffusée ?'})[action]||'Valider cette action ?';}
function supplierLabel(value){return ({pending:'Réponse attendue',confirmed:'Date confirmée',alternate_proposed:'Autre date proposée',rejected:'Date refusée',not_required:'Non requis'})[value]||value;}
function preparationLabel(value){return ({to_book:'À réserver',booked:'Réservée',completed:'Terminée'})[value]||value;}
function eventLabel(value){return String(value||'').replaceAll('_',' ').replace(/^./u,(letter)=>letter.toUpperCase());}
function isoLocal(value){const date=new Date(value||'');if(Number.isNaN(date.getTime()))return'';const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
function validDate(value){return !Number.isNaN(new Date(value||'').getTime());}
function dateLabel(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À confirmer':new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Paris'}).format(date);}
async function api(url,options={}){const headers={Accept:'application/json',...(options.headers||{}),'X-CSRF-Token':sessionStorage.getItem('neptune_csrf')||''};if(options.body)headers['Content-Type']='application/json';const response=await fetch(url,{...options,headers,credentials:'same-origin'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;}
function errorText(value){return ({delivery_assets_incomplete:'La livraison doit contenir au moins une émission complète et un contenu court.',filming_date_required:'Renseignez une date définitive.',broadcast_date_required:'Renseignez la date de diffusion.',forbidden:'Votre rôle ne permet pas cette action.',unauthorized:'Votre session a expiré.'})[value]||'L’action a échoué. Vérifiez le dossier et réessayez.';}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
