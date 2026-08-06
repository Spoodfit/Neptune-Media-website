const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const RECIPIENTS={client:'Client',admin:'Neptune / organisateur',supplier:'Studio fournisseur'};
const STATUSES={queued:'En attente',sent:'Envoyé',delivered:'Distribué',opened:'Ouvert · lecture détectée',clicked:'Ouvert et cliqué',delayed:'Retardé',failed:'Échec',bounced:'Rejeté',complained:'Signalé comme indésirable',suppressed:'Bloqué par le fournisseur'};
const FAILURE=new Set(['failed','bounced','complained','suppressed']);
let emailActive=false,activeOrderId='',history={items:[],summary:{},tracking:{}},timer=0,scheduled=0,animating=false;
const animationQueue=[],animatedIds=new Set();

boot();

function boot(){
  document.body.classList.add('studio-email-activity-v82');
  patchFetch();
  document.addEventListener('click',onClick,true);
  window.addEventListener('hashchange',()=>{emailActive=false;activeOrderId=currentOrderId();stopRefresh();scheduleInstall();});
  new MutationObserver(scheduleInstall).observe(document.body,{childList:true,subtree:true});
  scheduleInstall();
}

function scheduleInstall(){
  if(scheduled)return;
  scheduled=requestAnimationFrame(()=>{scheduled=0;installTab();if(emailActive)maintainView();});
}

function installTab(){
  const tabs=qs('#clientDetail .tabs');
  if(!tabs||!currentOrderId()||qs('[data-email-tab-v82]',tabs))return;
  const button=document.createElement('button');
  button.type='button';
  button.dataset.emailTabV82='true';
  button.dataset.detailTab='email-v82';
  button.innerHTML='<span aria-hidden="true">✉</span> E-mails';
  const passage=qs('[data-passage-tab-v80]',tabs);
  passage?passage.after(button):tabs.append(button);
}

async function onClick(event){
  if(event.target.closest('[data-email-tab-v82]')){
    event.preventDefault();event.stopImmediatePropagation();await openHistory(true);return;
  }
  const regular=event.target.closest('[data-detail-tab]');
  if(regular&&!regular.dataset.emailTabV82){emailActive=false;stopRefresh();return;}
  if(event.target.closest('[data-email-refresh-v82]')){event.preventDefault();await loadHistory(true);return;}
  if(event.target.closest('[data-email-back-passage-v82]')){event.preventDefault();emailActive=false;stopRefresh();qs('[data-passage-tab-v80]')?.click();}
}

async function openHistory(refreshProvider){
  const id=currentOrderId();if(!id)return;
  emailActive=true;activeOrderId=id;activateTab();renderLoading();await loadHistory(refreshProvider);startRefresh();
}

function maintainView(){
  if(activeOrderId!==currentOrderId())return;
  activateTab();
  const body=qs('#detailBody');
  if(body&&body.dataset.emailActivityV82!==activeOrderId)renderHistory();
}

function activateTab(){
  const tabs=qs('#clientDetail .tabs');
  if(tabs)qsa('button',tabs).forEach(b=>b.classList.toggle('active',Boolean(b.dataset.emailTabV82)));
}

function renderLoading(){
  const body=qs('#detailBody');if(!body)return;
  body.className='email-v82-body';body.dataset.emailActivityV82=activeOrderId;
  body.innerHTML='<section class="email-v82-shell"><div class="email-v82-loading">Chargement de l’historique des e-mails…</div></section>';
}

async function loadHistory(refreshProvider=false){
  const id=currentOrderId();if(!emailActive||!id)return;
  const button=qs('[data-email-refresh-v82]');if(button)button.disabled=true;
  try{
    history=await api(`/api/admin/email-history?${new URLSearchParams({orderId:id,limit:'150',refresh:refreshProvider?'1':'0'})}`);
    renderHistory();
  }catch(error){
    const body=qs('#detailBody');if(body){body.className='email-v82-body';body.innerHTML=`<section class="email-v82-shell"><div class="email-v82-error">${escapeHtml(errorLabel(error.message))}</div></section>`;}
  }finally{if(button)button.disabled=false;}
}

