import '/studio/studio-catalog-commerce-v143-4.js?v=1';

const RELEASE='neptune-catalog-commercial-cockpit-v145';
const API='/api/admin/media-catalog-v98/context';
const POLICY_API='/api/admin/media-catalog-v143/policies';
const state={context:null,policies:null,query:'',city:'all',supplier:'all',status:'all',margin:'all',showInactive:false,showFilters:false,loading:false,lastLoaded:0,mountTimer:0,reloadTimer:0};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

boot();

function boot(){
  document.body.dataset.neptuneCatalogCockpit='v145';
  window.__neptuneCatalogCommercialCockpitV145=RELEASE;
  scheduleMount(0);
  new MutationObserver(()=>scheduleMount(45)).observe(document.body,{subtree:true,childList:true});
  window.addEventListener('hashchange',()=>{state.context=null;state.policies=null;state.city='all';scheduleMount(0);});
  window.addEventListener('focus',()=>{if(catalogReady()&&Date.now()-state.lastLoaded>15000)loadData(true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&catalogReady()&&Date.now()-state.lastLoaded>15000)loadData(true);});
  document.addEventListener('click',handleClick,true);
  document.addEventListener('input',handleInput,true);
  document.addEventListener('change',handleInput,true);
}

function scheduleMount(delay=45){clearTimeout(state.mountTimer);state.mountTimer=setTimeout(mount,delay);}
function scheduleReload(delay=180){clearTimeout(state.reloadTimer);state.reloadTimer=setTimeout(()=>loadData(true),delay);}

async function mount(){
  if(!catalogReady())return teardown();
  const page=$('.c98-page');if(!page)return;
  document.body.classList.add('v145-catalog-active');
  page.dataset.catalogCommercialCockpit='v145';
  cleanLegacy(page);
  ensureRoot(page);
  if(!state.context&&!state.loading)await loadData(false);
  else if(state.context)render();
}

function catalogReady(){
  const page=$('.c98-page');if(!page)return false;
  const hash=String(location.hash||'').toLowerCase();
  const title=String($('#title')?.textContent||'').toLowerCase();
  const active=$('[data-tab="programs"].active,[data-tab="programs"][aria-current="page"]');
  return hash==='#programs'||Boolean(active)||title.includes('catalogue');
}

function teardown(){document.body.classList.remove('v145-catalog-active');closeMenus();}

function cleanLegacy(page){
  for(const selector of ['.c98-hero','.c98-tabs']){
    const node=$(selector,page);if(node){node.hidden=true;node.setAttribute('aria-hidden','true');node.style.setProperty('display','none','important');}
  }
  for(const id of ['studioCatalogCockpitV131','studioCatalogMarketplaceV128','catalogMarketplaceV126','studioCatalogVisualV132'])$('#'+id,page)?.setAttribute('aria-hidden','true');
  const hierarchy=$('#studioCatalogHierarchyV133',page);if(hierarchy)hierarchy.dataset.v145LegacyHost='1';
}

function ensureRoot(page){
  let root=$('#studioCatalogCommercialCockpitV145',page);if(root)return;
  root=document.createElement('section');
  root.id='studioCatalogCommercialCockpitV145';root.className='v145-cockpit';root.setAttribute('aria-label','Cockpit commercial du catalogue média');
  root.innerHTML='<div class="v145-loading"><i></i><span>Lecture du catalogue commercial…</span></div>';
  const anchor=$('#studioCatalogHierarchyV133',page)||$('.c98-layout',page);anchor?.before(root);
}

