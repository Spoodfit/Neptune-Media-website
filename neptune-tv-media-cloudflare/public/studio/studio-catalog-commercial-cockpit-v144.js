import '/studio/studio-catalog-commerce-v143-4.js?v=1';

const RELEASE='neptune-catalog-commercial-cockpit-v144';
const API='/api/admin/media-catalog-v98/context';
const state={context:null,query:'',showInactive:false,city:'all',loading:false,refreshTimer:0};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

boot();

function boot(){
  document.body.dataset.neptuneCatalogCockpit='v144';
  window.__neptuneCatalogCommercialCockpitV144=RELEASE;
  scheduleMount(0);
  new MutationObserver(()=>scheduleMount(35)).observe(document.body,{subtree:true,childList:true});
  window.addEventListener('hashchange',()=>scheduleMount(0));
  document.addEventListener('click',handleClick,true);
  document.addEventListener('input',handleInput,true);
}

function scheduleMount(delay=35){clearTimeout(state.refreshTimer);state.refreshTimer=setTimeout(mount,delay);}

async function mount(){
  if(!catalogReady())return teardown();
  const page=$('.c98-page');if(!page)return;
  document.body.classList.add('v144-catalog-active');
  page.dataset.catalogCommercialCockpit='v144';
  ensureRoot(page);
  hideLegacyCockpits();
  if(!state.context&&!state.loading)await loadContext();
  else if(state.context)render();
}

function catalogReady(){
  const page=$('.c98-page');if(!page)return false;
  const hash=String(location.hash||'').toLowerCase();
  const title=String($('#title')?.textContent||'').toLowerCase();
  const active=$('[data-tab="programs"].active,[data-tab="programs"][aria-current="page"]');
  return hash==='#programs'||Boolean(active)||title.includes('catalogue');
}

function teardown(){document.body.classList.remove('v144-catalog-active');}

function ensureRoot(page){
  let root=$('#studioCatalogCommercialCockpitV144',page);
  if(root)return;
  root=document.createElement('section');
  root.id='studioCatalogCommercialCockpitV144';
  root.className='v144-cockpit';
  root.setAttribute('aria-label','Cockpit commercial du catalogue média');
  root.innerHTML='<div class="v144-loading"><i></i><span>Lecture du catalogue commercial…</span></div>';
  const anchor=$('#studioCatalogCockpitV131',page)||$('.c98-layout',page);
  anchor?.before(root);
}

function hideLegacyCockpits(){
  for(const node of ['#studioCatalogCockpitV131','#studioCatalogMarketplaceV128','#catalogMarketplaceV126'])$(node)?.setAttribute('aria-hidden','true');
}

async function loadContext(){
  if(state.loading)return;
  state.loading=true;
  try{
    const response=await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:'{}'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    state.context=await response.json();
    render();
  }catch(error){renderError(error.message);}
  finally{state.loading=false;}
}

function render(){
  const root=$('#studioCatalogCommercialCockpitV144');if(!root||!state.context)return;
  const offers=offerViews();
  const visible=filteredOffers(offers);
  const active=offers.filter(item=>item.active&&!item.issues.length);
  const cityIds=new Set(active.map(item=>item.cityId).filter(Boolean));
  const supplierIds=new Set(active.map(item=>item.supplierId).filter(Boolean));
  const margins=active.map(item=>item.marginPct).filter(Number.isFinite);
  const avgMargin=margins.length?Math.round(margins.reduce((a,b)=>a+b,0)/margins.length):null;
  const alerts=buildAlerts(offers);
  const grouped=groupByCitySupplier(visible);
  root.innerHTML=`
    <div class="v144-topbar">
      <div class="v144-topbar-copy">
        <span class="v144-eyebrow">CATALOGUE COMMERCIAL</span>
        <div class="v144-kpis">
          ${kpi(active.length,'offre'+plural(active.length),'vendable')}
          ${kpi(cityIds.size,'ville'+plural(cityIds.size),'active')}
          ${kpi(supplierIds.size,'fournisseur'+plural(supplierIds.size),'actif')}
          ${avgMargin===null?kpi('—','marge brute','moyenne'):kpi(`${avgMargin} %`,'marge brute','moyenne')}
        </div>
      </div>
      <div class="v144-toolbar">
        <label class="v144-search"><span>⌕</span><input data-v144-search type="search" value="${attr(state.query)}" placeholder="Rechercher une ville, offre, fournisseur…" aria-label="Rechercher dans le catalogue"></label>
        <button class="v144-btn v144-btn--ghost" type="button" data-v144-filter>Filtres</button>
        <a class="v144-btn v144-btn--ghost" href="/reserver?catalog_preview=studio" target="_blank" rel="noopener">Aperçu client ↗</a>
        <button class="v144-btn v144-btn--primary" type="button" data-v144-add>+ Ajouter</button>
      </div>
    </div>
    ${alerts.length?renderAlerts(alerts):'<div class="v144-health v144-health--ok"><span>✓</span><div><strong>Catalogue prêt à vendre</strong><small>Aucune incohérence bloquante détectée dans les offres actives.</small></div></div>'}
    <div class="v144-filterbar">
      <div class="v144-city-chips">${cityChip('all','Toutes les villes',offers.length)}${cities().map(city=>cityChip(String(city.id),city.name,offers.filter(item=>String(item.cityId)===String(city.id)).length)).join('')}</div>
      <label class="v144-switchline"><input data-v144-inactive type="checkbox" ${state.showInactive?'checked':''}><span></span>Afficher les masquées</label>
    </div>
    <div class="v144-city-stack">${grouped.length?grouped.map(renderCityGroup).join(''):'<div class="v144-empty">Aucune offre ne correspond à cette vue.</div>'}</div>`;
}