function renderHistory(){
  if(!emailActive||activeOrderId!==currentOrderId())return;
  const body=qs('#detailBody');if(!body)return;
  body.className='email-v82-body';body.dataset.emailActivityV82=activeOrderId;
  body.innerHTML=`<section class="email-v82-shell">
    <header class="email-v82-header"><div><p class="eyebrow">COMMUNICATIONS DU PASSAGE</p><h3>Historique des e-mails</h3><p>Visualisez le destinataire, le contenu communiqué et les signaux d’envoi, de distribution, d’ouverture et de clic.</p></div><div class="email-v82-header-actions"><button type="button" data-email-back-passage-v82>Retour au passage</button><button type="button" class="primary" data-email-refresh-v82>Actualiser les statuts</button></div></header>
    ${metrics(history.summary||{})}
    <div class="email-v82-toolbar"><input type="search" data-email-search-v82 aria-label="Rechercher dans les e-mails" placeholder="Rechercher un destinataire, un objet…"><select data-email-recipient-filter-v82 aria-label="Filtrer par destinataire"><option value="all">Tous les destinataires</option><option value="client">Client</option><option value="admin">Neptune / organisateur</option><option value="supplier">Studio fournisseur</option></select><select data-email-status-filter-v82 aria-label="Filtrer par statut"><option value="all">Tous les statuts</option><option value="sent">Envoyés</option><option value="delivered">Distribués</option><option value="opened">Ouverts</option><option value="clicked">Cliqués</option><option value="failed">En échec</option></select></div>
    <p class="email-v82-note">Le statut « Ouvert » est un signal fourni par le pixel de suivi du prestataire. Il indique qu’une ouverture a été détectée, mais ne constitue pas une preuve absolue de lecture humaine. Un clic est un signal d’engagement plus fort.</p>
    <div class="email-v82-list" data-email-list-v82></div>
  </section>`;
  qsa('[data-email-search-v82],[data-email-recipient-filter-v82],[data-email-status-filter-v82]',body).forEach(control=>{control.addEventListener('input',filterItems);control.addEventListener('change',filterItems);});
  filterItems();
}

function metrics(s){
  return `<div class="email-v82-metrics">${[['Envoyés',s.sent],['Distribués',s.delivered],['Ouverts',s.opened],['Cliqués',s.clicked],['Échecs',s.failed]].map(([label,value])=>`<div class="email-v82-metric"><span>${label}</span><strong>${Number(value||0)}</strong></div>`).join('')}</div>`;
}

function filterItems(){
  const list=qs('[data-email-list-v82]');if(!list)return;
  const term=normalize(qs('[data-email-search-v82]')?.value).toLowerCase();
  const recipient=qs('[data-email-recipient-filter-v82]')?.value||'all';
  const status=qs('[data-email-status-filter-v82]')?.value||'all';
  const items=(history.items||[]).filter(item=>{
    if(recipient!=='all'&&item.recipientType!==recipient)return false;
    if(status==='failed'&&!FAILURE.has(item.status))return false;
    if(status==='sent'&&!item.sentAt)return false;
    if(status==='delivered'&&!(item.deliveredAt||['delivered','opened','clicked'].includes(item.status)))return false;
    if(status==='opened'&&!(item.openedAt||['opened','clicked'].includes(item.status)))return false;
    if(status==='clicked'&&!(item.clickedAt||item.status==='clicked'))return false;
    if(!term)return true;
    return [item.subject,item.toEmail,item.messageKey,item.clientName,item.passageTitle].some(v=>normalize(v).toLowerCase().includes(term));
  });
  list.innerHTML=items.length?items.map(emailCard).join(''):'<div class="email-v82-empty">Aucun e-mail ne correspond aux filtres sélectionnés.</div>';
}

function emailCard(item){
  const changes=Array.isArray(item.payload?.changes)?item.payload.changes:[];
  const reference=item.lastEventAt||item.sentAt||item.createdAt;
  return `<details class="email-v82-card"><summary class="email-v82-card-summary"><div><h4>${escapeHtml(item.subject||'Notification Neptune Media')}</h4><p>${escapeHtml(dateTime(reference))} · ${escapeHtml(item.messageKey||'notification')}</p></div><div class="email-v82-recipient"><strong>${escapeHtml(item.toEmail||'Destinataire inconnu')}</strong><span>${escapeHtml(RECIPIENTS[item.recipientType]||item.recipientType||'Destinataire')}</span></div><span class="email-v82-status is-${escapeHtml(item.status)}">${escapeHtml(STATUSES[item.status]||item.status)}</span></summary><div class="email-v82-details">${timeline(item)}<div class="email-v82-detail-grid">${detail('Destinataire',item.toEmail||'Non renseigné')}${detail('Type',RECIPIENTS[item.recipientType]||item.recipientType||'Non renseigné')}${detail('Identifiant Resend',item.emailId||'Non disponible')}${detail('Signaux',`${Number(item.openCount||0)} ouverture(s) · ${Number(item.clickCount||0)} clic(s)`)}${item.lastClickUrl?linkDetail('Dernier lien cliqué',item.lastClickUrl):''}${item.lastError?detail('Dernière erreur',item.lastError):''}</div>${changes.length?`<div class="email-v82-changes">${changes.map(changeMarkup).join('')}</div>`:''}</div></details>`;
}

