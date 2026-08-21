const RELEASE='neptune-studio-operating-ux-20260821-v135';
const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
const $$=(selector,root=document)=>[...(root?.querySelectorAll?.(selector)||[])];
const path=location.pathname;
const isClients=/^\/studio\/clients(?:\.html|\/)?$/u.test(path);
const isWebTv=/^\/studio\/webtv(?:\.html|\/)?$/u.test(path);
const nativeFetch=window.fetch.bind(window);
let contactDraft={firstName:'',lastName:'',phone:''};
let pendingPrefill=null;
let agenda={mode:'filming',month:new Date(new Date().getFullYear(),new Date().getMonth(),1),clients:[],orders:[],selectedDate:'',loading:false};

installFetchBridge();
boot();

function boot(){
  document.body.dataset.studioOperatingUx=RELEASE;
  document.body.classList.add('studio-operating-v135');
  if(isWebTv)document.body.classList.add('studio-operating-webtv-v135');
  if(isClients){
    installClientAgenda();
    enhanceWizardContact();
    new MutationObserver(()=>{installClientAgenda();enhanceWizardContact();applyPendingPrefill();}).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',validateWizardContact,true);
  }
}

function installFetchBridge(){
  if(window.__neptuneStudioOperatingFetchV135)return;
  window.__neptuneStudioOperatingFetchV135=true;
  window.fetch=async function studioOperatingFetchV135(input,init={}){
    const url=requestUrl(input);if(!url)return nativeFetch(input,init);
    let next={...init};
    let payload=null;
    const method=String(next.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    if(method==='POST'&&url.pathname==='/api/admin/media-catalog-v98/context'){
      const headers=new Headers(next.headers||(input instanceof Request?input.headers:undefined));
      if(!headers.get('X-CSRF-Token'))headers.set('X-CSRF-Token',await ensureCsrf());
      next.headers=headers;
    }
    if(method==='POST'&&url.pathname==='/api/admin/client-order'){
      try{payload=JSON.parse(String(next.body||'{}'));}catch{payload=null;}
      if(payload&&contactDraft.firstName&&contactDraft.lastName){
        payload={...payload,firstName:contactDraft.firstName,lastName:contactDraft.lastName,phone:contactDraft.phone};
        next.body=JSON.stringify(payload);
      }
    }
    const response=await nativeFetch(input,next);
    if(response.ok&&url.pathname==='/api/admin/client-order'&&payload?.email&&payload?.phone){
      try{
        const csrf=await ensureCsrf();
        await nativeFetch('/api/admin/contact-profile-v135',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email:payload.email,firstName:payload.firstName,lastName:payload.lastName,fullName:payload.fullName,phone:payload.phone,company:payload.company||''})});
      }catch(error){console.warn('studio_v135_contact_sync_failed',String(error?.message||error));}
    }
    return response;
  };
}

async function ensureCsrf(force=false){
  if(!force){const cached=sessionStorage.getItem('neptune_csrf')||'';if(cached)return cached;}
  const response=await nativeFetch('/api/auth/status',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.csrfToken)throw new Error(data.error||'csrf_unavailable');
  sessionStorage.setItem('neptune_csrf',data.csrfToken);return data.csrfToken;
}

function enhanceWizardContact(){
  const original=$('#wizardNameV118');
  if(!original||original.dataset.contactV135==='1')return;
  original.dataset.contactV135='1';
  const hiddenLabel=original.closest('label');
  const initial=String(original.value||'').trim();
  if(!contactDraft.firstName&&!contactDraft.lastName&&initial){const parts=initial.split(/\s+/u);contactDraft.firstName=parts.shift()||'';contactDraft.lastName=parts.join(' ');}
  original.type='hidden';if(hiddenLabel)hiddenLabel.style.display='none';
  const anchor=hiddenLabel||original;
  anchor.insertAdjacentHTML('beforebegin',`
    <label class="wizard-field"><span>Prénom *</span><input id="wizardFirstNameV135" autocomplete="given-name" value="${attr(contactDraft.firstName)}" required></label>
    <label class="wizard-field"><span>Nom *</span><input id="wizardLastNameV135" autocomplete="family-name" value="${attr(contactDraft.lastName)}" required></label>
    <label class="wizard-field wide"><span>Téléphone *</span><input id="wizardPhoneV135" type="tel" autocomplete="tel" value="${attr(contactDraft.phone)}" placeholder="06 12 34 56 78" required></label>`);
  const sync=()=>{
    contactDraft.firstName=value('#wizardFirstNameV135');contactDraft.lastName=value('#wizardLastNameV135');contactDraft.phone=value('#wizardPhoneV135');
    original.value=`${contactDraft.firstName} ${contactDraft.lastName}`.trim();
    original.dispatchEvent(new Event('input',{bubbles:true}));
  };
  for(const input of [$('#wizardFirstNameV135'),$('#wizardLastNameV135'),$('#wizardPhoneV135')])input?.addEventListener('input',sync);
  sync();applyPendingPrefill();
}

