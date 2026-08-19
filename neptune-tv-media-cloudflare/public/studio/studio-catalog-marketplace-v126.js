const RELEASE='neptune-studio-catalog-marketplace-20260819-v126';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
const state={context:null,query:'',city:'all',showInactive:false,admin:false,mounted:false,loading:false};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

boot();

function boot(){
  document.body.dataset.studioCatalogMarketplace=RELEASE;
  enhance();
  new MutationObserver(()=>scheduleEnhance()).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('hashchange',()=>{state.admin=false;scheduleEnhance();});
  document.addEventListener('submit',event=>{if(event.target.closest('.c98-page'))setTimeout(()=>refreshContext(false),900);},true);
}

let enhanceTimer=0;
function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,40);}
function active(){return location.pathname.includes('/studio/advanced')&&(location.hash||'#programs')==='#programs';}

async function enhance(){
  if(!active()){document.body.classList.remove('v126-studio-catalog','v126-catalog-admin-open');return;}
  const page=$('.c98-page');if(!page)return;
  document.body.classList.add('v126-studio-catalog');
  prepareHero(page);
  ensureShell(page);
  if(!state.context&&!state.loading)await refreshContext(true);
  else render();
}

function prepareHero(page){
  const hero=$('.c98-hero',page);if(!hero)return;
  const eyebrow=$('.c98-eyebrow',hero),title=$('h2',hero),description=$('.v122-catalog-description',hero)||[...hero.querySelectorAll('p')].find(node=>!node.classList.contains('c98-eyebrow'));
  if(eyebrow)eyebrow.textContent='MARKETPLACE DE PRODUCTION';
  if(title)title.textContent='Catalogue';
  if(description)description.textContent='Choisissez une ville : tout ce qui peut y être produit est réuni au même endroit.';
  const tunnel=$('.c98-hero-actions a[href^="/reserver"]',hero);if(tunnel)tunnel.textContent='Voir le tunnel client ↗';
}

function ensureShell(page){
  if(state.mounted&&$('#catalogMarketplaceV126'))return;
  const layout=$('.c98-layout',page);if(!layout)return;
  state.mounted=true;
  const shell=document.createElement('section');shell.id='catalogMarketplaceV126';shell.className='v126-market';shell.setAttribute('aria-label','Catalogue par ville');
  shell.innerHTML='<div class="v126-market-loading"><i></i><span>Construction du catalogue…</span></div>';
  layout.before(shell);
  const admin=document.createElement('section');admin.id='catalogAdminBarV126';admin.className='v126-admin-bar';admin.hidden=true;
  admin.innerHTML='<button class="v126-back" type="button" data-v126-back>← Retour au catalogue</button><div><small>GESTION INTERNE</small><strong id="v126AdminTitle">Données du catalogue</strong></div>';
  layout.before(admin);
  layout.setAttribute('aria-hidden','true');
  bindShell(shell,admin);
}

function bindShell(shell,admin){
  shell.addEventListener('input',event=>{
    if(event.target.matches('[data-v126-search]')){state.query=event.target.value.trim().toLowerCase();renderListings();}
    if(event.target.matches('[data-v126-hidden]')){state.showInactive=event.target.checked;render();}
  });
  shell.addEventListener('click',event=>{
    const city=event.target.closest('[data-v126-city]');if(city){state.city=city.dataset.v126City||'all';render();return;}
    const edit=event.target.closest('[data-v126-edit]');if(edit){openLegacy('offers',{key:edit.dataset.v126Edit});return;}
    const create=event.target.closest('[data-v126-new]');if(create){openLegacy('offers',{create:true,cityId:create.dataset.v126New||''});return;}
    const manage=event.target.closest('[data-v126-manage]');if(manage){toggleAdminMenu();return;}
    const area=event.target.closest('[data-v126-area]');if(area){openLegacy(area.dataset.v126Area);return;}
  });
  admin.addEventListener('click',event=>{if(event.target.closest('[data-v126-back]'))closeLegacy();});
  document.addEventListener('click',event=>{
    const menu=$('#v126AdminMenu');if(menu&&!menu.hidden&&!event.target.closest('[data-v126-manage]')&&!event.target.closest('#v126AdminMenu'))menu.hidden=true;
  },true);
}

