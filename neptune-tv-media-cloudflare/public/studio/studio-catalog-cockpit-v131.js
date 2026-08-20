const RELEASE='neptune-studio-catalog-cockpit-20260820-v131';
const API='/api/admin/media-catalog-v98/context';
const state={context:null,view:'overview',city:'all',query:'',showInactive:false,admin:false,loading:false};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let mountTimer=0,refreshTimer=0;

boot();

function boot(){
  window.__neptuneStudioCatalogCockpitV131=RELEASE;
  document.body.dataset.studioCatalogCockpit=RELEASE;
  scheduleMount(0);
  new MutationObserver(()=>{
    if(catalogDomReady()&&!$('#studioCatalogCockpitV131'))scheduleMount(35);
    if(catalogDomReady())enforceVisibility();
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','style']});
  window.addEventListener('hashchange',()=>{state.admin=false;state.context=null;state.view='overview';scheduleMount(0);});
  document.addEventListener('click',handleClick,true);
  document.addEventListener('input',handleInput,true);
  document.addEventListener('change',handleInput,true);
  document.addEventListener('submit',event=>{if(event.target.closest('.c98-page'))scheduleRefresh(700);},true);
}

function scheduleMount(delay=35){clearTimeout(mountTimer);mountTimer=setTimeout(mount,delay);}
function scheduleRefresh(delay=0){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadContext(true),delay);}

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
    document.body.classList.remove('v131-catalog-cockpit','v131-admin-open');
    return;
  }
  const page=$('.c98-page');
  document.body.classList.add('v131-catalog-cockpit');
  page.dataset.catalogRuntime='v131';
  prepareShell(page);
  ensureCockpit(page);
  enforceVisibility();
  if(!state.context&&!state.loading)await loadContext(false);
  else if(state.context&&!state.admin)render();
}

function prepareShell(page){
  if($('#title'))$('#title').textContent='Catalogue Média';
  const hero=$('.c98-hero',page);
  if(hero)hero.setAttribute('aria-hidden','true');
  $('#studioCatalogGlanceV1221')?.remove();
  $('#catalogMarketplaceV126')?.remove();
  $('#studioCatalogMarketplaceV128')?.remove();
  $('#studioCatalogAdminV128')?.remove();
}

function ensureCockpit(page){
  const layout=$('.c98-layout',page);if(!layout)return;
  let cockpit=$('#studioCatalogCockpitV131',page);
  if(!cockpit){
    cockpit=document.createElement('section');
    cockpit.id='studioCatalogCockpitV131';
    cockpit.className='v131-cockpit';
    cockpit.setAttribute('aria-label','Cockpit du catalogue média');
    cockpit.innerHTML='<div class="v131-loading"><i></i><span>Chargement du catalogue…</span></div>';
    layout.before(cockpit);
  }
  let admin=$('#studioCatalogAdminV131',page);
  if(!admin){
    admin=document.createElement('section');
    admin.id='studioCatalogAdminV131';
    admin.className='v131-admin-bar';
    admin.hidden=true;
    admin.innerHTML='<button type="button" class="v131-btn" data-v131-back>← Retour au catalogue</button><div><small>ÉDITION DU CATALOGUE</small><strong id="v131AdminTitle">Donnée du catalogue</strong></div>';
    layout.before(admin);
  }
}

function enforceVisibility(){
  const page=$('.c98-page');
  const cockpit=$('#studioCatalogCockpitV131',page);
  const layout=$('.c98-layout',page);
  const tabs=$('.c98-tabs',page);
  const hero=$('.c98-hero',page);
  const admin=$('#studioCatalogAdminV131',page);
  if(!page||!cockpit||!layout)return;
  forceHidden(hero,true);
  forceHidden(tabs,true);
  forceHidden(cockpit,state.admin);
  forceHidden(layout,!state.admin);
  if(admin)forceHidden(admin,!state.admin,'flex');
  page.dataset.catalogVisibility='v131';
}

function forceHidden(node,hidden,visibleDisplay=''){
  if(!node)return;
  node.hidden=hidden;
  if(hidden){node.style.setProperty('display','none','important');node.setAttribute('aria-hidden','true');return;}
  if(visibleDisplay)node.style.setProperty('display',visibleDisplay,'important');
  else node.style.removeProperty('display');
  node.removeAttribute('aria-hidden');
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
  }catch(error){renderError(error.message);}
  finally{state.loading=false;}
}