function validateWizardContact(event){
  if(event.target?.id!=='wizardNextV118')return;
  const first=$('#wizardFirstNameV135'),last=$('#wizardLastNameV135'),phone=$('#wizardPhoneV135');
  if(!first||!last||!phone)return;
  const missing=!first.value.trim()||!last.value.trim()||phone.value.replace(/\D/gu,'').length<8;
  if(!missing)return;
  event.preventDefault();event.stopImmediatePropagation();
  const message=$('#wizardMessageV118');if(message){message.textContent='Renseignez le prénom, le nom et un numéro de téléphone valide.';message.className='message error';}
  (!first.value.trim()?first:!last.value.trim()?last:phone).focus();
}

function installClientAgenda(){
  const actions=$('.clients-top-actions');
  if(actions&&!$('#studioAgendaV135')){
    const button=document.createElement('button');button.id='studioAgendaV135';button.type='button';button.className='secondary v135-agenda-trigger';button.innerHTML='<span aria-hidden="true">▦</span> Agenda';button.onclick=()=>openAgenda('filming');
    const newPassage=$('#newClient',actions);newPassage?actions.insertBefore(button,newPassage):actions.append(button);
  }
  if(!$('#studioAgendaDialogV135'))document.body.insertAdjacentHTML('beforeend',agendaDialogMarkup());
  if(!$('#studioAgendaActionV135'))document.body.insertAdjacentHTML('beforeend',agendaActionMarkup());
  bindAgendaShell();
}

function agendaDialogMarkup(){return `<dialog id="studioAgendaDialogV135" class="v135-dialog"><section class="v135-agenda-card"><header class="v135-agenda-head"><div><p>AGENDA STUDIO</p><h2>Passages & préparations</h2><span id="v135AgendaSubtitle">Vue globale de l’activité</span></div><div class="v135-agenda-head-actions"><button type="button" data-v135-create="filming">+ Passage</button><button type="button" data-v135-create="preparation">+ Préparation</button><button type="button" class="v135-icon" data-v135-agenda-close aria-label="Fermer">×</button></div></header><div class="v135-agenda-tabs"><button type="button" data-v135-mode="filming">Passages</button><button type="button" data-v135-mode="preparation">Préparations</button></div><div class="v135-agenda-toolbar"><button type="button" data-v135-month="prev" aria-label="Mois précédent">‹</button><strong id="v135MonthLabel"></strong><button type="button" data-v135-month="next" aria-label="Mois suivant">›</button><span></span><button type="button" data-v135-today>Aujourd’hui</button></div><div class="v135-weekdays"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div><div id="v135AgendaGrid" class="v135-agenda-grid"></div></section></dialog>`;}
function agendaActionMarkup(){return `<dialog id="studioAgendaActionV135" class="v135-dialog v135-action-dialog"><section class="v135-action-card"><header><div><p id="v135ActionEyebrow">AJOUTER</p><h2 id="v135ActionTitle">Que souhaitez-vous planifier ?</h2></div><button type="button" class="v135-icon" data-v135-action-close aria-label="Fermer">×</button></header><div id="v135ActionChoices" class="v135-action-choices"><button type="button" data-v135-action="filming"><b>Nouveau passage</b><span>Choisir un client existant ou en créer un.</span></button><button type="button" data-v135-action="preparation"><b>Nouvelle préparation</b><span>Rattacher le rendez-vous à un passage client.</span></button></div><form id="v135PreparationForm" class="v135-preparation-form" hidden><label><span>Client / passage</span><select id="v135PreparationOrder" required></select></label><label><span>Date et heure</span><input id="v135PreparationAt" type="datetime-local" required></label><div class="v135-form-actions"><button type="button" class="secondary" data-v135-new-client>+ Nouveau client</button><button type="submit" class="button">Créer la préparation</button></div><p id="v135PreparationMessage" class="message"></p></form></section></dialog>`;}

