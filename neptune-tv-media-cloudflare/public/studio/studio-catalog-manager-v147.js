const RELEASE='neptune-studio-catalog-manager-20260829-v147';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
const POLICY_API='/api/admin/media-catalog-v143/policies';
const CITY_API='/api/admin/media-catalog-v143/city/save';
const FAMILY_API='/api/admin/media-catalog-v143/family/save';
const SUPPLIER_API='/api/admin/media-catalog-v98/supplier/save';
const CONCEPT_API='/api/admin/media-catalog-v98/format/save';
const PHYSICAL_FORMAT_API='/api/admin/media-catalog-v98/configuration-visual/save';
const ASSET_API='/api/admin/media-catalog-v98/asset/upload';
const STRIPE_API='/api/admin/sales-config-v96/stripe-links';
const PUBLIC_CATALOG='/api/reservation/catalog-v96';
const state={context:null,policies:null,stripeLinks:[],dialog:null,csrf:'',syncAuditTimer:0,syncAuditAt:0,mountTimer:0};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

document.documentElement.dataset.neptuneCatalogManager=RELEASE;
boot();

function boot(){
  const run=()=>{scheduleMount(0);scheduleSyncAudit(180)};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
  new MutationObserver(()=>scheduleMount(35)).observe(document.body,{subtree:true,childList:true});
  window.addEventListener('hashchange',()=>{state.context=null;state.policies=null;scheduleMount(0);scheduleSyncAudit(200)});
  window.addEventListener('click',interceptVisibleActions,true);
}

function scheduleMount(delay=35){clearTimeout(state.mountTimer);state.mountTimer=setTimeout(mount,delay)}
function mount(){
  if(!catalogActive())return;
  const root=$('#studioCatalogCommercialCockpitV145');if(!root)return;
  const add=$('[data-v145-add]',root);
  if(add){add.textContent='+ Ajouter';add.title='Ajouter ou gérer une ville, un fournisseur, un concept, un format ou une offre';}
  const toolbar=$('.v145-toolbar',root);
  if(toolbar&&!$('[data-v147-manage]',toolbar)){
    const button=document.createElement('button');button.type='button';button.className='v145-btn v147-manage';button.dataset.v147Manage='1';button.textContent='Gérer';button.title='Gérer villes, fournisseurs, concepts, formats et offres';
    add?.before(button);
  }
  const explainer=$('.v146-catalog-explainer',root);if(explainer)explainer.innerHTML='<strong>Catalogue = tunnel :</strong> chaque modification est vérifiée côté client avant d’être indiquée comme synchronisée.';
  scheduleSyncAudit(250);
}
function catalogActive(){return Boolean($('#studioCatalogCommercialCockpitV145'))||String(location.hash||'').toLowerCase()==='#programs'}

function interceptVisibleActions(event){
  if(!catalogActive())return;
  const manage=event.target.closest?.('[data-v147-manage]');
  if(manage)return consume(event,()=>openHub('manage'));
  const add=event.target.closest?.('[data-v145-add]');
  if(add)return consume(event,()=>openHub('add'));
  const configure=event.target.closest?.('[data-v145-configure]');
  if(configure)return consume(event,()=>openOfferByKey(configure.dataset.v145Configure));
  const quickCity=event.target.closest?.('[data-v145-new-city-offer]');
  if(quickCity)return consume(event,()=>openOfferForm(null,{cityId:quickCity.dataset.v145NewCityOffer}));
  const action=event.target.closest?.('[data-v145-action]');
  if(!action)return;
  const code=action.dataset.v145Action||'';
  if(code==='city-edit')return consume(event,()=>openCityForm(action.dataset.cityId));
  if(code==='city-offer')return consume(event,()=>openOfferForm(null,{cityId:action.dataset.cityId}));
  if(code==='supplier-edit')return consume(event,()=>openSupplierForm(action.dataset.supplierId));
  if(code==='supplier-offer')return consume(event,()=>openOfferForm(null,{cityId:action.dataset.cityId,supplierId:action.dataset.supplierId}));
  if(code==='offer-edit')return consume(event,()=>openOfferByKey(action.dataset.offerKey));
  if(code==='offer-format')return consume(event,()=>openPhysicalFormatForm(null,{familyKey:action.dataset.offerKey}));
}
function consume(event,fn){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();Promise.resolve().then(fn).catch(showFatal)}

async function openHub(mode='manage'){
  await loadAll(true);
  const dialog=ensureDialog();
  dialog.dataset.view='hub';
  const adding=mode==='add';
  dialog.innerHTML=`<section class="v147-card v147-hub"><header><div><span>CATALOGUE MÉDIA</span><h2>${adding?'Qu’est-ce que vous ajoutez ?':'Gérer le catalogue'}</h2><p>Une seule interface pour les données qui alimentent réellement le tunnel de vente.</p></div><button type="button" data-v147-close aria-label="Fermer">×</button></header><div class="v147-grid">
    ${hubButton('city','Ville','Créer, renommer ou masquer une ville.',cities().length)}
    ${hubButton('supplier','Fournisseur','Coordonnées, coût de référence et TVA.',suppliers().length)}
    ${hubButton('concept','Concept éditorial','Nom, ligne éditoriale, durée et visuel.',concepts().length)}
    ${hubButton('physical','Format physique','Chaise, canapé, plateau, bar, sur-mesure…',physicalFormats().length)}
    ${hubButton('offer','Offre dans le tunnel','Ville + fournisseur + concept + formats + prix Stripe.',families().length)}
  </div><footer><span data-v147-sync-summary>${syncSummaryText()}</span><button type="button" class="quiet" data-v147-close>Fermer</button></footer></section>`;
  bindDialog(dialog);showDialog(dialog);
}
function hubButton(kind,title,description,count){return `<button type="button" class="v147-hub-action" data-v147-list="${kind}"><span>${html(title)}</span><strong>${count}</strong><small>${html(description)}</small></button>`}

