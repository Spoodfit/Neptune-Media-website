const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let workflowState=null;
let refreshTimer=0;

start();

function start(){
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
}
function boot(){
  const dashboard=$('#dashboard');
  if(!dashboard)return;
  new MutationObserver(()=>{if(!dashboard.hidden)refresh();}).observe(dashboard,{attributes:true,attributeFilter:['hidden']});
  const detail=$('#detailContent');
  if(detail)new MutationObserver(()=>enhanceTracking()).observe(detail,{childList:true,subtree:true});
  document.addEventListener('click',(event)=>{if(event.target.closest('[data-open-panel="tracking"],[data-order-id]'))setTimeout(enhanceTracking,80);});
  if(!dashboard.hidden)refresh();
}

async function refresh(){
  clearTimeout(refreshTimer);
  try{
    const response=await fetch('/api/client/session',{headers:{Accept:'application/json'},credentials:'same-origin'});
    if(!response.ok)return;
    workflowState=await response.json();
    renderDashboard();
    enhanceTracking();
  }catch{}
  refreshTimer=setTimeout(refresh,60_000);
}

function renderDashboard(){
  const order=(workflowState?.orders||[]).find((item)=>item.status!=='completed')||(workflowState?.orders||[])[0];
  const flow=order?.workflow;
  if(!flow)return;

  setText($('#projectPhaseValue'),flow.currentLabel||'Parcours en cours');
  setText($('#countdownText'),flow.currentLabel||'Votre passage avance');
  setText($('#passageBadge'),flow.currentLabel||'Suivi');
  setText($('#projectNextAction'),flow.nextAction||order.nextAction||'Consultez votre suivi.');

  renderAppointmentSummary(order,flow);
  configurePrimaryAction(order,flow);

  const steps=Array.isArray(flow.steps)?flow.steps:[];
  const list=$('.project-stage-list');
  if(list&&steps.length){
    list.classList.add('workflow-nine');
    list.innerHTML=steps.map((step)=>`<li data-state="${esc(step.state||'pending')}"><i></i><span>${esc(shortLabel(step.label))}</span></li>`).join('');
    const done=steps.filter((step)=>step.state==='done').length;
    const current=Math.min(steps.length,done+1);
    setText($('#projectProgressLabel'),`${current} sur ${steps.length}`);
    const fill=$('#projectProgressFill');if(fill)fill.style.width=`${Math.max(0,Math.min(100,(done/(steps.length-1))*100))}%`;
  }

  const deadline=nextDeadline(flow);
  if(deadline){
    setText($('#deadlineLabel'),deadline.label);
    setText($('#deadlineValue'),deadline.value);
    setText($('#deadlineDateValue'),formatDate(deadline.at));
    $('#projectDeadlineCard')?.classList.toggle('is-urgent',new Date(deadline.at)-Date.now()<48*3600_000);
  }else{
    setText($('#deadlineLabel'),'Prochaine échéance');
    setText($('#deadlineValue'),'Aucune urgence');
    setText($('#deadlineDateValue'),'Le parcours est à jour');
  }
}

function renderAppointmentSummary(order,flow){
  const appointmentAt=validDate(order.appointmentAt)?order.appointmentAt:null;
  const filmingAt=validDate(order.filmingAt)?order.filmingAt:null;
  const requestedAt=validDate(flow.requestedFilmingAt)?flow.requestedFilmingAt:null;
  const studioConfirmed=flow.supplierStatus==='confirmed'&&filmingAt;

  setText($('#appointmentBadge'),appointmentAt?`Visio · ${formatCompact(appointmentAt)}`:'Visio à réserver');

  if(studioConfirmed){
    setText($('#studioDateValue'),formatDay(filmingAt));
    setText($('#studioTimeValue'),`Passage confirmé · ${formatTime(filmingAt)}`);
  }else if(requestedAt){
    setText($('#studioDateValue'),formatDay(requestedAt));
    setText($('#studioTimeValue'),'Passage demandé · validation du studio en attente');
  }else{
    setText($('#studioDateValue'),'À confirmer');
    setText($('#studioTimeValue'),'Aucune date de passage studio validée');
  }

  const snapshot=$('.project-snapshot');
  if(!snapshot)return;
  let panel=$('#workflowDatesSummary');
  if(!panel){
    panel=document.createElement('section');
    panel.id='workflowDatesSummary';
    panel.className='workflow-dates-summary';
    snapshot.before(panel);
  }

  const prepStatus=flow.preparationStatus==='completed'?'Visio réalisée':appointmentAt?'Visio réservée':'Visio à réserver';
  const prepDetail=appointmentAt?formatDate(appointmentAt):'Aucun rendez-vous de préparation enregistré';
  const studioStatus=studioConfirmed?'Passage confirmé':requestedAt?'Date demandée':'Date à définir';
  const studioDetail=studioConfirmed?formatDate(filmingAt):requestedAt?`${formatDate(requestedAt)} · en attente de validation`:'Aucune date de passage studio enregistrée';
  const next=flow.nextAction||order.nextAction||'Le parcours avance automatiquement.';

  panel.innerHTML=`
    <header class="workflow-dates-head">
      <div><small>VOS DEUX RENDEZ-VOUS</small><h3>Une visio de préparation, puis votre passage au studio</h3></div>
      <span>Deux dates différentes</span>
    </header>
    <div class="workflow-dates-grid">
      <article class="workflow-date-card ${appointmentAt?'is-ready':'is-pending'}">
        <header><span>1</span><div><small>VISIO DE PRÉPARATION</small><strong>${esc(prepStatus)}</strong></div></header>
        <p>${esc(prepDetail)}</p>
        <em>Échange de 30 minutes pour préparer votre intervention.</em>
      </article>
      <article class="workflow-date-card ${studioConfirmed?'is-ready':'is-pending'}">
        <header><span>2</span><div><small>PASSAGE AU STUDIO</small><strong>${esc(studioStatus)}</strong></div></header>
        <p>${esc(studioDetail)}</p>
        <em>${studioConfirmed?'Créneau définitif validé par le studio.':'La date affichée reste provisoire tant que le studio ne l’a pas confirmée.'}</em>
      </article>
    </div>
    <div class="workflow-next-step"><small>CE QUI SE PASSE MAINTENANT</small><strong>${esc(next)}</strong></div>`;
}