function render(){
  const root=$('#studioCatalogCockpitV131');if(!root||!state.context||state.admin)return;
  const offers=offerViews();
  const active=offers.filter(offer=>offer.active);
  const activeCities=new Set(active.map(offer=>offer.cityId).filter(Boolean));
  const activeSuppliers=new Set(active.map(offer=>offer.supplierId).filter(Boolean));
  const incomplete=offers.filter(offer=>offer.issues.length);
  root.innerHTML=`
    <header class="v131-head">
      <div class="v131-head-copy"><span>CATALOGUE OPÉRATIONNEL</span><strong>${active.length} offre${active.length===1?'':'s'} · ${activeCities.size} ville${activeCities.size===1?'':'s'} · ${activeSuppliers.size} fournisseur${activeSuppliers.size===1?'':'s'}</strong>${incomplete.length?`<em>${incomplete.length} à compléter</em>`:'<em class="is-ok">Tout est exploitable</em>'}</div>
      <div class="v131-head-actions"><label class="v131-search"><span>⌕</span><input data-v131-search type="search" value="${attr(state.query)}" placeholder="Ville, offre, fournisseur…" aria-label="Rechercher dans le catalogue"></label><button class="v131-btn v131-btn--primary" type="button" data-v131-new-offer>+ Nouvelle offre</button><a class="v131-btn" href="/reserver/" target="_blank" rel="noopener">Voir côté client ↗</a></div>
    </header>
    <nav class="v131-tabs" aria-label="Vues du catalogue">
      ${viewButton('overview','Vue d’ensemble')}${viewButton('offers','Offres')}${viewButton('elements','Éléments du catalogue')}
    </nav>
    <div class="v131-body">${renderView()}</div>`;
}

function viewButton(value,label){return `<button type="button" class="v131-tab ${state.view===value?'is-active':''}" data-v131-view="${value}">${label}</button>`;}
function renderView(){if(state.view==='offers')return renderOffers();if(state.view==='elements')return renderElements();return renderOverview();}

function renderOverview(){
  const offers=filteredOffers();
  return `<section class="v131-view v131-overview">
    <div class="v131-section-head"><div><h2>Tout le catalogue en un coup d’œil</h2><p>Une ligne = une offre réellement vendable dans une ville.</p></div><label class="v131-check"><input data-v131-inactive type="checkbox" ${state.showInactive?'checked':''}> Inclure les masquées</label></div>
    <div class="v131-table-wrap"><table class="v131-table"><thead><tr><th>Ville</th><th>Offre</th><th>Fournisseur</th><th>Configurations</th><th>Coût</th><th>Prix client</th><th>État</th><th></th></tr></thead><tbody>${offers.length?offers.map(overviewRow).join(''):'<tr><td colspan="8"><div class="v131-empty">Aucune offre ne correspond à la recherche.</div></td></tr>'}</tbody></table></div>
  </section>`;
}

function overviewRow(offer){
  const range=priceRange(offer);
  const issue=offer.issues[0]||'';
  return `<tr class="${offer.active?'':'is-muted'}"><td><strong>${html(offer.cityName||'Ville à définir')}</strong></td><td><strong>${html(offer.formatName)}</strong><small>${html(offer.concept||'Concept à préciser')}</small></td><td>${html(offer.supplierName||'À définir')}</td><td>${configSummary(offer.configurations)}</td><td><strong>${offer.supplierNetCents?money(offer.supplierNetCents):'—'}</strong></td><td><strong>${range}</strong></td><td>${issue?`<span class="v131-state is-warning">À compléter</span><small>${html(issue)}</small>`:`<span class="v131-state ${offer.active?'is-ok':''}">${offer.active?'Publiée':'Masquée'}</span>`}</td><td><button class="v131-link" type="button" data-v131-edit-offer="${attr(offer.key)}">Modifier</button></td></tr>`;
}