async function openList(kind){
  await loadAll(true);const dialog=ensureDialog(),meta=kindMeta(kind),items=listItems(kind);
  dialog.dataset.view=`list-${kind}`;
  dialog.innerHTML=`<section class="v147-card"><header><div><span>CATALOGUE MÉDIA</span><h2>${html(meta.title)}</h2><p>${html(meta.help)}</p></div><button type="button" data-v147-close aria-label="Fermer">×</button></header><div class="v147-list-head"><strong>${items.length} élément${items.length>1?'s':''}</strong><button type="button" class="primary" data-v147-new="${kind}">+ ${html(meta.add)}</button></div><div class="v147-list">${items.length?items.map(item=>listRow(kind,item)).join(''):'<div class="v147-empty">Aucun élément pour le moment.</div>'}</div><footer><button type="button" class="quiet" data-v147-back>← Catalogue</button></footer></section>`;
  bindDialog(dialog);showDialog(dialog);
}
function kindMeta(kind){return({city:{title:'Villes',help:'Les villes proposées au client.',add:'Nouvelle ville'},supplier:{title:'Fournisseurs',help:'Les prestataires réellement disponibles.',add:'Nouveau fournisseur'},concept:{title:'Concepts éditoriaux',help:'Les émissions / concepts proposés.',add:'Nouveau concept'},physical:{title:'Formats physiques',help:'Les configurations visibles dans une offre.',add:'Nouveau format'},offer:{title:'Offres du tunnel',help:'Ce qui est effectivement achetable côté client.',add:'Nouvelle offre'}})[kind]}
function listItems(kind){if(kind==='city')return cities();if(kind==='supplier')return suppliers();if(kind==='concept')return concepts();if(kind==='physical')return physicalFormats();return families()}
function listRow(kind,item){
  if(kind==='city')return row(item.name,item.country||'France',item.active!==false,'city',item.id);
  if(kind==='supplier')return row(item.name,item.email||money(Number(item.defaultNetCents||0)),item.active!==false,'supplier',item.id);
  if(kind==='concept')return row(item.name,item.concept||item.description||'Concept éditorial',item.active!==false,'concept',item.id);
  if(kind==='physical')return row(item.label,item.conceptName||'Format physique',true,'physical',item.key);
  const city=cityById(item.cityId),supplier=supplierById(item.supplierId),concept=conceptById(item.formatId);
  return row(concept?.name||item.formatName||'Offre',`${city?.name||item.cityName||'Ville'} · ${supplier?.name||item.supplierName||'Fournisseur'}`,item.active!==false,'offer',familyKey(item));
}
function row(title,sub,active,kind,id){return `<button type="button" class="v147-row" data-v147-edit="${kind}" data-v147-id="${attr(id)}"><div><strong>${html(title||'Sans nom')}</strong><span>${html(sub||'')}</span></div><em class="${active?'is-on':'is-off'}">${active?'Actif':'Masqué'}</em><b>Modifier →</b></button>`}

async function openCityForm(id=''){
  await loadAll();const item=cities().find(x=>String(x.id)===String(id))||null,dialog=ensureDialog();
  dialog.innerHTML=`<form class="v147-card" data-v147-form="city"><header><div><span>VILLE</span><h2>${item?'Modifier la ville':'Nouvelle ville'}</h2><p>Une ville active n’apparaît dans le tunnel que si elle possède au moins une offre vendable.</p></div><button type="button" data-v147-close>×</button></header><div class="v147-form"><input type="hidden" name="id" value="${attr(item?.id||'')}"><label><span>Ville</span><input name="name" required value="${attr(item?.name||'')}" placeholder="Toulouse"></label><label><span>Pays</span><input name="country" value="${attr(item?.country||'France')}"></label><label class="v147-toggle"><input type="checkbox" name="active" ${item?.active===false?'':'checked'}><span>Ville active</span></label></div><div class="v147-feedback" data-v147-feedback hidden></div><footer><button type="button" class="quiet" data-v147-back-list="city">← Villes</button><button type="submit" class="primary">Enregistrer</button></footer></form>`;
  bindDialog(dialog);showDialog(dialog);
}

