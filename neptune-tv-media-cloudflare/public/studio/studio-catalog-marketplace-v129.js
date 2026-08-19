const RELEASE='neptune-studio-catalog-marketplace-20260820-v129-worker-enforced';
const API='/api/admin/media-catalog-v98/context';
const state={context:null,city:'all',query:'',showInactive:false,admin:false,loading:false};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let timer=0;

boot();

function boot(){
  document.body.dataset.studioCatalogMarketplace=RELEASE;
  schedule(0);
  new MutationObserver(()=>schedule(50)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('hashchange',()=>{state.admin=false;state.context=null;schedule(0);});
  document.addEventListener('click',handleDocumentClick,true);
  document.addEventListener('input',handleInput,true);
  document.addEventListener('submit',event=>{if(event.target.closest('.c98-page'))setTimeout(()=>load(true),700);},true);
}

function schedule(delay=50){clearTimeout(timer);timer=setTimeout(mount,delay);}
function isCatalog(){
  const page=$('.c98-page');
  if(!page||!$('.c98-tabs',page)||!$('.c98-layout',page))return false;
  const hash=(location.hash||'').toLowerCase();
  const tab=$('[data-tab="programs"].active,[data-tab="programs"][aria-current="page"]');
  const title=String($('#title')?.textContent||'').toLowerCase();
  return hash==='#programs'||Boolean(tab)||title.includes('catalogue');
}

async function mount(){
  if(!isCatalog()){
    document.body.classList.remove('v128-studio-marketplace','v128-catalog-admin-open');
    return;
  }
  const page=$('.c98-page');
  document.body.classList.add('v128-studio-marketplace');
  prepareHero(page);
  ensureShell(page);
  if(!state.context&&!state.loading)await load(false);
  else if(state.context&&!state.admin)render();
}

function prepareHero(page){
  const hero=$('.c98-hero',page);if(!hero)return;
  const eyebrow=$('.c98-eyebrow',hero),title=$('h2',hero),sync=$('.c98-sync',hero),tunnel=$('.c98-hero-actions a[href^="/reserver"]',hero);
  if(eyebrow)eyebrow.textContent='MARKETPLACE DE PRODUCTION';
  if(title)title.textContent='Catalogue Média';
  if($('#title'))$('#title').textContent='Catalogue Média';
  const copy=hero.firstElementChild;
  if(copy){
    [...copy.querySelectorAll('p:not(.c98-eyebrow):not(.v128-catalog-description)')].forEach(node=>node.hidden=true);
    let description=$('.v128-catalog-description',copy);
    if(!description){description=document.createElement('p');description.className='v128-catalog-description';copy.append(description);}
    description.textContent='Choisissez une ville. Concepts, fournisseurs, configurations et tarifs sont réunis au même endroit.';
  }
  if(sync){
    const node=[...sync.childNodes].find(item=>item.nodeType===Node.TEXT_NODE);
    if(node)node.textContent=' Catalogue synchronisé';
  }
  if(tunnel){tunnel.textContent='Voir le tunnel client ↗';tunnel.setAttribute('aria-label','Voir le tunnel de réservation côté client');}
}

function ensureShell(page){
  $('#studioCatalogGlanceV1221')?.remove();
  $('#catalogMarketplaceV126')?.remove();
  const tabs=$('.c98-tabs',page),layout=$('.c98-layout',page);
  if(!tabs||!layout)return;
  tabs.setAttribute('aria-hidden','true');
  let market=$('#studioCatalogMarketplaceV129',page);
  if(!market){
    market=document.createElement('section');
    market.id='studioCatalogMarketplaceV129';
    market.className='v128-market';
    market.setAttribute('aria-label','Marketplace du catalogue par ville');
    market.innerHTML='<div class="v128-loading"><i></i><span>Chargement des offres…</span></div>';
    tabs.before(market);
  }
  let admin=$('#studioCatalogAdminV129',page);
  if(!admin){
    admin=document.createElement('section');
    admin.id='studioCatalogAdminV129';
    admin.className='v128-admin-bar';
    admin.hidden=true;
    admin.innerHTML='<button type="button" class="v128-button" data-v129-back>← Retour au catalogue</button><div><small>GESTION INTERNE</small><strong id="v129AdminTitle">Données du catalogue</strong></div>';
    layout.before(admin);
  }
  if(!state.admin)layout.setAttribute('aria-hidden','true');
}

async function load(force=false){
  if(!isCatalog()||state.loading)return;
  if(state.context&&!force){render();return;}
  state.loading=true;
  try{
    const response=await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    state.context=await response.json();
    if(state.city!=='all'&&!cities().some(city=>String(city.id)===state.city))state.city='all';
    if(!state.admin)render();
  }catch(error){renderError(error.message);}
  finally{state.loading=false;}
}

function render(){
  const host=$('#studioCatalogMarketplaceV129');if(!host||!state.context||state.admin)return;
  const cityList=cities();
  const offers=offerViews();
  const activeCities=cityList.filter(city=>city.active!==false);
  const activeOffers=offers.filter(offer=>offer.active);
  host.innerHTML=`
    <div class="v128-toolbar">
      <label class="v128-search"><span aria-hidden="true">⌕</span><input data-v129-search type="search" value="${attr(state.query)}" placeholder="Ville, concept ou fournisseur…" aria-label="Rechercher dans le catalogue"></label>
      <div class="v128-summary"><strong>${activeCities.length}</strong><span>ville${activeCities.length===1?'':'s'}</span><i></i><strong>${activeOffers.length}</strong><span>offre${activeOffers.length===1?'':'s'}</span></div>
      <div class="v128-actions"><button class="v128-button v128-button--primary" type="button" data-v129-new>+ Nouvelle offre</button><div class="v128-manage"><button class="v128-button" type="button" data-v129-manage>Gérer les données ▾</button>${manageMenu()}</div></div>
    </div>
    <div class="v128-city-chooser" aria-label="Choisir une ville">${chip('all','Toutes les villes',offers.length)}${cityList.map(city=>chip(String(city.id),city.name,offers.filter(offer=>String(offer.cityId)===String(city.id)).length,city.active===false)).join('')}</div>
    <div class="v128-meta"><span>Ville → concept → fournisseur → coût → tarifs client</span><label><input data-v129-hidden type="checkbox" ${state.showInactive?'checked':''}> Voir les offres masquées</label></div>
    <div id="v129Listings" class="v128-listings"></div>`;
  renderListings();
}

function renderListings(){
  const host=$('#v129Listings');if(!host||!state.context)return;
  const query=state.query.trim().toLowerCase();
  const all=offerViews();
  const sections=[];
  for(const city of cities().filter(item=>state.city==='all'||String(item.id)===state.city)){
    let offers=all.filter(offer=>String(offer.cityId)===String(city.id));
    if(!state.showInactive)offers=offers.filter(offer=>offer.active);
    if(query)offers=offers.filter(offer=>offer.search.includes(query)||String(city.name||'').toLowerCase().includes(query));
    if(query&&!offers.length&&!String(city.name||'').toLowerCase().includes(query))continue;
    const suppliers=new Set(offers.map(offer=>offer.supplierId).filter(Boolean));
    const prices=offers.flatMap(offer=>Object.values(offer.tiers||{}).map(tier=>Number(tier?.clientPriceCents||0)).filter(Boolean));
    const start=prices.length?Math.min(...prices):0;
    sections.push(`<section class="v128-city-section"><header class="v128-city-head"><div class="v128-city-title"><span class="v128-pin">⌖</span><div><h3>${html(city.name)}</h3><p>${offers.length} offre${offers.length===1?'':'s'} · ${suppliers.size} fournisseur${suppliers.size===1?'':'s'}${start?` · à partir de ${money(start)}`:''}</p></div></div><button class="v128-button" type="button" data-v129-new="${attr(city.id)}">+ Ajouter une offre</button></header><div class="v128-offer-grid">${offers.length?offers.map(card).join(''):`<div class="v128-empty"><strong>Aucune offre ${state.showInactive?'':'active '}à ${html(city.name)}.</strong><span>Ajoutez un concept et son fournisseur pour rendre la ville exploitable.</span><button class="v128-button" type="button" data-v129-new="${attr(city.id)}">Créer une offre</button></div>`}</div></section>`);
  }
  host.innerHTML=sections.length?sections.join(''):'<div class="v128-empty"><strong>Aucun résultat.</strong><span>Essayez une autre ville, un concept ou un fournisseur.</span></div>';
}

function card(offer){
  const configs=offer.configurations.slice(0,4),extra=Math.max(0,offer.configurations.length-configs.length);
  const visual=offer.image?`<img src="${attr(offer.image)}" alt="" loading="lazy">`:'<div class="v128-visual-placeholder">NEPTUNE MEDIA</div>';
  return `<article class="v128-offer ${offer.active?'':'is-muted'}"><div class="v128-visual">${visual}<span class="v128-status ${offer.active?'is-active':''}">${offer.active?'Disponible':'Masquée'}</span></div><div class="v128-offer-body"><div class="v128-offer-top"><div><small>${html(offer.durationLabel||'CONCEPT')}</small><h4>${html(offer.formatName)}</h4></div><span class="v128-supplier">${html(offer.supplierName||'Fournisseur à définir')}</span></div><p class="v128-concept">${html(offer.concept||offer.description||'Concept à préciser')}</p><div class="v128-configs">${configs.length?configs.map(value=>`<span>${html(value)}</span>`).join(''):'<span class="is-empty">Configuration standard</span>'}${extra?`<span>+${extra}</span>`:''}</div><div class="v128-economics"><div class="is-cost"><span>Coût fournisseur</span><strong>${offer.supplierNetCents?money(offer.supplierNetCents):'—'}</strong></div>${price('Coûtant',offer.tiers.launch)}${price('Préférentiel',offer.tiers.promo)}${price('Normal',offer.tiers.base)}</div><div class="v128-offer-actions"><a href="${preview(offer.key)}" target="_blank" rel="noopener">Voir côté client ↗</a><button type="button" data-v129-edit="${attr(offer.key)}">Modifier</button></div></div></article>`;
}

function handleInput(event){
  if(event.target.matches('[data-v129-search]')){state.query=event.target.value;renderListings();}
  if(event.target.matches('[data-v129-hidden]')){state.showInactive=event.target.checked;render();}
}

function handleDocumentClick(event){
  const city=event.target.closest('[data-v129-city]');if(city){state.city=city.dataset.v129City||'all';render();return;}
  const edit=event.target.closest('[data-v129-edit]');if(edit){openAdmin('offers',{key:edit.dataset.v129Edit});return;}
  const create=event.target.closest('[data-v129-new]');if(create){openAdmin('offers',{create:true,cityId:create.dataset.v129New||''});return;}
  if(event.target.closest('[data-v129-manage]')){const menu=$('#v129ManageMenu');if(menu)menu.hidden=!menu.hidden;return;}
  const area=event.target.closest('[data-v129-area]');if(area){openAdmin(area.dataset.v129Area);return;}
  if(event.target.closest('[data-v129-back]')){closeAdmin();return;}
  const menu=$('#v129ManageMenu');if(menu&&!menu.hidden&&!event.target.closest('#v129ManageMenu'))menu.hidden=true;
}

function openAdmin(area,{key='',create=false,cityId=''}={}){
  const page=$('.c98-page');if(!page)return;
  state.admin=true;
  document.body.classList.add('v128-catalog-admin-open');
  $('#studioCatalogMarketplaceV129')?.setAttribute('aria-hidden','true');
  $('.c98-layout',page)?.removeAttribute('aria-hidden');
  const bar=$('#studioCatalogAdminV129',page);if(bar)bar.hidden=false;
  const title=$('#v129AdminTitle',page);if(title)title.textContent=create?'Nouvelle offre':key?'Modifier une offre':adminTitle(area);
  if(area==='services'){activateServices(0);return;}
  const target=$(`[data-c98-tab="${area}"]`,page);
  target?.click();
  setTimeout(()=>{
    if(area==='offers'&&key)$$('[data-edit-offer]',page).find(button=>button.dataset.editOffer===key)?.click();
    if(area==='offers'&&create){$('#newOffer',page)?.click();setTimeout(()=>{const form=$('#offerForm',page);if(form&&cityId&&form.cityId)form.cityId.value=cityId;},60);}
  },80);
}

function closeAdmin(){
  state.admin=false;
  document.body.classList.remove('v128-catalog-admin-open');
  $('#studioCatalogMarketplaceV129')?.removeAttribute('aria-hidden');
  $('.c98-layout')?.setAttribute('aria-hidden','true');
  const bar=$('#studioCatalogAdminV129');if(bar)bar.hidden=true;
  load(true);
}

function activateServices(attempt){
  const target=$('[data-c116-services]');
  if(target){target.click();return;}
  if(attempt<20)setTimeout(()=>activateServices(attempt+1),80);
}

function offerViews(){
  const context=state.context||{},formats=context.formats||[],suppliers=context.suppliers||[];
  return (context.families||[]).map(family=>{
    const format=formats.find(item=>String(item.id)===String(family.formatId))||family.format||{};
    const supplier=suppliers.find(item=>String(item.id)===String(family.supplierId))||{};
    const configs=(family.configurationVisuals||[]).map(item=>item?.label).filter(Boolean);
    const fallback=Array.isArray(family.configurationOptions)?family.configurationOptions:[];
    const view={...family,formatName:family.formatName||format.name||'Concept',supplierName:family.supplierName||supplier.name||'Fournisseur',concept:format.concept||family.concept||'',description:format.description||family.description||'',durationLabel:format.durationLabel||family.durationLabel||'',image:format.image||family.image||'',supplierNetCents:Number(family.supplierNetCents||supplier.defaultNetCents||0),configurations:configs.length?configs:fallback,tiers:family.tiers||{},active:family.active!==false};
    view.search=[family.cityName,view.formatName,view.supplierName,view.concept,view.description,...view.configurations].filter(Boolean).join(' ').toLowerCase();
    return view;
  });
}

function cities(){return Array.isArray(state.context?.cities)?state.context.cities:[];}
function chip(id,label,count,muted=false){return `<button type="button" class="v128-city-chip ${state.city===id?'is-active':''} ${muted?'is-muted':''}" data-v129-city="${attr(id)}"><span>${html(label)}</span><strong>${count}</strong></button>`;}
function price(label,tier){const value=Number(tier?.clientPriceCents||0);return `<div><span>${label}</span><strong>${value?money(value):'—'}</strong></div>`;}
function manageMenu(){return '<div id="v129ManageMenu" class="v128-manage-menu" hidden><small>ADMINISTRATION</small><button type="button" data-v129-area="formats">Concepts & formats</button><button type="button" data-v129-area="configurations">Configurations</button><button type="button" data-v129-area="services">Prestations</button><button type="button" data-v129-area="suppliers">Fournisseurs</button><button type="button" data-v129-area="cities">Villes</button><button type="button" data-v129-area="offers">Offres & tarifs</button></div>';}
function adminTitle(area){return({formats:'Concepts & formats',configurations:'Configurations',services:'Prestations',suppliers:'Fournisseurs',cities:'Villes',offers:'Offres & tarifs'})[area]||'Données du catalogue';}
function preview(key){return `/reserver?${new URLSearchParams({catalog_preview:'studio',catalog_family:key||''})}`;}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100);}
function renderError(message){const host=$('#studioCatalogMarketplaceV129');if(host)host.innerHTML=`<div class="v128-empty"><strong>Catalogue indisponible.</strong><span>${html(message||'Impossible de charger les offres.')}</span><button class="v128-button" type="button" onclick="location.reload()">Réessayer</button></div>`;}
function html(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function attr(value){return html(value);}