async function refreshContext(first=false){
  if(state.loading)return;state.loading=true;
  try{
    const response=await fetch(CONTEXT_API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    state.context=await response.json();
    if(first&&state.city!=='all'&&!cities().some(city=>String(city.id)===state.city))state.city='all';
    render();
  }catch(error){renderError(error.message);}finally{state.loading=false;}
}

function render(){
  const shell=$('#catalogMarketplaceV126');if(!shell||!state.context||state.admin)return;
  const cityList=cities();const offers=offerViews();const activeOffers=offers.filter(item=>item.active);const activeCities=cityList.filter(city=>city.active!==false);
  shell.innerHTML=`
    <div class="v126-toolbar">
      <div class="v126-search"><span aria-hidden="true">⌕</span><input data-v126-search type="search" value="${escapeAttr(state.query)}" placeholder="Ville, concept, fournisseur…" aria-label="Rechercher dans le catalogue"></div>
      <div class="v126-market-stats"><strong>${activeCities.length}</strong><span>ville${activeCities.length===1?'':'s'}</span><i></i><strong>${activeOffers.length}</strong><span>offre${activeOffers.length===1?'':'s'} exploitable${activeOffers.length===1?'':'s'}</span></div>
      <div class="v126-toolbar-actions"><button class="v126-button v126-button-primary" type="button" data-v126-new>+ Nouvelle offre</button><div class="v126-manage-wrap"><button class="v126-button" type="button" data-v126-manage>Gérer les données ▾</button>${adminMenu()}</div></div>
    </div>
    <div class="v126-city-strip" aria-label="Filtrer par ville">${cityChip('all','Toutes les villes',offers.length)}${cityList.map(city=>cityChip(String(city.id),city.name,offers.filter(offer=>String(offer.cityId)===String(city.id)).length,city.active===false)).join('')}</div>
    <div class="v126-secondary"><label><input data-v126-hidden type="checkbox" ${state.showInactive?'checked':''}> Inclure les offres masquées</label><span>Un clic sur une ville suffit : concepts, formats, fournisseurs et tarifs sont déjà rapprochés.</span></div>
    <div id="v126Listings" class="v126-listings"></div>`;
  renderListings();
}

function renderListings(){
  const host=$('#v126Listings');if(!host||!state.context)return;
  const allOffers=offerViews();const listCities=cities().filter(city=>state.city==='all'||String(city.id)===state.city);
  const query=state.query;
  const sections=[];
  for(const city of listCities){
    let offers=allOffers.filter(offer=>String(offer.cityId)===String(city.id));
    if(!state.showInactive)offers=offers.filter(offer=>offer.active);
    if(query)offers=offers.filter(offer=>offer.search.includes(query));
    if(query&&offers.length===0&&!String(city.name||'').toLowerCase().includes(query))continue;
    const suppliersCount=new Set(offers.map(offer=>offer.supplierId).filter(Boolean)).size;
    const formatsCount=new Set(offers.map(offer=>offer.formatId).filter(Boolean)).size;
    const prices=offers.flatMap(offer=>[offer.tiers.launch,offer.tiers.promo,offer.tiers.base].map(tier=>Number(tier?.clientPriceCents||0)).filter(Boolean));
    const minPrice=prices.length?Math.min(...prices):0;
    sections.push(`<section class="v126-city-section" data-v126-city-section="${escapeAttr(city.id)}"><header class="v126-city-head"><div><span class="v126-city-pin">●</span><div><h3>${escapeHtml(city.name)}</h3><p>${formatsCount} concept${formatsCount===1?'':'s'} · ${suppliersCount} fournisseur${suppliersCount===1?'':'s'}${minPrice?` · dès ${money(minPrice)}`:''}</p></div></div><button class="v126-button" type="button" data-v126-new="${escapeAttr(city.id)}">+ Ajouter à ${escapeHtml(city.name)}</button></header><div class="v126-offer-grid">${offers.length?offers.map(offer=>offerCard(offer)).join(''):`<div class="v126-city-empty"><strong>Aucune offre ${state.showInactive?'':'active '}dans cette ville.</strong><span>Ajoutez une combinaison concept × fournisseur pour la rendre exploitable.</span><button class="v126-button" type="button" data-v126-new="${escapeAttr(city.id)}">Créer une offre</button></div>`}</div></section>`);
  }
  host.innerHTML=sections.length?sections.join(''):'<div class="v126-empty"><strong>Aucun résultat.</strong><span>Essayez une ville, un concept ou un fournisseur différent.</span></div>';
}

function offerCard(offer){
  const config=offer.configurations.slice(0,4);const extra=Math.max(0,offer.configurations.length-config.length);
  const image=offer.image?`<img src="${escapeAttr(offer.image)}" alt="" loading="lazy">`:'<span class="v126-offer-placeholder">NEPTUNE</span>';
  const cost=offer.supplierNetCents?money(offer.supplierNetCents):'—';
  return `<article class="v126-offer ${offer.active?'':'is-muted'}">
    <div class="v126-offer-media">${image}<span class="v126-status ${offer.active?'is-active':''}">${offer.active?'Disponible':'Masqué'}</span></div>
    <div class="v126-offer-body">
      <div class="v126-offer-heading"><div><small>${escapeHtml(offer.durationLabel||'FORMAT')}</small><h4>${escapeHtml(offer.formatName)}</h4></div><span>${escapeHtml(offer.supplierName||'Fournisseur à définir')}</span></div>
      <p class="v126-concept">${escapeHtml(offer.concept||offer.description||'Concept à préciser')}</p>
      <div class="v126-configs">${config.length?config.map(label=>`<span>${escapeHtml(label)}</span>`).join(''):'<span class="is-empty">Configuration standard</span>'}${extra?`<span>+${extra}</span>`:''}</div>
      <div class="v126-prices"><div class="is-cost"><span>Coût fournisseur</span><strong>${cost}</strong></div>${priceCell('Coûtant',offer.tiers.launch)}${priceCell('Préférentiel',offer.tiers.promo)}${priceCell('Normal',offer.tiers.base)}</div>
      <div class="v126-offer-actions"><a href="${previewUrl(offer.key)}" target="_blank" rel="noopener">Voir tunnel ↗</a><button type="button" data-v126-edit="${escapeAttr(offer.key)}">Modifier l’offre</button></div>
    </div>
  </article>`;
}

function priceCell(label,tier){const value=Number(tier?.clientPriceCents||0);return `<div><span>${label}</span><strong>${value?money(value):'—'}</strong></div>`;}
function cityChip(id,label,count,muted=false){return `<button class="v126-city-chip ${state.city===id?'is-active':''} ${muted?'is-muted':''}" type="button" data-v126-city="${escapeAttr(id)}"><strong>${escapeHtml(label)}</strong><span>${count}</span></button>`;}
function adminMenu(){return `<div id="v126AdminMenu" class="v126-admin-menu" hidden><small>ADMINISTRATION</small><button type="button" data-v126-area="formats">Concepts & formats</button><button type="button" data-v126-area="configurations">Configurations</button><button type="button" data-v126-area="services">Prestations</button><button type="button" data-v126-area="suppliers">Fournisseurs</button><button type="button" data-v126-area="cities">Villes</button><button type="button" data-v126-area="offers">Toutes les offres & tarifs</button></div>`;}
function toggleAdminMenu(){const menu=$('#v126AdminMenu');if(menu)menu.hidden=!menu.hidden;}

function openLegacy(area,{key='',create=false,cityId=''}={}){
  const page=$('.c98-page');if(!page)return;
  state.admin=true;document.body.classList.add('v126-catalog-admin-open');
  $('#catalogMarketplaceV126')?.setAttribute('aria-hidden','true');
  const layout=$('.c98-layout',page);layout?.removeAttribute('aria-hidden');
  const bar=$('#catalogAdminBarV126');if(bar)bar.hidden=false;
  const title=$('#v126AdminTitle');if(title)title.textContent=adminTitle(area,key,create);
  const tabMap={formats:'formats',configurations:'configurations',offers:'offers',suppliers:'suppliers',cities:'cities'};
  if(area==='services'){$('[data-c116-services]')?.click();return;}
  const tab=$(`[data-c98-tab="${tabMap[area]||'offers'}"]`);tab?.click();
  setTimeout(()=>{
    if(area==='offers'&&key){const target=$(`[data-edit-offer="${cssEscape(key)}"]`);target?.click();}
    if(area==='offers'&&create){$('#newOffer')?.click();setTimeout(()=>{const form=$('#offerForm');if(form&&cityId&&form.cityId)form.cityId.value=cityId;},40);}
  },50);
}

function closeLegacy(){
  state.admin=false;document.body.classList.remove('v126-catalog-admin-open');
  $('#catalogMarketplaceV126')?.removeAttribute('aria-hidden');
  $('.c98-layout')?.setAttribute('aria-hidden','true');
  const bar=$('#catalogAdminBarV126');if(bar)bar.hidden=true;
  refreshContext(false);
}

function adminTitle(area,key,create){if(create)return'Nouvelle offre';if(key)return'Modifier une offre';return({formats:'Concepts & formats',configurations:'Configurations',services:'Prestations',suppliers:'Fournisseurs',cities:'Villes',offers:'Offres & tarifs'})[area]||'Données du catalogue';}

function offerViews(){
  const context=state.context||{},formats=new Map(array(context.formats).map(item=>[String(item.id),item])),suppliers=new Map(array(context.suppliers).map(item=>[String(item.id),item]));
  return array(context.families).map((family,index)=>{
    const format=formats.get(String(family.formatId))||{},supplier=suppliers.get(String(family.supplierId))||{};
    const configurations=configurationLabels(family);
    const formatName=family.formatName||format.name||`Concept ${index+1}`,supplierName=family.supplierName||supplier.name||'Fournisseur à définir',cityName=family.cityName||cityNameById(family.cityId);
    const supplierNet=numberOr(family.supplierNetCents,supplier.defaultNetCents,0);
    const search=[cityName,formatName,format.concept,format.description,supplierName,...configurations].join(' ').toLowerCase();
    return {...family,key:String(family.key||`${family.cityId||''}:${family.formatId||''}:${family.supplierId||''}`),cityName,formatName,supplierName,concept:family.concept||format.concept||'',description:family.description||format.description||'',durationLabel:family.durationLabel||format.durationLabel||'',image:format.image||format.imageUrl||family.image||'',supplierNetCents:supplierNet,tiers:family.tiers||{},configurations,active:family.active!==false,search};
  }).sort((a,b)=>numberOr(a.publicOrder,100)-numberOr(b.publicOrder,100)||String(a.formatName).localeCompare(String(b.formatName),'fr'));
}
function cities(){return array(state.context?.cities).slice().sort((a,b)=>numberOr(a.publicOrder,100)-numberOr(b.publicOrder,100)||String(a.name).localeCompare(String(b.name),'fr'));}
function cityNameById(id){return cities().find(city=>String(city.id)===String(id))?.name||'Ville';}
function configurationLabels(family){const raw=[...array(family.configurationOptions),...array(family.configurationVisuals)];const seen=new Set();return raw.map(item=>typeof item==='string'?item:item?.label||item?.name||item?.title||'').map(value=>String(value||'').trim()).filter(value=>value&&!seen.has(value)&&seen.add(value));}
function previewUrl(key){const params=new URLSearchParams({catalog_preview:'studio',catalog_view:'format',catalog_family:key});return `/reserver?${params}`;}
function renderError(message){const shell=$('#catalogMarketplaceV126');if(shell)shell.innerHTML=`<div class="v126-empty"><strong>Catalogue indisponible.</strong><span>${escapeHtml(message||'Impossible de charger les offres.')}</span><button class="v126-button" type="button" onclick="location.reload()">Réessayer</button></div>`;}
function array(value){return Array.isArray(value)?value:[];}
function numberOr(...values){for(const value of values){const n=Number(value);if(Number.isFinite(n)&&value!==''&&value!==null&&value!==undefined)return n;}return 0;}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100)+' HT';}
function cssEscape(value){return window.CSS?.escape?CSS.escape(String(value)):String(value).replace(/["\\]/gu,'\\$&');}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function escapeAttr(value){return escapeHtml(value).replace(/`/gu,'&#096;');}
