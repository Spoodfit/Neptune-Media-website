const RELEASE='neptune-studio-operations-20260811-v95';
const ACCOUNT_API='/api/admin/studio-operations-v95/client-account';
const CONFIG_API='/api/admin/studio-operations-v95/configuration';
const SUPPLIER_SAVE_API='/api/admin/studio-operations-v95/supplier/save';
const FORMAT_SAVE_API='/api/admin/studio-operations-v95/format/save';
const FINANCE_CONTEXT_API='/api/admin/studio-operations-v95/supplier-payment/context';
const FINANCE_ACTION_API='/api/admin/studio-operations-v95/supplier-payment/action';
let scheduled=false;
let currentAccount=null;
const financeCache=new Map();

start();

function start(){
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
}

function boot(){
  document.body.dataset.studioOperationsRelease=RELEASE;
  installDialogs();
  installConfigurationButton();
  document.addEventListener('click',captureNavigation,true);
  new MutationObserver(scheduleEnhance).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','class','data-order-id']});
  window.addEventListener('hashchange',()=>{financeCache.clear();scheduleEnhance();});
  scheduleEnhance();
}

function scheduleEnhance(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;installConfigurationButton();enhanceSupplierPayment();});
}

function captureNavigation(event){
  const trigger=event.target.closest('button,a');
  if(!trigger)return;
  if(trigger.matches('[data-client-manage-v76]')||/^gérer le compte$/iu.test(trigger.textContent.trim())){
    event.preventDefault();event.stopImmediatePropagation();
    openClientAccount({orderId:currentOrderId()});
    return;
  }
  const manager=trigger.closest('#clientManagerDialog,#clientManager,[data-client-manager]');
  const label=trigger.textContent.trim().toLowerCase();
  if(manager&&(label==='dossier'||label==='voir dossier')){
    event.preventDefault();event.stopImmediatePropagation();
    const row=trigger.closest('tr,article,.client-row,.account-row,[data-client-id]');
    const orderId=trigger.dataset.orderId||row?.dataset.orderId||'';
    if(orderId)return openOrderImmediate(orderId);
    const email=(row?.textContent||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0]||'';
    if(email)openClientAccount({email,openLatest:true});
  }
}

function installDialogs(){
  if(!document.getElementById('clientAccountV95')){
    document.body.insertAdjacentHTML('beforeend',`<dialog id="clientAccountV95" class="v95-dialog v95-account-dialog"><div class="v95-dialog-shell"><header class="v95-dialog-head"><div><span>COMPTE CLIENT</span><h2 data-v95-account-title>Compte client</h2><p data-v95-account-subtitle></p></div><button type="button" class="v95-icon-close" data-v95-close="clientAccountV95" aria-label="Fermer">×</button></header><div class="v95-dialog-body" data-v95-account-body></div></div></dialog>`);
  }
  if(!document.getElementById('mediaConfigurationV95')){
    document.body.insertAdjacentHTML('beforeend',`<dialog id="mediaConfigurationV95" class="v95-dialog v95-config-dialog"><div class="v95-dialog-shell"><header class="v95-dialog-head"><div><span>CONFIGURATION NEPTUNE MEDIA</span><h2>Fournisseurs & formats</h2><p>Un seul référentiel pour le Studio et l’espace client.</p></div><button type="button" class="v95-icon-close" data-v95-close="mediaConfigurationV95" aria-label="Fermer">×</button></header><nav class="v95-config-tabs"><button type="button" class="is-active" data-v95-config-tab="suppliers">Fournisseurs</button><button type="button" data-v95-config-tab="formats">Formats & concepts</button></nav><div class="v95-dialog-body" data-v95-config-body></div></div></dialog>`);
  }
  document.querySelectorAll('[data-v95-close]').forEach(btn=>{if(btn.dataset.boundV95)return;btn.dataset.boundV95='1';btn.addEventListener('click',()=>document.getElementById(btn.dataset.v95Close)?.close());});
  document.querySelectorAll('[data-v95-config-tab]').forEach(btn=>{if(btn.dataset.boundV95)return;btn.dataset.boundV95='1';btn.addEventListener('click',()=>{document.querySelectorAll('[data-v95-config-tab]').forEach(x=>x.classList.toggle('is-active',x===btn));renderConfiguration(btn.dataset.v95ConfigTab);});});
}

