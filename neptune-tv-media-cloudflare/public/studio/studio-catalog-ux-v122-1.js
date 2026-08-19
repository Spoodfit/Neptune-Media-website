const RELEASE='neptune-studio-catalog-marketplace-20260820-v128';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
const state={context:null,query:'',city:'all',showInactive:false,admin:false,loading:false};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let enhanceTimer=0,refreshTimer=0;

boot();

function boot(){
  document.body.dataset.studioCatalogUx=RELEASE;
  enhance();
  new MutationObserver(()=>scheduleEnhance()).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('hashchange',()=>{state.admin=false;state.context=null;scheduleEnhance();});
  document.addEventListener('submit',event=>{if(event.target.closest('.c98-page'))scheduleContextRefresh(900);},true);
  document.addEventListener('click',event=>{if(event.target.closest('#refresh'))scheduleContextRefresh(450);},true);
}

function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,45);}
function scheduleContextRefresh(delay=0){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadContext(true),delay);}
function active(){return location.pathname.includes('/studio/advanced')&&(location.hash||'#programs')==='#programs';}

async function enhance(){
  if(!active()){
    document.body.classList.remove('v122-studio-catalog','v128-studio-marketplace','v128-catalog-admin-open');
    return;
  }
  const page=$('.c98-page');
  if(!page)return;
  document.body.classList.add('v122-studio-catalog','v128-studio-marketplace');
  page.dataset.catalogUxV1221='marketplace-v128';
  $('#title') && ($('#title').textContent='Catalogue Média');
  prepareHero(page);
  ensureMarketplace(page);
  if(!state.context&&!state.loading)await loadContext(false);
  else if(state.context&&!state.admin)renderMarketplace();
}

function prepareHero(page){
  const hero=$('.c98-hero',page);if(!hero)return;
  const eyebrow=$('.c98-eyebrow',hero),title=$('h2',hero),sync=$('.c98-sync',hero),tunnel=$('.c98-hero-actions a[href^="/reserver"]',hero);
  if(eyebrow)eyebrow.textContent='MARKETPLACE DE PRODUCTION';
  if(title)title.textContent='Catalogue Média';
  const copy=hero.firstElementChild;
  if(copy){
    [...copy.querySelectorAll('p:not(.c98-eyebrow):not(.v128-catalog-description)')].forEach(node=>node.hidden=true);
    let description=$('.v128-catalog-description',copy);
    if(!description){description=document.createElement('p');description.className='v128-catalog-description';copy.append(description);}
    description.textContent='Choisissez une ville. Tous les concepts réellement faisables, leurs fournisseurs et leurs tarifs sont déjà rapprochés.';
  }
  if(sync){const text=[...sync.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);if(text)text.textContent=' Catalogue synchronisé';}
  if(tunnel){tunnel.textContent='Voir le tunnel client ↗';tunnel.setAttribute('aria-label','Voir le tunnel de réservation côté client');}
}

function ensureMarketplace(page){
  $('#studioCatalogGlanceV1221')?.remove();
  $('#catalogMarketplaceV126')?.remove();
  const tabs=$('.c98-tabs',page),layout=$('.c98-layout',page);
  if(!tabs||!layout)return;
  let market=$('#studioCatalogMarketplaceV128',page);
  if(!market){
    market=document.createElement('section');
    market.id='studioCatalogMarketplaceV128';
    market.className='v128-market';
    market.setAttribute('aria-label','Marketplace du catalogue par ville');
    market.innerHTML='<div class="v128-loading"><i></i><span>Chargement des offres par ville…</span></div>';
    tabs.before(market);
    bindMarketplace(market);
  }
  let adminBar=$('#studioCatalogAdminV128',page);
  if(!adminBar){
    adminBar=document.createElement('section');
    adminBar.id='studioCatalogAdminV128';
    adminBar.className='v128-admin-bar';
    adminBar.hidden=true;
    adminBar.innerHTML='<button type="button" class="v128-button" data-v128-back>← Retour au catalogue</button><div><small>GESTION INTERNE</small><strong id="v128AdminTitle">Données du catalogue</strong></div>';
    layout.before(adminBar);
    adminBar.addEventListener('click',event=>{if(event.target.closest('[data-v128-back]'))closeAdmin();});
  }
  tabs.setAttribute('aria-hidden','true');
  if(!state.admin)layout.setAttribute('aria-hidden','true');
}