async function openSupplierForm(id=''){
  await loadAll();const item=suppliers().find(x=>String(x.id)===String(id))||null,dialog=ensureDialog();
  dialog.innerHTML=`<form class="v147-card" data-v147-form="supplier"><header><div><span>FOURNISSEUR</span><h2>${item?'Modifier le fournisseur':'Nouveau fournisseur'}</h2><p>Le coût de référence sert de plancher de sécurité aux offres.</p></div><button type="button" data-v147-close>×</button></header><div class="v147-form v147-two"><input type="hidden" name="id" value="${attr(item?.id||'')}"><label><span>Nom</span><input name="name" required value="${attr(item?.name||'')}"></label><label><span>E-mail</span><input name="email" type="email" value="${attr(item?.email||'')}"></label><label><span>Raison sociale</span><input name="legalName" value="${attr(item?.legalName||'')}"></label><label><span>Coût fournisseur HT</span><input name="defaultNet" type="number" min="0" step="0.01" value="${num(Number(item?.defaultNetCents||0)/100)}"></label><label><span>TVA %</span><input name="vatRate" type="number" min="0" max="100" step="0.1" value="${num(Number(item?.vatRateBps??2000)/100)}"></label><label class="v147-toggle"><input type="checkbox" name="active" ${item?.active===false?'':'checked'}><span>Fournisseur actif</span></label></div><div class="v147-feedback" data-v147-feedback hidden></div><footer><button type="button" class="quiet" data-v147-back-list="supplier">← Fournisseurs</button><button type="submit" class="primary">Enregistrer</button></footer></form>`;
  bindDialog(dialog);showDialog(dialog);
}

async function openConceptForm(id=''){
  await loadAll();const item=concepts().find(x=>String(x.id)===String(id))||null,dialog=ensureDialog();
  dialog.innerHTML=`<form class="v147-card" data-v147-form="concept"><header><div><span>CONCEPT ÉDITORIAL</span><h2>${item?'Modifier le concept':'Nouveau concept'}</h2><p>Le concept est l’émission ou la promesse éditoriale. Les formats physiques se gèrent séparément.</p></div><button type="button" data-v147-close>×</button></header><div class="v147-form v147-two"><input type="hidden" name="id" value="${attr(item?.id||'')}"><label><span>Nom du concept</span><input name="name" required value="${attr(item?.name||'')}"></label><label><span>Ligne éditoriale</span><input name="concept" value="${attr(item?.concept||'')}"></label><label class="wide"><span>Description</span><textarea name="description" rows="3">${html(item?.description||'')}</textarea></label><label><span>Durée du passage (min)</span><input name="shootMinutes" type="number" min="5" max="600" value="${num(item?.shootMinutes||60)}"></label><label><span>Temps total (min)</span><input name="totalMinutes" type="number" min="5" max="900" value="${num(item?.totalMinutes||90)}"></label><label class="wide"><span>Remplacer le visuel</span><input name="visual" type="file" accept="image/jpeg,image/png,image/webp"><small>${item?.image?`Visuel actuel conservé si aucun fichier n’est choisi.`:'JPG, PNG ou WebP.'}</small></label><label class="v147-toggle"><input type="checkbox" name="active" ${item?.active===false?'':'checked'}><span>Concept actif</span></label></div><div class="v147-feedback" data-v147-feedback hidden></div><footer><button type="button" class="quiet" data-v147-back-list="concept">← Concepts</button><button type="submit" class="primary">Enregistrer</button></footer></form>`;
  bindDialog(dialog);showDialog(dialog);
}