function timeline(item){
  const steps=[['Envoyé',item.sentAt],['Distribué',item.deliveredAt],['Ouvert',item.openedAt],['Cliqué',item.clickedAt]];
  if(FAILURE.has(item.status))steps.push(['Incident',item.failedAt||item.bouncedAt||item.complainedAt||item.suppressedAt||item.lastEventAt]);
  return `<div class="email-v82-timeline">${steps.map(([label,value])=>`<div class="email-v82-event ${value?'is-done':''}"><b>${label}</b><span>${value?escapeHtml(dateTime(value)):'Non détecté'}</span></div>`).join('')}</div>`;
}
function detail(label,value){return `<div class="email-v82-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;}
function linkDetail(label,value){return `<div class="email-v82-detail-item"><span>${escapeHtml(label)}</span><a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a></div>`;}
function changeMarkup(c){return `<div class="email-v82-change"><small>${escapeHtml(c.label||c.field||'Information')}</small><span>${escapeHtml(c.before||'Non renseigné')}</span><span aria-hidden="true">→</span><strong>${escapeHtml(c.after||'Non renseigné')}</strong></div>`;}

function patchFetch(){
  if(window.__neptuneEmailActivityFetchV82)return;
  window.__neptuneEmailActivityFetchV82=true;
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{
    const input=args[0],options=args[1]||{},url=typeof input==='string'?input:input?.url||'',method=String(options.method||(typeof input!=='string'?input?.method:'')||'GET').toUpperCase(),startedAt=Date.now();
    const response=await nativeFetch(...args);
    if(method==='POST'&&String(url).includes('/api/admin/')){
      response.clone().json().then(result=>{
        const delivery=result?.emailDelivery;
        if(Number(delivery?.sent||0)>0){delivery.sentItems?.forEach(i=>i.emailId&&animatedIds.add(i.emailId));enqueueAnimation(delivery);if(emailActive)setTimeout(()=>loadHistory(false),500);return;}
        if(Number(delivery?.failed||0)>0){enqueueAnimation(delivery);return;}
        if(response.ok)setTimeout(()=>detectUnreported(startedAt),900);
      }).catch(()=>{});
    }
    return response;
  };
}

async function detectUnreported(startedAt){
  const id=currentOrderId();if(!id)return;
  try{
    const result=await api(`/api/admin/email-history?${new URLSearchParams({orderId:id,limit:'25',refresh:'0'})}`);
    const recent=(result.items||[]).filter(item=>item.emailId&&new Date(item.sentAt||0).getTime()>=startedAt-1500&&!animatedIds.has(item.emailId));
    if(!recent.length)return;
    recent.forEach(item=>animatedIds.add(item.emailId));
    enqueueAnimation({sent:recent.length,failed:0,sentItems:recent});
    if(emailActive){history=result;renderHistory();}
  }catch{}
}

function enqueueAnimation(delivery){animationQueue.push(delivery);if(!animating)runAnimation();}
function runAnimation(){
  const delivery=animationQueue.shift();if(!delivery){animating=false;return;}
  animating=true;
  const failed=Number(delivery.failed||0),sent=Number(delivery.sent||0),labels=[...new Set((delivery.sentItems||[]).map(i=>RECIPIENTS[i.recipientType]||i.toEmail).filter(Boolean))];
  const toast=document.createElement('aside');
  toast.className='email-send-toast-v82';toast.dataset.state=failed?'failed':'sending';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  toast.innerHTML=`<div class="email-send-visual-v82"><div class="email-send-envelope-v82" aria-hidden="true"></div></div><div class="email-send-copy-v82"><strong>${failed?'Envoi incomplet':'Envoi des e-mails confirmé'}</strong><p>${failed?`${failed} notification(s) seront réessayées automatiquement.`:`${sent} e-mail(s) transmis au prestataire.`}</p>${labels.length?`<div class="email-send-recipients-v82">${labels.map(l=>`<span>${escapeHtml(l)}</span>`).join('')}</div>`:''}</div>`;
  document.body.append(toast);
  requestAnimationFrame(()=>{toast.classList.add('is-visible');if(!failed)toast.classList.add('is-flying');});
  if(!failed)setTimeout(()=>toast.classList.add('is-success'),950);
  setTimeout(()=>{toast.classList.remove('is-visible');setTimeout(()=>{toast.remove();runAnimation();},260);},failed?3300:3000);
}

function startRefresh(){
  stopRefresh();const webhook=Boolean(history.tracking?.webhookConfigured);timer=window.setInterval(()=>{if(emailActive&&document.visibilityState==='visible')loadHistory(!webhook);},webhook?30000:60000);
}
function stopRefresh(){if(timer)clearInterval(timer);timer=0;}

async function api(url,options={}){
  const headers={Accept:'application/json',...(options.headers||{})};if(options.body)headers['Content-Type']='application/json';headers['X-CSRF-Token']=sessionStorage.getItem('neptune_csrf')||'';
  const response=await fetch(url,{...options,headers,credentials:'same-origin'}),result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||`http_${response.status}`);return result;
}
function currentOrderId(){try{return decodeURIComponent(location.hash.slice(1)||'');}catch{return '';}}
function dateTime(value){const d=new Date(value||'');return Number.isNaN(d.getTime())?'Date inconnue':new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Paris'}).format(d);}
function normalize(value){return String(value??'').trim();}
function errorLabel(code){return ({unauthorized:'La session Studio a expiré. Reconnectez-vous.',csrf_failed:'La session a expiré. Rechargez la page.',email_activity_failed:'L’historique des e-mails n’a pas pu être chargé.'})[code]||'L’historique des e-mails n’a pas pu être chargé.';}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
