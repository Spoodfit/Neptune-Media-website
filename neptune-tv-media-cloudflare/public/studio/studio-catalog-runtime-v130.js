const RELEASE='neptune-studio-catalog-marketplace-20260820-v130-runtime';
const API='/api/admin/media-catalog-v98/context';
const state={context:null,city:'all',query:'',showInactive:false,admin:false,loading:false};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let mountTimer=0,refreshTimer=0;

boot();

function boot(){
  window.__neptuneStudioCatalogRuntimeV130=RELEASE;
  document.body.dataset.studioCatalogRuntime=RELEASE;
  scheduleMount(0);
  new MutationObserver(()=>{
    if(!catalogDomReady())return;
    if(!$('#studioCatalogMarketplaceV128')||!document.body.classList.contains('v128-studio-marketplace'))scheduleMount(35);
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('hashchange',()=>{state.admin=false;state.context=null;scheduleMount(0);});
  document.addEventListener('click',handleClick,true);
  document.addEventListener('input',handleInput,true);
  document.addEventListener('submit',event=>{if(event.target.closest('.c98-page'))scheduleRefresh(800);},true);
}

function scheduleMount(delay=35){clearTimeout(mountTimer);mountTimer=setTimeout(mount,delay);}
function scheduleRefresh(delay=0){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadContext(true),delay);}

function catalogDomReady(){
  const page=$('.c98-page');
  if(!page||!$('.c98-tabs',page)||!$('.c98-layout',page))return false;
  const hash=(location.hash||'').toLowerCase();
  const activeTab=$('[data-tab="programs"].active,[data-tab="programs"][aria-current="page"]');
  const title=String($('#title')?.textContent||'').toLowerCase();
  return hash==='#programs'||Boolean(activeTab)||title.includes('catalogue');
}

async function mount(){
  if(!catalogDomReady()){
    document.body.classList.remove('v128-studio-marketplace','v128-catalog-admin-open');
    return;
  }
  const page=$('.c98-page');
  document.body.classList.add('v128-studio-marketplace');
  page.dataset.catalogRuntime='v130';
  prepareHero(page);
  ensureMarketplace(page);
  if(!state.context&&!state.loading)await loadContext(false);
  else if(state.context&&!state.admin)renderMarketplace();
}

function prepareHero(page){
  const hero=$('.c98-hero',page);if(!hero)return;
  const eyebrow=$('.c98-eyebrow',hero),title=$('h2',hero),sync=$('.c98-sync',hero),tunnel=$('.c98-hero-actions a[href^="/reserver"]',hero);
  if($('#title'))$('#title').textContent='Catalogue Média';
  if(eyebrow)eyebrow.textContent='MARKETPLACE DE PRODUCTION';
  if(title)title.textContent='Catalogue Média';
  const copy=hero.firstElementChild;
  if(copy){
    [...copy.querySelectorAll('p:not(.c98-eyebrow):not(.v128-catalog-description)')].forEach(node=>node.hidden=true);
    let description=$('.v128-catalog-description',copy);
    if(!description){description=document.createElement('p');description.className='v128-catalog-description';copy.append(description);}
    description.textContent='Choisissez une ville. Concepts, formats, fournisseurs, configurations et tarifs sont réunis au même endroit.';
  }
  if(sync){
    const text=[...sync.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
    if(text)text.textContent=' Catalogue synchronisé';
  }
  if(tunnel){tunnel.textContent='Voir le tunnel client ↗';tunnel.setAttribute('aria-label','Voir le tunnel de réservation côté client');}
}

function ensureMarketplace(page){
  $('#studioCatalogGlanceV1221')?.remove();
  $('#catalogMarketplaceV126')?.remove();
  const tabs=$('.c98-tabs',page),layout=$('.c98-layout',page);
  if(!tabs||!layout)return;
  tabs.setAttribute('aria-hidden','true');
  let market=$('#studioCatalogMarketplaceV128',page);
  if(!market){
    market=document.createElement('section');
    market.id='studioCatalogMarketplaceV128';
    market.className='v128-market';
    market.setAttribute('aria-label','Marketplace du catalogue par ville');
    market.innerHTML='<div class="v128-loading"><i></i><span>Chargement des offres par ville…</span></div>';
    tabs.before(market);
  }
  let admin=$('#studioCatalogAdminV128',page);
  if(!admin){
    admin=document.createElement('section');
    admin.id='studioCatalogAdminV128';
    admin.className='v128-admin-bar';
    admin.hidden=true;
    admin.innerHTML='<button type="button" class="v128-button" data-v130-back>← Retour au catalogue</button><div><small>GESTION INTERNE</small><strong id="v128AdminTitle">Données du catalogue</strong></div>';
    layout.before(admin);
  }
  if(!state.admin)layout.setAttribute('aria-hidden','true');
}

async function loadContext(force=false){
  if(!catalogDomReady()||state.loading)return;
  if(state.context&&!force){renderMarketplace();return;}
  state.loading=true;
  try{
    const response=await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    state.context=await response.json();
    if(state.city!=='all'&&!cities().some(city=>String(city.id)===state.city))state.city='all';
    if(!state.admin)renderMarketplace();
  }catch(error){renderError(error.message);}
  finally{state.loading=false;}
}

function renderMarketplace(){
  const market=$('#studioCatalogMarketplaceV128');if(!market||!state.context||state.admin)return;
  const cityList=cities(),offers=offerViews();
  const activeCities=cityList.filter(city=>city.active!==false),activeOffers=offers.filter(offer=>offer.active);
  market.innerHTML=`<div class="v128-toolbar">
    <label class="v128-search"><span aria-hidden="true">⌕</span><input data-v130-search type="search" value="${attr(state.query)}" placeholder="Rechercher une ville, un concept, un fournisseur…" aria-label="Rechercher dans le catalogue"></label>
    <div class="v128-summary"><strong>${activeCities.length}</strong><span>ville${activeCities.length===1?'':'s'}</span><i></i><strong>${activeOffers.length}</strong><span>offre${activeOffers.length===1?'':'s'} disponible${activeOffers.length===1?'':'s'}</span></div>
    <div class="v128-actions"><button class="v128-button v128-button--primary" type="button" data-v130-new>+ Nouvelle offre</button><div class="v128-manage"><button class="v128-button" type="button" data-v130-manage>Gérer les données ▾</button>${manageMenu()}</div></div>
  </div>
  <div class="v128-city-chooser" aria-label="Choisir une ville">${cityChip('all','Toutes les villes',offers.length)}${cityList.map(city=>cityChip(String(city.id),city.name,offers.filter(offer=>String(offer.cityId)===String(city.id)).length,city.active===false)).join('')}</div>
  <div class="v128-meta"><span>Ville → concept → fournisseur → coût → tarifs client</span><label><input data-v130-hidden type="checkbox" ${state.showInactive?'checked':''}> Voir aussi les offres masquées</label></div>
  <div id="v128Listings" class="v128-listings"></div>`;
  renderListings();
}

function renderListings(){
  const host=$('#v128Listings');if(!host||!state.context)return;
  const query=state.query.trim().toLowerCase(),allOffers=offerViews(),sections=[];
  for(const city of cities().filter(item=>state.city==='all'||String(item.id)===state.city)){
    let offers=allOffers.filter(offer=>String(offer.cityId)===String(city.id));
    if(!state.showInactive)offers=offers.filter(offer=>offer.active);
    if(query)offers=offers.filter(offer=>offer.search.includes(query)||String(city.name||'').toLowerCase().includes(query));
    if(query&&!offers.length&&!String(city.name||'').toLowerCase().includes(query))continue;
    const suppliers=new Set(offers.map(offer=>offer.supplierId).filter(Boolean));
    const prices=offers.flatMap(offer=>Object.values(offer.tiers||{}).map(tier=>Number(tier?.clientPriceCents||0)).filter(Boolean));
    const starting=prices.length?Math.min(...prices):0;
    sections.push(`<section class="v128-city-section"><header class="v128-city-head"><div class="v128-city-title"><span class="v128-pin">⌖</span><div><h3>${html(city.name)}</h3><p>${offers.length} offre${offers.length===1?'':'s'} · ${suppliers.size} fournisseur${suppliers.size===1?'':'s'}${starting?` · à partir de ${money(starting)}`:''}</p></div></div><button class="v128-button" type="button" data-v130-new="${attr(city.id)}">+ Ajouter une offre</button></header><div class="v128-offer-grid">${offers.length?offers.map(offerCard).join(''):`<div class="v128-empty"><strong>Aucune offre ${state.showInactive?'':'active '}à ${html(city.name)}.</strong><span>Ajoutez un concept et son fournisseur pour rendre cette ville exploitable.</span><button class="v128-button" type="button" data-v130-new="${attr(city.id)}">Créer une offre</button></div>`}</div></section>`);
  }
  host.innerHTML=sections.length?sections.join(''):'<div class="v128-empty"><strong>Aucun résultat.</strong><span>Essayez une autre ville, un concept ou un fournisseur.</span></div>';
}

function offerCard(offer){
  const configs=offer.configurations.slice(0,4),extra=Math.max(0,offer.configurations.length-configs.length);
  const visual=offer.image?`<img src="${attr(offer.image)}" alt="" loading="lazy">`:'<div class="v128-visual-placeholder">NEPTUNE MEDIA</div>';
  return `<article class="v128-offer ${offer.active?'':'is-muted'}"><div class="v128-visual">${visual}<span class="v128-status ${offer.active?'is-active':''}">${offer.active?'Disponible':'Masquée'}</span></div><div class="v128-offer-body"><div class="v128-offer-top"><div><small>${html(offer.durationLabel||'CONCEPT')}</small><h4>${html(offer.formatName)}</h4></div><span class="v128-supplier">${html(offer.supplierName||'Fournisseur à définir')}</span></div><p class="v128-concept">${html(offer.concept||offer.description||'Concept à préciser')}</p><div class="v128-configs">${configs.length?configs.map(value=>`<span>${html(value)}</span>`).join(''):'<span class="is-empty">Configuration standard</span>'}${extra?`<span>+${extra}</span>`:''}</div><div class="v128-economics"><div class="is-cost"><span>Coût fournisseur</span><strong>${offer.supplierNetCents?money(offer.supplierNetCents):'—'}</strong></div>${priceCell('Coûtant',offer.tiers.launch)}${priceCell('Préférentiel',offer.tiers.promo)}${priceCell('Normal',offer.tiers.base)}</div><div class="v128-offer-actions"><a href="${previewUrl(offer.key)}" target="_blank" rel="noopener">Voir côté client ↗</a><button type="button" data-v130-edit="${attr(offer.key)}">Modifier</button></div></div></article>`;
}

function handleInput(event){
  if(event.target.matches('[data-v130-search]')){state.query=event.target.value;renderListings();}
  if(event.target.matches('[data-v130-hidden]')){state.showInactive=event.target.checked;renderMarketplace();}
}

function handleClick(event){
  if(event.target.closest('#refresh')){scheduleRefresh(300);return;}
  const city=event.target.closest('[data-v130-city]');if(city){state.city=city.dataset.v130City||'all';renderMarketplace();return;}
  const edit=event.target.closest('[data-v130-edit]');if(edit){openAdmin('offers',{key:edit.dataset.v130Edit});return;}
  const create=event.target.closest('[data-v130-new]');if(create){openAdmin('offers',{create:true,cityId:create.dataset.v130New||''});return;}
  if(event.target.closest('[data-v130-manage]')){const menu=$('#v130ManageMenu');if(menu)menu.hidden=!menu.hidden;return;}
  const area=event.target.closest('[data-v130-area]');if(area){openAdmin(area.dataset.v130Area);return;}
  if(event.target.closest('[data-v130-back]')){closeAdmin();return;}
  const menu=$('#v130ManageMenu');if(menu&&!menu.hidden&&!event.target.closest('#v130ManageMenu'))menu.hidden=true;
}

function openAdmin(area,{key='',create=false,cityId=''}={}){
  const page=$('.c98-page');if(!page)return;
  state.admin=true;
  document.body.classList.add('v128-catalog-admin-open');
  $('#studioCatalogMarketplaceV128')?.setAttribute('aria-hidden','true');
  $('.c98-layout',page)?.removeAttribute('aria-hidden');
  const bar=$('#studioCatalogAdminV128',page);if(bar)bar.hidden=false;
  const title=$('#v128AdminTitle',page);if(title)title.textContent=create?'Nouvelle offre':key?'Modifier une offre':adminTitle(area);
  if(area==='services'){activateServices(0);return;}
  $(`[data-c98-tab="${area}"]`,page)?.click();
  setTimeout(()=>{
    if(area==='offers'&&key)$$('[data-edit-offer]',page).find(button=>button.dataset.editOffer===key)?.click();
    if(area==='offers'&&create){$('#newOffer',page)?.click();setTimeout(()=>{const form=$('#offerForm',page);if(form&&cityId&&form.cityId)form.cityId.value=cityId;},60);}
  },80);
}

function closeAdmin(){
  state.admin=false;
  document.body.classList.remove('v128-catalog-admin-open');
  $('#studioCatalogMarketplaceV128')?.removeAttribute('aria-hidden');
  $('.c98-layout')?.setAttribute('aria-hidden','true');
  const bar=$('#studioCatalogAdminV128');if(bar)bar.hidden=true;
  loadContext(true);
}

function activateServices(attempt){const target=$('[data-c116-services]');if(target){target.click();return;}if(attempt<20)setTimeout(()=>activateServices(attempt+1),80);}
function adminTitle(area){return({formats:'Concepts & formats',configurations:'Configurations',services:'Prestations',suppliers:'Fournisseurs',cities:'Villes',offers:'Offres & tarifs'})[area]||'Données du catalogue';}
function manageMenu(){return '<div id="v130ManageMenu" class="v128-manage-menu" hidden><small>ADMINISTRATION</small><button type="button" data-v130-area="formats">Concepts & formats</button><button type="button" data-v130-area="configurations">Configurations</button><button type="button" data-v130-area="services">Prestations</button><button type="button" data-v130-area="suppliers">Fournisseurs</button><button type="button" data-v130-area="cities">Villes</button><button type="button" data-v130-area="offers">Offres & tarifs</button></div>';}

function offerViews(){
  const context=state.context||{},formatMap=new Map(array(context.formats).map(item=>[String(item.id),item])),supplierMap=new Map(array(context.suppliers).map(item=>[String(item.id),item]));
  return array(context.families).map((family,index)=>{
    const format=formatMap.get(String(family.formatId))||{},supplier=supplierMap.get(String(family.supplierId))||{};
    const configurations=configurationLabels(family),cityName=family.cityName||cityNameById(family.cityId),formatName=family.formatName||format.name||`Concept ${index+1}`,supplierName=family.supplierName||supplier.name||'Fournisseur à définir';
    const supplierNetCents=numberOr(family.supplierNetCents,supplier.defaultNetCents,0),tiers=family.tiers||{},concept=family.concept||format.concept||'',description=family.description||format.description||'';
    const search=[cityName,formatName,concept,description,supplierName,...configurations].join(' ').toLowerCase();
    return {...family,key:String(family.key||`${family.cityId||''}:${family.formatId||''}:${family.supplierId||''}`),cityName,formatName,supplierName,concept,description,durationLabel:family.durationLabel||format.durationLabel||'',image:format.image||format.imageUrl||family.image||'',supplierNetCents,tiers,configurations,active:family.active!==false,search};
  }).sort((a,b)=>numberOr(a.publicOrder,100)-numberOr(b.publicOrder,100)||String(a.formatName).localeCompare(String(b.formatName),'fr'));
}
function cities(){return array(state.context?.cities).slice().sort((a,b)=>numberOr(a.publicOrder,100)-numberOr(b.publicOrder,100)||String(a.name).localeCompare(String(b.name),'fr'));}
function cityNameById(id){return cities().find(city=>String(city.id)===String(id))?.name||'Ville';}
function configurationLabels(family){const seen=new Set();return [...array(family.configurationOptions),...array(family.configurationVisuals)].map(item=>typeof item==='string'?item:item?.label||item?.name||item?.title||'').map(value=>String(value||'').trim()).filter(value=>value&&!seen.has(value)&&seen.add(value));}
function cityChip(id,label,count,muted=false){return `<button type="button" class="v128-city-chip ${state.city===id?'is-active':''} ${muted?'is-muted':''}" data-v130-city="${attr(id)}"><span>${html(label)}</span><strong>${count}</strong></button>`;}
function priceCell(label,tier){const value=Number(tier?.clientPriceCents||0);return `<div><span>${label}</span><strong>${value?money(value):'—'}</strong></div>`;}
function previewUrl(key){const params=new URLSearchParams({catalog_preview:'studio',catalog_view:'format',catalog_family:key});return `/reserver?${params}`;}
function renderError(message){const market=$('#studioCatalogMarketplaceV128');if(market)market.innerHTML=`<div class="v128-empty"><strong>Catalogue indisponible.</strong><span>${html(message||'Impossible de charger les offres.')}</span><button class="v128-button" type="button" onclick="location.reload()">Réessayer</button></div>`;}
function array(value){return Array.isArray(value)?value:[];}
function numberOr(...values){for(const value of values){const number=Number(value);if(Number.isFinite(number)&&value!==''&&value!==null&&value!==undefined)return number;}return 0;}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100)+' HT';}
function html(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function attr(value){return html(value).replace(/`/gu,'&#096;');}