async function openPhysicalFormatForm(key='',opts={}){
  await loadAll();let item=physicalFormats().find(x=>x.key===key)||null;const presetFamily=opts.familyKey?familyByKey(opts.familyKey):item?.familyKey?familyByKey(item.familyKey):null,conceptId=item?.conceptId||presetFamily?.formatId||'',dialog=ensureDialog();
  const familyChoice=!item&&!presetFamily?`<label><span>Offre à laquelle rattacher ce format</span><select name="familyKey" required><option value="">Choisir une offre</option>${families().map(f=>{const city=cityById(f.cityId),supplier=supplierById(f.supplierId),concept=conceptById(f.formatId);return `<option value="${attr(familyKey(f))}">${html(city?.name||f.cityName||'Ville')} · ${html(concept?.name||f.formatName||'Concept')} · ${html(supplier?.name||f.supplierName||'Fournisseur')}</option>`}).join('')}</select><small>Un format physique doit appartenir à au moins une offre réelle pour exister dans le catalogue.</small></label>`:`<label><span>Concept associé</span><input value="${attr(conceptById(conceptId)?.name||presetFamily?.formatName||'Concept')}" disabled><input type="hidden" name="conceptId" value="${attr(conceptId)}"></label>`;
  dialog.innerHTML=`<form class="v147-card" data-v147-form="physical" data-family-key="${attr(opts.familyKey||item?.familyKey||'')}"><header><div><span>FORMAT PHYSIQUE</span><h2>${item?'Modifier le format':'Nouveau format physique'}</h2><p>Exemples : chaise, canapé, plateau, bar, sur-mesure. Ce n’est pas un concept éditorial.</p></div><button type="button" data-v147-close>×</button></header><div class="v147-form">${familyChoice}<label><span>Nom du format</span><input name="label" required value="${attr(item?.label||'')}" ${item?'readonly':''} placeholder="Canapé"></label><label><span>Description</span><textarea name="description" rows="3">${html(item?.description||'')}</textarea></label><label><span>Visuel</span><input name="visual" type="file" accept="image/jpeg,image/png,image/webp"><small>${item?.image?'Le visuel actuel reste si aucun fichier n’est choisi.':'Optionnel.'}</small></label></div><div class="v147-feedback" data-v147-feedback hidden></div><footer><button type="button" class="quiet" data-v147-back-list="physical">← Formats</button><button type="submit" class="primary">Enregistrer</button></footer></form>`;
  bindDialog(dialog);showDialog(dialog);
}
async function openOfferByKey(key){await loadAll(true);const family=familyByKey(key);if(!family)return showFatal(new Error('Offre introuvable dans le catalogue.'));return openOfferForm(family)}
async function openOfferForm(family=null,preset={}){
  await loadAll(true);await loadStripeLinks();const dialog=ensureDialog(),cityId=String(preset.cityId||family?.cityId||''),supplierId=String(preset.supplierId||family?.supplierId||''),conceptId=String(family?.formatId||'');
  const available=physicalFormatsForConcept(conceptId),selected=new Set((family?.configurationOptions||[]).map(String));
  dialog.innerHTML=`<form class="v147-card v147-offer-form" data-v147-form="offer" data-family-key="${attr(family?familyKey(family):'')}"><header><div><span>OFFRE · TUNNEL</span><h2>${family?'Configurer l’offre':'Nouvelle offre'}</h2><p>Ce formulaire écrit directement dans la source du tunnel puis vérifie le résultat public avant d’afficher “Synchronisé”.</p></div><button type="button" data-v147-close>×</button></header><div class="v147-form v147-two"><label><span>Ville</span><select name="cityId" required>${options(cities(),cityId,'Choisir une ville')}</select></label><label><span>Fournisseur</span><select name="supplierId" required>${options(suppliers(),supplierId,'Choisir un fournisseur')}</select></label><label class="wide"><span>Concept éditorial</span><select name="formatId" required>${options(concepts(),conceptId,'Choisir un concept')}</select></label><div class="wide v147-physical-picker"><span>Formats physiques disponibles dans cette offre</span><div data-v147-format-options>${renderPhysicalChecks(available,selected)}</div><button type="button" class="quiet-link" data-v147-create-physical>+ Créer un format physique</button></div><label><span>Coût fournisseur HT</span><input name="supplierNet" type="number" min="0" step="0.01" value="${num(Number(family?.supplierNetCents||supplierById(supplierId)?.defaultNetCents||0)/100)}"></label><label><span>TVA %</span><input name="vatRate" type="number" min="0" max="100" step="0.1" value="${num(Number(family?.vatRateBps??supplierById(supplierId)?.vatRateBps??2000)/100)}"></label><label class="v147-toggle wide"><input type="checkbox" name="active" ${family?.active===false?'':'checked'}><span>Offre active dans le tunnel</span></label></div><section class="v147-tiers"><h3>Prix et liens Stripe</h3><p>Le tarif de base suffit. Lancement et préférentiel sont optionnels.</p>${['launch','promo','base'].map(key=>tierRow(key,family)).join('')}</section><div class="v147-feedback" data-v147-feedback hidden></div><footer><button type="button" class="quiet" data-v147-back-list="offer">← Offres</button><button type="submit" class="primary">Enregistrer et vérifier le tunnel →</button></footer></form>`;
  bindDialog(dialog);bindOfferForm(dialog.querySelector('[data-v147-form="offer"]'));showDialog(dialog);
}

function tierRow(key,family){const meta={launch:'Lancement',promo:'Préférentiel',base:'Base'}[key],offer=family?.tiers?.[key]||{},policy=policyFor(offer.id),visible=family?(policy?policy.visible!==false:offer.active!==false):key==='base',price=Number(offer.clientPriceCents||0)/100,url=offer.paymentUrl||'',capacity=policy?Number(policy.capacity||0):(key==='launch'?3:key==='promo'?7:0);return `<div class="v147-tier" data-tier="${key}"><label class="v147-toggle"><input type="checkbox" name="${key}_visible" ${visible?'checked':''}><span>${meta}</span></label><label><span>Prix client TTC</span><input name="${key}_price" type="number" min="0" step="0.01" value="${num(price)}"></label><label><span>Lien Stripe</span><input name="${key}_url" type="url" value="${attr(url)}" placeholder="https://buy.stripe.com/…"></label><label><span>Places</span><input name="${key}_capacity" type="number" min="0" step="1" value="${capacity}"><small>0 = illimité</small></label>${stripeLinksSelect(key,url)}</div>`}
function stripeLinksSelect(key,currentUrl){if(!state.stripeLinks.length)return'';return `<label class="v147-stripe-pick"><span>Reprendre un lien Stripe existant</span><select data-v147-stripe-pick="${key}"><option value="">Choisir…</option>${state.stripeLinks.map(link=>`<option value="${attr(link.id)}" data-url="${attr(link.url)}" data-price="${Number(link.amountTotal||0)/100}" ${link.url===currentUrl?'selected':''}>${html(link.label||link.id)} · ${money(Number(link.amountTotal||0))}</option>`).join('')}</select></label>`}
function bindOfferForm(form){if(!form)return;form.querySelector('[name="formatId"]')?.addEventListener('change',()=>updateOfferFormats(form));form.querySelector('[name="supplierId"]')?.addEventListener('change',()=>fillSupplierDefaults(form));for(const select of form.querySelectorAll('[data-v147-stripe-pick]'))select.addEventListener('change',()=>applyStripeChoice(form,select));for(const box of form.querySelectorAll('.v147-tier input[type="checkbox"]'))box.addEventListener('change',()=>toggleTier(form,box));for(const box of form.querySelectorAll('.v147-tier input[type="checkbox"]'))toggleTier(form,box)}
function updateOfferFormats(form){const conceptId=form.querySelector('[name="formatId"]')?.value||'',selected=new Set();form.querySelector('[data-v147-format-options]').innerHTML=renderPhysicalChecks(physicalFormatsForConcept(conceptId),selected)}
function fillSupplierDefaults(form){const supplier=supplierById(form.querySelector('[name="supplierId"]')?.value||'');if(!supplier)return;const net=form.querySelector('[name="supplierNet"]'),vat=form.querySelector('[name="vatRate"]');if(net&&!net.value)net.value=num(Number(supplier.defaultNetCents||0)/100);if(vat)vat.value=num(Number(supplier.vatRateBps??2000)/100)}
function applyStripeChoice(form,select){const option=select.selectedOptions?.[0],key=select.dataset.v147StripePick;if(!option||!key)return;const url=form.querySelector(`[name="${key}_url"]`),price=form.querySelector(`[name="${key}_price"]`);if(option.dataset.url&&url)url.value=option.dataset.url;if(option.dataset.price&&price)price.value=option.dataset.price}
function toggleTier(form,box){const tier=box.closest('.v147-tier');if(!tier)return;for(const input of tier.querySelectorAll('input:not([type="checkbox"]),select'))input.disabled=!box.checked}
function renderPhysicalChecks(items,selected){if(!items.length)return'<span class="v147-hint">Aucun format physique pour ce concept. Créez-en un ci-dessous.</span>';return items.map(item=>`<label><input type="checkbox" name="physicalFormat" value="${attr(item.label)}" ${selected.has(String(item.label))?'checked':''}><span>${html(item.label)}</span></label>`).join('')}