function bindAgendaShell(){
  const dialog=$('#studioAgendaDialogV135');if(dialog&&!dialog.dataset.bound){dialog.dataset.bound='1';$('[data-v135-agenda-close]',dialog).onclick=()=>dialog.close();$$('[data-v135-mode]',dialog).forEach(b=>b.onclick=()=>{agenda.mode=b.dataset.v135Mode;renderAgenda();});$$('[data-v135-month]',dialog).forEach(b=>b.onclick=()=>{agenda.month=new Date(agenda.month.getFullYear(),agenda.month.getMonth()+(b.dataset.v135Month==='next'?1:-1),1);renderAgenda();});$('[data-v135-today]',dialog).onclick=()=>{const n=new Date();agenda.month=new Date(n.getFullYear(),n.getMonth(),1);renderAgenda();};$$('[data-v135-create]',dialog).forEach(b=>b.onclick=()=>openAgendaAction(b.dataset.v135Create,toDateKey(new Date())));dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});}
  const action=$('#studioAgendaActionV135');if(action&&!action.dataset.bound){action.dataset.bound='1';$('[data-v135-action-close]',action).onclick=()=>action.close();$$('[data-v135-action]',action).forEach(b=>b.onclick=()=>chooseAgendaAction(b.dataset.v135Action));$('[data-v135-new-client]',action).onclick=()=>openNewPassage('preparation',agenda.selectedDate);$('#v135PreparationForm',action).addEventListener('submit',createPreparation);action.addEventListener('click',e=>{if(e.target===action)action.close();});}
}

async function openAgenda(mode='filming'){
  installClientAgenda();agenda.mode=mode==='preparation'?'preparation':'filming';const dialog=$('#studioAgendaDialogV135');if(!dialog)return;
  if(!dialog.open)dialog.showModal();
  $('#v135AgendaGrid').innerHTML='<div class="v135-loading">Chargement de l’agenda…</div>';
  await loadAgenda();renderAgenda();
}
async function loadAgenda(){if(agenda.loading)return;agenda.loading=true;try{const data=await apiGet('/api/admin/clients');agenda.clients=Array.isArray(data.clients)?data.clients:[];agenda.orders=Array.isArray(data.orders)?data.orders:[];}catch(error){$('#v135AgendaGrid').innerHTML=`<div class="v135-empty is-error">${html(errorLabel(error.message))}</div>`;}finally{agenda.loading=false;}}
function renderAgenda(){
  const grid=$('#v135AgendaGrid');if(!grid)return;
  $$('[data-v135-mode]','#studioAgendaDialogV135').forEach(b=>b.classList.toggle('active',b.dataset.v135Mode===agenda.mode));
  $('#v135MonthLabel').textContent=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(agenda.month);
  const events=agendaEvents();const year=agenda.month.getFullYear(),month=agenda.month.getMonth(),first=new Date(year,month,1),offset=(first.getDay()+6)%7,last=new Date(year,month+1,0).getDate();let cells='';
  for(let i=0;i<offset;i++)cells+='<span class="v135-day is-empty"></span>';
  for(let day=1;day<=last;day++){
    const date=new Date(year,month,day),key=toDateKey(date),daily=events.filter(e=>e.key===key),today=key===toDateKey(new Date());
    cells+=`<button type="button" class="v135-day${today?' is-today':''}" data-v135-date="${key}"><span class="v135-day-number">${day}</span><span class="v135-day-events">${daily.slice(0,3).map(eventChip).join('')}${daily.length>3?`<i>+${daily.length-3}</i>`:''}</span></button>`;
  }
  grid.innerHTML=cells;
  $$('[data-v135-date]',grid).forEach(cell=>cell.onclick=e=>{const chip=e.target.closest('[data-v135-order]');if(chip){e.stopPropagation();openOrder(chip.dataset.v135Order);return;}openAgendaAction(agenda.mode,cell.dataset.v135Date);});
  const count=events.filter(e=>e.date.getMonth()===month&&e.date.getFullYear()===year).length;$('#v135AgendaSubtitle').textContent=`${count} rendez-vous · ${agenda.orders.length} passage${agenda.orders.length===1?'':'s'} suivi${agenda.orders.length===1?'':'s'}`;
}
function agendaEvents(){const field=agenda.mode==='preparation'?'appointmentAt':'filmingAt';return agenda.orders.map(order=>{const date=new Date(order[field]||'');if(Number.isNaN(date.getTime()))return null;return{orderId:order.id,key:toDateKey(date),date,label:order.fullName||order.company||order.email||'Client',meta:order.format||order.title||''};}).filter(Boolean).sort((a,b)=>a.date-b.date);}
function eventChip(event){return `<span class="v135-event" data-v135-order="${attr(event.orderId)}"><b>${timeLabel(event.date)}</b><em>${html(event.label)}</em></span>`;}
function openOrder(orderId){const dialog=$('#studioAgendaDialogV135');dialog?.close();const card=document.querySelector(`[data-order-card="${cssEscape(orderId)}"]`);if(card){card.click();return;}location.assign(`/studio/clients#${encodeURIComponent(orderId)}`);}