function kpi(value,label,sub){return `<div class="v144-kpi"><strong>${html(value)}</strong><span>${html(label)}</span><small>${html(sub)}</small></div>`;}

function renderAlerts(alerts){
  const first=alerts[0];
  return `<div class="v144-health v144-health--warn"><span>!</span><div><strong>${alerts.length} point${plural(alerts.length)} à vérifier</strong><small>${html(first)}${alerts.length>1?` · +${alerts.length-1} autre${plural(alerts.length-1)}`:''}</small></div><button type="button" data-v144-show-issues>Voir</button></div>`;
}

function buildAlerts(offers){
  const out=[];
  for(const offer of offers){
    for(const issue of offer.issues)out.push(`${offer.cityName||'Ville'} · ${offer.formatName}: ${issue}`);
    if(Number.isFinite(offer.marginPct)&&offer.marginPct<20&&offer.active)out.push(`${offer.cityName} · ${offer.formatName}: marge brute faible (${Math.round(offer.marginPct)} %)`);
    if(offer.launchRemaining===0&&offer.active)out.push(`${offer.cityName} · ${offer.formatName}: tarif lancement épuisé`);
  }
  return unique(out).slice(0,12);
}

function filteredOffers(all){
  const query=state.query.trim().toLowerCase();
  return all.filter(offer=>{
    if(!state.showInactive&&!offer.active)return false;
    if(state.city!=='all'&&String(offer.cityId)!==state.city)return false;
    if(query&&!offer.search.includes(query))return false;
    return true;
  });
}

function groupByCitySupplier(offers){
  const citiesMap=new Map();
  for(const offer of offers){
    const cityKey=offer.cityId||offer.cityName||'unknown';
    if(!citiesMap.has(cityKey))citiesMap.set(cityKey,{id:offer.cityId,name:offer.cityName||'Ville à définir',suppliers:new Map()});
    const city=citiesMap.get(cityKey);
    const supplierKey=offer.supplierId||offer.supplierName||'unknown';
    if(!city.suppliers.has(supplierKey))city.suppliers.set(supplierKey,{id:offer.supplierId,name:offer.supplierName||'Fournisseur à définir',offers:[]});
    city.suppliers.get(supplierKey).offers.push(offer);
  }
  return [...citiesMap.values()].map(city=>({...city,suppliers:[...city.suppliers.values()]}));
}

function renderCityGroup(city){
  const allOffers=city.suppliers.flatMap(s=>s.offers);
  const healthy=allOffers.filter(o=>o.active&&!o.issues.length).length;
  const status=healthy===allOffers.length?'Prête à vendre':healthy?'À vérifier':'Configuration requise';
  const statusClass=healthy===allOffers.length?'is-ok':'is-warn';
  return `<section class="v144-city-card">
    <header class="v144-city-head">
      <div><span class="v144-section-label">VILLE</span><h2>${html(city.name)}</h2><small>${city.suppliers.length} fournisseur${plural(city.suppliers.length)} · ${allOffers.length} offre${plural(allOffers.length)}</small></div>
      <div class="v144-city-head-actions"><span class="v144-status ${statusClass}">${status}</span><button class="v144-more" type="button" data-v144-menu="city" data-city-id="${attr(city.id)}" aria-label="Actions pour ${attr(city.name)}">•••</button></div>
    </header>
    <div class="v144-supplier-stack">${city.suppliers.map(supplier=>renderSupplier(city,supplier)).join('')}</div>
  </section>`;
}

