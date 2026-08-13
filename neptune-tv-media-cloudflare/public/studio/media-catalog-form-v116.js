const RELEASE='neptune-media-catalog-form-20260813-v116',API='/api/admin/media-catalog-v98/';
let model=null,loading=false;
document.body.dataset.mediaCatalogFormV116=RELEASE;
installStyles();
boot();

function boot(){
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-tab="programs"],[data-go="programs"],[data-c98-tab]'))setTimeout(enhance,60);
  },true);
  new MutationObserver(()=>queueMicrotask(enhance)).observe(document.body,{subtree:true,childList:true});
  enhance();
}
async function enhance(){
  const page=document.querySelector('.c98-page');if(!page)return;
  reflowPreview(page);
  ensureServicesTab(page);
  if(!model&&!loading){loading=true;try{model=await post('context',{});}catch{}finally{loading=false;queueMicrotask(enhance);}return;}
  if(!model)return;
  enhanceFormatForm(document.getElementById('formatForm'));
  enhanceSupplierForm(document.getElementById('supplierForm'));
  enhanceCityForm(document.getElementById('cityForm'));
  enhanceOfferForm(document.getElementById('offerForm'));
}
function reflowPreview(page){
  const preview=document.getElementById('c98Preview'),layout=page.querySelector('.c98-layout');if(!preview||!layout||preview.closest('[data-c116-preview-panel]'))return;
  const panel=document.createElement('details');panel.className='c116-preview-panel';panel.dataset.c116PreviewPanel='1';
  const summary=document.createElement('summary');summary.innerHTML='<span><b>Aperçu du tunnel réel</b><small>Rétractable · pleine largeur</small></span><strong>Afficher / masquer</strong>';
  layout.after(panel);panel.append(summary,preview);
}
function ensureServicesTab(page){
  const tabs=page.querySelector('.c98-tabs');if(!tabs||tabs.querySelector('[data-c116-services]'))return;
  const button=document.createElement('button');button.type='button';button.dataset.c116Services='1';button.textContent='Prestations fournisseurs';
  const offers=tabs.querySelector('[data-c98-tab="offers"]');tabs.insertBefore(button,offers||null);
  button.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('neptune:catalog-services-v116')));
  tabs.querySelectorAll('[data-c98-tab]').forEach(tab=>tab.addEventListener('click',()=>button.classList.remove('is-active')));
}
async function refreshModel(){model=await post('context',{});}
async function forceReload(){
  await refreshModel();
  const content=document.getElementById('content');if(!content)return;
  content.dataset.c98='';content.replaceChildren();
  const tab=document.querySelector('[data-tab="programs"].active')||document.querySelector('[data-tab="programs"]');
  tab?.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
}

