const RELEASE='neptune-studio-catalog-visual-20260820-v132';
const API='/api/admin/media-catalog-v98/context';
const state={context:null,mode:'catalog',city:'all',query:'',showInactive:false,admin:false,loading:false};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let mountTimer=0,refreshTimer=0,visibilityScheduled=false;

boot();

function boot(){
  window.__neptuneStudioCatalogVisualV132=RELEASE;
  document.body.dataset.studioCatalogVisual=RELEASE;
  scheduleMount(0);
  new MutationObserver(()=>{
    if(!catalogDomReady())return;
    if(!$('#studioCatalogVisualV132'))scheduleMount(35);
    scheduleVisibility();
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('hashchange',()=>{state.admin=false;state.context=null;state.mode='catalog';state.city='all';scheduleMount(0);});
  document.addEventListener('click',handleClick,true);
  document.addEventListener('input',handleInput,true);
  document.addEventListener('change',handleInput,true);
  document.addEventListener('submit',event=>{if(event.target.closest('.c98-page'))scheduleRefresh(700);},true);
}

function scheduleMount(delay=35){clearTimeout(mountTimer);mountTimer=setTimeout(mount,delay);}
function scheduleRefresh(delay=0){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadContext(true),delay);}
function scheduleVisibility(){if(visibilityScheduled)return;visibilityScheduled=true;queueMicrotask(()=>{visibilityScheduled=false;enforceVisibility();});}

function catalogDomReady(){
  const page=$('.c98-page');
  if(!page||!$('.c98-layout',page))return false;
  const hash=(location.hash||'').toLowerCase();
  const activeTab=$('[data-tab="programs"].active,[data-tab="programs"][aria-current="page"]');
  const title=String($('#title')?.textContent||'').toLowerCase();
  return hash==='#programs'||Boolean(activeTab)||title.includes('catalogue');
}

async function mount(){
  if(!catalogDomReady()){
    document.body.classList.remove('v132-catalog-visual','v132-admin-open');
    return;
  }
  const page=$('.c98-page');
  document.body.classList.add('v132-catalog-visual');
  page.dataset.catalogRuntime='v132';
  prepareShell(page);
  ensureVisual(page);
  enforceVisibility();
  if(!state.context&&!state.loading)await loadContext(false);
  else if(state.context&&!state.admin)render();
}

function prepareShell(page){
  if($('#title'))$('#title').textContent='Catalogue Média';
  $('#studioCatalogCockpitV131')?.remove();
  $('#studioCatalogAdminV131')?.remove();
  $('#studioCatalogMarketplaceV128')?.remove();
  $('#studioCatalogAdminV128')?.remove();
  $('#catalogMarketplaceV126')?.remove();
  $('#studioCatalogGlanceV1221')?.remove();
  const hero=$('.c98-hero',page);if(hero)hero.setAttribute('aria-hidden','true');
}

function ensureVisual(page){
  const layout=$('.c98-layout',page);if(!layout)return;
  let visual=$('#studioCatalogVisualV132',page);
  if(!visual){
    visual=document.createElement('section');
    visual.id='studioCatalogVisualV132';
    visual.className='v132-shell';
    visual.setAttribute('aria-label','Catalogue média visuel');
    visual.innerHTML='<div class="v132-loading"><i></i><span>Chargement du catalogue…</span></div>';
    layout.before(visual);
  }
  let admin=$('#studioCatalogAdminV132',page);
  if(!admin){
    admin=document.createElement('section');
    admin.id='studioCatalogAdminV132';
    admin.className='v132-admin-bar';
    admin.hidden=true;
    admin.innerHTML='<button type="button" class="v132-btn" data-v132-back>← Catalogue</button><div><small>ÉDITION</small><strong id="v132AdminTitle">Donnée du catalogue</strong></div>';
    layout.before(admin);
  }
}

function enforceVisibility(){
  const page=$('.c98-page');
  const visual=$('#studioCatalogVisualV132',page),layout=$('.c98-layout',page),tabs=$('.c98-tabs',page),hero=$('.c98-hero',page),admin=$('#studioCatalogAdminV132',page);
  if(!page||!visual||!layout)return;
  forceHidden(hero,true);forceHidden(tabs,true);forceHidden(visual,state.admin);forceHidden(layout,!state.admin);if(admin)forceHidden(admin,!state.admin,'flex');
  if(page.dataset.catalogVisibility!=='v132')page.dataset.catalogVisibility='v132';
}

function forceHidden(node,hidden,visibleDisplay=''){
  if(!node)return;
  if(node.hidden!==hidden)node.hidden=hidden;
  if(hidden){if(node.style.getPropertyValue('display')!=='none'||node.style.getPropertyPriority('display')!=='important')node.style.setProperty('display','none','important');if(node.getAttribute('aria-hidden')!=='true')node.setAttribute('aria-hidden','true');return;}
  if(visibleDisplay){if(node.style.getPropertyValue('display')!==visibleDisplay||node.style.getPropertyPriority('display')!=='important')node.style.setProperty('display',visibleDisplay,'important');}
  else if(node.style.getPropertyValue('display'))node.style.removeProperty('display');
  if(node.hasAttribute('aria-hidden'))node.removeAttribute('aria-hidden');
}

async function loadContext(force=false){
  if(!catalogDomReady()||state.loading)return;
  if(state.context&&!force){render();return;}
  state.loading=true;
  try{
    const response=await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    state.context=await response.json();
    if(state.city!=='all'&&!cities().some(city=>String(city.id)===state.city))state.city='all';
    if(!state.admin)render();
  }catch(error){renderError(error.message);}finally{state.loading=false;}
}

function render(){
  const root=$('#studioCatalogVisualV132');if(!root||!state.context||state.admin)return;
  const all=offerViews(),active=all.filter(offer=>offer.active),incomplete=all.filter(offer=>offer.issues.length);
  const activeCities=new Set(active.map(offer=>offer.cityId).filter(Boolean));
  const activeSuppliers=new Set(active.map(offer=>offer.supplierId).filter(Boolean));
  root.innerHTML=`
    <header class="v132-topbar">
      <div class="v132-snapshot"><span>CATALOGUE</span><div class="v132-kpis"><strong>${activeCities.size}<small>ville${activeCities.size===1?'':'s'}</small></strong><strong>${active.length}<small>offre${active.length===1?'':'s'}</small></strong><strong>${activeSuppliers.size}<small>fournisseur${activeSuppliers.size===1?'':'s'}</small></strong>${incomplete.length?`<strong class="is-warning">${incomplete.length}<small>à compléter</small></strong>`:'<strong class="is-ok">✓<small>opérationnel</small></strong>'}</div></div>
      <label class="v132-search"><span>⌕</span><input data-v132-search type="search" value="${attr(state.query)}" placeholder="Ville, concept, fournisseur…" aria-label="Rechercher dans le catalogue"></label>
      <div class="v132-actions"><button class="v132-btn v132-btn--primary" type="button" data-v132-new>+ Nouvelle offre</button><a class="v132-btn" href="/reserver/" target="_blank" rel="noopener">Voir côté client ↗</a></div>
    </header>
    <nav class="v132-switch" aria-label="Vues du catalogue"><button class="${state.mode==='catalog'?'is-active':''}" data-v132-mode="catalog">Catalogue visuel</button><button class="${state.mode==='structure'?'is-active':''}" data-v132-mode="structure">Structure</button></nav>
    <div class="v132-content">${state.mode==='structure'?renderStructure():renderCatalog()}</div>`;
}

function renderCatalog(){
  const all=offerViews();
  const cityList=cities();
  const visible=filteredOffers();
  const selected=state.city==='all'?null:cityList.find(city=>String(city.id)===state.city);
  return `<section class="v132-market">
    <div class="v132-city-rail" aria-label="Choisir une ville">${allCitiesCard(all)}${cityList.map(city=>cityCard(city,all.filter(offer=>offer.cityId===String(city.id)))).join('')}</div>
    <div class="v132-market-head"><div><span>${selected?'VILLE SÉLECTIONNÉE':'RÉSEAU NEPTUNE MEDIA'}</span><h2>${selected?html(selected.name):'Toutes les offres'}</h2><p>${visible.length} offre${visible.length===1?'':'s'} visible${visible.length===1?'':'s'}${selected?` · ${new Set(visible.map(offer=>offer.supplierId).filter(Boolean)).size} fournisseur${new Set(visible.map(offer=>offer.supplierId).filter(Boolean)).size===1?'':'s'}`:''}</p></div><label class="v132-check"><input data-v132-inactive type="checkbox" ${state.showInactive?'checked':''}> Masquées</label></div>
    <div class="v132-gallery">${visible.length?visible.map(offerCard).join(''):'<div class="v132-empty"><strong>Aucune offre ici.</strong><span>Changez de ville ou créez une nouvelle offre.</span></div>'}</div>
  </section>`;
}

function allCitiesCard(offers){
  const images=unique(offers.map(offer=>offer.image).filter(Boolean)).slice(0,3);
  return `<button class="v132-city-card is-all ${state.city==='all'?'is-active':''}" type="button" data-v132-city="all"><div class="v132-city-mosaic">${images.length?images.map(src=>`<img src="${attr(src)}" alt="" loading="lazy">`).join(''):'<span>NM</span>'}</div><div class="v132-city-overlay"><span>Réseau</span><strong>Toutes les villes</strong><small>${offers.length} offre${offers.length===1?'':'s'}</small></div></button>`;
}

function cityCard(city,offers){
  const hero=offers.find(offer=>offer.image)?.image||'';
  const suppliers=new Set(offers.map(offer=>offer.supplierId).filter(Boolean));
  const min=lowestPrice(offers);
  return `<button class="v132-city-card ${state.city===String(city.id)?'is-active':''}" type="button" data-v132-city="${attr(city.id)}">${hero?`<img class="v132-city-image" src="${attr(hero)}" alt="" loading="lazy">`:'<div class="v132-city-fallback"></div>'}<div class="v132-city-overlay"><span>⌖ ${html(city.name)}</span><strong>${offers.length} offre${offers.length===1?'':'s'}</strong><small>${suppliers.size} fournisseur${suppliers.size===1?'':'s'}${min?` · dès ${money(min)}`:''}</small></div></button>`;
}

function offerCard(offer){
  const tiers=[['Coûtant',offer.tiers.launch],['Préférentiel',offer.tiers.promo],['Normal',offer.tiers.base]];
  const configs=offer.configurations.slice(0,4),extra=Math.max(0,offer.configurations.length-configs.length);
  return `<article class="v132-offer ${offer.active?'':'is-muted'}">
    <div class="v132-offer-visual">${offer.image?`<img src="${attr(offer.image)}" alt="" loading="lazy">`:'<div class="v132-offer-placeholder"><span>NEPTUNE</span><strong>MEDIA</strong></div>'}<span class="v132-city-badge">⌖ ${html(offer.cityName||'Ville à définir')}</span><span class="v132-status ${offer.issues.length?'is-warning':offer.active?'is-ok':''}">${offer.issues.length?'À compléter':offer.active?'Publiée':'Masquée'}</span></div>
    <div class="v132-offer-info"><div class="v132-offer-title"><div><small>CONCEPT</small><h3>${html(offer.formatName)}</h3><p>${html(offer.concept||'')}</p></div><span class="v132-supplier">${supplierInitial(offer.supplierName)}<b>${html(offer.supplierName||'Fournisseur à définir')}</b></span></div>
      <div class="v132-config-row">${configs.length?configs.map(value=>`<span>${html(value)}</span>`).join(''):'<span>Configuration standard</span>'}${extra?`<span>+${extra}</span>`:''}</div>
      <div class="v132-economy"><div class="is-cost"><small>Coût fournisseur</small><strong>${offer.supplierNetCents?money(offer.supplierNetCents):'—'}</strong></div>${tiers.map(([label,tier])=>`<div><small>${label}</small><strong>${Number(tier?.clientPriceCents||0)?money(tier.clientPriceCents):'—'}</strong></div>`).join('')}</div>
      <div class="v132-card-actions"><a href="${previewUrl(offer.key)}" target="_blank" rel="noopener">Voir côté client ↗</a><button type="button" data-v132-edit="${attr(offer.key)}">Modifier</button></div>
    </div>
  </article>`;
}

function renderStructure(){
  return `<section class="v132-structure"><header><div><span>STRUCTURE DU CATALOGUE</span><h2>Les briques qui composent vos offres</h2></div><small>Modifier une brique met à jour les offres qui l’utilisent.</small></header><div class="v132-structure-grid">${conceptBlock()}${supplierBlock()}${configBlock()}${cityBlock()}</div></section>`;
}

function conceptBlock(){const items=formats();return structureBlock('◈','Concepts',items.length,'formats',items.slice(0,5).map(item=>`<div class="v132-visual-item">${item.image?`<img src="${attr(item.image)}" alt="">`:'<span></span>'}<b>${html(item.name)}</b></div>`).join(''));}
function supplierBlock(){const items=suppliers();return structureBlock('⬡','Fournisseurs',items.length,'suppliers',items.slice(0,6).map(item=>`<div class="v132-person-item"><i>${supplierInitial(item.name)}</i><span><b>${html(item.name)}</b><small>${item.defaultNetCents?money(item.defaultNetCents):'Coût à définir'}</small></span></div>`).join(''));}
function configBlock(){const items=configurationCatalog();return structureBlock('⇄','Configurations',items.length,'configurations',`<div class="v132-chip-cloud">${items.slice(0,10).map(item=>`<span>${html(item)}</span>`).join('')}</div>`);}
function cityBlock(){const items=cities(),offers=offerViews();return structureBlock('⌖','Villes',items.length,'cities',items.slice(0,6).map(city=>`<div class="v132-place-item"><i>⌖</i><span><b>${html(city.name)}</b><small>${offers.filter(offer=>offer.cityId===String(city.id)).length} offre${offers.filter(offer=>offer.cityId===String(city.id)).length===1?'':'s'}</small></span></div>`).join(''));}
function structureBlock(icon,title,count,area,body){return `<article class="v132-structure-card"><header><div class="v132-structure-title"><i>${icon}</i><span><small>${count} élément${count===1?'':'s'}</small><strong>${title}</strong></span></div><button type="button" data-v132-manage="${area}">Gérer →</button></header><div class="v132-structure-body">${body||'<em>Aucun élément</em>'}</div></article>`;}

function handleInput(event){
  if(event.target.matches('[data-v132-search]')){state.query=event.target.value;render();}
  if(event.target.matches('[data-v132-inactive]')){state.showInactive=event.target.checked;render();}
}
function handleClick(event){
  if(event.target.closest('#refresh')){scheduleRefresh(250);return;}
  const mode=event.target.closest('[data-v132-mode]');if(mode){state.mode=mode.dataset.v132Mode;render();return;}
  const city=event.target.closest('[data-v132-city]');if(city){state.city=city.dataset.v132City||'all';state.mode='catalog';render();return;}
  const edit=event.target.closest('[data-v132-edit]');if(edit){openLegacy('offers',{key:edit.dataset.v132Edit});return;}
  if(event.target.closest('[data-v132-new]')){openLegacy('offers',{create:true});return;}
  const manage=event.target.closest('[data-v132-manage]');if(manage){openLegacy(manage.dataset.v132Manage);return;}
  if(event.target.closest('[data-v132-back]')){closeLegacy();return;}
}

function openLegacy(area,{key='',create=false}={}){
  const page=$('.c98-page');if(!page)return;
  state.admin=true;document.body.classList.add('v132-admin-open');
  const title=$('#v132AdminTitle',page);if(title)title.textContent=create?'Nouvelle offre':key?'Modifier une offre':adminTitle(area);
  enforceVisibility();
  $(`[data-c98-tab="${area}"]`,page)?.click();
  setTimeout(()=>{if(area==='offers'&&key)$$('[data-edit-offer]',page).find(button=>button.dataset.editOffer===key)?.click();if(area==='offers'&&create)$('#newOffer',page)?.click();},90);
}
function closeLegacy(){state.admin=false;document.body.classList.remove('v132-admin-open');enforceVisibility();loadContext(true);}

function filteredOffers(){
  const query=state.query.trim().toLowerCase();
  return offerViews().filter(offer=>{if(!state.showInactive&&!offer.active)return false;if(state.city!=='all'&&offer.cityId!==state.city)return false;if(query&&!offer.search.includes(query))return false;return true;});
}
function offerViews(){
  const formatMap=new Map(formats().map(item=>[String(item.id),item]));const supplierMap=new Map(suppliers().map(item=>[String(item.id),item]));
  return families().map((family,index)=>{const format=formatMap.get(String(family.formatId))||{},supplier=supplierMap.get(String(family.supplierId))||{};const cityName=family.cityName||cityNameById(family.cityId),formatName=family.formatName||format.name||`Offre ${index+1}`,supplierName=family.supplierName||supplier.name||'',configurations=configurationLabels(family),supplierNetCents=Number(family.supplierNetCents||supplier.defaultNetCents||0),tiers=family.tiers||{},active=family.active!==false,image=format.image||format.imageUrl||family.image||'',concept=family.concept||format.concept||format.description||'',issues=[];if(!cityName)issues.push('Ville manquante');if(!family.formatId&&!format.name)issues.push('Concept manquant');if(!supplierName)issues.push('Fournisseur manquant');if(!supplierNetCents)issues.push('Coût fournisseur manquant');if(!Object.values(tiers).some(tier=>Number(tier?.clientPriceCents||0)>0))issues.push('Tarif client manquant');const key=String(family.key||family.id||`${family.cityId||'city'}|${family.formatId||'format'}|${family.supplierId||'supplier'}|${index}`);return{key,cityId:String(family.cityId||''),cityName,formatName,concept,supplierId:String(family.supplierId||''),supplierName,configurations,supplierNetCents,tiers,active,image,issues,search:[cityName,formatName,concept,supplierName,...configurations].filter(Boolean).join(' ').toLowerCase()};}).sort((a,b)=>String(a.cityName).localeCompare(String(b.cityName),'fr')||String(a.formatName).localeCompare(String(b.formatName),'fr'));
}
function lowestPrice(offers){const values=offers.flatMap(offer=>Object.values(offer.tiers||{}).map(tier=>Number(tier?.clientPriceCents||0))).filter(value=>value>0);return values.length?Math.min(...values):0;}
function configurationLabels(family){return unique([...(Array.isArray(family.configurationOptions)?family.configurationOptions:[]),...(Array.isArray(family.configurationVisuals)?family.configurationVisuals.map(item=>typeof item==='string'?item:item?.label):[])]).filter(Boolean);}
function configurationCatalog(){return unique(families().flatMap(configurationLabels)).sort((a,b)=>a.localeCompare(b,'fr'));}
function previewUrl(key){const params=new URLSearchParams({catalog_preview:'studio',catalog_view:'format',catalog_family:key});return `/reserver?${params}`;}
function supplierInitial(value){return String(value||'?').trim().slice(0,2).toUpperCase();}
function adminTitle(area){return({formats:'Concepts',configurations:'Configurations',suppliers:'Fournisseurs',cities:'Villes',offers:'Offres & tarifs'})[area]||'Donnée du catalogue';}
function renderError(message){const root=$('#studioCatalogVisualV132');if(root)root.innerHTML=`<div class="v132-empty"><strong>Catalogue indisponible</strong><span>${html(message)}</span><button class="v132-btn" type="button" onclick="location.reload()">Réessayer</button></div>`;}
function cities(){return array(state.context?.cities).slice().sort((a,b)=>Number(a.publicOrder||999)-Number(b.publicOrder||999)||String(a.name||'').localeCompare(String(b.name||''),'fr'));}
function formats(){return array(state.context?.formats);}
function suppliers(){return array(state.context?.suppliers);}
function families(){return array(state.context?.families);}
function cityNameById(id){return cities().find(city=>String(city.id)===String(id))?.name||'';}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100)+' HT';}
function array(value){return Array.isArray(value)?value:[];}
function unique(values){return [...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))];}
function html(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function attr(value){return html(value);}