function renderSupplier(city,supplier){
  const costs=supplier.offers.map(o=>o.supplierNetCents).filter(Boolean);
  const minCost=costs.length?Math.min(...costs):0;
  return `<section class="v144-supplier-block">
    <header class="v144-supplier-head">
      <div class="v144-supplier-id"><span class="v144-supplier-avatar">${initials(supplier.name)}</span><div><span>FOURNISSEUR</span><strong>${html(supplier.name)}</strong><small>${minCost?`Coût dès ${money(minCost)}`:'Coût à définir'}</small></div></div>
      <div class="v144-supplier-actions"><span>${supplier.offers.length} offre${plural(supplier.offers.length)}</span><button class="v144-more" type="button" data-v144-menu="supplier" data-supplier-id="${attr(supplier.id)}">•••</button></div>
    </header>
    <div class="v144-offer-grid">${supplier.offers.map(renderOfferCard).join('')}</div>
  </section>`;
}

function renderOfferCard(offer){
  const health=offerHealth(offer);
  const configs=offer.configurations.slice(0,5);
  const moreConfigs=Math.max(0,offer.configurations.length-configs.length);
  const visual=offer.visualUrl?`<img src="${attr(offer.visualUrl)}" alt="" loading="lazy">`:`<div class="v144-art-fallback"><span>${html(offer.formatName)}</span></div>`;
  return `<article class="v144-offer-card ${offer.active?'':'is-muted'}">
    <div class="v144-offer-art">${visual}<span class="v144-status ${health.className}">${health.label}</span></div>
    <div class="v144-offer-content">
      <div class="v144-offer-title-row"><div><span class="v144-section-label">CONCEPT ÉDITORIAL</span><h3>${html(offer.formatName)}</h3>${offer.concept?`<p>${html(offer.concept)}</p>`:''}</div><button class="v144-more" type="button" data-v144-menu="offer" data-offer-key="${attr(offer.key)}">•••</button></div>
      <div class="v144-format-chips"><span class="v144-section-label">FORMATS</span><div>${configs.length?configs.map(item=>`<span>${html(item)}</span>`).join(''):'<span>Standard</span>'}${moreConfigs?`<span>+${moreConfigs}</span>`:''}</div></div>
      <div class="v144-money-grid">
        <div class="v144-price-main"><span>À partir de</span><strong>${offer.minPrice?money(offer.minPrice):'—'}</strong><small>${offer.maxPrice&&offer.maxPrice!==offer.minPrice?`jusqu’à ${money(offer.maxPrice)}`:'Prix client HT'}</small></div>
        <div><span>Coût fournisseur</span><strong>${offer.supplierNetCents?money(offer.supplierNetCents):'—'}</strong><small>HT</small></div>
        <div><span>Marge brute</span><strong class="${offer.marginCents<0?'is-danger':''}">${Number.isFinite(offer.marginCents)?moneyBare(offer.marginCents):'—'}</strong><small>${Number.isFinite(offer.marginPct)?`${Math.round(offer.marginPct)} % du prix d’appel`:'Non calculable'}</small></div>
        <div><span>Places lancement</span><strong>${offer.launchRemainingLabel}</strong><small>${offer.launchLimitLabel}</small></div>
      </div>
      ${offer.issues.length?`<div class="v144-issues">${offer.issues.map(issue=>`<span>⚠ ${html(issue)}</span>`).join('')}</div>`:''}
      <footer class="v144-offer-footer"><a href="${previewUrl(offer.key)}" target="_blank" rel="noopener">Voir côté client ↗</a><button class="v144-configure" type="button" data-v144-configure="${attr(offer.key)}">Configurer</button></footer>
    </div>
  </article>`;
}