function renderOffers(){
  const all=offerViews();
  const filtered=filteredOffers();
  return `<section class="v131-view v131-offers-view">
    <div class="v131-filter-row"><div class="v131-city-filter">${cityChip('all','Toutes les villes',all.length)}${cities().map(city=>cityChip(String(city.id),city.name,all.filter(offer=>String(offer.cityId)===String(city.id)).length)).join('')}</div><label class="v131-check"><input data-v131-inactive type="checkbox" ${state.showInactive?'checked':''}> Inclure les masquées</label></div>
    <div class="v131-offer-list">${filtered.length?filtered.map(offerCard).join(''):'<div class="v131-empty">Aucune offre dans cette vue.</div>'}</div>
  </section>`;
}

function offerCard(offer){
  const range=priceRange(offer);
  return `<article class="v131-offer ${offer.active?'':'is-muted'}"><div class="v131-offer-main"><div class="v131-offer-title"><span>${html(offer.cityName||'Ville à définir')}</span><strong>${html(offer.formatName)}</strong><small>${html(offer.supplierName||'Fournisseur à définir')}</small></div><div class="v131-offer-config"><span>Configurations</span><strong>${configSummary(offer.configurations)}</strong></div><div class="v131-offer-money"><span>Coût fournisseur</span><strong>${offer.supplierNetCents?money(offer.supplierNetCents):'—'}</strong></div><div class="v131-offer-money"><span>Prix client</span><strong>${range}</strong></div><div>${offer.issues.length?'<span class="v131-state is-warning">À compléter</span>':`<span class="v131-state ${offer.active?'is-ok':''}">${offer.active?'Publiée':'Masquée'}</span>`}</div></div><div class="v131-offer-actions"><a href="${previewUrl(offer.key)}" target="_blank" rel="noopener">Voir côté client ↗</a><button type="button" data-v131-edit-offer="${attr(offer.key)}">Modifier</button></div></article>`;
}

function renderElements(){
  return `<section class="v131-view v131-elements-view"><div class="v131-section-head"><div><h2>Les briques du catalogue</h2><p>Ces éléments sont réutilisés pour composer les offres vendues dans chaque ville.</p></div></div><div class="v131-elements-grid">${elementCard('formats','Concepts',formats().map(item=>item.name),formats().length)}${elementCard('suppliers','Fournisseurs',suppliers().map(item=>item.name),suppliers().length)}${elementCard('configurations','Configurations',configurationCatalog(),configurationCatalog().length)}${elementCard('cities','Villes',cities().map(item=>item.name),cities().length)}</div></section>`;
}

function elementCard(area,title,values,count){
  const visible=values.filter(Boolean).slice(0,6);
  return `<article class="v131-element"><header><div><span>${count}</span><h3>${title}</h3></div><button class="v131-link" type="button" data-v131-manage-category="${area}">Gérer</button></header><div class="v131-element-list">${visible.length?visible.map(value=>`<span>${html(value)}</span>`).join(''):'<em>Aucun élément</em>'}${count>visible.length?`<small>+ ${count-visible.length} autre${count-visible.length===1?'':'s'}</small>`:''}</div></article>`;
}

function handleInput(event){
  if(event.target.matches('[data-v131-search]')){state.query=event.target.value;render();}
  if(event.target.matches('[data-v131-inactive]')){state.showInactive=event.target.checked;render();}
}

function handleClick(event){
  if(event.target.closest('#refresh')){scheduleRefresh(250);return;}
  const view=event.target.closest('[data-v131-view]');if(view){state.view=view.dataset.v131View;render();return;}
  const city=event.target.closest('[data-v131-city]');if(city){state.city=city.dataset.v131City||'all';render();return;}
  const edit=event.target.closest('[data-v131-edit-offer]');if(edit){openLegacy('offers',{key:edit.dataset.v131EditOffer});return;}
  if(event.target.closest('[data-v131-new-offer]')){openLegacy('offers',{create:true});return;}
  const category=event.target.closest('[data-v131-manage-category]');if(category){openLegacy(category.dataset.v131ManageCategory);return;}
  if(event.target.closest('[data-v131-back]')){closeLegacy();return;}
}