async function loadData(force=false){
  if(state.loading||(!force&&state.context))return;
  state.loading=true;
  try{
    const [contextResponse,policyResponse]=await Promise.all([
      fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'}),
      fetch(POLICY_API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'}),
    ]);
    if(!contextResponse.ok)throw new Error(`Catalogue HTTP ${contextResponse.status}`);
    state.context=await contextResponse.json();
    state.policies=policyResponse.ok?await policyResponse.json():{offerPolicies:[]};
    state.lastLoaded=Date.now();
    if(state.city!=='all'&&!offerViews().some(offer=>offer.cityId===state.city))state.city='all';
    render();
  }catch(error){renderError(error.message);}finally{state.loading=false;}
}

function render(){
  const root=$('#studioCatalogCommercialCockpitV145');if(!root||!state.context)return;
  const offers=offerViews();
  const sellable=offers.filter(item=>item.active&&!item.issues.length);
  const activeCities=cities().filter(city=>city.active!==false);
  const activeSuppliers=suppliers().filter(supplier=>supplier.active!==false);
  const commercialOffers=offers.filter(item=>item.active);
  const commercialCityIds=new Set(commercialOffers.map(item=>item.cityId).filter(Boolean));
  const commercialSupplierIds=new Set(commercialOffers.map(item=>item.supplierId).filter(Boolean));
  const margins=sellable.map(item=>item.marginPct).filter(Number.isFinite);
  const avgMargin=margins.length?Math.round(margins.reduce((a,b)=>a+b,0)/margins.length):null;
  const alerts=buildAlerts(offers);
  const visible=filteredOffers(offers);
  const grouped=groupByCitySupplier(visible);
  root.innerHTML=`
    <section class="v145-summary">
      <div class="v145-summary-head">
        <div><span class="v145-eyebrow">CATALOGUE COMMERCIAL</span><div class="v145-titleline"><h2>Pilotage des offres</h2>${alerts.length?`<span class="v145-health is-warn">${alerts.length} à vérifier</span>`:'<span class="v145-health is-ok">✓ Prêt à vendre</span>'}</div></div>
        <div class="v145-kpis">
          ${kpi(sellable.length,'Offres vendables')}${kpi(commercialCityIds.size,'Villes actives')}${kpi(commercialSupplierIds.size,'Fournisseurs actifs')}${kpi(avgMargin===null?'—':`${avgMargin} %`,'Marge brute moy.')}
        </div>
      </div>
      <div class="v145-toolbar">
        <label class="v145-search"><span>⌕</span><input data-v145-search type="search" value="${attr(state.query)}" placeholder="Rechercher une ville, une offre, un fournisseur…" aria-label="Rechercher dans le catalogue"></label>
        <button class="v145-btn ${state.showFilters?'is-active':''}" type="button" data-v145-filter aria-expanded="${state.showFilters}">Filtres${activeFilterCount()?` · ${activeFilterCount()}`:''}</button>
        <a class="v145-btn" href="/reserver?catalog_preview=studio" target="_blank" rel="noopener">Aperçu client ↗</a>
        <button class="v145-btn v145-btn--primary" type="button" data-v145-add>+ Nouvelle offre</button>
      </div>
      ${state.showFilters?renderFilters(offers):''}
    </section>
    ${alerts.length?renderAlerts(alerts):''}
    <div class="v145-citybar">
      <div class="v145-city-chips">${cityChips(offers)}</div>
      <span class="v145-updated">Mis à jour ${relativeTime(state.lastLoaded)}</span>
    </div>
    <div class="v145-city-stack">${grouped.length?grouped.map(renderCityGroup).join(''):'<div class="v145-empty">Aucune offre ne correspond à cette vue.</div>'}</div>`;
  void activeCities;void activeSuppliers;
}

function kpi(value,label){return `<div class="v145-kpi"><strong>${html(value)}</strong><span>${html(label)}</span></div>`;}
function renderAlerts(alerts){const first=alerts[0];return `<div class="v145-alert"><span>!</span><div><strong>${alerts.length} point${plural(alerts.length)} à vérifier</strong><small>${html(first)}${alerts.length>1?` · +${alerts.length-1} autre${plural(alerts.length-1)}`:''}</small></div><button type="button" data-v145-show-issues>Voir</button></div>`;}

function renderFilters(offers){
  const supplierOptions=suppliers().filter(s=>offers.some(o=>o.supplierId===String(s.id))).map(s=>`<option value="${attr(s.id)}" ${state.supplier===String(s.id)?'selected':''}>${html(s.name)}</option>`).join('');
  return `<div class="v145-filter-panel">
    <label><span>Statut</span><select data-v145-status><option value="all">Tous</option><option value="ready" ${state.status==='ready'?'selected':''}>Prêtes à vendre</option><option value="warning" ${state.status==='warning'?'selected':''}>À vérifier</option><option value="hidden" ${state.status==='hidden'?'selected':''}>Masquées</option></select></label>
    <label><span>Fournisseur</span><select data-v145-supplier><option value="all">Tous</option>${supplierOptions}</select></label>
    <label><span>Marge brute</span><select data-v145-margin><option value="all">Toutes</option><option value="low" ${state.margin==='low'?'selected':''}>Faible &lt; 20 %</option><option value="healthy" ${state.margin==='healthy'?'selected':''}>20–40 %</option><option value="strong" ${state.margin==='strong'?'selected':''}>&gt; 40 %</option></select></label>
    <label class="v145-check"><input data-v145-inactive type="checkbox" ${state.showInactive?'checked':''}><span>Inclure les offres masquées</span></label>
    <button class="v145-reset" type="button" data-v145-reset>Réinitialiser</button>
  </div>`;
}

function activeFilterCount(){return [state.supplier!=='all',state.status!=='all',state.margin!=='all',state.showInactive].filter(Boolean).length;}
function buildAlerts(offers){const out=[];for(const offer of offers){for(const issue of offer.issues)out.push(`${offer.cityName||'Ville'} · ${offer.formatName}: ${issue}`);if(Number.isFinite(offer.marginPct)&&offer.marginPct<20&&offer.active&&!offer.issues.length)out.push(`${offer.cityName} · ${offer.formatName}: marge brute faible (${Math.round(offer.marginPct)} %)`);if(offer.launchRemaining===0&&offer.active)out.push(`${offer.cityName} · ${offer.formatName}: tarif lancement épuisé`);}return unique(out).slice(0,12);}
function offerWarning(offer){return Boolean(offer.issues.length||(Number.isFinite(offer.marginPct)&&offer.marginPct<20)||offer.launchRemaining===0);}

function filteredOffers(all){
  const query=state.query.trim().toLowerCase();
  return all.filter(offer=>{
    if(!state.showInactive&&!offer.active)return false;
    if(state.city!=='all'&&offer.cityId!==state.city)return false;
    if(state.supplier!=='all'&&offer.supplierId!==state.supplier)return false;
    if(state.status==='ready'&&(!offer.active||offerWarning(offer)))return false;
    if(state.status==='warning'&&(!offer.active||!offerWarning(offer)))return false;
    if(state.status==='hidden'&&offer.active)return false;
    if(state.margin==='low'&&!(Number.isFinite(offer.marginPct)&&offer.marginPct<20))return false;
    if(state.margin==='healthy'&&!(Number.isFinite(offer.marginPct)&&offer.marginPct>=20&&offer.marginPct<=40))return false;
    if(state.margin==='strong'&&!(Number.isFinite(offer.marginPct)&&offer.marginPct>40))return false;
    if(query&&!offer.search.includes(query))return false;
    return true;
  });
}

function cityChips(offers){
  const counts=new Map();for(const offer of offers)counts.set(offer.cityId,(counts.get(offer.cityId)||0)+1);
  const available=cities().filter(city=>(counts.get(String(city.id))||0)>0);
  return `${cityChip('all','Toutes les villes',offers.length)}${available.map(city=>cityChip(String(city.id),city.name,counts.get(String(city.id))||0)).join('')}`;
}
function cityChip(id,label,count){return `<button type="button" class="v145-city-chip ${state.city===id?'is-active':''}" data-v145-city="${attr(id)}"><span>${html(label)}</span><strong>${count}</strong></button>`;}

function groupByCitySupplier(offers){
  const cityMap=new Map();for(const offer of offers){const cityKey=offer.cityId||offer.cityName||'unknown';if(!cityMap.has(cityKey))cityMap.set(cityKey,{id:offer.cityId,name:offer.cityName||'Ville à définir',suppliers:new Map()});const city=cityMap.get(cityKey),supplierKey=offer.supplierId||offer.supplierName||'unknown';if(!city.suppliers.has(supplierKey))city.suppliers.set(supplierKey,{id:offer.supplierId,name:offer.supplierName||'Fournisseur à définir',offers:[]});city.suppliers.get(supplierKey).offers.push(offer);}return [...cityMap.values()].map(city=>({...city,suppliers:[...city.suppliers.values()]}));
}

function renderCityGroup(city){
  const allOffers=city.suppliers.flatMap(s=>s.offers),ready=allOffers.filter(o=>o.active&&!offerWarning(o)).length;
  const label=ready===allOffers.length?'Prête à vendre':ready?'À vérifier':'Configuration requise',klass=ready===allOffers.length?'is-ok':'is-warn';
  return `<section class="v145-city"><header class="v145-city-head"><div><span>VILLE</span><h2>${html(city.name)}</h2><small>${city.suppliers.length} fournisseur${plural(city.suppliers.length)} · ${allOffers.length} offre${plural(allOffers.length)}</small></div><div><span class="v145-status ${klass}">${label}</span><button class="v145-more" type="button" data-v145-menu="city" data-city-id="${attr(city.id)}" aria-label="Actions pour ${attr(city.name)}">•••</button></div></header>${city.suppliers.map(supplier=>renderSupplier(city,supplier)).join('')}</section>`;
}

function renderSupplier(city,supplier){
  const grossCosts=supplier.offers.map(o=>o.supplierGrossCents).filter(v=>v>0),netCosts=supplier.offers.map(o=>o.supplierNetCents).filter(v=>v>0),minGross=grossCosts.length?Math.min(...grossCosts):0,minNet=netCosts.length?Math.min(...netCosts):0;
  return `<section class="v145-supplier"><header class="v145-supplier-head"><div class="v145-supplier-id"><span>${initials(supplier.name)}</span><div><small>FOURNISSEUR</small><strong>${html(supplier.name)}</strong><em>${minGross?`${money(minGross)} TTC${minNet?` · ${money(minNet)} HT`:''}`:'Coût à définir'}</em></div></div><div><small>${supplier.offers.length} offre${plural(supplier.offers.length)}</small><button class="v145-more" type="button" data-v145-menu="supplier" data-city-id="${attr(city.id)}" data-supplier-id="${attr(supplier.id)}" aria-label="Actions pour ${attr(supplier.name)}">•••</button></div></header><div class="v145-offer-grid">${supplier.offers.map(renderOfferCard).join('')}</div></section>`;
}

function renderOfferCard(offer){
  const health=offerHealth(offer),configs=offer.configurations.slice(0,5),extra=Math.max(0,offer.configurations.length-configs.length),visual=offer.visualUrl?`<img src="${attr(offer.visualUrl)}" alt="" loading="lazy">`:`<div class="v145-art-fallback"><span>${html(offer.formatName)}</span></div>`;
  return `<article class="v145-offer ${offer.active?'':'is-muted'}"><div class="v145-art">${visual}<span class="v145-status ${health.className}">${health.label}</span></div><div class="v145-offer-body"><div class="v145-offer-title"><div><small>CONCEPT ÉDITORIAL</small><h3>${html(offer.formatName)}</h3>${offer.concept?`<p>${html(offer.concept)}</p>`:''}</div><button class="v145-more" type="button" data-v145-menu="offer" data-offer-key="${attr(offer.key)}" aria-label="Actions pour ${attr(offer.formatName)}">•••</button></div><div class="v145-formats">${configs.length?configs.map(item=>`<span>${html(item)}</span>`).join(''):'<span>Standard</span>'}${extra?`<span>+${extra}</span>`:''}</div><div class="v145-money"><div class="is-main"><span>Prix client TTC</span><strong>${offer.minPrice?money(offer.minPrice):'—'}</strong><small>${offer.maxPrice&&offer.maxPrice!==offer.minPrice?`jusqu’à ${money(offer.maxPrice)}`:'prix d’appel'}</small></div><div><span>Coût fournisseur TTC</span><strong>${offer.supplierGrossCents?money(offer.supplierGrossCents):'—'}</strong><small>${offer.supplierNetCents?`${money(offer.supplierNetCents)} HT`:'base TTC'}</small></div><div><span>Marge brute</span><strong class="${offer.marginCents<0?'is-danger':''}">${Number.isFinite(offer.marginCents)?moneyBare(offer.marginCents):'—'}</strong><small>${Number.isFinite(offer.marginPct)?`${Math.round(offer.marginPct)} % du prix TTC`:'Non calculable'}</small></div><div><span>Places lancement</span><strong>${offer.launchRemainingLabel}</strong><small>${offer.launchLimitLabel}</small></div></div>${offer.issues.length?`<div class="v145-issues">${offer.issues.map(issue=>`<span>⚠ ${html(issue)}</span>`).join('')}</div>`:''}<footer><a href="${previewUrl(offer.key)}" target="_blank" rel="noopener">Voir côté client ↗</a><button class="v145-configure" type="button" data-v145-configure="${attr(offer.key)}">Configurer</button></footer></div></article>`;
}

function offerHealth(offer){if(!offer.active)return{label:'Masquée',className:'is-muted'};if(offer.issues.length)return{label:'Configuration requise',className:'is-warn'};if(Number.isFinite(offer.marginPct)&&offer.marginPct<20)return{label:'Marge faible',className:'is-warn'};if(offer.launchRemaining===0)return{label:'Lancement épuisé',className:'is-warn'};return{label:'Prête à vendre',className:'is-ok'};}

function offerViews(){
  const formatMap=new Map(formats().map(item=>[String(item.id),item])),supplierMap=new Map(suppliers().map(item=>[String(item.id),item])),policyMap=new Map(array(state.policies?.offerPolicies).map(item=>[String(item.offerId),item]));
  return families().map((family,index)=>{
    const format=formatMap.get(String(family.formatId))||family.format||{},supplier=supplierMap.get(String(family.supplierId))||{},cityName=family.cityName||cityNameById(family.cityId),formatName=family.formatName||format.name||`Offre ${index+1}`,supplierName=family.supplierName||supplier.name||'',configurations=configurationLabels(family),tiers=family.tiers||{};
    const supplierNetCents=Number(family.supplierRate?.netCents||family.supplierNetCents||supplier.defaultNetCents||0),vatRateBps=Number(family.supplierRate?.vatRateBps||family.vatRateBps||supplier.vatRateBps||2000),supplierGrossCents=Number(family.supplierRate?.grossCents||firstTierGross(tiers)||supplier.defaultGrossCents||Math.round(supplierNetCents*(1+vatRateBps/10000))||0);
    const visibleTiers=Object.values(tiers).filter(tier=>tier&&tierVisible(tier,policyMap));
    const prices=visibleTiers.map(tier=>Number(tier.clientPriceCents||0)).filter(v=>v>0).sort((a,b)=>a-b),minPrice=prices[0]||0,maxPrice=prices.at(-1)||0,marginCents=minPrice&&supplierGrossCents?minPrice-supplierGrossCents:null,marginPct=minPrice&&Number.isFinite(marginCents)?marginCents/minPrice*100:null,active=family.active!==false&&visibleTiers.length>0;
    const issues=[];if(!cityName)issues.push('Ville manquante');if(!family.formatId&&!format.name)issues.push('Concept manquant');if(!supplierName)issues.push('Fournisseur manquant');if(!supplierGrossCents)issues.push('Coût fournisseur TTC manquant');if(!prices.length)issues.push('Tarif client visible manquant');if(Number.isFinite(marginCents)&&marginCents<0)issues.push('Prix client TTC inférieur au coût fournisseur TTC');
    for(const tier of visibleTiers)if(!tier.paymentUrl)issues.push('Lien Stripe manquant');
    const launch=tiers.launch||tiers.launching||tiers.intro||tiers.lancement||null,launchPolicy=launch?.id?policyMap.get(String(launch.id)):null,launchLimit=firstNumber(launchPolicy?.capacity,launch?.seatLimit,launch?.places,launch?.quota,launch?.limit,launch?.capacity),launchUsed=firstNumber(launchPolicy?.usedPlaces,launch?.usedSeats,launch?.used,launch?.booked,launch?.sold),launchRemaining=Number.isFinite(launchLimit)&&launchLimit>0?Math.max(0,launchLimit-(Number.isFinite(launchUsed)?launchUsed:0)):null;
    const key=String(family.key||`${family.cityId||'city'}|${family.formatId||'format'}|${family.supplierId||'supplier'}|${index}`),visualUrl=firstUrl(family.imageUrl,family.visualUrl,family.coverUrl,family.posterUrl,format.imageUrl,format.visualUrl,format.coverUrl,format.posterUrl,format.image);
    return{key,cityId:String(family.cityId||''),cityName,formatName,concept:family.concept||format.concept||format.description||'',supplierId:String(family.supplierId||''),supplierName,configurations,supplierNetCents,supplierGrossCents,vatRateBps,minPrice,maxPrice,marginCents,marginPct,active,issues:unique(issues),launchRemaining,launchRemainingLabel:Number.isFinite(launchRemaining)?String(launchRemaining):'—',launchLimitLabel:Number.isFinite(launchLimit)&&launchLimit>0?`sur ${launchLimit} place${plural(launchLimit)}`:'Illimité / non exposé',visualUrl,search:[cityName,formatName,supplierName,family.concept,format.concept,format.description,...configurations].filter(Boolean).join(' ').toLowerCase()};
  }).sort((a,b)=>String(a.cityName).localeCompare(String(b.cityName),'fr')||String(a.formatName).localeCompare(String(b.formatName),'fr'));
}

function tierVisible(tier,policyMap){const policy=tier?.id?policyMap.get(String(tier.id)):null;return policy?policy.visible!==false:tier.active!==false;}
function firstTierGross(tiers){for(const tier of Object.values(tiers||{})){const value=Number(tier?.supplierGrossCents||0);if(value>0)return value;}return 0;}

function handleInput(event){
  if(event.target.matches('[data-v145-search]')){state.query=event.target.value;render();return;}
  if(event.target.matches('[data-v145-status]')){state.status=event.target.value;if(state.status==='hidden')state.showInactive=true;render();return;}
  if(event.target.matches('[data-v145-supplier]')){state.supplier=event.target.value;render();return;}
  if(event.target.matches('[data-v145-margin]')){state.margin=event.target.value;render();return;}
  if(event.target.matches('[data-v145-inactive]')){state.showInactive=event.target.checked;render();return;}
}

function handleClick(event){
  const refresh=event.target.closest('#refresh');if(refresh){scheduleReload(250);return;}
  const city=event.target.closest('[data-v145-city]');if(city){state.city=city.dataset.v145City||'all';render();return;}
  const filter=event.target.closest('[data-v145-filter]');if(filter){state.showFilters=!state.showFilters;render();return;}
  const reset=event.target.closest('[data-v145-reset]');if(reset){Object.assign(state,{supplier:'all',status:'all',margin:'all',showInactive:false});render();return;}
  if(event.target.closest('[data-v145-add]')){openAddMenu(event.target.closest('[data-v145-add]'));return;}
  if(event.target.closest('[data-v145-show-issues]')){state.showFilters=true;state.status='warning';render();document.querySelector('.v145-status.is-warn')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  const configure=event.target.closest('[data-v145-configure]');if(configure){delegateOffer(configure.dataset.v145Configure);return;}
  const menu=event.target.closest('[data-v145-menu]');if(menu){openContextMenu(menu);return;}
  const newOffer=event.target.closest('[data-v145-new-city-offer]');if(newOffer){delegateCityOffer(newOffer.dataset.v145NewCityOffer);closeMenus();return;}
  const action=event.target.closest('[data-v145-action]');if(action){runMenuAction(action);return;}
  if(!event.target.closest('.v145-popover'))closeMenus();
}

function openAddMenu(button){
  closeMenus();const active=cities().filter(city=>city.active!==false);if(active.length===1){delegateCityOffer(String(active[0].id));return;}
  const pop=popover(button);pop.innerHTML=`<strong>Nouvelle offre</strong>${active.map(city=>`<button type="button" data-v145-new-city-offer="${attr(city.id)}">${html(city.name)}</button>`).join('')||'<span>Aucune ville active</span>'}`;markMenuItems(pop);
}
function openContextMenu(button){
  closeMenus();const type=button.dataset.v145Menu,pop=popover(button);if(type==='city')pop.innerHTML=`<button data-v145-action="city-edit" data-city-id="${attr(button.dataset.cityId)}">Modifier la ville</button><button data-v145-action="city-offer" data-city-id="${attr(button.dataset.cityId)}">Ajouter une offre</button>`;else if(type==='supplier')pop.innerHTML=`<button data-v145-action="supplier-edit" data-supplier-id="${attr(button.dataset.supplierId)}">Modifier le fournisseur</button><button data-v145-action="supplier-offer" data-city-id="${attr(button.dataset.cityId)}" data-supplier-id="${attr(button.dataset.supplierId)}">Ajouter un concept</button>`;else pop.innerHTML=`<button data-v145-action="offer-edit" data-offer-key="${attr(button.dataset.offerKey)}">Configurer l’offre</button><button data-v145-action="offer-format" data-offer-key="${attr(button.dataset.offerKey)}">Ajouter un format</button><a href="${previewUrl(button.dataset.offerKey)}" target="_blank" rel="noopener">Aperçu client ↗</a>`;markMenuItems(pop);
}
function popover(button){const pop=document.createElement('div');pop.className='v145-popover';pop.setAttribute('role','menu');const rect=button.getBoundingClientRect();pop.style.position='fixed';pop.style.top=`${Math.min(innerHeight-220,rect.bottom+8)}px`;pop.style.left=`${Math.max(12,Math.min(innerWidth-240,rect.right-230))}px`;document.body.append(pop);return pop;}
function markMenuItems(pop){for(const action of pop.querySelectorAll('button,a'))action.setAttribute('role','menuitem');}
function runMenuAction(button){const action=button.dataset.v145Action;if(action==='city-edit')delegateClick(`[data-v133-edit-city="${cssEscape(button.dataset.cityId)}"]`);if(action==='city-offer')delegateCityOffer(button.dataset.cityId);if(action==='supplier-edit')delegateClick(`[data-v133-edit-supplier="${cssEscape(button.dataset.supplierId)}"]`);if(action==='supplier-offer')delegateClick(`[data-v133-add-concept][data-city="${cssEscape(button.dataset.cityId)}"][data-supplier="${cssEscape(button.dataset.supplierId)}"]`);if(action==='offer-edit')delegateOffer(button.dataset.offerKey);if(action==='offer-format')delegateClick(`[data-v133-add-format="${cssEscape(button.dataset.offerKey)}"]`);closeMenus();}
function delegateOffer(key){delegateClick(`[data-v133-edit-offer="${cssEscape(key)}"]`);}
function delegateCityOffer(cityId){delegateClick(`[data-v133-add-supplier-city="${cssEscape(cityId)}"]`);}
function delegateClick(selector){const target=$(selector);if(target){target.click();return true;}return false;}
function closeMenus(){$$('.v145-popover').forEach(node=>node.remove());}

function previewUrl(key){const params=new URLSearchParams({catalog_preview:'studio',catalog_view:'format',catalog_family:key});return `/reserver?${params}`;}
function configurationLabels(family){return unique([...(Array.isArray(family.configurationOptions)?family.configurationOptions:[]),...(Array.isArray(family.configurationVisuals)?family.configurationVisuals.map(item=>typeof item==='string'?item:item?.label):[])]).filter(Boolean);}
function cities(){return array(state.context?.cities).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr'));}
function formats(){return array(state.context?.formats);}
function suppliers(){return array(state.context?.suppliers);}
function families(){return array(state.context?.families);}
function cityNameById(id){return cities().find(city=>String(city.id)===String(id))?.name||'';}
function firstNumber(...values){for(const value of values){if(value===''||value==null)continue;const n=Number(value);if(Number.isFinite(n)&&n>=0)return n;}return null;}
function firstUrl(...values){for(const value of values){if(typeof value!=='string')continue;const clean=value.trim();if(/^https?:\/\//i.test(clean)||clean.startsWith('/'))return clean;}return '';}
function initials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join('').toUpperCase();}
function relativeTime(time){const seconds=Math.max(0,Math.round((Date.now()-Number(time||Date.now()))/1000));if(seconds<10)return'à l’instant';if(seconds<60)return`il y a ${seconds} s`;const minutes=Math.round(seconds/60);return`il y a ${minutes} min`;}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100);}
function moneyBare(cents){const sign=Number(cents)<0?'-':'';return sign+new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Math.abs(Number(cents||0))/100);}
function plural(n){return Number(n)>1?'s':'';}
function array(value){return Array.isArray(value)?value:[];}
function unique(values){return [...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))];}
function cssEscape(value){return window.CSS?.escape?CSS.escape(String(value||'')):String(value||'').replace(/["\\]/g,'\\$&');}
function html(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function attr(value){return html(value);}
function renderError(message){const root=$('#studioCatalogCommercialCockpitV145');if(root)root.innerHTML=`<div class="v145-empty"><strong>Catalogue indisponible</strong><span>${html(message)}</span><button class="v145-btn" type="button" onclick="location.reload()">Réessayer</button></div>`;}
