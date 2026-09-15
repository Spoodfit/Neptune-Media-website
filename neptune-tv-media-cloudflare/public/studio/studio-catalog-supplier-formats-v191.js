(() => {
  const RELEASE='neptune-studio-supplier-physical-formats-20260915-v191';
  const CONTEXT_API='/api/admin/media-catalog-v98/context';
  const SAVE_API='/api/admin/media-catalog-v191/physical-format/save';
  const ASSET_API='/api/admin/media-catalog-v98/asset/upload';
  const KEY='__neptuneSupplierPhysicalFormatsV191';
  if(window[KEY])return;window[KEY]=true;

  let context=null,loading=null,csrf='',adaptTimer=0;
  document.documentElement.dataset.neptuneSupplierPhysicalFormats=RELEASE;
  installStyles();
  document.addEventListener('click',onClick,true);
  document.addEventListener('submit',onSubmit,true);
  new MutationObserver(scheduleAdapt).observe(document.documentElement,{subtree:true,childList:true});
  scheduleAdapt();

  function onClick(event){
    const target=event.target?.closest?.('[data-v147-list="physical"],[data-v147-new="physical"],[data-v191-physical-edit],[data-v191-physical-new],[data-v147-create-physical],[data-v191-delete]');
    if(!target)return;
    if(target.matches('[data-v191-delete]'))return consume(event,()=>deletePhysical(target.dataset.v191Delete||'',target.dataset.label||''));
    if(target.matches('[data-v147-list="physical"]'))return consume(event,renderPhysicalList);
    if(target.matches('[data-v147-new="physical"],[data-v191-physical-new]'))return consume(event,()=>openPhysicalForm());
    if(target.matches('[data-v191-physical-edit]'))return consume(event,()=>openPhysicalForm(target.dataset.v191PhysicalEdit||''));
    if(target.matches('[data-v147-create-physical]')){
      const offer=target.closest('[data-v147-form="offer"]');
      return consume(event,()=>openPhysicalForm('',{
        supplierId:offer?.querySelector('[name="supplierId"]')?.value||'',
        conceptIds:[offer?.querySelector('[name="formatId"]')?.value||''].filter(Boolean),
      }));
    }
  }

  function onSubmit(event){
    const form=event.target?.closest?.('[data-v191-form="physical"]');if(!form)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    savePhysical(form).catch(error=>showFormError(form,error));
  }

  function consume(event,fn){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();Promise.resolve().then(fn).catch(showFatal)}
  function scheduleAdapt(){clearTimeout(adaptTimer);adaptTimer=setTimeout(()=>{adaptHub();adaptConceptVisualCopy();adaptOfferForm().catch(()=>{});},60)}

  async function adaptHub(){
    const card=document.querySelector('#v147CatalogManager [data-v147-list="physical"]');if(!card)return;
    const small=card.querySelector('small');if(small)small.textContent='Les décors et configurations proposés par chaque fournisseur.';
    try{const data=await loadContext();const count=(data.supplierPhysicalFormats||[]).filter(item=>item.active!==false).length;const badge=card.querySelector('strong');if(badge)badge.textContent=String(count);}catch{}
  }

  function adaptConceptVisualCopy(){
    const form=document.querySelector('#v147CatalogManager [data-v147-form="concept"]');if(!form)return;
    const input=form.querySelector('input[name="visual"]'),label=input?.closest('label');if(!label)return;
    const title=label.querySelector(':scope > span'),help=label.querySelector('small');
    if(title)title.textContent='Miniature du concept — tunnel de réservation';
    if(help)help.textContent='Cette miniature représente le concept dans le tunnel. Elle est indépendante des images des formats physiques du fournisseur.';
  }

  async function adaptOfferForm(){
    const form=document.querySelector('#v147CatalogManager [data-v147-form="offer"]');if(!form)return;
    const supplier=form.querySelector('[name="supplierId"]'),concept=form.querySelector('[name="formatId"]'),container=form.querySelector('[data-v147-format-options]');
    if(!supplier||!concept||!container)return;
    const picker=container.closest('.v147-physical-picker'),title=picker?.querySelector(':scope > span');if(title)title.textContent='Formats proposés par ce fournisseur pour ce concept';
    if(!form.dataset.v191Bound){
      form.dataset.v191Bound='1';
      supplier.addEventListener('change',()=>setTimeout(()=>renderOfferFormats(form,new Set()),0));
      concept.addEventListener('change',()=>setTimeout(()=>renderOfferFormats(form,new Set()),0));
    }
    const current=new Set([...form.querySelectorAll('input[name="physicalFormat"]:checked')].map(input=>String(input.value||'')));
    await renderOfferFormats(form,current);
  }

  async function renderOfferFormats(form,selected){
    const supplierId=form.querySelector('[name="supplierId"]')?.value||'',conceptId=form.querySelector('[name="formatId"]')?.value||'',container=form.querySelector('[data-v147-format-options]');if(!container)return;
    if(!supplierId||!conceptId){container.innerHTML='<span class="v147-hint">Choisissez d’abord un fournisseur et un concept éditorial.</span>';return;}
    const data=await loadContext(true),items=availableFormats(data,supplierId,conceptId);
    if(!items.length){container.innerHTML='<span class="v147-hint">Ce fournisseur n’a encore aucun format autorisé pour ce concept. Créez ou modifiez un format ci-dessous.</span>';return;}
    container.innerHTML=items.map(item=>`<label class="v191-offer-format"><input type="checkbox" name="physicalFormat" value="${attr(item.label)}" ${selected.has(String(item.label))?'checked':''}><span class="v191-offer-format-copy">${formatThumb(item)}<b>${html(item.label)}</b></span></label>`).join('');
  }

  async function renderPhysicalList(){
    const dialog=ensureDialog(),data=await loadContext(true),items=[...(data.supplierPhysicalFormats||[])],groups=groupBySupplier(items);
    dialog.dataset.view='list-physical-v191';
    dialog.innerHTML=`<section class="v147-card"><header><div><span>CATALOGUE MÉDIA</span><h2>Formats physiques</h2><p>Les formats appartiennent d’abord au fournisseur. Un même format peut ensuite être autorisé pour un ou plusieurs concepts éditoriaux.</p></div><button type="button" data-v147-close aria-label="Fermer">×</button></header><div class="v147-list-head"><strong>${items.length} format${items.length>1?'s':''}</strong><button type="button" class="primary" data-v191-physical-new>+ Nouveau format</button></div><div class="v191-supplier-groups">${groups.length?groups.map(renderSupplierGroup).join(''):'<div class="v147-empty">Aucun format physique fournisseur pour le moment.</div>'}</div><footer><button type="button" class="quiet" data-v147-back>← Catalogue</button></footer></section>`;
    showDialog(dialog);
  }

  function groupBySupplier(items){
    const map=new Map();for(const item of items){const key=String(item.supplierId||'');if(!map.has(key))map.set(key,{supplierId:key,supplierName:item.supplierName||'Fournisseur',items:[]});map.get(key).items.push(item);}
    return [...map.values()].sort((a,b)=>a.supplierName.localeCompare(b.supplierName,'fr'));
  }
  function renderSupplierGroup(group){return `<section class="v191-supplier-group"><div class="v191-supplier-head"><div><span>FOURNISSEUR</span><strong>${html(group.supplierName)}</strong></div><em>${group.items.length} format${group.items.length>1?'s':''}</em></div><div class="v147-list">${group.items.map(physicalRow).join('')}</div></section>`}
  function physicalRow(item){
    const names=(item.concepts||[]).map(concept=>concept.name).filter(Boolean),sub=names.length?`Concepts : ${names.join(' · ')}`:'Aucun concept associé';
    return `<button type="button" class="v147-row v191-format-row" data-v191-physical-edit="${attr(item.id)}"><div class="v191-format-main">${formatThumb(item)}<span><strong>${html(item.label||'Sans nom')}</strong><small>${html(sub)}</small></span></div><em class="${item.active===false?'is-off':'is-on'}">${item.active===false?'Masqué':'Actif'}</em><b>Modifier →</b></button>`;
  }

  async function openPhysicalForm(id='',preset={}){
    const dialog=ensureDialog(),data=await loadContext(true),item=(data.supplierPhysicalFormats||[]).find(row=>String(row.id)===String(id))||null;
    const supplierId=String(preset.supplierId||item?.supplierId||''),selectedConcepts=new Set((preset.conceptIds||item?.conceptIds||[]).map(String));
    dialog.dataset.view='physical-v191';
    dialog.innerHTML=`<form class="v147-card" data-v191-form="physical"><header><div><span>FORMAT PHYSIQUE · FOURNISSEUR</span><h2>${item?'Modifier le format':'Nouveau format physique'}</h2><p>Le fournisseur possède le format. Vous choisissez ensuite les concepts qui peuvent l’utiliser dans leurs offres.</p></div><button type="button" data-v147-close>×</button></header><div class="v147-form v147-two"><input type="hidden" name="id" value="${attr(item?.id||'')}"><label class="wide"><span>Fournisseur propriétaire du format</span><select name="supplierId" required>${selectOptions(data.suppliers||[],supplierId,'Choisir un fournisseur')}</select></label><label><span>Nom du format</span><input name="label" required maxlength="80" value="${attr(item?.label||'')}" placeholder="Canapé"></label><label><span>Ordre d’affichage</span><input name="publicOrder" type="number" min="0" max="9999" step="1" value="${Number(item?.publicOrder||100)}"></label><label class="wide"><span>Description du format</span><textarea name="description" rows="3">${html(item?.description||'')}</textarea></label><label class="wide"><span>Image du format physique</span><input name="visual" type="file" accept="image/jpeg,image/png,image/webp"><small>Image du décor/configuration du fournisseur. Elle est distincte de la miniature du concept affichée dans le tunnel.</small>${item?.imageUrl?`<img class="v191-current-image" src="${attr(item.imageUrl)}" alt="Aperçu ${attr(item.label||'format')}">`:''}</label><fieldset class="wide v191-concepts"><legend>Concepts autorisés pour ce format</legend><p>Le format restera la propriété du fournisseur ; cochez simplement les concepts qui peuvent le proposer.</p><div>${(data.formats||[]).filter(concept=>concept.active!==false).map(concept=>`<label><input type="checkbox" name="conceptId" value="${attr(concept.id)}" ${selectedConcepts.has(String(concept.id))?'checked':''}><span>${html(concept.name||concept.id)}</span></label>`).join('')}</div></fieldset><label class="v147-toggle wide"><input type="checkbox" name="active" ${item?.active===false?'':'checked'}><span>Format disponible chez ce fournisseur</span></label></div><div class="v147-feedback" data-v147-feedback hidden></div><footer>${item?`<button type="button" class="quiet v191-delete" data-v191-delete="${attr(item.id)}" data-label="${attr(item.label||'ce format')}">Supprimer</button>`:''}<button type="button" class="quiet" data-v147-list="physical">← Formats</button><button type="submit" class="primary">Enregistrer</button></footer></form>`;
    showDialog(dialog);
  }

  async function savePhysical(form){
    const data=new FormData(form),button=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v147-feedback]');
    setBusy(button,true);try{
      const existing=(await loadContext()).supplierPhysicalFormats?.find(row=>String(row.id)===String(data.get('id')||''));
      const file=data.get('visual');let imageUrl=existing?.imageUrl||'';
      if(file&&typeof file==='object'&&Number(file.size||0)>0)imageUrl=await uploadAsset(file);
      await api(SAVE_API,{id:String(data.get('id')||''),supplierId:String(data.get('supplierId')||''),label:String(data.get('label')||'').trim(),description:String(data.get('description')||'').trim(),imageUrl,active:data.get('active')==='on',publicOrder:Number(data.get('publicOrder')||100),conceptIds:data.getAll('conceptId').map(String)});
      context=null;showFeedback(feedback,'Format fournisseur enregistré. Les concepts associés et les offres utilisent maintenant cette relation.');setTimeout(renderPhysicalList,350);
    }finally{setBusy(button,false)}
  }

  async function deletePhysical(id,label){
    if(!id)return;
    const confirmed=window.confirm(`Supprimer définitivement « ${label||'ce format'} » ?\n\nLa suppression est autorisée uniquement si aucune offre ne l’utilise.`);if(!confirmed)return;
    await api(SAVE_API,{action:'delete',id});context=null;if(window.neptuneToast)window.neptuneToast('Format physique supprimé.','success');await renderPhysicalList();
  }

  async function loadContext(force=false){if(context&&!force)return context;if(loading&&!force)return loading;loading=api(CONTEXT_API,{}).then(data=>{context=data;return data}).finally(()=>{loading=null});return loading;}
  function availableFormats(data,supplierId,conceptId){return(data.supplierPhysicalFormats||[]).filter(item=>item.active!==false&&String(item.supplierId)===String(supplierId)&&(item.conceptIds||[]).map(String).includes(String(conceptId))).sort((a,b)=>Number(a.publicOrder||100)-Number(b.publicOrder||100)||String(a.label||'').localeCompare(String(b.label||''),'fr'))}

  async function api(path,payload,retry=true){const token=await csrfToken(false),headers={'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache, no-store'};if(token)headers['X-CSRF-Token']=token;const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers,body:JSON.stringify(payload||{})}),data=await response.json().catch(()=>({}));if(response.status===403&&data.error==='csrf_failed'&&retry){csrf='';sessionStorage.removeItem('neptune_csrf');await csrfToken(true);return api(path,payload,false)}if(!response.ok)throw new Error(messageFor(data));return data;}
  async function csrfToken(force=false){if(csrf&&!force)return csrf;const stored=sessionStorage.getItem('neptune_csrf')||'';if(stored&&!force){csrf=stored;return csrf}const response=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'}),data=await response.json().catch(()=>({}));csrf=String(data.csrfToken||'');if(csrf)sessionStorage.setItem('neptune_csrf',csrf);return csrf}
  async function uploadAsset(file){const token=await csrfToken(false),form=new FormData();form.set('file',file);const headers={};if(token)headers['X-CSRF-Token']=token;const response=await fetch(ASSET_API,{method:'POST',credentials:'same-origin',headers,body:form}),data=await response.json().catch(()=>({}));if(!response.ok||!data.url)throw new Error('L’image du format n’a pas pu être importée.');return data.url}

  function ensureDialog(){let dialog=document.querySelector('#v147CatalogManager');if(dialog)return dialog;dialog=document.createElement('dialog');dialog.id='v147CatalogManager';dialog.className='v147-dialog';document.body.append(dialog);return dialog}
  function showDialog(dialog){if(!dialog.open)dialog.showModal?.()}
  function selectOptions(items,current,placeholder){return `<option value="">${html(placeholder)}</option>`+items.filter(item=>item.active!==false).map(item=>`<option value="${attr(item.id)}" ${String(item.id)===String(current)?'selected':''}>${html(item.name||item.label||item.id)}</option>`).join('')}
  function formatThumb(item){return item?.imageUrl?`<img class="v191-format-thumb" src="${attr(item.imageUrl)}" alt="">`:`<span class="v191-format-thumb v191-format-thumb-empty">▦</span>`}
  function showFeedback(node,message){if(!node)return;node.hidden=false;node.textContent=message;node.classList.remove('error');node.classList.add('success')}
  function showFormError(form,error){const node=form?.querySelector?.('[data-v147-feedback]');if(node){node.hidden=false;node.textContent=String(error?.message||error);node.classList.remove('success');node.classList.add('error')}else showFatal(error)}
  function showFatal(error){console.error('supplier_physical_formats_v191',error);const message=String(error?.message||error||'Erreur catalogue');if(window.neptuneToast)window.neptuneToast(message,'error');else alert(message)}
  function setBusy(button,busy){if(!button)return;button.disabled=busy;button.dataset.v191Original=button.dataset.v191Original||button.textContent||'';button.textContent=busy?'Enregistrement…':button.dataset.v191Original}
  function messageFor(data){const code=String(data?.error||'');const map={supplier_physical_format_fields_required:'Le fournisseur et le nom du format sont requis.',supplier_physical_format_supplier_invalid:'Le fournisseur n’existe plus.',supplier_physical_format_concept_invalid:'Un des concepts sélectionnés n’existe plus.',supplier_physical_format_already_exists:'Ce fournisseur possède déjà un format portant ce nom.',supplier_physical_format_supplier_in_use:`Ce format est utilisé dans ${Number(data?.usedByOffers||0)} offre(s). Retirez-le des offres avant de changer de fournisseur.`,supplier_physical_format_concept_in_use:`Ce concept utilise encore ce format dans ${Number(data?.usedByOffers||0)} offre(s). Retirez le format de ces offres avant de dissocier le concept.`,supplier_physical_format_used_by_active_offer:'Retirez d’abord ce format des offres actives avant de le masquer.',supplier_physical_format_unavailable:'Un format sélectionné n’est pas proposé par ce fournisseur pour ce concept.',supplier_physical_format_id_required:'Le format à supprimer est introuvable.',supplier_physical_format_not_found:'Ce format n’existe plus.',supplier_physical_format_in_use:`Ce format est encore utilisé dans ${Number(data?.usedByOffers||0)} offre(s). Retirez-le de ces offres avant de le supprimer.`};return map[code]||code||'La modification n’a pas pu être enregistrée.'}
  function installStyles(){if(document.querySelector('#v191SupplierFormatStyles'))return;const style=document.createElement('style');style.id='v191SupplierFormatStyles';style.textContent='.v191-supplier-groups{display:grid;gap:18px}.v191-supplier-group{border:1px solid #e5e7f2;border-radius:18px;padding:14px;background:#fafbff}.v191-supplier-head{display:flex;align-items:center;justify-content:space-between;padding:0 4px 10px;gap:12px}.v191-supplier-head div{display:grid;gap:2px}.v191-supplier-head span{font-size:11px;font-weight:800;letter-spacing:.08em;color:#6d5ce8}.v191-supplier-head strong{font-size:16px}.v191-supplier-head em{font-style:normal;color:#667085;font-size:12px}.v191-format-main{display:flex;align-items:center;gap:12px;min-width:0}.v191-format-main>span:last-child{display:grid;gap:3px;text-align:left}.v191-format-main small{font-size:12px;color:#7a8196;font-weight:500}.v191-format-thumb{width:48px;height:48px;border-radius:10px;object-fit:cover;flex:none;background:#eef0f8}.v191-format-thumb-empty{display:grid;place-items:center;color:#707a96;font-size:20px}.v191-concepts{border:1px solid #e1e5f0;border-radius:14px;padding:14px}.v191-concepts legend{font-weight:800;padding:0 6px}.v191-concepts p{margin:0 0 10px;color:#6d7488;font-size:12px}.v191-concepts>div{display:flex;flex-wrap:wrap;gap:8px}.v191-concepts label,.v191-offer-format{display:flex;align-items:center;gap:8px;border:1px solid #e1e5f0;border-radius:12px;padding:9px 11px;background:white}.v191-offer-format-copy{display:flex;align-items:center;gap:8px}.v191-offer-format .v191-format-thumb{width:34px;height:34px;border-radius:8px}.v191-current-image{display:block;width:140px;height:82px;object-fit:cover;border-radius:10px;margin-top:10px;border:1px solid #e1e5f0}.v191-delete{margin-right:auto;color:#b42318!important}@media(max-width:720px){.v191-supplier-head{align-items:flex-start}.v191-format-row{gap:8px}.v191-format-thumb{width:42px;height:42px}}';document.head.append(style)}
  function html(value){return String(value??'').replace(/[&<>"']/gu,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
  function attr(value){return html(value)}
})();