function offerHealth(offer){
  if(!offer.active)return {label:'Masquée',className:'is-muted'};
  if(offer.issues.length)return {label:'Configuration requise',className:'is-warn'};
  if(Number.isFinite(offer.marginPct)&&offer.marginPct<20)return {label:'Marge faible',className:'is-warn'};
  return {label:'Prête à vendre',className:'is-ok'};
}

function offerViews(){
  const formatMap=new Map(formats().map(item=>[String(item.id),item]));
  const supplierMap=new Map(suppliers().map(item=>[String(item.id),item]));
  return families().map((family,index)=>{
    const format=formatMap.get(String(family.formatId))||{};
    const supplier=supplierMap.get(String(family.supplierId))||{};
    const cityName=family.cityName||cityNameById(family.cityId);
    const formatName=family.formatName||format.name||`Offre ${index+1}`;
    const supplierName=family.supplierName||supplier.name||'';
    const configurations=configurationLabels(family);
    const supplierNetCents=Number(family.supplierNetCents||supplier.defaultNetCents||0);
    const tiers=family.tiers||{};
    const prices=Object.values(tiers).map(tier=>Number(tier?.clientPriceCents||0)).filter(value=>value>0).sort((a,b)=>a-b);
    const minPrice=prices[0]||0,maxPrice=prices.at(-1)||0;
    const marginCents=minPrice&&supplierNetCents?minPrice-supplierNetCents:null;
    const marginPct=minPrice&&Number.isFinite(marginCents)?(marginCents/minPrice)*100:null;
    const active=family.active!==false;
    const issues=[];
    if(!cityName)issues.push('Ville manquante');
    if(!family.formatId&&!format.name)issues.push('Concept manquant');
    if(!supplierName)issues.push('Fournisseur manquant');
    if(!supplierNetCents)issues.push('Coût fournisseur manquant');
    if(!prices.length)issues.push('Tarif client manquant');
    if(Number.isFinite(marginCents)&&marginCents<0)issues.push('Prix inférieur au coût fournisseur');
    const launch=tiers.launch||tiers.launching||tiers.intro||tiers.lancement||null;
    const launchLimit=firstNumber(launch?.seatLimit,launch?.places,launch?.quota,launch?.limit,launch?.capacity);
    const launchUsed=firstNumber(launch?.usedSeats,launch?.used,launch?.booked,launch?.sold);
    const launchRemaining=Number.isFinite(launchLimit)?Math.max(0,launchLimit-(Number.isFinite(launchUsed)?launchUsed:0)):null;
    const launchRemainingLabel=Number.isFinite(launchRemaining)?String(launchRemaining):'—';
    const launchLimitLabel=Number.isFinite(launchLimit)?`sur ${launchLimit} place${plural(launchLimit)}`:'Quota non exposé';
    const key=String(family.key||family.id||`${family.cityId||'city'}|${family.formatId||'format'}|${family.supplierId||'supplier'}|${index}`);
    const visualUrl=firstUrl(family.imageUrl,family.visualUrl,family.coverUrl,family.posterUrl,format.imageUrl,format.visualUrl,format.coverUrl,format.posterUrl,format.image);
    return {key,cityId:String(family.cityId||''),cityName,formatId:String(family.formatId||''),formatName,concept:family.concept||format.concept||format.description||'',supplierId:String(family.supplierId||''),supplierName,configurations,supplierNetCents,tiers,minPrice,maxPrice,marginCents,marginPct,active,issues,launchRemaining,launchRemainingLabel,launchLimitLabel,visualUrl,search:[cityName,formatName,supplierName,family.concept,format.concept,format.description,...configurations].filter(Boolean).join(' ').toLowerCase()};
  }).sort((a,b)=>String(a.cityName).localeCompare(String(b.cityName),'fr')||String(a.formatName).localeCompare(String(b.formatName),'fr'));
}

function handleInput(event){
  if(event.target.matches('[data-v144-search]')){state.query=event.target.value;render();}
  if(event.target.matches('[data-v144-inactive]')){state.showInactive=event.target.checked;render();}
}