function bindMarketplace(market){
  market.addEventListener('input',event=>{
    if(event.target.matches('[data-v128-search]')){state.query=event.target.value.trim().toLowerCase();renderListings();}
    if(event.target.matches('[data-v128-hidden]')){state.showInactive=event.target.checked;renderMarketplace();}
  });
  market.addEventListener('click',event=>{
    const city=event.target.closest('[data-v128-city]');
    if(city){state.city=city.dataset.v128City||'all';renderMarketplace();return;}
    const edit=event.target.closest('[data-v128-edit]');
    if(edit){openAdmin('offers',{key:edit.dataset.v128Edit});return;}
    const create=event.target.closest('[data-v128-new]');
    if(create){openAdmin('offers',{create:true,cityId:create.dataset.v128New||''});return;}
    if(event.target.closest('[data-v128-manage]')){const menu=$('#v128ManageMenu');if(menu)menu.hidden=!menu.hidden;return;}
    const area=event.target.closest('[data-v128-area]');
    if(area){openAdmin(area.dataset.v128Area);return;}
    if(event.target.closest('[data-v128-retry]'))loadContext(true);
  });
  document.addEventListener('click',event=>{const menu=$('#v128ManageMenu');if(menu&&!menu.hidden&&!event.target.closest('[data-v128-manage]')&&!event.target.closest('#v128ManageMenu'))menu.hidden=true;},true);
}