function configurePrimaryAction(order,flow){
  const link=$('#prepareLink');
  if(!link)return;
  const appointmentAt=validDate(order.appointmentAt)?order.appointmentAt:null;
  if(!appointmentAt&&order.bookingUrl){
    link.href=order.bookingUrl;
    link.textContent='Réserver ma visio de préparation';
    return;
  }
  link.href='#workflowDatesSummary';
  link.removeAttribute('target');
  link.removeAttribute('rel');
  link.textContent='Voir mes deux rendez-vous';
}

function enhanceTracking(){
  if(!workflowState||$('#detailTitle')?.textContent?.trim()!=='Mes passages')return;
  const cards=$$('.order-card',$('#detailContent'));
  const orders=workflowState.orders||[];
  cards.forEach((card,index)=>{
    const order=orders[index];
    const flow=order?.workflow;
    if(!flow)return;
    const timeline=$('.timeline',card);
    if(!timeline||timeline.dataset.workflowV45)return;
    timeline.dataset.workflowV45='1';
    timeline.innerHTML=(flow.steps||[]).map((step)=>`<div class="timeline-step workflow-step ${esc(step.state||'pending')}"><i></i><div><b>${esc(step.label)}</b>${step.detail?`<p>${esc(step.detail)}</p>`:''}${step.completedAt?`<small>${formatDate(step.completedAt)}</small>`:''}</div></div>`).join('');
    const meta=$('.detail-meta',card);
    if(meta&&!meta.querySelector('.workflow-current'))meta.insertAdjacentHTML('beforeend',`<span class="workflow-current">${esc(flow.currentLabel||'Parcours en cours')}</span>`);
    const header=card.querySelector(':scope>div');
    if(header&&!header.querySelector('.workflow-next-card'))header.insertAdjacentHTML('beforeend',`<div class="workflow-next-card"><small>PROCHAINE ACTION</small><strong>${esc(flow.nextAction||order.nextAction||'Consulter le suivi')}</strong></div>`);
  });
}

function nextDeadline(flow){
  const candidates=[
    flow.supplierDeadlineAt?{label:'Confirmation studio',at:flow.supplierDeadlineAt}:null,
    flow.sourceDeliveryDueAt&&!flow.sourceReceivedAt?{label:'Fichiers du studio',at:flow.sourceDeliveryDueAt}:null,
    flow.deliveryDueAt&&!flow.deliveredAt?{label:'Livraison Neptune',at:flow.deliveryDueAt}:null,
    flow.broadcastAt&&flow.broadcastStatus==='scheduled'?{label:'Diffusion',at:flow.broadcastAt}:null,
  ].filter(Boolean).filter((item)=>!Number.isNaN(new Date(item.at).getTime())).sort((a,b)=>new Date(a.at)-new Date(b.at));
  if(!candidates.length)return null;
  const selected=candidates[0],ms=new Date(selected.at)-Date.now();
  const value=ms<0?'Échéance dépassée':ms<=24*3600_000?`${Math.max(1,Math.ceil(ms/3600_000))} h`:`J-${Math.max(1,Math.ceil(ms/86400_000))}`;
  return {...selected,value};
}
function shortLabel(label){return String(label||'').replace('Date du passage confirmée','Date confirmée').replace('Date du passage en confirmation','Date en confirmation').replace('Rendez-vous de préparation','Préparation').replace('Fichiers du studio','Sources studio').replace('Programmation de diffusion','Programmation').replace('Émission diffusée','Diffusée').replace('Diffusion à venir','À diffuser');}
function validDate(value){const date=new Date(value||'');return !Number.isNaN(date.getTime());}
function formatDate(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À confirmer':new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Paris'}).format(date);}
function formatCompact(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À confirmer':new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Paris'}).format(date);}
function formatDay(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À confirmer':new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Paris'}).format(date);}
function formatTime(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(date);}
function setText(element,value){if(element)element.textContent=value;}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