function installConfigurationButton(){
  if(document.getElementById('openMediaConfigurationV95'))return;
  const anchor=document.getElementById('openClientManager')||document.querySelector('[data-open-client-manager],.top-actions button:last-child,.workspace-actions button:last-child');
  if(!anchor)return;
  const button=document.createElement('button');
  button.id='openMediaConfigurationV95';button.type='button';button.className=anchor.className||'btn secondary';
  button.textContent='Configuration';
  button.addEventListener('click',()=>openConfiguration('suppliers'));
  anchor.insertAdjacentElement('afterend',button);
}

async function openClientAccount({orderId='',clientId='',email='',openLatest=false}={}){
  const dialog=document.getElementById('clientAccountV95');
  const body=dialog.querySelector('[data-v95-account-body]');
  body.innerHTML=loading('Chargement du compte client…');
  if(!dialog.open)dialog.showModal();
  try{
    const data=await api(ACCOUNT_API,{orderId,clientId,email});
    currentAccount=data;
    if(openLatest){dialog.close();return openOrderImmediate(data.orders?.[0]?.id||'');}
    renderAccount(data);
  }catch(error){body.innerHTML=errorCard(error.message,'Impossible de charger le compte client.');}
}

function renderAccount(data){
  const client=data.client||{};const orders=data.orders||[];const body=document.querySelector('[data-v95-account-body]');
  document.querySelector('[data-v95-account-title]').textContent=client.fullName||client.email||'Compte client';
  document.querySelector('[data-v95-account-subtitle]').textContent=[client.company,client.email].filter(Boolean).join(' · ');
  body.innerHTML=`<section class="v95-account-summary"><div><small>PASSAGES</small><strong>${orders.length}</strong></div><div><small>ACCÈS CLIENT</small><strong>${client.active?'Actif':'Désactivé'}</strong></div><div><small>DERNIER ACCÈS</small><strong>${client.lastAccessAt?date(client.lastAccessAt):'Jamais'}</strong></div><button type="button" class="v95-primary" data-v95-new-passage>Nouveau passage</button></section>
  <section class="v95-client-info"><div><small>CLIENT</small><strong>${esc(client.fullName||'—')}</strong></div><div><small>ENTREPRISE</small><strong>${esc(client.company||'—')}</strong></div><div><small>E-MAIL</small><strong>${esc(client.email||'—')}</strong></div><button type="button" class="v95-secondary" data-v95-access-manager>Gérer les accès</button></section>
  <section class="v95-passage-section"><div class="v95-section-head"><div><small>HISTORIQUE</small><h3>Tous les passages</h3></div><span>${orders.length} dossier${orders.length>1?'s':''}</span></div>${orders.length?`<div class="v95-passage-list">${orders.map(order=>passageRow(order)).join('')}</div>`:'<p class="v95-empty">Aucun passage pour ce client.</p>'}</section>`;
  body.querySelector('[data-v95-new-passage]')?.addEventListener('click',()=>newPassageForClient(client));
  body.querySelector('[data-v95-access-manager]')?.addEventListener('click',()=>openLegacyAccessManager(client));
  body.querySelectorAll('[data-v95-open-order]').forEach(btn=>btn.addEventListener('click',()=>openOrderImmediate(btn.dataset.v95OpenOrder)));
}

