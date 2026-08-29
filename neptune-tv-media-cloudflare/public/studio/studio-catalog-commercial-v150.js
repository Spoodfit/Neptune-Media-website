const RELEASE='neptune-studio-catalog-commercial-20260829-v150';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
const PUBLIC_API='/api/reservation/catalog-v96';
const state={context:null,publicCatalog:null,loadedAt:0,promise:null,timer:0};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

document.documentElement.dataset.neptuneCatalogCommercial=RELEASE;
boot();

function boot(){
  const run=()=>{
    schedule(0);
    new MutationObserver(mutations=>{
      const relevant=mutations.some(mutation=>[...mutation.addedNodes].some(node=>node?.nodeType===1&&(node.matches?.('#studioCatalogHierarchyV133,.v133-city,.v133-concept,.v133-drawer,#v133DrawerHost')||node.querySelector?.('.v133-city,.v133-concept,.v133-drawer'))));
      if(relevant)schedule(70);
    }).observe(document.body,{subtree:true,childList:true});
    document.addEventListener('click',event=>{
      if(event.target.closest('#refresh,[data-v147-save],[data-v133-save-offer],[data-v133-save-format],[data-v133-save-entity]')){
        invalidate();schedule(800);
      }
    },true);
    document.addEventListener('submit',event=>{if(event.target.closest('#v147CatalogManager,.v133-drawer')){invalidate();schedule(900)}},true);
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
}

function invalidate(){state.context=null;state.publicCatalog=null;state.loadedAt=0;state.promise=null}
function schedule(delay=70){clearTimeout(state.timer);state.timer=setTimeout(()=>enhance().catch(error=>console.warn('[catalog-v150]',error)),delay)}
function active(){return Boolean($('#studioCatalogHierarchyV133'))&&(String(location.hash||'').toLowerCase()==='#programs'||String($('#title')?.textContent||'').toLowerCase().includes('catalogue'))}

async function enhance(){
  if(!active())return;
  const root=$('#studioCatalogHierarchyV133');if(!root)return;
  const data=await loadData();if(!data?.context)return;
  enhanceSummary(root,data);
  enhanceCities(root,data);
  enhanceFamilies(root,data);
  enhanceDrawer(root,data);
}

async function loadData(force=false){
  if(!force&&state.context&&Date.now()-state.loadedAt<15000)return{context:state.context,publicCatalog:state.publicCatalog};
  if(state.promise&&!force)return state.promise;
  state.promise=(async()=>{
    const [contextResult,publicResult]=await Promise.allSettled([
      fetchJson(CONTEXT_API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'}),
      fetchJson(`${PUBLIC_API}?catalog_v150=${Date.now()}`,{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json','Cache-Control':'no-cache, no-store'}})
    ]);
    if(contextResult.status!=='fulfilled')throw contextResult.reason;
    state.context=contextResult.value;
    state.publicCatalog=publicResult.status==='fulfilled'?publicResult.value:null;
    state.loadedAt=Date.now();
    return{context:state.context,publicCatalog:state.publicCatalog};
  })();
  try{return await state.promise}finally{state.promise=null}
}

async function fetchJson(url,options){const response=await fetch(url,options),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data}

function enhanceSummary(root,data){
  const families=familyViews(data.context);
  const diagnostics=families.map(f=>({family:f,...diagnose(f,data)}));
  const blocked=diagnostics.filter(x=>x.family.active!==false&&x.blockers.length).length;
  const warnings=diagnostics.reduce((sum,x)=>sum+x.warnings.length,0);
  const live=diagnostics.filter(x=>x.publicVisible).length;
  const orphaned=diagnostics.filter(x=>!x.city||!x.supplier||!x.concept).length;
  let panel=$('#v150CommercialHealth',root);
  if(!panel){panel=document.createElement('section');panel.id='v150CommercialHealth';panel.className='v150-health';const toolbar=$('.v133-toolbar',root);toolbar?.after(panel)}
  panel.innerHTML=`<div class="v150-health-main"><span>COHÉRENCE COMMERCIALE</span><strong>${blocked?`${blocked} offre${blocked>1?'s':''} à corriger`:'Catalogue exploitable'}</strong><small>${live} visible${live>1?'s':''} côté client · ${warnings} avertissement${warnings>1?'s':''}${orphaned?` · ${orphaned} relation${orphaned>1?'s':''} orpheline${orphaned>1?'s':''}`:''}</small></div><div class="v150-health-kpis"><span class="${blocked?'is-bad':'is-ok'}"><b>${blocked}</b> blocage${blocked>1?'s':''}</span><span class="${live?'is-ok':''}"><b>${live}</b> tunnel</span><span class="${warnings?'is-warn':'is-ok'}"><b>${warnings}</b> visuel${warnings>1?'s':''}</span></div>`;
}

function enhanceCities(root,data){
  for(const section of $$('.v133-city',root)){
    const edit=$('[data-v133-edit-city]',section);const cityId=String(edit?.dataset.v133EditCity||'');
    const city=cityById(data.context,cityId);if(!city)continue;
    const local=familyViews(data.context).filter(f=>f.cityId===cityId);
    const live=local.some(f=>isPublicVisible(f,data.publicCatalog));
    const title=$('.v133-city-title > div',section);if(!title)continue;
    let meta=$('.v150-city-meta',title);if(!meta){meta=document.createElement('div');meta.className='v150-city-meta';title.append(meta)}
    meta.innerHTML=`<span>${html(city.country||'France')}</span><em class="${city.active===false?'is-muted':live?'is-live':'is-warning'}">${city.active===false?'Ville masquée':live?'Visible côté client':'Aucune offre visible côté client'}</em>`;
  }
}

function enhanceFamilies(root,data){
  const map=new Map(familyViews(data.context).map(f=>[f.key,f]));
  for(const card of $$('.v133-concept',root)){
    const edit=$('[data-v133-edit-offer]',card);const key=String(edit?.dataset.v133EditOffer||'');const family=map.get(key);if(!family)continue;
    const diagnostic=diagnose(family,data);
    card.dataset.v150Commercial=diagnostic.blockers.length?'blocked':family.active===false?'hidden':diagnostic.publicVisible?'live':'ready';
    enhanceConceptImage(card,family,data.context);
    enhanceFormatImages(card,family,data.context);
    enhanceRelationLine(card,family,diagnostic);
    enhanceDiagnostic(card,family,diagnostic);
  }
}

function enhanceConceptImage(card,family,context){
  const media=$('.v133-concept-media',card);if(!media)return;
  const url=resolveConceptImage(family,context);if(!url)return;
  let image=$(':scope > img',media);
  if(!image){image=document.createElement('img');image.alt='';image.loading='lazy';media.prepend(image);$('.v133-placeholder',media)?.remove()}
  if(image.getAttribute('src')!==url)image.src=url;
  bindImageFallback(image,media,'concept');
}

function enhanceFormatImages(card,family,context){
  for(const tile of $$('[data-v133-edit-format]',card)){
    const label=String(tile.dataset.formatLabel||'');const format=family.formats.find(x=>x.label===label)||{label};const url=resolveFormatImage(family,format,context);if(!url)continue;
    let image=$(':scope > img',tile);if(!image){image=document.createElement('img');image.alt='';tile.prepend(image);$('.v133-format-fallback',tile)?.remove()}
    if(image.getAttribute('src')!==url)image.src=url;
    bindImageFallback(image,tile,'format');
  }
}

function bindImageFallback(image,host,kind){
  if(image.dataset.v150Fallback==='1')return;image.dataset.v150Fallback='1';
  image.addEventListener('error',()=>{image.hidden=true;host.classList.add('v150-image-broken');if(!$('.v150-image-error',host)){const flag=document.createElement('span');flag.className='v150-image-error';flag.textContent=kind==='concept'?'Visuel indisponible':'Image indisponible';host.append(flag)}});
  image.addEventListener('load',()=>{image.hidden=false;host.classList.remove('v150-image-broken');$('.v150-image-error',host)?.remove()});
}

function enhanceRelationLine(card,family,diagnostic){
  const head=$('.v133-concept-head',card);if(!head)return;
  let line=$('.v150-relations',card);if(!line){line=document.createElement('div');line.className='v150-relations';head.after(line)}
  const formatNames=family.formats.map(x=>x.label).filter(Boolean);
  line.innerHTML=`<span class="is-city">${html(diagnostic.city?.name||family.cityName||'Ville introuvable')}</span><i>→</i><span class="is-supplier">${html(diagnostic.supplier?.name||family.supplierName||'Fournisseur introuvable')}</span><i>→</i><span class="is-concept">${html(diagnostic.concept?.name||family.conceptName||'Concept introuvable')}</span><i>→</i><span class="is-format">${html(formatNames.length?`${formatNames.length} format${formatNames.length>1?'s':''}`:'Aucun format')}</span>`;
}

function enhanceDiagnostic(card,family,d){
  const body=$('.v133-concept-body',card);if(!body)return;
  let block=$('.v150-diagnostic',body);if(!block){block=document.createElement('section');block.className='v150-diagnostic';const footer=$('footer',body);footer?.before(block)}
  const status=family.active===false?{label:'Masquée',cls:'is-muted',copy:'Cette offre n’est pas publiée.'}:d.blockers.length?{label:'Action requise',cls:'is-bad',copy:`${d.blockers.length} point${d.blockers.length>1?'s':''} bloque${d.blockers.length===1?'':'nt'} la vente.`}:d.publicVisible?{label:'Prête à vendre',cls:'is-ok',copy:'Présente dans le tunnel client.'}:{label:'À vérifier',cls:'is-warn',copy:'Configuration complète mais non détectée dans le tunnel client.'};
  const issues=[...d.blockers.map(x=>({type:'block',text:x})),...d.warnings.map(x=>({type:'warn',text:x}))];
  block.innerHTML=`<div class="v150-diagnostic-head"><div><span>ÉTAT COMMERCIAL</span><strong class="${status.cls}">${status.label}</strong><small>${html(status.copy)}</small></div><a href="${previewUrl(family.key)}" target="_blank" rel="noopener">Tester le tunnel ↗</a></div>${issues.length?`<details ${d.blockers.length?'open':''}><summary>${issues.length} contrôle${issues.length>1?'s':''} à connaître</summary><ul>${issues.map(item=>`<li class="is-${item.type}"><b>${item.type==='block'?'À corriger':'À améliorer'}</b><span>${html(item.text)}</span></li>`).join('')}</ul></details>`:'<div class="v150-all-good">✓ Ville, fournisseur, concept, formats, coût, prix et paiement sont cohérents.</div>'}`;
}

function enhanceDrawer(root,data){
  for(const choice of $$('.v133-concept-choice',root)){
    const id=String($('input[name="conceptId"]',choice)?.value||'');const concept=conceptById(data.context,id);const url=resolveEntryImage(concept,data.context);if(!url)continue;
    let image=$(':scope > img',choice);if(!image){image=document.createElement('img');image.alt='';choice.insertBefore(image,choice.children[1]||null);$('.v133-concept-fallback',choice)?.remove()}if(image.getAttribute('src')!==url)image.src=url;bindImageFallback(image,choice,'concept');
  }
  const selectedConcept=String($('input[name="conceptId"]:checked',root)?.value||'');
  for(const choice of $$('.v133-format-choice',root)){
    const label=String($('input[name="formatLabels"]',choice)?.value||'');const url=resolveGlobalFormatImage(selectedConcept,label,data.context);if(!url)continue;
    let image=$(':scope > img',choice);if(!image){image=document.createElement('img');image.alt='';choice.insertBefore(image,choice.children[1]||null)}if(image.getAttribute('src')!==url)image.src=url;bindImageFallback(image,choice,'format');
  }
}

function diagnose(family,data){
  const context=data.context||{},city=cityById(context,family.cityId),supplier=supplierById(context,family.supplierId),concept=conceptById(context,family.conceptId),blockers=[],warnings=[];
  if(!city)blockers.push('La ville reliée à cette offre n’existe plus.');else if(city.active===false)blockers.push(`La ville ${city.name} est masquée.`);
  if(!supplier)blockers.push('Le fournisseur relié à cette offre n’existe plus.');else if(supplier.active===false)blockers.push(`Le fournisseur ${supplier.name} est masqué.`);
  if(!concept)blockers.push('Le concept éditorial relié à cette offre n’existe plus.');else if(concept.active===false)blockers.push(`Le concept ${concept.name} est masqué.`);
  if(!family.formats.length)blockers.push('Aucun format physique n’est rattaché à cette offre.');
  if(!(Number(family.supplierNetCents)>0))blockers.push('Le coût fournisseur HT n’est pas renseigné.');
  const gross=Math.round(Number(family.supplierNetCents||0)*(1+Number(family.vatRateBps??2000)/10000));
  for(const key of ['launch','promo','base']){
    const tier=family.tiers?.[key]||{},label={launch:'lancement',promo:'préférentiel',base:'normal'}[key];
    const used=key==='base'||Boolean(tier.id||tier.clientPriceCents||tier.paymentUrl);
    if(!used)continue;
    if(!(Number(tier.clientPriceCents)>0))blockers.push(`Le prix ${label} est manquant.`);
    if(!String(tier.paymentUrl||'').trim())blockers.push(`Le lien Stripe du tarif ${label} est manquant.`);
    if(gross>0&&Number(tier.clientPriceCents)>0&&Number(tier.clientPriceCents)<gross)blockers.push(`Le prix ${label} est inférieur au coût fournisseur TTC.`);
  }
  if(!resolveConceptImage(family,context))warnings.push('Le concept n’a pas de visuel exploitable.');
  for(const format of family.formats)if(!resolveFormatImage(family,format,context))warnings.push(`Le format « ${format.label} » n’a pas de visuel exploitable.`);
  if(!String(family.lineEditoriale||'').trim())warnings.push('La ligne éditoriale du concept est vide.');
  const publicVisible=isPublicVisible(family,data.publicCatalog);
  if(family.active!==false&&!blockers.length&&data.publicCatalog&&!publicVisible)blockers.push('L’offre est publiée mais aucun de ses tarifs n’est détecté dans le tunnel client.');
  return{city,supplier,concept,blockers:unique(blockers),warnings:unique(warnings),publicVisible};
}

function familyViews(context){return(context?.families||[]).map(f=>{const concept=conceptById(context,f.formatId)||f.format||{};const familyVisuals=Array.isArray(f.configurationVisuals)?f.configurationVisuals:[];const globalVisuals=(context.configurationVisuals||[]).filter(v=>String(v.formatId)===String(f.formatId));const byLabel=new Map([...globalVisuals,...familyVisuals].map(v=>[normal(v.label),v]));const labels=(f.configurationOptions||[]).map(x=>String(x||'').trim()).filter(Boolean);const formats=labels.map(label=>{const visual=byLabel.get(normal(label))||{};return{...visual,label,image:resolveEntryImage(visual,context),description:visual.description||''}});return{...f,key:String(f.key||`${f.cityId||''}|${f.formatId||''}|${f.supplierId||''}`),cityId:String(f.cityId||''),supplierId:String(f.supplierId||''),conceptId:String(f.formatId||''),conceptName:f.formatName||concept.name||'Concept',lineEditoriale:concept.concept||concept.description||'',image:resolveEntryImage(concept,context),formats,tiers:f.tiers||{launch:{},promo:{},base:{}}}})}
function resolveConceptImage(family,context){return firstUrl([family.image,resolveEntryImage(conceptById(context,family.conceptId),context)])}
function resolveFormatImage(family,format,context){return firstUrl([resolveEntryImage(format,context),resolveGlobalFormatImage(family.conceptId,format.label,context)])}
function resolveGlobalFormatImage(conceptId,label,context){const visual=(context.configurationVisuals||[]).find(v=>String(v.formatId)===String(conceptId)&&normal(v.label)===normal(label));return resolveEntryImage(visual,context)}
function resolveEntryImage(entry,context){if(!entry)return'';const direct=firstUrl([entry.image,entry.imageUrl,entry.thumbnailUrl,entry.visual,entry.assetUrl,entry.posterUrl,entry.coverUrl,entry.mediaUrl,entry.publicUrl,entry.originalUrl]);if(direct)return direct;for(const id of [entry.mediaAssetId,entry.assetId,entry.mediaId,entry.linkedMediaAssetId].filter(Boolean)){const asset=findAsset(context,id),url=firstUrl([asset?.publicUrl,asset?.imageUrl,asset?.thumbnailUrl,asset?.url,asset?.assetUrl,asset?.originalUrl]);if(url)return url}return''}
function findAsset(context,id){for(const list of [context?.mediaAssets,context?.assets,context?.visualAssets]){const hit=(list||[]).find(x=>String(x.id||x.assetId||x.mediaAssetId)===String(id));if(hit)return hit}return null}
function firstUrl(values){for(const value of values){const url=String(value||'').trim();if(url&&(url.startsWith('/')||/^https?:\/\//i.test(url)||url.startsWith('blob:')||url.startsWith('data:image/')))return url}return''}

function isPublicVisible(family,publicCatalog){if(!publicCatalog)return false;const city=(publicCatalog.cities||[]).find(x=>String(x.id)===String(family.cityId));const format=(city?.formats||[]).find(x=>String(x.id)===String(family.conceptId));const publicIds=new Set((format?.offers||[]).map(o=>String(o.id||'')).filter(Boolean));return ['launch','promo','base'].some(key=>{const id=String(family.tiers?.[key]?.id||'');return id&&publicIds.has(id)})}
function cityById(context,id){return(context?.cities||[]).find(x=>String(x.id)===String(id))||null}
function supplierById(context,id){return(context?.suppliers||[]).find(x=>String(x.id)===String(id))||null}
function conceptById(context,id){return(context?.formats||[]).find(x=>String(x.id)===String(id))||null}
function previewUrl(key){return`/reserver/?offer=${encodeURIComponent(key)}`}
function normal(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function unique(values){return[...new Set(values.filter(Boolean))]}
function html(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