async function loadContext(force=false){
  if(!active()||state.loading)return;
  if(state.context&&!force){renderMarketplace();return;}
  state.loading=true;
  try{
    const response=await fetch(CONTEXT_API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    state.context=await response.json();
    if(state.city!=='all'&&!cities().some(city=>String(city.id)===state.city))state.city='all';
    if(!state.admin)renderMarketplace();
  }catch(error){renderError(error.message);}finally{state.loading=false;}
}

function renderMarketplace(){
  const market=$('#studioCatalogMarketplaceV128');if(!market||!state.context||state.admin)return;
  const cityList=cities();const offers=offerViews();const visibleOffers=offers.filter(offer=>state.showInactive||offer.active);const activeCities=cityList.filter(city=>city.active!==false);
  market.innerHTML=`
    <div class="v128-toolbar">
      <label class="v128-search"><span aria-hidden="true">⌕</span><input data-v128-search type="search" value="${escapeAttr(state.query)}" placeholder="Rechercher une ville, un concept, un fournisseur…" aria-label="Rechercher dans le catalogue"></label>
      <div class="v128-summary"><strong>${activeCities.length}</strong><span>ville${activeCities.length===1?'':'s'}</span><i></i><strong>${visibleOffers.filter(offer=>offer.active).length}</strong><span>offre${visibleOffers.filter(offer=>offer.active).length===1?'':'s'} disponible${visibleOffers.filter(offer=>offer.active).length===1?'':'s'}</span></div>
      <div class="v128-actions"><button class="v128-button v128-button--primary" type="button" data-v128-new>+ Nouvelle offre</button><div class="v128-manage"><button class="v128-button" type="button" data-v128-manage>Gérer les données ▾</button>${manageMenu()}</div></div>
    </div>
    <div class="v128-city-chooser" aria-label="Choisir une ville">${cityChip('all','Toutes les villes',visibleOffers.length)}${cityList.map(city=>cityChip(String(city.id),city.name,visibleOffers.filter(offer=>String(offer.cityId)===String(city.id)).length,city.active===false)).join('')}</div>
    <div class="v128-meta"><span>Ville → concepts réalisables → fournisseur → coût → tarifs client</span><label><input data-v128-hidden type="checkbox" ${state.showInactive?'checked':''}> Voir aussi les offres masquées</label></div>
    <div id="v128Listings" class="v128-listings"></div>`;
  renderListings();
}

function renderListings(){
  const host=$('#v128Listings');if(!host||!state.context)return;
  const query=state.query;const allOffers=offerViews();const targetCities=cities().filter(city=>state.city==='all'||String(city.id)===state.city);const sections=[];
  for(const city of targetCities){
    let offers=allOffers.filter(offer=>String(offer.cityId)===String(city.id));
    if(!state.showInactive)offers=offers.filter(offer=>offer.active);
    if(query)offers=offers.filter(offer=>offer.search.includes(query));
    if(query&&offers.length===0&&!String(city.name||'').toLowerCase().includes(query))continue;
    const suppliers=new Set(offers.map(offer=>offer.supplierId).filter(Boolean));
    const prices=offers.flatMap(offer=>Object.values(offer.tiers||{}).map(tier=>Number(tier?.clientPriceCents||0)).filter(Boolean));
    const starting=prices.length?Math.min(...prices):0;
    sections.push(`<section class="v128-city-section"><header class="v128-city-head"><div class="v128-city-title"><span class="v128-pin">⌖</span><div><h3>${escapeHtml(city.name)}</h3><p>${offers.length} offre${offers.length===1?'':'s'} · ${suppliers.size} fournisseur${suppliers.size===1?'':'s'}${starting?` · à partir de ${money(starting)}`:''}</p></div></div><button class="v128-button" type="button" data-v128-new="${escapeAttr(city.id)}">+ Ajouter une offre à ${escapeHtml(city.name)}</button></header><div class="v128-offer-grid">${offers.length?offers.map(offerCard).join(''):`<div class="v128-empty"><strong>Aucune offre ${state.showInactive?'':'active '}pour ${escapeHtml(city.name)}.</strong><span>Ajoutez une combinaison concept × fournisseur pour rendre cette ville exploitable.</span><button class="v128-button" type="button" data-v128-new="${escapeAttr(city.id)}">Créer une offre</button></div>`}</div></section>`);
  }
  host.innerHTML=sections.length?sections.join(''):'<div class="v128-empty"><strong>Aucun résultat.</strong><span>Essayez un autre terme ou revenez à “Toutes les villes”.</span></div>';
}

function offerCard(offer){
  const configs=offer.configurations.slice(0,4),extra=Math.max(0,offer.configurations.length-configs.length);
  const visual=offer.image?`<img src="${escapeAttr(offer.image)}" alt="" loading="lazy">`:'<div class="v128-visual-placeholder">NEPTUNE MEDIA</div>';
  return `<article class="v128-offer ${offer.active?'':'is-muted'}">
    <div class="v128-visual">${visual}<span class="v128-status ${offer.active?'is-active':''}">${offer.active?'Disponible':'Masquée'}</span></div>
    <div class="v128-offer-body">
      <div class="v128-offer-top"><div><small>${escapeHtml(offer.durationLabel||'CONCEPT')}</small><h4>${escapeHtml(offer.formatName)}</h4></div><span class="v128-supplier">${escapeHtml(offer.supplierName||'Fournisseur à définir')}</span></div>
      <p class="v128-concept">${escapeHtml(offer.concept||offer.description||'Concept à préciser')}</p>
      <div class="v128-configs">${configs.length?configs.map(config=>`<span>${escapeHtml(config)}</span>`).join(''):'<span class="is-empty">Configuration standard</span>'}${extra?`<span>+${extra}</span>`:''}</div>
      <div class="v128-economics"><div class="is-cost"><span>Coût fournisseur</span><strong>${offer.supplierNetCents?money(offer.supplierNetCents):'—'}</strong></div>${priceCell('Coûtant',offer.tiers.launch)}${priceCell('Préférentiel',offer.tiers.promo)}${priceCell('Normal',offer.tiers.base)}</div>
      <div class="v128-offer-actions"><a href="${previewUrl(offer.key)}" target="_blank" rel="noopener">Voir côté client ↗</a><button type="button" data-v128-edit="${escapeAttr(offer.key)}">Modifier</button></div>
    </div>
  </article>`;
}

function cityChip(id,label,count,muted=false){return `<button type="button" class="v128-city-chip ${state.city===id?'is-active':''} ${muted?'is-muted':''}" data-v128-city="${escapeAttr(id)}"><span>${escapeHtml(label)}</span><strong>${count}</strong></button>`;}
function priceCell(label,tier){const value=Number(tier?.clientPriceCents||0);return `<div><span>${label}</span><strong>${value?money(value):'—'}</strong></div>`;}
function manageMenu(){return `<div id="v128ManageMenu" class="v128-manage-menu" hidden><small>ADMINISTRATION</small><button type="button" data-v128-area="formats">Concepts & formats</button><button type="button" data-v128-area="configurations">Configurations</button><button type="button" data-v128-area="services">Prestations</button><button type="button" data-v128-area="suppliers">Fournisseurs</button><button type="button" data-v128-area="cities">Villes</button><button type="button" data-v128-area="offers">Offres & tarifs</button></div>`;}

function openAdmin(area,{key='',create=false,cityId=''}={}){
  const page=$('.c98-page');if(!page)return;
  state.admin=true;document.body.classList.add('v128-catalog-admin-open');
  $('#studioCatalogMarketplaceV128')?.setAttribute('aria-hidden','true');
  const layout=$('.c98-layout',page);layout?.removeAttribute('aria-hidden');
  const bar=$('#studioCatalogAdminV128');if(bar)bar.hidden=false;
  const title=$('#v128AdminTitle');if(title)title.textContent=adminTitle(area,key,create);
  if(area==='services'){activateServices(0);return;}
  const target=$(`[data-c98-tab="${area==='offers'?'offers':area}"]`,page);target?.click();
  setTimeout(()=>{
    if(area==='offers'&&key)$$('[data-edit-offer]',page).find(button=>button.dataset.editOffer===key)?.click();
    if(area==='offers'&&create){$('#newOffer',page)?.click();setTimeout(()=>{const form=$('#offerForm',page);if(form&&cityId&&form.cityId)form.cityId.value=cityId;},50);}
  },70);
}

function activateServices(attempt){const target=$('[data-c116-services]');if(target){target.click();return;}if(attempt<18)setTimeout(()=>activateServices(attempt+1),80);}
function closeAdmin(){state.admin=false;document.body.classList.remove('v128-catalog-admin-open');$('#studioCatalogMarketplaceV128')?.removeAttribute('aria-hidden');$('.c98-layout')?.setAttribute('aria-hidden','true');const bar=$('#studioCatalogAdminV128');if(bar)bar.hidden=true;loadContext(true);}
function adminTitle(area,key,create){if(create)return'Nouvelle offre';if(key)return'Modifier une offre';return({formats:'Concepts & formats',configurations:'Configurations',services:'Prestations',suppliers:'Fournisseurs',cities:'Villes',offers:'Offres & tarifs'})[area]||'Données du catalogue';}

function offerViews(){
  const context=state.context||{},formatMap=new Map(array(context.formats).map(item=>[String(item.id),item])),supplierMap=new Map(array(context.suppliers).map(item=>[String(item.id),item]));
  return array(context.families).map((family,index)=>{
    const format=formatMap.get(String(family.formatId))||{},supplier=supplierMap.get(String(family.supplierId))||{};
    const configurations=configurationLabels(family);const cityName=family.cityName||cityNameById(family.cityId);const formatName=family.formatName||format.name||`Concept ${index+1}`;const supplierName=family.supplierName||supplier.name||'Fournisseur à définir';
    const supplierNetCents=numberOr(family.supplierNetCents,supplier.defaultNetCents,0);const tiers=family.tiers||{};const concept=family.concept||format.concept||'';const description=family.description||format.description||'';
    const search=[cityName,formatName,concept,description,supplierName,...configurations].join(' ').toLowerCase();
    return {...family,key:String(family.key||`${family.cityId||''}:${family.formatId||''}:${family.supplierId||''}`),cityName,formatName,supplierName,concept,description,durationLabel:family.durationLabel||format.durationLabel||'',image:format.image||format.imageUrl||family.image||'',supplierNetCents,tiers,configurations,active:family.active!==false,search};
  }).sort((a,b)=>numberOr(a.publicOrder,100)-numberOr(b.publicOrder,100)||String(a.formatName).localeCompare(String(b.formatName),'fr'));
}
function cities(){return array(state.context?.cities).slice().sort((a,b)=>numberOr(a.publicOrder,100)-numberOr(b.publicOrder,100)||String(a.name).localeCompare(String(b.name),'fr'));}
function cityNameById(id){return cities().find(city=>String(city.id)===String(id))?.name||'Ville';}
function configurationLabels(family){const seen=new Set();return [...array(family.configurationOptions),...array(family.configurationVisuals)].map(item=>typeof item==='string'?item:item?.label||item?.name||item?.title||'').map(value=>String(value||'').trim()).filter(value=>value&&!seen.has(value)&&seen.add(value));}
function previewUrl(key){const params=new URLSearchParams({catalog_preview:'studio',catalog_view:'format',catalog_family:key});return `/reserver?${params}`;}
function renderError(message){const market=$('#studioCatalogMarketplaceV128');if(market)market.innerHTML=`<div class="v128-empty"><strong>Catalogue indisponible.</strong><span>${escapeHtml(message||'Impossible de charger les offres.')}</span><button class="v128-button" type="button" data-v128-retry>Réessayer</button></div>`;}
function array(value){return Array.isArray(value)?value:[];}
function numberOr(...values){for(const value of values){const number=Number(value);if(Number.isFinite(number)&&value!==''&&value!==null&&value!==undefined)return number;}return 0;}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100)+' HT';}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function escapeAttr(value){return escapeHtml(value).replace(/`/gu,'&#096;');}