function openAgendaAction(mode,date){agenda.selectedDate=date||toDateKey(new Date());const action=$('#studioAgendaActionV135');if(!action)return;$('#v135ActionChoices').hidden=false;$('#v135PreparationForm').hidden=true;$('#v135ActionTitle').textContent=`${prettyDate(agenda.selectedDate)}`;if(!action.open)action.showModal();if(mode==='preparation')chooseAgendaAction('preparation');}
function chooseAgendaAction(mode){if(mode==='filming'){openNewPassage('filming',agenda.selectedDate);return;}$('#v135ActionChoices').hidden=true;const form=$('#v135PreparationForm');form.hidden=false;const select=$('#v135PreparationOrder');select.innerHTML='<option value="">Choisir un client / passage…</option>'+agenda.orders.filter(o=>o.status!=='completed').map(o=>`<option value="${attr(o.id)}">${html(o.fullName||o.company||o.email)} · ${html(o.format||o.title||'Passage')}</option>`).join('');$('#v135PreparationAt').value=`${agenda.selectedDate}T10:00`;$('#v135PreparationMessage').textContent='';}
function openNewPassage(mode,date){pendingPrefill={mode,date};$('#studioAgendaActionV135')?.close();$('#studioAgendaDialogV135')?.close();$('#newClient')?.click();setTimeout(()=>{const newMode=$('[data-client-mode="new"]');if(newMode)newMode.click();applyPendingPrefill();},80);}
function applyPendingPrefill(){if(!pendingPrefill)return;const id=pendingPrefill.mode==='preparation'?'#wizardAppointmentV118':'#wizardFilmingV118',input=$(id);if(!input)return;if(!input.value)input.value=`${pendingPrefill.date}T10:00`;input.dispatchEvent(new Event('input',{bubbles:true}));pendingPrefill=null;}
async function createPreparation(event){event.preventDefault();const form=event.currentTarget,button=$('button[type="submit"]',form),message=$('#v135PreparationMessage'),orderId=$('#v135PreparationOrder').value,appointmentAt=$('#v135PreparationAt').value;if(!orderId||!appointmentAt){message.textContent='Sélectionnez un passage et un créneau.';message.className='message error';return;}button.disabled=true;message.textContent='Synchronisation…';message.className='message';try{await apiProtected('/api/admin/preparation-calendar',{orderId,appointmentAt:new Date(appointmentAt).toISOString(),action:'upsert',durationMinutes:30});message.textContent='Préparation ajoutée et synchronisée.';message.className='message success';await loadAgenda();renderAgenda();$('#refresh')?.click();setTimeout(()=>$('#studioAgendaActionV135')?.close(),450);}catch(error){message.textContent=errorLabel(error.message);message.className='message error';}finally{button.disabled=false;}}

async function apiGet(url){const response=await nativeFetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;}
async function apiProtected(url,payload,retry=true){const csrf=await ensureCsrf(!retry);const response=await nativeFetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':csrf},body:JSON.stringify(payload||{})}),data=await response.json().catch(()=>({}));if(!response.ok&&data.error==='csrf_failed'&&retry){sessionStorage.removeItem('neptune_csrf');return apiProtected(url,payload,false);}if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;}
function requestUrl(input){try{return new URL(typeof input==='string'||input instanceof URL?String(input):String(input?.url||''),location.href);}catch{return null;}}
function value(selector){return String($(selector)?.value||'').trim();}
function toDateKey(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return`${y}-${m}-${d}`;}
function prettyDate(key){const d=new Date(`${key}T12:00:00`);return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(d);}
function timeLabel(date){return new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(date);}
function cssEscape(value){return window.CSS?.escape?CSS.escape(String(value)):String(value).replace(/["\\]/gu,'\\$&');}
function errorLabel(code){return({unauthorized:'Reconnectez-vous au Studio.',csrf_failed:'La session de sécurité doit être renouvelée.',calendar_access_missing:'Google Agenda doit être réautorisé.',calendar_permission_required:'Google Agenda doit être réautorisé.',appointment_in_past:'Choisissez une date future.'})[code]||`Impossible de terminer l’opération (${code||'erreur'}).`;}
function html(value){return String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function attr(value){return html(value);}