function openLegacy(area,{key='',create=false}={}){
  const page=$('.c98-page');if(!page)return;
  state.admin=true;
  document.body.classList.add('v131-admin-open');
  const title=$('#v131AdminTitle',page);if(title)title.textContent=create?'Nouvelle offre':key?'Modifier une offre':adminTitle(area);
  enforceVisibility();
  if(area==='services'){activateServices(0);return;}
  $(`[data-c98-tab="${area}"]`,page)?.click();
  setTimeout(()=>{
    if(area==='offers'&&key)$$('[data-edit-offer]',page).find(button=>button.dataset.editOffer===key)?.click();
    if(area==='offers'&&create)$('#newOffer',page)?.click();
  },90);
}

function closeLegacy(){
  state.admin=false;
  document.body.classList.remove('v131-admin-open');
  enforceVisibility();
  loadContext(true);
}

function filteredOffers(){
  const query=state.query.trim().toLowerCase();
  return offerViews().filter(offer=>{
    if(!state.showInactive&&!offer.active)return false;
    if(state.view==='offers'&&state.city!=='all'&&String(offer.cityId)!==state.city)return false;
    if(query&&!offer.search.includes(query))return false;
    return true;
  });
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
    const active=family.active!==false;
    const issues=[];
    if(!cityName)issues.push('Ville manquante');
    if(!family.formatId&&!format.name)issues.push('Concept manquant');
    if(!supplierName)issues.push('Fournisseur manquant');
    if(!supplierNetCents)issues.push('Coût fournisseur manquant');
    if(!Object.values(tiers).some(tier=>Number(tier?.clientPriceCents||0)>0))issues.push('Tarif client manquant');
    const key=String(family.key||family.id||`${family.cityId||'city'}|${family.formatId||'format'}|${family.supplierId||'supplier'}|${index}`);
    return {key,cityId:String(family.cityId||''),cityName,formatId:String(family.formatId||''),formatName,concept:family.concept||format.concept||format.description||'',supplierId:String(family.supplierId||''),supplierName,configurations,supplierNetCents,tiers,active,issues,search:[cityName,formatName,supplierName,family.concept,format.concept,format.description,...configurations].filter(Boolean).join(' ').toLowerCase()};
  }).sort((a,b)=>String(a.cityName).localeCompare(String(b.cityName),'fr')||String(a.formatName).localeCompare(String(b.formatName),'fr'));
}

function priceRange(offer){
  const prices=Object.values(offer.tiers||{}).map(tier=>Number(tier?.clientPriceCents||0)).filter(value=>value>0).sort((a,b)=>a-b);
  if(!prices.length)return '—';
  if(prices[0]===prices[prices.length-1])return money(prices[0]);
  return `${money(prices[0])} – ${money(prices[prices.length-1])}`;
}
function configSummary(values){if(!values.length)return 'Standard';if(values.length<=2)return values.map(html).join(' · ');return `${values.slice(0,2).map(html).join(' · ')} +${values.length-2}`;}
function configurationLabels(family){return unique([...(Array.isArray(family.configurationOptions)?family.configurationOptions:[]),...(Array.isArray(family.configurationVisuals)?family.configurationVisuals.map(item=>typeof item==='string'?item:item?.label):[])]).filter(Boolean);}
function configurationCatalog(){return unique(families().flatMap(configurationLabels)).filter(Boolean).sort((a,b)=>String(a).localeCompare(String(b),'fr'));}
function cityChip(id,label,count){return `<button type="button" class="v131-city ${state.city===id?'is-active':''}" data-v131-city="${attr(id)}"><span>${html(label)}</span><strong>${count}</strong></button>`;}
function previewUrl(key){const params=new URLSearchParams({catalog_preview:'studio',catalog_view:'format',catalog_family:key});return `/reserver?${params}`;}
function adminTitle(area){return({formats:'Concepts',configurations:'Configurations',suppliers:'Fournisseurs',cities:'Villes',offers:'Offres & tarifs',services:'Prestations'})[area]||'Donnée du catalogue';}
function activateServices(attempt){const target=$('[data-c116-services]');if(target){target.click();return;}if(attempt<20)setTimeout(()=>activateServices(attempt+1),80);}
function renderError(message){const root=$('#studioCatalogCockpitV131');if(root)root.innerHTML=`<div class="v131-empty"><strong>Catalogue indisponible</strong><span>${html(message)}</span><button class="v131-btn" type="button" onclick="location.reload()">Réessayer</button></div>`;}
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