function bindDialog(dialog){
  dialog.onclick=event=>{
    if(event.target===dialog)return closeDialog();
    if(event.target.closest('[data-v147-close]'))return closeDialog();
    if(event.target.closest('[data-v147-back]'))return openHub('manage');
    const backList=event.target.closest('[data-v147-back-list]');if(backList)return openList(backList.dataset.v147BackList);
    const list=event.target.closest('[data-v147-list]');if(list)return openList(list.dataset.v147List);
    const add=event.target.closest('[data-v147-new]');if(add)return openNew(add.dataset.v147New);
    const edit=event.target.closest('[data-v147-edit]');if(edit)return openEdit(edit.dataset.v147Edit,edit.dataset.v147Id);
    const createPhysical=event.target.closest('[data-v147-create-physical]');if(createPhysical){const form=createPhysical.closest('[data-v147-form="offer"]'),familyKeyValue=form?.dataset.familyKey||'';return openPhysicalFormatForm('',{familyKey:familyKeyValue});}
  };
  dialog.onsubmit=event=>{event.preventDefault();saveForm(event.target).catch(error=>showFormError(event.target,error));};
}
function openNew(kind){if(kind==='city')return openCityForm();if(kind==='supplier')return openSupplierForm();if(kind==='concept')return openConceptForm();if(kind==='physical')return openPhysicalFormatForm();return openOfferForm()}
function openEdit(kind,id){if(kind==='city')return openCityForm(id);if(kind==='supplier')return openSupplierForm(id);if(kind==='concept')return openConceptForm(id);if(kind==='physical')return openPhysicalFormatForm(id);return openOfferByKey(id)}
async function saveForm(form){const kind=form.dataset.v147Form;if(kind==='city')return saveCity(form);if(kind==='supplier')return saveSupplier(form);if(kind==='concept')return saveConcept(form);if(kind==='physical')return savePhysical(form);if(kind==='offer')return saveOffer(form)}