function handleClick(event){
  const city=event.target.closest('[data-v144-city]');if(city){state.city=city.dataset.v144City||'all';render();return;}
  if(event.target.closest('[data-v144-add]')){delegateCategory('offers',true);return;}
  if(event.target.closest('[data-v144-filter]')){document.querySelector('[data-v144-search]')?.focus();return;}
  if(event.target.closest('[data-v144-show-issues]')){state.showInactive=true;render();document.querySelector('.v144-issues')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  const configure=event.target.closest('[data-v144-configure]');if(configure){delegateOffer(configure.dataset.v144Configure);return;}
  const menu=event.target.closest('[data-v144-menu]');if(menu){openMenu(menu);return;}
  if(!event.target.closest('.v144-popover'))closeMenus();
}

function openMenu(button){
  closeMenus();
  const type=button.dataset.v144Menu;
  const pop=document.createElement('div');pop.className='v144-popover';
  if(type==='city')pop.innerHTML='<button data-v144-action="cities">Modifier la ville</button><button data-v144-action="suppliers">Ajouter / gérer les fournisseurs</button>';
  else if(type==='supplier')pop.innerHTML='<button data-v144-action="suppliers">Modifier le fournisseur</button><button data-v144-action="formats">Ajouter / gérer les concepts</button>';
  else pop.innerHTML='<button data-v144-action="offer-edit">Configurer l’offre</button><button data-v144-action="formats">Gérer les formats</button><a href="/reserver?catalog_preview=studio" target="_blank" rel="noopener">Aperçu client ↗</a>';
  pop.style.position='fixed';const rect=button.getBoundingClientRect();pop.style.top=`${Math.min(innerHeight-180,rect.bottom+8)}px`;pop.style.left=`${Math.max(12,Math.min(innerWidth-230,rect.right-220))}px`;
  pop.dataset.offerKey=button.dataset.offerKey||'';
  document.body.append(pop);
  pop.addEventListener('click',e=>{const action=e.target.closest('[data-v144-action]')?.dataset.v144Action;if(!action)return;if(action==='offer-edit')delegateOffer(pop.dataset.offerKey);else delegateCategory(action);closeMenus();});
}
function closeMenus(){$$('.v144-popover').forEach(node=>node.remove());}

function delegateOffer(key){
  const button=$$('[data-v131-edit-offer]').find(node=>String(node.dataset.v131EditOffer)===String(key));
  if(button){button.click();return;}
  delegateCategory('offers');
}
function delegateCategory(area,create=false){
  if(create){const add=$('[data-v131-new-offer]');if(add){add.click();return;}}
  const button=$(`[data-v131-manage-category="${area}"]`);if(button){button.click();return;}
  const fallback=area==='offers'?'[data-c98-tab="offers"]':`[data-c98-tab="${area}"]`;
  $(fallback)?.click();
}

function cityChip(id,label,count){return `<button type="button" class="v144-city-chip ${state.city===id?'is-active':''}" data-v144-city="${attr(id)}"><span>${html(label)}</span><strong>${count}</strong></button>`;}
function previewUrl(key){const params=new URLSearchParams({catalog_preview:'studio',catalog_view:'format',catalog_family:key});return `/reserver?${params}`;}
function configurationLabels(family){return unique([...(Array.isArray(family.configurationOptions)?family.configurationOptions:[]),...(Array.isArray(family.configurationVisuals)?family.configurationVisuals.map(item=>typeof item==='string'?item:item?.label):[])]).filter(Boolean);}
function cities(){return array(state.context?.cities).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr'));}
function formats(){return array(state.context?.formats);}
function suppliers(){return array(state.context?.suppliers);}
function families(){return array(state.context?.families);}
function cityNameById(id){return cities().find(city=>String(city.id)===String(id))?.name||'';}
function firstNumber(...values){for(const value of values){const n=Number(value);if(Number.isFinite(n)&&n>=0)return n;}return null;}
function firstUrl(...values){for(const value of values){if(typeof value==='string'&&/^https?:\/\//i.test(value.trim()))return value.trim();}return '';}
function initials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join('').toUpperCase();}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100);}
function moneyBare(cents){const sign=Number(cents)<0?'-':'';return sign+new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Math.abs(Number(cents||0))/100);}
function plural(n){return Number(n)>1?'s':'';}
function array(value){return Array.isArray(value)?value:[];}
function unique(values){return [...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))];}
function html(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function attr(value){return html(value);}
function renderError(message){const root=$('#studioCatalogCommercialCockpitV144');if(root)root.innerHTML=`<div class="v144-empty"><strong>Catalogue indisponible</strong><span>${html(message)}</span><button class="v144-btn" type="button" onclick="location.reload()">Réessayer</button></div>`;}
