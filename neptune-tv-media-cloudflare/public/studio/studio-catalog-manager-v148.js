const RELEASE='neptune-studio-catalog-presentation-20260829-v148';
const DIALOG_ID='v147CatalogManager';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
let contextCache=null;
let contextPromise=null;
let enhanceTimer=0;

document.documentElement.dataset.neptuneCatalogPresentation=RELEASE;
boot();

function boot(){
  const run=()=>{
    scheduleEnhance(0);
    new MutationObserver(()=>scheduleEnhance(25)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','open']});
    document.addEventListener('submit',event=>{
      if(event.target?.closest?.(`#${DIALOG_ID}`)){
        contextCache=null;
        setTimeout(()=>{contextCache=null;scheduleEnhance(0)},900);
      }
    },true);
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
}

function scheduleEnhance(delay=25){
  clearTimeout(enhanceTimer);
  enhanceTimer=setTimeout(()=>enhance().catch(error=>console.warn('[catalog-v148]',error)),delay);
}

async function enhance(){
  const dialog=document.getElementById(DIALOG_ID);
  if(!dialog)return;
  const offer=dialog.querySelector('[data-v147-form="offer"]');
  if(offer)enhanceOfferTabs(offer);
  const concept=dialog.querySelector('[data-v147-form="concept"]');
  const physical=dialog.querySelector('[data-v147-form="physical"]');
  const needsImages=concept||physical||dialog.querySelector('[data-v147-edit="concept"],[data-v147-edit="physical"]');
  if(needsImages){
    const ctx=await getContext();
    if(concept)enhanceConceptVisual(concept,ctx);
    if(physical)enhancePhysicalVisual(physical,ctx);
    enhanceListVisuals(dialog,ctx);
  }
  const success=dialog.querySelector('.v147-feedback.is-success:not([data-v148-context-reset])');
  if(success){
    success.dataset.v148ContextReset='1';
    contextCache=null;
  }
}

function enhanceOfferTabs(form){
  if(form.dataset.v148Tabs==='1')return;
  const configuration=form.querySelector('.v147-form');
  const pricing=form.querySelector('.v147-tiers');
  const header=form.querySelector(':scope > header');
  if(!configuration||!pricing||!header)return;
  form.dataset.v148Tabs='1';
  configuration.dataset.v148Panel='configuration';
  pricing.dataset.v148Panel='pricing';
  pricing.hidden=true;
  const tabs=document.createElement('nav');
  tabs.className='v148-tabs';
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','Configuration de l’offre');
  tabs.innerHTML='<button type="button" role="tab" aria-selected="true" data-v148-tab="configuration"><b>1</b><span>Configuration</span><small>Ville, concept, formats et fournisseur</small></button><button type="button" role="tab" aria-selected="false" data-v148-tab="pricing"><b>2</b><span>Prix & Stripe</span><small>Tarifs, liens de paiement et quotas</small></button>';
  header.after(tabs);
  tabs.addEventListener('click',event=>{
    const button=event.target.closest('[data-v148-tab]');
    if(button)activateOfferTab(form,button.dataset.v148Tab);
  });
  const feedback=form.querySelector('[data-v147-feedback]');
  if(feedback){
    new MutationObserver(()=>{
      if(feedback.hidden||!feedback.classList.contains('is-error'))return;
      const text=String(feedback.textContent||'').toLowerCase();
      if(/stripe|tarif|prix|paiement|lien/.test(text))activateOfferTab(form,'pricing');
      else if(/ville|fournisseur|concept|format/.test(text))activateOfferTab(form,'configuration');
    }).observe(feedback,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
  }
}

function activateOfferTab(form,name){
  for(const panel of form.querySelectorAll('[data-v148-panel]'))panel.hidden=panel.dataset.v148Panel!==name;
  for(const button of form.querySelectorAll('[data-v148-tab]')){
    const active=button.dataset.v148Tab===name;
    button.setAttribute('aria-selected',active?'true':'false');
    button.classList.toggle('is-active',active);
  }
  form.dataset.v148ActiveTab=name;
}

async function getContext(force=false){
  if(contextCache&&!force)return contextCache;
  if(contextPromise&&!force)return contextPromise;
  contextPromise=(async()=>{
    let token=sessionStorage.getItem('neptune_csrf')||'';
    if(!token){
      try{
        const authResponse=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});
        const auth=await authResponse.json().catch(()=>({}));
        token=String(auth.csrfToken||'');
        if(token)sessionStorage.setItem('neptune_csrf',token);
      }catch{}
    }
    const headers={'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache, no-store'};
    if(token)headers['X-CSRF-Token']=token;
    const response=await fetch(CONTEXT_API,{method:'POST',credentials:'same-origin',cache:'no-store',headers,body:'{}'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Catalogue HTTP ${response.status}`);
    contextCache=data;
    return data;
  })();
  try{return await contextPromise}finally{contextPromise=null}
}

function enhanceConceptVisual(form,ctx){
  if(form.dataset.v148Visual==='1')return;
  const id=form.querySelector('[name="id"]')?.value||'';
  const item=(ctx.formats||[]).find(entry=>String(entry.id)===String(id));
  const file=form.querySelector('[name="visual"]');
  if(!file)return;
  form.dataset.v148Visual='1';
  const preview=createVisualPreview(item?.image||item?.imageUrl||'',item?.name||'Concept éditorial');
  file.closest('label')?.before(preview.root);
  bindLiveFilePreview(file,preview,item?.image||item?.imageUrl||'');
}

function enhancePhysicalVisual(form,ctx){
  if(form.dataset.v148Visual==='1')return;
  const conceptId=form.querySelector('[name="conceptId"]')?.value||'';
  const label=form.querySelector('[name="label"]')?.value||'';
  const item=findPhysical(ctx,conceptId,label);
  const file=form.querySelector('[name="visual"]');
  if(!file)return;
  form.dataset.v148Visual='1';
  const preview=createVisualPreview(item?.image||item?.imageUrl||'',label||'Format physique');
  file.closest('label')?.before(preview.root);
  bindLiveFilePreview(file,preview,item?.image||item?.imageUrl||'');
}

function createVisualPreview(url,title){
  const root=document.createElement('figure');
  root.className='v148-visual-preview wide';
  const image=document.createElement('img');
  image.alt=title?`Visuel actuel · ${title}`:'Visuel actuel';
  const copy=document.createElement('figcaption');
  root.append(image,copy);
  setPreview(root,image,copy,url,'Visuel actuel');
  return{root,image,copy};
}

function setPreview(root,image,copy,url,label){
  const has=Boolean(String(url||'').trim());
  root.classList.toggle('is-empty',!has);
  if(has){
    image.hidden=false;
    image.src=String(url);
    copy.innerHTML=`<strong>${escapeHtml(label)}</strong><span>Vous pouvez le remplacer ci-dessous.</span>`;
    image.onerror=()=>{root.classList.add('is-empty');image.hidden=true;copy.innerHTML='<strong>Visuel indisponible</strong><span>Le fichier enregistré ne peut pas être affiché.</span>'};
  }else{
    image.hidden=true;
    image.removeAttribute('src');
    copy.innerHTML='<strong>Aucun visuel enregistré</strong><span>Ajoutez une image pour la voir ici et dans le catalogue.</span>';
  }
}

function bindLiveFilePreview(file,preview,originalUrl){
  let objectUrl='';
  file.addEventListener('change',()=>{
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=''}
    const selected=file.files?.[0];
    if(selected){objectUrl=URL.createObjectURL(selected);setPreview(preview.root,preview.image,preview.copy,objectUrl,'Nouveau visuel sélectionné')}
    else setPreview(preview.root,preview.image,preview.copy,originalUrl,'Visuel actuel');
  });
}

function enhanceListVisuals(dialog,ctx){
  for(const row of dialog.querySelectorAll('[data-v147-edit="concept"],[data-v147-edit="physical"]')){
    if(row.dataset.v148Thumb==='1')continue;
    const kind=row.dataset.v147Edit;
    const id=row.dataset.v147Id||'';
    let item=null;
    if(kind==='concept')item=(ctx.formats||[]).find(entry=>String(entry.id)===String(id));
    else{
      const split=String(id).indexOf('|');
      const conceptId=split>=0?String(id).slice(0,split):'';
      const label=split>=0?String(id).slice(split+1):'';
      item=findPhysical(ctx,conceptId,label);
    }
    const url=item?.image||item?.imageUrl||'';
    if(!url)continue;
    row.dataset.v148Thumb='1';
    const thumb=document.createElement('span');
    thumb.className='v148-row-thumb';
    const img=document.createElement('img');img.src=String(url);img.alt='';img.loading='lazy';
    img.onerror=()=>thumb.remove();
    thumb.append(img);
    row.prepend(thumb);
  }
}

function findPhysical(ctx,conceptId,label){
  const direct=(ctx.configurationVisuals||[]).find(item=>String(item.formatId)===String(conceptId)&&String(item.label||'')===String(label));
  if(direct)return direct;
  for(const family of ctx.families||[]){
    if(String(family.formatId)!==String(conceptId))continue;
    const match=(family.configurationVisuals||[]).find(item=>String(item.label||'')===String(label));
    if(match)return match;
  }
  return null;
}

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