async function saveCity(form){const data=new FormData(form),button=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v147-feedback]');setBusy(button,true);const name=String(data.get('name')||'').trim();if(!name)throw new Error('Le nom de la ville est requis.');let geo=null;if(!data.get('id'))geo=await resolveCity(name);await api(CITY_API,{id:String(data.get('id')||''),name:geo?.name||name,country:String(data.get('country')||'France'),active:data.get('active')==='on',latitude:geo?.lat??null,longitude:geo?.lng??null,geoSource:geo?'geo.api.gouv.fr':'manual'});await afterMutation('Ville enregistrée.',feedback);setBusy(button,false);setTimeout(()=>openList('city'),450)}
async function saveSupplier(form){const data=new FormData(form),button=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v147-feedback]');setBusy(button,true);await api(SUPPLIER_API,{id:String(data.get('id')||''),name:String(data.get('name')||'').trim(),email:String(data.get('email')||'').trim(),legalName:String(data.get('legalName')||'').trim(),defaultNetCents:Math.round(Number(data.get('defaultNet')||0)*100),vatRateBps:Math.round(Number(data.get('vatRate')||20)*100),notes:'',active:data.get('active')==='on'});await afterMutation('Fournisseur enregistré.',feedback);setBusy(button,false);setTimeout(()=>openList('supplier'),450)}
async function saveConcept(form){const data=new FormData(form),button=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v147-feedback]');setBusy(button,true);const current=conceptById(data.get('id')),file=data.get('visual');let imageUrl=current?.image||current?.imageUrl||'';if(file&&typeof file==='object'&&Number(file.size||0)>0)imageUrl=await uploadAsset(file);await api(CONCEPT_API,{id:String(data.get('id')||''),name:String(data.get('name')||'').trim(),concept:String(data.get('concept')||'').trim(),description:String(data.get('description')||'').trim(),shootMinutes:Number(data.get('shootMinutes')||60),totalMinutes:Number(data.get('totalMinutes')||90),imageUrl,active:data.get('active')==='on',publicOrder:Number(current?.publicOrder||100)});await afterMutation('Concept enregistré.',feedback);setBusy(button,false);setTimeout(()=>openList('concept'),450)}
async function savePhysical(form){const data=new FormData(form),button=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v147-feedback]');setBusy(button,true);const linkedKey=String(form.dataset.familyKey||data.get('familyKey')||''),linkedFamily=linkedKey?familyByKey(linkedKey):null,conceptId=String(data.get('conceptId')||linkedFamily?.formatId||''),label=String(data.get('label')||'').trim();if(!linkedFamily&&!physicalFormats().some(item=>item.conceptId===conceptId&&item.label===label))throw new Error('Choisissez l’offre à laquelle rattacher ce format physique.');if(!conceptId||!label)throw new Error('Le concept et le nom du format physique sont requis.');const existing=physicalFormats().find(item=>item.conceptId===conceptId&&item.label===label),file=data.get('visual');let imageUrl=existing?.image||'';if(file&&typeof file==='object'&&Number(file.size||0)>0)imageUrl=await uploadAsset(file);await api(PHYSICAL_FORMAT_API,{formatId:conceptId,label,imageUrl,description:String(data.get('description')||'').trim()});if(linkedFamily){const labels=unique([...(linkedFamily.configurationOptions||[]).map(String),label]);await saveFamilyPreservingTiers(linkedFamily,labels);}await afterMutation('Format physique enregistré.',feedback);setBusy(button,false);setTimeout(()=>openList('physical'),450)}
async function saveOffer(form){
  const data=new FormData(form),button=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v147-feedback]');setBusy(button,true,'Enregistrement…');
  const existing=familyByKey(form.dataset.familyKey||''),cityId=String(data.get('cityId')||''),supplierId=String(data.get('supplierId')||''),formatId=String(data.get('formatId')||''),labels=data.getAll('physicalFormat').map(String),active=data.get('active')==='on';
  if(!cityId||!supplierId||!formatId)throw new Error('Ville, fournisseur et concept sont requis.');if(!labels.length)throw new Error('Sélectionnez au moins un format physique.');
  const net=Math.round(Number(data.get('supplierNet')||0)*100),vat=Math.round(Number(data.get('vatRate')||20)*100),gross=net+Math.round(net*vat/10000),tiers={};
  for(const key of ['launch','promo','base']){const visible=data.get(`${key}_visible`)==='on',price=Math.round(Number(data.get(`${key}_price`)||0)*100),paymentUrl=String(data.get(`${key}_url`)||'').trim(),capacity=Math.max(0,Math.round(Number(data.get(`${key}_capacity`)||0)));if(visible&&!/^https:\/\//iu.test(paymentUrl))throw new Error(`Ajoutez un lien Stripe valide pour le tarif ${tierLabel(key)}.`);if(visible&&price<gross)throw new Error(`Le tarif ${tierLabel(key)} doit être au minimum de ${money(gross)} TTC.`);tiers[key]={id:existing?.tiers?.[key]?.id||'',visible,clientPriceCents:price,paymentUrl,capacity};}
  if(active&&!Object.values(tiers).some(tier=>tier.visible))throw new Error('Gardez au moins un tarif visible pour une offre active.');
  const saved=await api(FAMILY_API,{cityId,formatId,supplierId,supplierNetCents:net,vatRateBps:vat,configurationOptions:labels,active,tiers});
  feedback.hidden=false;feedback.className='v147-feedback';feedback.innerHTML='<strong>Enregistré. Vérification du tunnel…</strong>';
  const verified=await verifyTunnelFamily({cityId,formatId,active,tiers,savedTierIds:saved.savedTierIds||{}});if(!verified){setSyncState('error');throw new Error('La source admin est enregistrée mais le tunnel public ne reflète pas encore exactement cette offre. Neptune ne l’annonce pas comme synchronisée.');}
  await afterMutation('Offre enregistrée et vérifiée dans le tunnel ✓',feedback,true);setBusy(button,false,'Enregistrer et vérifier le tunnel →');setTimeout(()=>openList('offer'),650);
}
async function saveFamilyPreservingTiers(family,labels){const tiers={};for(const key of ['launch','promo','base']){const offer=family.tiers?.[key]||{},policy=policyFor(offer.id);tiers[key]={id:offer.id||'',visible:policy?policy.visible!==false:offer.active!==false,clientPriceCents:Number(offer.clientPriceCents||0),paymentUrl:offer.paymentUrl||'',capacity:Number(policy?.capacity||0)}}return api(FAMILY_API,{cityId:family.cityId,formatId:family.formatId,supplierId:family.supplierId,supplierNetCents:Number(family.supplierNetCents||0),vatRateBps:Number(family.vatRateBps||2000),configurationOptions:labels,active:family.active!==false,tiers})}

async function afterMutation(message,feedback,alreadyVerified=false){state.context=null;state.policies=null;await loadAll(true);if(feedback){feedback.hidden=false;feedback.className='v147-feedback is-success';feedback.innerHTML=`<strong>${html(message)}</strong>`}document.getElementById('refresh')?.click();if(alreadyVerified)setSyncState('ok');else scheduleSyncAudit(80)}

async function auditSync(){
  if(!catalogActive()||Date.now()-state.syncAuditAt<1500)return;state.syncAuditAt=Date.now();setSyncState('checking');
  try{await loadAll(true);const publicData=await getPublicCatalog(),publicIds=publicOfferIds(publicData),known=new Set();let ok=true;
    for(const family of families())for(const key of ['launch','promo','base']){const offer=family.tiers?.[key];if(!offer?.id)continue;known.add(String(offer.id));const policy=policyFor(offer.id),expected=family.active!==false&&(policy?policy.visible!==false:offer.active!==false);if(expected!==publicIds.has(String(offer.id)))ok=false;}
    for(const id of publicIds)if(!known.has(id))ok=false;
    setSyncState(ok?'ok':'error');
  }catch{setSyncState('error')}
}
function scheduleSyncAudit(delay=250){clearTimeout(state.syncAuditTimer);state.syncAuditTimer=setTimeout(auditSync,delay)}
function setSyncState(mode){const badge=$('#syncState');if(!badge)return;badge.dataset.catalogSync=mode;if(mode==='checking')badge.innerHTML='<i></i> Vérification tunnel…';else if(mode==='ok')badge.innerHTML='<i></i> Tunnel synchronisé';else badge.innerHTML='<i></i> Tunnel à vérifier'}
function syncSummaryText(){const mode=$('#syncState')?.dataset.catalogSync;return mode==='ok'?'✓ Tunnel synchronisé':mode==='error'?'⚠ Tunnel à vérifier':'Vérification du tunnel en cours…'}
async function verifyTunnelFamily({cityId,formatId,active,tiers,savedTierIds}){for(let attempt=0;attempt<6;attempt++){const data=await getPublicCatalog(`v147=${Date.now()}-${attempt}`),ids=publicOfferIdsFor(data,cityId,formatId);let ok=true;for(const key of ['launch','promo','base']){const id=String(savedTierIds[key]||tiers[key]?.id||'');if(!id)continue;const expected=active&&tiers[key]?.visible===true;if(expected!==ids.has(id)){ok=false;break}}if(ok)return true;await wait(300)}return false}
async function getPublicCatalog(query='v147=sync'){const response=await fetch(`${PUBLIC_CATALOG}?${query}`,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache, no-store'}}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Tunnel HTTP ${response.status}`);return data}
function publicOfferIds(data){const ids=new Set();for(const city of data.cities||[])for(const format of city.formats||[])for(const offer of format.offers||[])if(offer?.id)ids.add(String(offer.id));return ids}
function publicOfferIdsFor(data,cityId,formatId){const city=(data.cities||[]).find(item=>String(item.id)===String(cityId)),format=(city?.formats||[]).find(item=>String(item.id)===String(formatId));return new Set((format?.offers||[]).map(offer=>String(offer.id||'')).filter(Boolean))}

async function loadAll(force=false){await Promise.all([loadContext(force),loadPolicies(force)]);return state.context}
async function loadContext(force=false){if(state.context&&!force)return state.context;state.context=await api(CONTEXT_API,{});return state.context}
async function loadPolicies(force=false){if(state.policies&&!force)return state.policies;try{state.policies=await api(POLICY_API,{})}catch{state.policies={offerPolicies:[]}}return state.policies}
async function loadStripeLinks(){try{const data=await api(STRIPE_API,{});state.stripeLinks=Array.isArray(data.links)?data.links.filter(link=>link?.url&&Number(link.amountTotal)>0):[]}catch{state.stripeLinks=[]}return state.stripeLinks}
async function api(path,payload,retry=true){const token=await csrfToken(false),headers={'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache, no-store'};if(token)headers['X-CSRF-Token']=token;const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers,body:JSON.stringify(payload||{})}),data=await response.json().catch(()=>({}));if(response.status===403&&data.error==='csrf_failed'&&retry){state.csrf='';await csrfToken(true);return api(path,payload,false)}if(!response.ok)throw new Error(messageFor(data.error)||data.error||`HTTP ${response.status}`);return data}
async function csrfToken(force=false){if(state.csrf&&!force)return state.csrf;const stored=sessionStorage.getItem('neptune_csrf')||'';if(stored&&!force){state.csrf=stored;return stored}try{const response=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'}),data=await response.json().catch(()=>({}));state.csrf=String(data.csrfToken||'');if(state.csrf)sessionStorage.setItem('neptune_csrf',state.csrf)}catch{state.csrf=''}return state.csrf}
async function uploadAsset(file){const token=await csrfToken(false),form=new FormData();form.set('file',file);const headers={};if(token)headers['X-CSRF-Token']=token;const response=await fetch(ASSET_API,{method:'POST',credentials:'same-origin',headers,body:form}),data=await response.json().catch(()=>({}));if(!response.ok||!data.url)throw new Error(messageFor(data.error)||'Le visuel n’a pas pu être importé.');return data.url}

function cities(){return state.context?.cities||[]}function suppliers(){return state.context?.suppliers||[]}function concepts(){return state.context?.formats||[]}function families(){return state.context?.families||[]}
function cityById(id){return cities().find(x=>String(x.id)===String(id))}function supplierById(id){return suppliers().find(x=>String(x.id)===String(id))}function conceptById(id){return concepts().find(x=>String(x.id)===String(id))}
function familyKey(f){return String(f?.key||`${f?.cityId||''}|${f?.formatId||''}|${f?.supplierId||''}`)}function familyByKey(key){return families().find(f=>familyKey(f)===String(key))||null}
function policyFor(offerId){return(state.policies?.offerPolicies||[]).find(p=>String(p.offerId)===String(offerId))||null}
function physicalFormats(){const map=new Map();for(const visual of state.context?.configurationVisuals||[]){const concept=conceptById(visual.formatId),label=String(visual.label||'').trim();if(!label)continue;const key=`${visual.formatId}|${label}`;map.set(key,{key,conceptId:String(visual.formatId),conceptName:concept?.name||'Concept',label,image:visual.image||visual.imageUrl||'',description:visual.description||'',familyKey:''})}for(const family of families()){const concept=conceptById(family.formatId),visuals=Array.isArray(family.configurationVisuals)?family.configurationVisuals:[],byLabel=new Map(visuals.map(v=>[String(v.label||''),v]));for(const raw of family.configurationOptions||[]){const label=String(raw||'').trim();if(!label)continue;const visual=byLabel.get(label)||{},key=`${family.formatId}|${label}`,current=map.get(key)||{};map.set(key,{...current,key,conceptId:String(family.formatId),conceptName:concept?.name||family.formatName||current.conceptName||'Concept',label,image:visual.image||visual.imageUrl||current.image||'',description:visual.description||current.description||'',familyKey:current.familyKey||familyKey(family)})}}return[...map.values()].sort((a,b)=>a.conceptName.localeCompare(b.conceptName,'fr')||a.label.localeCompare(b.label,'fr'))}
function physicalFormatsForConcept(conceptId){return physicalFormats().filter(item=>item.conceptId===String(conceptId))}
function options(items,selected,placeholder){return `<option value="">${html(placeholder)}</option>${items.map(item=>`<option value="${attr(item.id)}" ${String(item.id)===String(selected)?'selected':''}>${html(item.name)}</option>`).join('')}`}
function tierLabel(key){return{launch:'de lancement',promo:'préférentiel',base:'de base'}[key]||key}
function unique(values){return[...new Set(values.filter(Boolean))]}
function num(value){const n=Number(value);return Number.isFinite(n)&&n!==0?String(Math.round(n*100)/100):''}
function money(cents){const value=Number(cents||0)/100;return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value)}
function attr(value){return html(value).replace(/`/gu,'&#96;')}
function html(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function normal(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().trim()}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

async function searchCities(q){try{const url=new URL('https://geo.api.gouv.fr/communes');url.searchParams.set('nom',q);url.searchParams.set('fields','nom,centre,codesPostaux');url.searchParams.set('boost','population');url.searchParams.set('limit','6');const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)return[];const data=await response.json();return(data||[]).map(item=>({name:item.nom,lat:Number(item.centre?.coordinates?.[1]),lng:Number(item.centre?.coordinates?.[0])})).filter(item=>item.name)}catch{return[]}}
async function resolveCity(name){const items=await searchCities(name);return items.find(item=>normal(item.name)===normal(name))||items[0]||null}

function ensureDialog(){let dialog=$('#v147CatalogManager');if(dialog)return dialog;dialog=document.createElement('dialog');dialog.id='v147CatalogManager';dialog.className='v147-dialog';document.body.append(dialog);state.dialog=dialog;return dialog}
function showDialog(dialog){if(!dialog.open)dialog.showModal()}
function closeDialog(){const dialog=ensureDialog();if(dialog.open)dialog.close();dialog.innerHTML=''}
function setBusy(button,busy,label='Enregistrement…'){if(!button)return;button.disabled=busy;if(busy){button.dataset.label=button.textContent;button.textContent=label}else button.textContent=button.dataset.label||button.textContent}
function showFormError(form,error){const feedback=form?.querySelector?.('[data-v147-feedback]');if(feedback){feedback.hidden=false;feedback.className='v147-feedback is-error';feedback.innerHTML=`<strong>${html(error.message||error)}</strong>`}const button=form?.querySelector?.('[type="submit"]');setBusy(button,false)}
function showFatal(error){console.error('[catalog-v147]',error);const dialog=ensureDialog();dialog.innerHTML=`<section class="v147-card"><header><div><span>CATALOGUE MÉDIA</span><h2>Action impossible</h2><p>${html(error?.message||error||'Erreur inconnue')}</p></div><button type="button" data-v147-close>×</button></header><footer><button type="button" class="primary" data-v147-close>Fermer</button></footer></section>`;bindDialog(dialog);showDialog(dialog)}
function messageFor(code){return({csrf_failed:'La session de sécurité a expiré. Réessayez.',client_price_below_supplier_gross:'Le prix client est inférieur au coût fournisseur TTC.',payment_url_required_launch:'Ajoutez un lien Stripe pour le tarif de lancement.',payment_url_required_promo:'Ajoutez un lien Stripe pour le tarif préférentiel.',payment_url_required_base:'Ajoutez un lien Stripe pour le tarif de base.',offer_reference_invalid:'La ville, le fournisseur ou le concept n’existe plus.',offer_family_fields_required:'Ville, fournisseur ou concept manquant.'})[String(code||'')]||''}
