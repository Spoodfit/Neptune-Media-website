(() => {
  const RELEASE='neptune-studio-supplier-physical-formats-20260915-v190.1';
  const CONTEXT_API='/api/admin/media-catalog-v98/context';
  const SAVE_API='/api/admin/media-catalog-v190/physical-format/save';
  const ASSET_API='/api/admin/media-catalog-v98/asset/upload';
  const KEY='__neptuneSupplierPhysicalFormatsV190';
  if(window[KEY])return;window[KEY]=true;

  let context=null,loading=null,csrf='',adaptTimer=0;
  document.documentElement.dataset.neptuneSupplierPhysicalFormats=RELEASE;

  document.addEventListener('click',onClick,true);
  document.addEventListener('submit',onSubmit,true);
  new MutationObserver(scheduleAdapt).observe(document.documentElement,{subtree:true,childList:true});
  scheduleAdapt();

  function onClick(event){
    const target=event.target?.closest?.('[data-v147-list="physical"],[data-v147-new="physical"],[data-v190-physical-edit],[data-v190-physical-new],[data-v147-create-physical],[data-v190-delete]');
    if(!target)return;
    if(target.matches('[data-v190-delete]'))return consume(event,()=>deletePhysical(target.dataset.v190Delete||'',target.dataset.label||''));
    if(target.matches('[data-v147-list="physical"]'))return consume(event,renderPhysicalList);
    if(target.matches('[data-v147-new="physical"],[data-v190-physical-new]'))return consume(event,()=>openPhysicalForm());
    if(target.matches('[data-v190-physical-edit]'))return consume(event,()=>openPhysicalForm(target.dataset.v190PhysicalEdit||''));
    if(target.matches('[data-v147-create-physical]')){
      const offer=target.closest('[data-v147-form="offer"]');
      return consume(event,()=>openPhysicalForm('',{supplierId:offer?.querySelector('[name="supplierId"]')?.value||'',formatId:offer?.querySelector('[name="formatId"]')?.value||''}));
    }
  }

  function onSubmit(event){
    const form=event.target?.closest?.('[data-v190-form="physical"]');if(!form)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    savePhysical(form).catch(error=>showFormError(form,error));
  }

  function consume(event,fn){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();Promise.resolve().then(fn).catch(showFatal)}
  function scheduleAdapt(){clearTimeout(adaptTimer);adaptTimer=setTimeout(()=>{adaptHubCount();adaptOfferForm().catch(()=>{});},60)}

  async function adaptHubCount(){
    const card=document.querySelector('#v147CatalogManager [data-v147-list="physical"]');if(!card)return;
    try{const data=await loadContext();const count=(data.supplierPhysicalFormats||[]).filter(item=>item.active!==false).length;const badge=card.querySelector('strong');if(badge)badge.textContent=String(count);}catch{}
  }

  async function adaptOfferForm(){
    const form=document.querySelector('#v147CatalogManager [data-v147-form="offer"]');if(!form)return;
    const supplier=form.querySelector('[name="supplierId"]'),concept=form.querySelector('[name="formatId"]'),container=form.querySelector('[data-v147-format-options]');
    if(!supplier||!concept||!container)return;
    if(!form.dataset.v190Bound){
      form.dataset.v190Bound='1';
      supplier.addEventListener('change',()=>setTimeout(()=>renderOfferFormats(form,new Set()),0));
      concept.addEventListener('change',()=>setTimeout(()=>renderOfferFormats(form,new Set()),0));
    }
    const current=new Set([...form.querySelectorAll('input[name="physicalFormat"]:checked')].map(input=>String(input.value||'')));
    await renderOfferFormats(form,current);
  }

  async function renderOfferFormats(form,selected){
    const supplierId=form.querySelector('[name="supplierId"]')?.value||'',formatId=form.querySelector('[name="formatId"]')?.value||'',container=form.querySelector('[data-v147-format-options]');if(!container)return;
    if(!supplierId||!formatId){container.innerHTML='<span class="v147-hint">Choisissez d’abord un fournisseur et un concept éditorial.</span>';return;}
    const data=await loadContext(true),items=availableFormats(data,supplierId,formatId);
    if(!items.length){container.innerHTML='<span class="v147-hint">Aucun format disponible pour ce fournisseur et ce concept. Créez-en un ci-dessous.</span>';return;}
    container.innerHTML=items.map(item=>`<label><input type="checkbox" name="physicalFormat" value="${attr(item.label)}" ${selected.has(String(item.label))?'checked':''}><span>${html(item.label)}</span></label>`).join('');
  }

  async function renderPhysicalList(){
    const dialog=ensureDialog(),data=await loadContext(true),items=[...(data.supplierPhysicalFormats||[])];
    dialog.dataset.view='list-physical-v190';
    dialog.innerHTML=`<section class="v147-card"><header><div><span>CATALOGUE MÉDIA</span><h2>Formats physiques</h2><p>Chaque format appartient à un fournisseur et à un concept éditorial. Les offres ne peuvent sélectionner que les formats réellement proposés par le fournisseur choisi.</p></div><button type="button" data-v147-close aria-label="Fermer">×</button></header><div class="v147-list-head"><strong>${items.length} élément${items.length>1?'s':''}</strong><button type="button" class="primary" data-v190-physical-new>+ Nouveau format</button></div><div class="v147-list">${items.length?items.map(physicalRow).join(''):'<div class="v147-empty">Aucun format physique fournisseur pour le moment.</div>'}</div><footer><button type="button" class="quiet" data-v147-back>← Catalogue</button></footer></section>`;
    dialog.showModal?.();
  }

  function physicalRow(item){
    const sub=`${item.supplierName||'Fournisseur'} · ${item.conceptName||'Concept'}`;
    return `<button type="button" class="v147-row" data-v190-physical-edit="${attr(item.id)}"><div><strong>${html(item.label||'Sans nom')}</strong><span>${html(sub)}</span></div><em class="${item.active===false?'is-off':'is-on'}">${item.active===false?'Masqué':'Actif'}</em><b>Modifier →</b></button>`;
  }

  async function openPhysicalForm(id='',preset={}){
    const dialog=ensureDialog(),data=await loadContext(true),item=(data.supplierPhysicalFormats||[]).find(row=>String(row.id)===String(id))||null;
    const supplierId=String(preset.supplierId||item?.supplierId||''),formatId=String(preset.formatId||item?.formatId||'');
    dialog.dataset.view='physical-v190';
    dialog.innerHTML=`<form class="v147-card" data-v190-form="physical"><header><div><span>FORMAT PHYSIQUE</span><h2>${item?'Modifier le format':'Nouveau format physique'}</h2><p>Un format est une capacité réelle d’un fournisseur pour un concept : canapé, chaise, plateau, bar, sur-mesure…</p></div><button type="button" data-v147-close>×</button></header><div class="v147-form v147-two"><input type="hidden" name="id" value="${attr(item?.id||'')}"><label><span>Fournisseur</span><select name="supplierId" required>${selectOptions(data.suppliers||[],supplierId,'Choisir un fournisseur')}</select></label><label><span>Concept éditorial</span><select name="formatId" required>${selectOptions(data.formats||[],formatId,'Choisir un concept')}</select></label><label class="wide"><span>Nom du format</span><input name="label" required maxlength="80" value="${attr(item?.label||'')}" placeholder="Canapé"></label><label class="wide"><span>Description</span><textarea name="description" rows="3">${html(item?.description||'')}</textarea></label><label class="wide"><span>Visuel</span><input name="visual" type="file" accept="image/jpeg,image/png,image/webp"><small>${item?.imageUrl?'Le visuel actuel est conservé si aucun fichier n’est choisi.':'Optionnel.'}</small></label><label class="v147-toggle wide"><input type="checkbox" name="active" ${item?.active===false?'':'checked'}><span>Format disponible pour ce fournisseur</span></label></div><div class="v147-feedback" data-v147-feedback hidden></div><footer>${item?`<button type="button" class="quiet" data-v190-delete="${attr(item.id)}" data-label="${attr(item.label||'ce format')}">Supprimer</button>`:''}<button type="button" class="quiet" data-v147-list="physical">← Formats</button><button type="submit" class="primary">Enregistrer</button></footer></form>`;
    dialog.showModal?.();
  }

  async function savePhysical(form){
    const data=new FormData(form),button=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v147-feedback]');
    setBusy(button,true);try{
      const existing=(await loadContext()).supplierPhysicalFormats?.find(row=>String(row.id)===String(data.get('id')||''));
      const file=data.get('visual');let imageUrl=existing?.imageUrl||'';
      if(file&&typeof file==='object'&&Number(file.size||0)>0)imageUrl=await uploadAsset(file);
      await api(SAVE_API,{id:String(data.get('id')||''),supplierId:String(data.get('supplierId')||''),formatId:String(data.get('formatId')||''),label:String(data.get('label')||'').trim(),description:String(data.get('description')||'').trim(),imageUrl,active:data.get('active')==='on',publicOrder:Number(existing?.publicOrder||100)});
      context=null;showFeedback(feedback,'Format physique enregistré et synchronisé avec les offres du fournisseur.');setTimeout(renderPhysicalList,350);
    }finally{setBusy(button,false)}
  }

  async function deletePhysical(id,label){
    if(!id)return;
    const confirmed=window.confirm(`Supprimer définitivement « ${label||'ce format'} » ?\n\nLa suppression est autorisée uniquement si ce format n’est utilisé dans aucune offre.`);
    if(!confirmed)return;
    await api(SAVE_API,{action:'delete',id});
    context=null;
    if(window.neptuneToast)window.neptuneToast('Format physique supprimé.','success');
    await renderPhysicalList();
  }

  async function loadContext(force=false){
    if(context&&!force)return context;if(loading&&!force)return loading;
    loading=api(CONTEXT_API,{}).then(data=>{context=data;return data}).finally(()=>{loading=null});return loading;
  }

  function availableFormats(data,supplierId,formatId){return(data.supplierPhysicalFormats||[]).filter(item=>item.active!==false&&String(item.supplierId)===String(supplierId)&&String(item.formatId)===String(formatId)).sort((a,b)=>Number(a.publicOrder||100)-Number(b.publicOrder||100)||String(a.label||'').localeCompare(String(b.label||''),'fr'))}

  async function api(path,payload,retry=true){
    const token=await csrfToken(false),headers={'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache, no-store'};if(token)headers['X-CSRF-Token']=token;
    const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers,body:JSON.stringify(payload||{})}),data=await response.json().catch(()=>({}));
    if(response.status===403&&data.error==='csrf_failed'&&retry){csrf='';sessionStorage.removeItem('neptune_csrf');await csrfToken(true);return api(path,payload,false)}
    if(!response.ok)throw new Error(messageFor(data));return data;
  }

  async function csrfToken(force=false){if(csrf&&!force)return csrf;const stored=sessionStorage.getItem('neptune_csrf')||'';if(stored&&!force){csrf=stored;return csrf}const response=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'}),data=await response.json().catch(()=>({}));csrf=String(data.csrfToken||'');if(csrf)sessionStorage.setItem('neptune_csrf',csrf);return csrf}
  async function uploadAsset(file){const token=await csrfToken(false),form=new FormData();form.set('file',file);const headers={};if(token)headers['X-CSRF-Token']=token;const response=await fetch(ASSET_API,{method:'POST',credentials:'same-origin',headers,body:form}),data=await response.json().catch(()=>({}));if(!response.ok||!data.url)throw new Error('Le visuel n’a pas pu être importé.');return data.url}

  function ensureDialog(){let dialog=document.querySelector('#v147CatalogManager');if(dialog)return dialog;dialog=document.createElement('dialog');dialog.id='v147CatalogManager';dialog.className='v147-dialog';document.body.append(dialog);return dialog}
  function selectOptions(items,current,placeholder){return `<option value="">${html(placeholder)}</option>`+items.filter(item=>item.active!==false).map(item=>`<option value="${attr(item.id)}" ${String(item.id)===String(current)?'selected':''}>${html(item.name||item.label||item.id)}</option>`).join('')}
  function showFeedback(node,message){if(!node)return;node.hidden=false;node.textContent=message;node.classList.remove('error');node.classList.add('success')}
  function showFormError(form,error){const node=form?.querySelector?.('[data-v147-feedback]');if(node){node.hidden=false;node.textContent=String(error?.message||error);node.classList.remove('success');node.classList.add('error')}else showFatal(error)}
  function showFatal(error){console.error('supplier_physical_formats_v190',error);const message=String(error?.message||error||'Erreur catalogue');if(window.neptuneToast)window.neptuneToast(message,'error');else alert(message)}
  function setBusy(button,busy){if(!button)return;button.disabled=busy;button.dataset.v190Original=button.dataset.v190Original||button.textContent||'';button.textContent=busy?'Enregistrement…':button.dataset.v190Original}
  function messageFor(data){const code=String(data?.error||'');const map={supplier_physical_format_fields_required:'Fournisseur, concept et nom du format sont requis.',supplier_physical_format_reference_invalid:'Le fournisseur ou le concept n’existe plus.',supplier_physical_format_already_exists:'Ce fournisseur propose déjà un format portant ce nom pour ce concept.',supplier_physical_format_relation_in_use:'Retirez d’abord ce format des offres actives avant de changer son fournisseur ou son concept.',supplier_physical_format_used_by_active_offer:'Retirez d’abord ce format des offres actives avant de le masquer.',supplier_physical_format_unavailable:'Un format sélectionné n’est pas proposé par ce fournisseur pour ce concept.',supplier_physical_format_id_required:'Le format à supprimer est introuvable.',supplier_physical_format_not_found:'Ce format n’existe plus.',supplier_physical_format_in_use:`Ce format est encore utilisé dans ${Number(data?.usedByOffers||0)} offre(s). Retirez-le de ces offres avant de le supprimer.`};return map[code]||code||'La modification n’a pas pu être enregistrée.'}
  function html(value){return String(value??'').replace(/[&<>"']/gu,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
  function attr(value){return html(value)}
})();