function passageRow(order){
  return `<article class="v95-passage-row"><div class="v95-passage-main"><span class="v95-status">${esc(statusLabel(order.status))}</span><strong>${esc(order.title||order.format||'Passage Neptune Media')}</strong><p>${esc(order.format||'')} · ${order.filmingAt?`Studio ${date(order.filmingAt)}`:'Date studio à confirmer'}</p></div><div class="v95-passage-meta"><small>PAIEMENT CLIENT</small><strong>${esc(paymentLabel(order.paymentStatus))}</strong></div><div class="v95-passage-meta"><small>PRÉPARATION</small><strong>${order.appointmentAt?date(order.appointmentAt):'À planifier'}</strong></div><button type="button" class="v95-secondary" data-v95-open-order="${esc(order.id)}">Voir dossier</button></article>`;
}

function newPassageForClient(client){
  document.getElementById('clientAccountV95')?.close();
  document.getElementById('clientDialog')?.close();
  const opener=document.getElementById('newClient');
  opener?.click();
  requestAnimationFrame(()=>{
    const form=document.getElementById('newOrder');
    setField(form,'email',client.email);setField(form,'fullName',client.fullName);setField(form,'company',client.company);
    form?.querySelector('[name="email"]')?.focus();
  });
}

function setField(form,name,value){const input=form?.querySelector(`[name="${name}"]`);if(!input)return;input.value=value||'';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}

function openLegacyAccessManager(client){
  document.getElementById('clientAccountV95')?.close();
  document.getElementById('clientDialog')?.close();
  document.getElementById('openClientManager')?.click();
  setTimeout(()=>{const input=document.querySelector('#clientManagerDialog input[type="search"],#clientManagerDialog input[type="text"],#clientManager input[type="search"]');if(input){input.value=client.email||'';input.dispatchEvent(new Event('input',{bubbles:true}));}},40);
}

function openOrderImmediate(orderId){
  if(!orderId)return;
  document.getElementById('clientAccountV95')?.close();
  document.getElementById('clientManagerDialog')?.close?.();
  const search=document.getElementById('search');
  if(search&&search.value){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));}
  history.replaceState({},'',`#${encodeURIComponent(orderId)}`);
  const clickCard=()=>{
    const selector=`[data-order-card="${cssEsc(orderId)}"]`;
    const card=document.querySelector(selector);
    if(card){card.click();return true;}
    return false;
  };
  if(clickCard())return;
  document.getElementById('refresh')?.click();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!clickCard())window.dispatchEvent(new HashChangeEvent('hashchange'));}));
}

async function enhanceSupplierPayment(){
  const detail=document.getElementById('clientDetail');if(!detail)return;
  const orderId=currentOrderId();if(!orderId)return;
  const paymentStep=findPaymentStep(detail);
  const billingBody=document.querySelector('.tabs .active[data-detail-tab="billing"]')?document.getElementById('detailBody'):null;
  const mounts=[];
  if(paymentStep&&!paymentStep.querySelector('[data-v95-supplier-finance]')){const mount=document.createElement('section');mount.dataset.v95SupplierFinance='';mount.className='v95-supplier-finance';paymentStep.append(mount);mounts.push(mount);}
  if(billingBody&&!billingBody.querySelector('[data-v95-supplier-finance]')){const mount=document.createElement('section');mount.dataset.v95SupplierFinance='';mount.className='v95-supplier-finance v95-supplier-finance--billing';billingBody.prepend(mount);mounts.push(mount);}
  if(!mounts.length)return;
  for(const mount of mounts){mount.innerHTML=loading('Chargement des fournisseurs…');loadFinance(orderId,mount);}
}

function findPaymentStep(detail){
  const steps=[...detail.querySelectorAll('.v92-step')];
  return steps.find(step=>/paiement/iu.test(step.querySelector('h3,.v92-step-title')?.textContent||''))||null;
}

