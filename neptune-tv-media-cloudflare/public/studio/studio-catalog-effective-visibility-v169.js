const RELEASE='neptune-studio-catalog-effective-visibility-20260903-v169';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let context=null,loading=null,timer=0;

document.documentElement.dataset.neptuneCatalogEffectiveVisibility=RELEASE;
boot();

function boot(){
  const run=()=>{
    schedule(0);
    new MutationObserver(()=>schedule(55)).observe(document.body,{subtree:true,childList:true});
    document.addEventListener('change',event=>{
      if(event.target.closest?.('#v147CatalogManager'))schedule(0,true);
    },true);
    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-v147-edit],[data-v147-list],[data-v147-new],[data-v147-back-list]'))schedule(90,true);
    },true);
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
}

function schedule(delay=40,force=false){clearTimeout(timer);timer=setTimeout(()=>enhance(force).catch(error=>console.warn('[catalog-effective-visibility-v169]',error)),delay)}
async function enhance(force=false){
  const dialog=$('#v147CatalogManager');if(!dialog?.open)return;
  const data=await loadContext(force);if(!data)return;
  annotateOfferList(dialog,data);
  annotateOfferForm(dialog,data);
}

async function loadContext(force=false){
  if(context&&!force)return context;
  if(loading&&!force)return loading;
  loading=(async()=>{
    const response=await fetch(CONTEXT_API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    context=data;return data;
  })();
  try{return await loading}finally{loading=null}
}

function annotateOfferList(dialog,data){
  if(dialog.dataset.view!=='list-offer')return;
  for(const row of $$('.v147-row[data-v147-edit="offer"]',dialog)){
    const family=familyByKey(data,row.dataset.v147Id||'');if(!family)continue;
    const visibility=offerVisibility(data,family);
    const badge=$('em',row),copy=$(':scope > div',row);if(!badge||!copy)continue;
    badge.classList.remove('is-on','is-off','is-blocked');
    if(!visibility.ownActive){badge.classList.add('is-off');badge.textContent='Masquée';}
    else if(visibility.blockers.length){badge.classList.add('is-blocked');badge.textContent='Non visible';}
    else{badge.classList.add('is-on');badge.textContent='Visible';}
    badge.title=visibility.message;
    let note=$('.v169-visibility-note',copy);
    if(!note){note=document.createElement('small');note.className='v169-visibility-note';copy.append(note);}
    note.className=`v169-visibility-note ${visibility.blockers.length?'is-blocked':visibility.ownActive?'is-visible':'is-muted'}`;
    note.textContent=visibility.message;
  }
}

function annotateOfferForm(dialog,data){
  const form=$('[data-v147-form="offer"]',dialog);if(!form)return;
  annotateSelect(form,'cityId',data.cities||[]);
  annotateSelect(form,'supplierId',data.suppliers||[]);
  annotateSelect(form,'formatId',data.formats||[]);
  const cityId=$('[name="cityId"]',form)?.value||'',supplierId=$('[name="supplierId"]',form)?.value||'',formatId=$('[name="formatId"]',form)?.value||'';
  const ownActive=Boolean($('[name="active"]',form)?.checked);
  const blockers=parentBlockers(data,{cityId,supplierId,formatId});
  const selectedParents=Boolean(cityId&&supplierId&&formatId);
  let callout=$('.v169-visibility-callout',form);
  if(!callout){
    callout=document.createElement('section');callout.className='v169-visibility-callout';callout.setAttribute('role','status');callout.setAttribute('aria-live','polite');
    const toggle=$('.v147-toggle.wide',form);toggle?.after(callout);
  }
  if(!selectedParents){
    callout.className='v169-visibility-callout is-neutral';
    callout.innerHTML='<strong>Visibilité effective</strong><span>Choisissez la ville, le fournisseur et le concept pour vérifier si cette offre pourra apparaître dans le tunnel.</span>';
    return;
  }
  if(!ownActive){
    callout.className='v169-visibility-callout is-muted';
    callout.innerHTML='<strong>Offre masquée</strong><span>Cette offre est désactivée : elle ne sera pas visible dans le tunnel, même si tous ses parents sont actifs.</span>';
    return;
  }
  if(blockers.length){
    callout.className='v169-visibility-callout is-blocked';
    callout.innerHTML=`<strong>Non visible dans le tunnel</strong><span>L’offre est activée, mais ${html(joinReasons(blockers))}.</span><small>Réactivez ${html(parentTargets(blockers))} pour que l’offre puisse être affichée côté client.</small>`;
    return;
  }
  callout.className='v169-visibility-callout is-visible';
  callout.innerHTML='<strong>Parents visibles</strong><span>Ville, fournisseur et concept sont actifs. Cette offre pourra être visible si elle reste activée et possède au moins un tarif publiable.</span>';
}

function annotateSelect(form,name,items){
  const select=$(`[name="${name}"]`,form);if(!select)return;
  const map=new Map(items.map(item=>[String(item.id),item]));
  for(const option of [...select.options]){
    const item=map.get(String(option.value||''));if(!item||option.dataset.v169Label==='1')continue;
    option.dataset.v169Label='1';
    if(item.active===false)option.textContent=`${option.textContent} — MASQUÉ`;
  }
}

function offerVisibility(data,family){
  const ownActive=family.active!==false,blockers=parentBlockers(data,family);
  if(!ownActive)return{ownActive,blockers,message:'Offre désactivée : non visible dans le tunnel.'};
  if(blockers.length)return{ownActive,blockers,message:`Non visible — ${sentenceReasons(blockers)}`};
  return{ownActive,blockers,message:'Visible : aucun parent ne masque cette offre.'};
}

function parentBlockers(data,{cityId,supplierId,formatId}){
  const blockers=[];
  const city=(data.cities||[]).find(item=>String(item.id)===String(cityId));
  const supplier=(data.suppliers||[]).find(item=>String(item.id)===String(supplierId));
  const concept=(data.formats||[]).find(item=>String(item.id)===String(formatId));
  if(!city)blockers.push({kind:'ville',label:'la ville liée',missing:true});else if(city.active===false)blockers.push({kind:'ville',label:city.name||'Ville'});
  if(!supplier)blockers.push({kind:'fournisseur',label:'le fournisseur lié',missing:true});else if(supplier.active===false)blockers.push({kind:'fournisseur',label:supplier.name||'Fournisseur'});
  if(!concept)blockers.push({kind:'concept',label:'le concept lié',missing:true});else if(concept.active===false)blockers.push({kind:'concept',label:concept.name||'Concept'});
  return blockers;
}

function sentenceReasons(blockers){return blockers.map(reason=>reason.missing?`${capitalize(reason.label)} n’existe plus.`:`${capitalize(reason.kind)} « ${reason.label} » masqué${reason.kind==='ville'?'e':''}.`).join(' ')}
function joinReasons(blockers){const parts=blockers.map(reason=>reason.missing?`${reason.label} n’existe plus`:`${reason.kind} « ${reason.label} » ${reason.kind==='ville'?'est masquée':'est masqué'}`);return parts.length===1?parts[0]:`${parts.slice(0,-1).join(', ')} et ${parts.at(-1)}`}
function parentTargets(blockers){const names=blockers.map(reason=>reason.missing?reason.label:`${reason.kind} « ${reason.label} »`);return names.length===1?names[0]:`${names.slice(0,-1).join(', ')} et ${names.at(-1)}`}
function familyKey(family){return String(family?.key||`${family?.cityId||''}|${family?.formatId||''}|${family?.supplierId||''}`)}
function familyByKey(data,key){return(data.families||[]).find(family=>familyKey(family)===String(key))||null}
function capitalize(value){const text=String(value||'');return text?text[0].toUpperCase()+text.slice(1):text}
function html(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