function enhanceFormatForm(form){
  if(!form||form.dataset.c116==='1')return;form.dataset.c116='1';
  const id=form.querySelector('[name="formatId"], [name="id"]')?.value||'';
  const current=(model.formats||[]).find(item=>item.id===id)||{};
  const slug=form.querySelector('[name="slug"]');if(slug){slug.readOnly=true;slug.setAttribute('aria-readonly','true');slug.closest('label')?.append(note('Automatique et verrouillé pour protéger les liens existants.'));}
  const name=form.querySelector('[name="name"]');if(name&&slug&&!id)name.addEventListener('input',()=>slug.value=slugify(name.value));
  const concept=form.querySelector('[name="concept"]');if(concept){
    const label=concept.closest('label'),select=document.createElement('select');select.name='conceptId';select.required=true;
    select.innerHTML='<option value="">Choisir…</option>'+((model.concepts||[]).filter(x=>x.active).map(x=>`<option value="${esc(x.id)}" ${x.id===current.conceptId?'selected':''}>${esc(x.label)}</option>`).join(''))+'<option value="__new__">+ Ajouter un autre concept</option>';
    const custom=document.createElement('input');custom.name='newConcept';custom.placeholder='Nouveau concept';custom.hidden=true;custom.className='c116-new-concept';
    concept.replaceWith(select);label?.append(custom);select.addEventListener('change',()=>{const show=select.value==='__new__';custom.hidden=!show;custom.required=show;if(show)custom.focus();});
  }
  const duration=form.querySelector('[name="durationLabel"]');if(duration){
    const old=duration.closest('label'),shoot=durationField('Durée de tournage','shootMinutes',Number(current.shootMinutes||parseDuration(duration.value))),total=durationField('Durée totale allouée le jour J','totalMinutes',Number(current.totalMinutes||0));
    old?.replaceWith(shoot,total);
  }
  form.onsubmit=async event=>{
    event.preventDefault();const msg=document.getElementById('formatMsg');try{
      if(msg)msg.textContent='Enregistrement…';const shoot=+form.elements.shootMinutes.value,total=+form.elements.totalMinutes.value;if(!shoot||!total)throw Error('duration_required');if(total<shoot)throw Error('duration_invalid');
      const conceptId=form.elements.conceptId?.value==='__new__'?'':form.elements.conceptId?.value||current.conceptId||'',concept=form.elements.conceptId?.value==='__new__'?form.elements.newConcept.value.trim():'';
      await post('format/save',{id,name:form.elements.name.value,conceptId,concept,shootMinutes:shoot,totalMinutes:total,description:form.elements.description?.value||'',publicOrder:+form.elements.publicOrder?.value||100,active:Boolean(form.elements.active?.checked),imageUrl:form.elements.imageUrl?.value||current.image||''});
      await forceReload();
    }catch(error){if(msg)msg.textContent=errorText(error.message);}
  };
}
function enhanceSupplierForm(form){
  if(!form||form.dataset.c116==='1')return;form.dataset.c116='1';
  for(const name of ['defaultNet','vatRate'])form.querySelector(`[name="${name}"]`)?.closest('label')?.remove();
  const grid=form.querySelector('.c98-editor-grid');if(grid){const info=document.createElement('div');info.className='c116-info c98-span-2';info.innerHTML='<strong>Tarifs séparés</strong><span>Les coûts fournisseur sont gérés par prestation et par durée dans « Prestations fournisseurs ». Un fournisseur peut donc avoir plusieurs tarifs négociés.</span>';grid.append(info);}
  const id=form.querySelector('[name="sid"], [name="id"]')?.value||'';
  form.onsubmit=async event=>{event.preventDefault();const msg=document.getElementById('supplierMsg');try{if(msg)msg.textContent='Enregistrement…';await post('supplier/save',{id,name:form.elements.name.value,email:form.elements.email?.value||'',legalName:form.elements.legalName?.value||'',notes:form.elements.notes?.value||'',active:Boolean(form.elements.active?.checked)});await forceReload();}catch(error){if(msg)msg.textContent=errorText(error.message);}};
}
function enhanceCityForm(form){
  if(!form||form.dataset.c116==='1')return;form.dataset.c116='1';
  const id=form.querySelector('[name="cid"], [name="id"]')?.value||'',slug=form.querySelector('[name="slug"]'),name=form.querySelector('[name="name"]');
  if(slug){slug.readOnly=true;slug.setAttribute('aria-readonly','true');slug.closest('label')?.append(note('Automatique et non modifiable.'));}
  if(name&&slug&&!id)name.addEventListener('input',()=>slug.value=slugify(name.value));
}
function enhanceOfferForm(form){
  if(!form||form.dataset.c116==='1')return;form.dataset.c116='1';
  for(const name of ['supplierNet','vatRate'])form.querySelector(`[name="${name}"]`)?.closest('label')?.remove();
  const city=form.elements.cityId,format=form.elements.formatId,supplier=form.elements.supplierId;if(!city||!format||!supplier)return;
  const family=(model.families||[]).find(item=>item.cityId===city.value&&item.formatId===format.value&&item.supplierId===supplier.value)||{};
  const rateLabel=document.createElement('label');rateLabel.className='c98-field c98-span-2';rateLabel.innerHTML='<span>Tarif fournisseur négocié</span><select name="supplierRateId" required></select><small data-c116-rate-help></small>';
  supplier.closest('label')?.after(rateLabel);
  const refresh=(current='')=>{
    const service=(model.services||[]).find(item=>item.active&&item.cityId===city.value&&item.formatId===format.value&&item.supplierId===supplier.value),rates=(model.supplierRates||[]).filter(item=>service&&item.serviceId===service.id&&item.active&&Number(item.durationMinutes)>0),select=form.elements.supplierRateId;
    select.innerHTML='<option value="">Choisir…</option>'+rates.map(rate=>`<option value="${esc(rate.id)}" ${rate.id===current?'selected':''}>${esc(rate.label)} · ${money(rate.netCents)} HT</option>`).join('');
    const help=form.querySelector('[data-c116-rate-help]');if(help)help.textContent=!service?'Aucune prestation active pour cette combinaison.':rates.length?'Le coût fournisseur est repris automatiquement depuis ce tarif.':'Ajoutez d’abord un tarif structuré dans « Prestations fournisseurs ».';
    const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=!rates.length;
  };
  city.addEventListener('change',()=>refresh());format.addEventListener('change',()=>refresh());supplier.addEventListener('change',()=>refresh());refresh(family.supplierRateId||'');
  form.onsubmit=async event=>{event.preventDefault();const msg=document.getElementById('offerMsg');try{if(msg)msg.textContent='Enregistrement…';if(!form.elements.supplierRateId.value)throw Error('supplier_rate_required');await post('family/save',{cityId:city.value,formatId:format.value,supplierId:supplier.value,supplierRateId:form.elements.supplierRateId.value,publicOrder:+form.elements.publicOrder?.value||100,preparationUrl:form.elements.preparationUrl?.value||'',configurationOptions:form.elements.configurationOptions?.value||'',priceSuffix:'HT',currency:'eur',active:Boolean(form.elements.active?.checked),tiers:{launch:tier(form,'launch'),promo:tier(form,'promo'),base:tier(form,'base')}});await forceReload();}catch(error){if(msg)msg.textContent=errorText(error.message);}};
}
function tier(form,key){return{id:form.elements[`${key}Id`]?.value||'',clientPriceCents:Math.round((+form.elements[`${key}Price`]?.value||0)*100),paymentUrl:form.elements[`${key}Url`]?.value||''};}
function durationField(label,name,current){const wrapper=document.createElement('label');wrapper.className='c98-field';wrapper.innerHTML=`<span>${label}</span><select name="${name}" required><option value="">Choisir…</option>${durationOptions(current)}</select>`;return wrapper;}
function durationOptions(current){const values=[...(model.durationOptions||[])];if(current&&!values.some(x=>Number(x.minutes)===Number(current)))values.push({minutes:current,label:durationLabel(current)});values.sort((a,b)=>a.minutes-b.minutes);return values.map(item=>`<option value="${item.minutes}" ${Number(item.minutes)===Number(current)?'selected':''}>${esc(item.label)}</option>`).join('');}
async function post(path,payload){const response=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||`http_${response.status}`);return data;}
function note(text){const small=document.createElement('small');small.textContent=text;return small;}
function parseDuration(value){const text=String(value||'').toLowerCase(),h=text.match(/(\d+(?:[.,]\d+)?)\s*h/),m=text.match(/(\d+)\s*min/);if(h)return Math.round(Number(h[1].replace(',','.'))*60)+(m?+m[1]:0);if(m)return+m[1];return parseInt(text,10)||0;}
function durationLabel(minutes){const h=Math.floor(minutes/60),m=minutes%60;return h?(m?`${h} h ${String(m).padStart(2,'0')}`:`${h} h`):`${m} min`;}
function slugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format((Number(cents)||0)/100);}
function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function errorText(value){return ({duration_required:'Choisissez la durée de tournage et la durée totale.',duration_invalid:'La durée totale doit être supérieure ou égale à la durée de tournage.',total_duration_required:'Choisissez la durée totale allouée.',supplier_rate_required:'Choisissez un tarif fournisseur structuré.',offer_family_rate_required:'Choisissez un tarif fournisseur structuré.',active_supplier_service_required:'Créez d’abord la prestation fournisseur correspondante.',supplier_rate_invalid:'Le tarif fournisseur sélectionné est invalide.'}[value]||value||'Une erreur est survenue.');}
function installStyles(){if(document.getElementById('mediaCatalogFormV116Style'))return;const style=document.createElement('style');style.id='mediaCatalogFormV116Style';style.textContent=`.c98-layout{display:block!important;grid-template-columns:1fr!important}.c116-preview-panel{margin-top:24px;border:1px solid #e4e7ec;border-radius:18px;background:#fff;overflow:hidden}.c116-preview-panel>summary{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 20px;cursor:pointer;list-style:none}.c116-preview-panel>summary::-webkit-details-marker{display:none}.c116-preview-panel>summary span{display:flex;flex-direction:column;gap:3px}.c116-preview-panel>summary b{color:#101828}.c116-preview-panel>summary small,.c116-preview-panel>summary strong{color:#667085;font-size:.68rem}.c116-preview-panel #c98Preview{padding:0 20px 20px;min-width:0!important}.c116-preview-panel .c115-preview-device{height:clamp(620px,72vh,900px)}.c116-info{display:flex;flex-direction:column;gap:4px;padding:13px 14px;border:1px solid #d0d5dd;border-radius:12px;background:#f8fafc}.c116-info span,.c98-field small{color:#667085;font-size:.64rem;line-height:1.45}.c98-field input[readonly]{background:#f2f4f7;color:#667085;cursor:not-allowed}.c116-new-concept{margin-top:8px}`;document.head.append(style);}