async function loadFinance(orderId,mount,force=false){
  try{
    const cached=financeCache.get(orderId);const data=!force&&cached&&Date.now()-cached.at<15000?cached.data:await api(FINANCE_CONTEXT_API,{orderId});
    financeCache.set(orderId,{at:Date.now(),data});
    if(mount.isConnected)renderFinance(mount,data);
  }catch(error){if(mount.isConnected)mount.innerHTML=errorCard(error.message,'Impossible de charger les paiements fournisseurs.');}
}

function renderFinance(mount,data){
  const payments=data.payments||[];const suppliers=data.suppliers||[];
  mount.innerHTML=`<div class="v95-finance-head"><div><small>FOURNISSEURS DU PASSAGE</small><h4>Factures & virements</h4><p>Le paiement fournisseur reste séparé du paiement du client.</p></div><button type="button" class="v95-link-button" data-v95-manage-suppliers>Gérer les fournisseurs</button></div>
  ${payments.length?`<div class="v95-finance-list">${payments.map(financeCard).join('')}</div>`:'<div class="v95-empty-card"><strong>Aucun fournisseur affecté</strong><p>Ajoutez le studio ou prestataire concerné par ce passage.</p></div>'}
  <form class="v95-add-supplier" data-v95-add-supplier><label><span>Ajouter un fournisseur</span><select name="supplierId" ${suppliers.length?'':'disabled'}>${suppliers.filter(s=>!payments.some(p=>p.supplierId===s.id)).map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${money(s.defaultGrossCents)} TTC</option>`).join('')}</select></label><button type="submit" class="v95-secondary" ${suppliers.every(s=>payments.some(p=>p.supplierId===s.id))?'disabled':''}>Affecter au passage</button></form><p class="v95-inline-message" data-v95-finance-message></p>`;
  mount.querySelector('[data-v95-manage-suppliers]')?.addEventListener('click',()=>openConfiguration('suppliers'));
  mount.querySelector('[data-v95-add-supplier]')?.addEventListener('submit',async event=>{event.preventDefault();const supplierId=new FormData(event.currentTarget).get('supplierId');await financeAction(mount,data.order.id,{action:'assign',orderId:data.order.id,supplierId});});
  mount.querySelectorAll('[data-v95-request-invoice]').forEach(btn=>btn.addEventListener('click',()=>financeAction(mount,data.order.id,{action:'request_invoice',paymentId:btn.dataset.v95RequestInvoice},btn)));
  mount.querySelectorAll('[data-v95-received-form]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();const fd=new FormData(form);financeAction(mount,data.order.id,{action:'mark_received',paymentId:form.dataset.v95ReceivedForm,invoiceNumber:fd.get('invoiceNumber'),invoiceUrl:fd.get('invoiceUrl')},form.querySelector('button'));}));
  mount.querySelectorAll('[data-v95-paid-form]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();const fd=new FormData(form);financeAction(mount,data.order.id,{action:'mark_paid',paymentId:form.dataset.v95PaidForm,paymentReference:fd.get('paymentReference')},form.querySelector('button'));}));
}

function financeCard(p){
  const vatRate=(Number(p.vatRateBps||0)/100).toLocaleString('fr-FR',{maximumFractionDigits:2});
  const state={assigned:['Facture à demander','neutral'],requested:['Facture demandée','waiting'],received:['Virement à effectuer','warning'],paid:['Payé','success']}[p.status]||['À vérifier','neutral'];
  let action='';
  if(p.status==='assigned')action=`<button type="button" class="v95-primary" data-v95-request-invoice="${esc(p.id)}">Demander la facture</button>`;
  if(p.status==='requested')action=`<div class="v95-requested-note"><strong>Demande envoyée${p.requestedAt?` le ${date(p.requestedAt)}`:''}</strong><p>Enregistrez la facture dès sa réception pour débloquer le virement.</p></div><form class="v95-inline-form" data-v95-received-form="${esc(p.id)}"><input name="invoiceNumber" placeholder="N° de facture"><input name="invoiceUrl" type="url" placeholder="Lien vers la facture"><button type="submit" class="v95-primary">Facture reçue</button></form>`;
  if(p.status==='received')action=`<div class="v95-invoice-ready"><strong>${esc(p.invoiceNumber||'Facture reçue')}</strong>${p.invoiceUrl?`<a href="${esc(p.invoiceUrl)}" target="_blank" rel="noopener">Ouvrir la facture ↗</a>`:''}</div><form class="v95-inline-form" data-v95-paid-form="${esc(p.id)}"><input name="paymentReference" placeholder="Référence du virement" required><button type="submit" class="v95-primary">Marquer le virement effectué</button></form>`;
  if(p.status==='paid')action=`<div class="v95-paid-note"><strong>Virement enregistré${p.paidAt?` · ${date(p.paidAt)}`:''}</strong><p>${esc(p.paymentReference||'')}</p></div>`;
  return `<article class="v95-finance-card"><div class="v95-finance-card-head"><div><strong>${esc(p.supplierName)}</strong><small>${esc(p.supplierEmail||'')}</small></div><span class="v95-finance-status is-${state[1]}">${state[0]}</span></div><div class="v95-money-grid"><div><small>HT</small><strong>${money(p.netCents)}</strong></div><div><small>TVA ${vatRate} %</small><strong>${money(p.vatCents)}</strong></div><div><small>TTC</small><strong>${money(p.grossCents)}</strong></div></div><div class="v95-finance-action">${action}</div></article>`;
}

async function financeAction(mount,orderId,payload,button){
  if(button)button.disabled=true;const message=mount.querySelector('[data-v95-finance-message]');if(message)message.textContent='Mise à jour…';
  try{const result=await api(FINANCE_ACTION_API,payload);financeCache.delete(orderId);if(message)message.textContent=result.suppressed?'Demande déjà envoyée récemment : aucun nouvel e-mail n’a été envoyé.':'Mise à jour enregistrée.';await loadFinance(orderId,mount,true);}
  catch(error){if(message){message.textContent=humanError(error.message);message.classList.add('is-error');}if(button)button.disabled=false;}
}

async function openConfiguration(tab='suppliers'){
  const dialog=document.getElementById('mediaConfigurationV95');
  document.querySelectorAll('[data-v95-config-tab]').forEach(x=>x.classList.toggle('is-active',x.dataset.v95ConfigTab===tab));
  dialog.querySelector('[data-v95-config-body]').innerHTML=loading('Chargement de la configuration…');
  if(!dialog.open)dialog.showModal();
  try{dialog._v95Data=await api(CONFIG_API,{});renderConfiguration(tab);}catch(error){dialog.querySelector('[data-v95-config-body]').innerHTML=errorCard(error.message,'Impossible de charger la configuration.');}
}

function renderConfiguration(tab){
  const dialog=document.getElementById('mediaConfigurationV95');const data=dialog._v95Data||{suppliers:[],formats:[]};const body=dialog.querySelector('[data-v95-config-body]');
  body.innerHTML=tab==='formats'?formatsMarkup(data.formats):suppliersMarkup(data.suppliers);
  if(tab==='formats')bindFormats(body,dialog);else bindSuppliers(body,dialog);
}

function suppliersMarkup(items){return `<section class="v95-config-intro"><div><small>FOURNISSEURS</small><h3>Prestataires Neptune Media</h3><p>Les tarifs servent de base lors de l’affectation à un passage. La facture reçue reste la pièce de référence avant virement.</p></div><button type="button" class="v95-primary" data-v95-add-supplier-config>Ajouter un fournisseur</button></section><div class="v95-config-list">${items.map(supplierEditor).join('')}</div><div data-v95-new-supplier></div>`;}
function supplierEditor(s){return `<form class="v95-config-card" data-v95-supplier-form="${esc(s.id)}"><div class="v95-config-card-title"><div><strong>${esc(s.name)}</strong><small>${s.active?'Actif':'Inactif'}</small></div><label class="v95-switch"><input type="checkbox" name="active" ${s.active?'checked':''}><span>Actif</span></label></div><div class="v95-form-grid"><label><span>Nom</span><input name="name" value="${esc(s.name)}" required></label><label><span>E-mail facture</span><input name="email" type="email" value="${esc(s.email||'')}"></label><label><span>Raison sociale</span><input name="legalName" value="${esc(s.legalName||'')}"></label><label><span>Coût HT par défaut (€)</span><input name="netEuros" type="number" min="0" step="0.01" value="${(Number(s.defaultNetCents||0)/100).toFixed(2)}"></label><label><span>TVA (%)</span><input name="vatRate" type="number" min="0" max="100" step="0.01" value="${(Number(s.vatRateBps||0)/100).toFixed(2)}"></label><label><span>TTC calculé</span><input value="${money(s.defaultGrossCents)}" readonly></label><label class="v95-full"><span>Notes internes</span><textarea name="notes">${esc(s.notes||'')}</textarea></label></div><button type="submit" class="v95-secondary">Enregistrer</button></form>`;}

function formatsMarkup(items){return `<section class="v95-config-intro"><div><small>FORMATS & CONCEPTS</small><h3>Catalogue proposé aux clients</h3><p>Un format actif devient disponible dans l’espace client. L’ordre d’affichage reste maîtrisé ici.</p></div><button type="button" class="v95-primary" data-v95-add-format-config>Ajouter un format</button></section><div class="v95-config-list">${items.map(formatEditor).join('')}</div><div data-v95-new-format></div>`;}
function formatEditor(f){return `<form class="v95-config-card" data-v95-format-form="${esc(f.id)}"><div class="v95-config-card-title"><div><strong>${esc(f.name)}</strong><small>${esc(f.concept||f.slug)}</small></div><label class="v95-switch"><input type="checkbox" name="active" ${f.active?'checked':''}><span>Visible client</span></label></div><div class="v95-form-grid"><label><span>Nom du format</span><input name="name" value="${esc(f.name)}" required></label><label><span>Concept</span><input name="concept" value="${esc(f.concept||'')}"></label><label><span>Durée / repère</span><input name="durationLabel" value="${esc(f.durationLabel||'')}"></label><label><span>Prix client (€)</span><input name="priceEuros" type="number" min="0" step="0.01" value="${(Number(f.priceCents||0)/100).toFixed(2)}"></label><label><span>Ordre</span><input name="publicOrder" type="number" min="0" step="1" value="${Number(f.publicOrder||0)}"></label><label><span>Lien de réservation</span><input name="bookingUrl" type="url" value="${esc(f.bookingUrl||'')}"></label><label class="v95-full"><span>Description client</span><textarea name="description">${esc(f.description||'')}</textarea></label></div><button type="submit" class="v95-secondary">Enregistrer</button></form>`;}

function bindSuppliers(body,dialog){
  body.querySelector('[data-v95-add-supplier-config]')?.addEventListener('click',()=>{body.querySelector('[data-v95-new-supplier]').innerHTML=supplierEditor({id:'',name:'Nouveau fournisseur',email:'',legalName:'',defaultNetCents:0,vatRateBps:2000,defaultGrossCents:0,notes:'',active:true});bindSuppliers(body,dialog);body.querySelector('[data-v95-new-supplier] input[name="name"]')?.select();});
  body.querySelectorAll('[data-v95-supplier-form]').forEach(form=>{if(form.dataset.boundV95)return;form.dataset.boundV95='1';form.addEventListener('submit',async event=>{event.preventDefault();const fd=new FormData(form);const button=form.querySelector('button[type="submit"]');button.disabled=true;try{dialog._v95Data=await api(SUPPLIER_SAVE_API,{id:form.dataset.v95SupplierForm,name:fd.get('name'),email:fd.get('email'),legalName:fd.get('legalName'),defaultNetCents:Math.round(Number(fd.get('netEuros')||0)*100),vatRateBps:Math.round(Number(fd.get('vatRate')||0)*100),notes:fd.get('notes'),active:fd.get('active')==='on'});financeCache.clear();renderConfiguration('suppliers');}catch(error){button.disabled=false;alert(humanError(error.message));}});});
}

function bindFormats(body,dialog){
  body.querySelector('[data-v95-add-format-config]')?.addEventListener('click',()=>{body.querySelector('[data-v95-new-format]').innerHTML=formatEditor({id:'',name:'Nouveau format',concept:'',durationLabel:'',priceCents:0,publicOrder:100,bookingUrl:'',description:'',active:true});bindFormats(body,dialog);body.querySelector('[data-v95-new-format] input[name="name"]')?.select();});
  body.querySelectorAll('[data-v95-format-form]').forEach(form=>{if(form.dataset.boundV95)return;form.dataset.boundV95='1';form.addEventListener('submit',async event=>{event.preventDefault();const fd=new FormData(form);const button=form.querySelector('button[type="submit"]');button.disabled=true;try{dialog._v95Data=await api(FORMAT_SAVE_API,{id:form.dataset.v95FormatForm,name:fd.get('name'),concept:fd.get('concept'),durationLabel:fd.get('durationLabel'),priceCents:Math.round(Number(fd.get('priceEuros')||0)*100),publicOrder:Number(fd.get('publicOrder')||100),bookingUrl:fd.get('bookingUrl'),description:fd.get('description'),active:fd.get('active')==='on'});renderConfiguration('formats');}catch(error){button.disabled=false;alert(humanError(error.message));}});});
}

function currentOrderId(){const detail=document.getElementById('clientDetail');const dataId=detail?.dataset?.orderId||'';const hash=decodeURIComponent(location.hash.slice(1));return dataId||(!['contenus','calendrier','finances'].includes(hash)?hash:'');}
async function api(path,payload={}){const csrf=sessionStorage.getItem('neptune_csrf')||'';const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(payload)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;}
function loading(text){return `<div class="v95-loading"><span></span><p>${esc(text)}</p></div>`;}
function errorCard(code,text){return `<div class="v95-error"><strong>${esc(text)}</strong><p>${esc(humanError(code))}</p></div>`;}
function humanError(code){return ({supplier_invoice_required_before_payment:'La facture doit être enregistrée avant le virement.',invoice_reference_required:'Ajoutez un numéro de facture ou un lien vers la facture.',payment_reference_required:'Ajoutez la référence du virement.',supplier_email_missing:'Ce fournisseur n’a pas d’adresse e-mail de facturation.',client_not_found:'Compte client introuvable.'})[code]||String(code||'Une erreur est survenue.').replaceAll('_',' ');}
function statusLabel(value){return ({completed:'Terminé',delivered:'Livré',editing:'Montage',approval:'Validation',videos_received:'Sources reçues',videos_pending:'Sources attendues',filmed:'Passage réalisé',filming_confirmed:'Passage confirmé',filming_scheduled:'Passage planifié',preparation_complete:'Préparation terminée',appointment_confirmed:'Préparation réservée',appointment_booked:'Préparation réservée',payment_confirmed:'Paiement reçu'})[value]||String(value||'En cours').replaceAll('_',' ');}
function paymentLabel(value){return ['paid','succeeded','complete','completed','no_payment_required'].includes(String(value||''))?'Réglé':'À suivre';}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(cents||0)/100);}
function date(value){try{return new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return '—';}}
function cssEsc(value){return globalThis.CSS?.escape?CSS.escape(String(value)):String(value).replace(/["\\]/gu,'\\$&');}
function esc(value){return String(value??'').replace(/[&<>"']/gu,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);}
