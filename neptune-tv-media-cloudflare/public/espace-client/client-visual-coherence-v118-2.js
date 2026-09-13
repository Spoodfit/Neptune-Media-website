const RELEASE='neptune-client-visual-coherence-20260913-v118.11-native-anchor-stable-view';
const CATALOG_API='/api/reservation/catalog-v96';
const ROOT=document.documentElement;
let catalog=null;
let selectedCity='';
let refreshTimer=0;
let renderQueued=false;

if(!window.__neptuneClientVisualCoherenceV1182){
  window.__neptuneClientVisualCoherenceV1182=true;
  ROOT.dataset.clientVisualCoherenceV1182='1';
  ROOT.dataset.clientVisualCoherenceRelease=RELEASE;
  start();
}

function start(){
  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded',boot,{once:true})
    : boot();
}

function boot(){
  if(!home())return;
  retireLegacySnapshot();
  observeCatalogStructure();
  hydrateCatalog();
}

function home(){
  return ['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname);
}

function retireLegacySnapshot(){
  const snapshot=document.querySelector('#clientContentSnapshot');
  if(!snapshot)return;
  snapshot.hidden=true;
  snapshot.setAttribute('aria-hidden','true');
  snapshot.inert=true;
  snapshot.dataset.retiredBy='v118.2';
}

function observeCatalogStructure(){
  // Several legacy dashboard runtimes still observe the whole document. Some of
  // them can replace .format-grid after the catalogue has already rendered.
  // Observe child-list changes only: never pointer/hover/focus/attributes. This
  // keeps the visual catalogue authoritative without touching native link input.
  const observer=new MutationObserver(mutations=>{
    if(!catalog)return;
    const relevant=mutations.some(mutation=>{
      const target=mutation.target instanceof Element?mutation.target:null;
      if(target?.closest?.('.formats-panel'))return true;
      return [...mutation.addedNodes,...mutation.removedNodes].some(node=>
        node instanceof Element&&(node.matches?.('.formats-panel,.format-grid')||node.querySelector?.('.formats-panel,.format-grid'))
      );
    });
    if(relevant)queueCatalogRender();
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

function queueCatalogRender(){
  if(renderQueued)return;
  renderQueued=true;
  requestAnimationFrame(()=>{
    renderQueued=false;
    renderCityCatalog();
  });
}

async function hydrateCatalog(){
  clearTimeout(refreshTimer);
  try{
    const response=await fetch(CATALOG_API,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`http_${response.status}`);
    catalog=data;
    const cities=catalogCities(data);
    if(cities.length&&!cities.some(city=>cityKey(city)===selectedCity))selectedCity=cityKey(cities[0]);
    renderCityCatalog();
  }catch(error){
    console.error('client_visual_coherence_catalog_failed',error);
  }finally{
    refreshTimer=window.setTimeout(hydrateCatalog,60000);
  }
}

function catalogCities(data){
  return (Array.isArray(data?.cities)?data.cities:[]).filter(city=>Array.isArray(city?.formats)&&city.formats.length);
}

function cityKey(city){
  return String(city?.slug||city?.id||city?.name||'').trim();
}

function renderCityCatalog(){
  if(!catalog)return;
  const panel=document.querySelector('.formats-panel');
  const grid=panel?.querySelector('.format-grid');
  if(!panel||!grid)return;

  // This module owns catalogue presentation only. Booking cards remain ordinary
  // same-origin anchors: no click interception, pointer gesture layer, DOM
  // replacement on hover/focus, or synthetic navigation.
  panel.hidden=false;
  panel.classList.remove('cc-legacy-formats');
  panel.classList.add('cc-v118-catalog-panel');

  const cities=catalogCities(catalog);
  if(!cities.length)return;
  const city=cities.find(item=>cityKey(item)===selectedCity)||cities[0];
  selectedCity=cityKey(city);

  const label=panel.querySelector('.section-label');
  const title=panel.querySelector('#formatsTitle,.section-heading h2');
  const description=panel.querySelector('.section-heading p:not(.section-label)');
  if(label)label.textContent=cities.length>1?'CHOISISSEZ LA VILLE, PUIS LE FORMAT':`FORMATS DISPONIBLES · ${String(city.name||'NEPTUNE MEDIA').toUpperCase()}`;
  if(title)title.textContent='Choisissez votre prochain format';
  if(description)description.textContent='Formats, prix et visuels synchronisés avec le catalogue du Studio Neptune Media.';

  renderCityFilter(panel,grid,cities);

  const cards=cityCards(city);
  const signature=[catalog.dataGuardRelease||'',selectedCity,...cards.map(({format,price})=>`${format.id||format.slug||format.name}:${format.imagePublicUrl||format.image||''}:${price}`)].join('|');
  const expectedCards=cards.length;
  const nativeCards=grid.querySelectorAll(':scope > a.cc-v118-catalog-card-link[data-v1182-booking-card="true"]');
  const stable=grid.dataset.v1182Signature===signature&&nativeCards.length===expectedCards&&grid.children.length===expectedCards;
  if(stable)return;

  grid.dataset.v1182Signature=signature;
  grid.classList.add('cc-v118-catalog-grid');
  grid.innerHTML=cards.map(item=>catalogCard(item)).join('');
}

function renderCityFilter(panel,grid,cities){
  let filter=panel.querySelector('#clientCityFilterV1182');
  if(cities.length<2){
    filter?.remove();
    return;
  }
  const signature=cities.map(city=>`${cityKey(city)}:${city.name||''}`).join('|');
  if(!filter){
    filter=document.createElement('div');
    filter.id='clientCityFilterV1182';
    filter.className='cc-v1182-city-filter';
    filter.setAttribute('role','group');
    filter.setAttribute('aria-label','Choisir la ville du prochain passage');
    grid.before(filter);
  }
  if(filter.dataset.signature!==signature){
    filter.dataset.signature=signature;
    filter.innerHTML=cities.map(city=>`<button type="button" data-v1182-city="${esc(cityKey(city))}" aria-pressed="false">${esc(city.name||cityKey(city))}</button>`).join('');
    filter.querySelectorAll('[data-v1182-city]').forEach(button=>button.addEventListener('click',()=>{
      const next=String(button.dataset.v1182City||'');
      if(!next||next===selectedCity)return;
      selectedCity=next;
      grid.dataset.v1182Signature='';
      renderCityCatalog();
    }));
  }
  filter.querySelectorAll('[data-v1182-city]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.v1182City===selectedCity)));
}

function cityCards(city){
  const seen=new Set();
  const cards=[];
  for(const format of city?.formats||[]){
    const key=String(format?.id||format?.slug||format?.name||'');
    if(!key||seen.has(key))continue;
    seen.add(key);
    const prices=(format.offers||[]).map(offer=>Number(offer?.clientPriceCents||0)).filter(value=>value>0);
    cards.push({city,format,price:prices.length?Math.min(...prices):0});
  }
  return cards.slice(0,16);
}

function catalogCard({city,format,price}){
  const img=safeImage(format.imagePublicUrl||format.image||'');
  const url=new URL('/espace-client/reserver/',location.origin);
  if(city.slug)url.searchParams.set('city',city.slug);
  if(format.slug)url.searchParams.set('format',format.slug);
  const href=url.pathname+url.search;
  const label=`Réserver ${format.name||'ce format'} à ${city.name||'Neptune Media'}`;
  return `<a class="cc-v118-catalog-card cc-v118-catalog-card-link" data-v1182-booking-card="true" data-v1182-city-card="${esc(cityKey(city))}" href="${esc(href)}" aria-label="${esc(label)}" draggable="false"><div class="cc-v118-catalog-visual">${img?`<img src="${esc(img)}" alt="" loading="lazy" decoding="async" draggable="false">`:'<span>NEPTUNE</span>'}<i>${esc(city.name||'Neptune Media')}</i></div><div class="cc-v118-catalog-copy"><span>${esc(format.concept||'NEPTUNE MEDIA')}</span><strong>${esc(format.name||'Format Neptune Media')}</strong>${format.durationLabel?`<small>${esc(format.durationLabel)}</small>`:''}<p>${esc(short(format.description||'Format Neptune Media disponible à la réservation.',130))}</p></div><footer><b>${price?`Dès ${money(price)}`:'Voir les offres'}</b><span class="cc-v118-catalog-cta">Choisir <span aria-hidden="true">→</span></span></footer></a>`;
}

function safeImage(value){
  const text=String(value||'').trim();
  if(/^\/(?:assets|media)\//u.test(text))return text;
  try{
    const url=new URL(text);
    return url.protocol==='https:'?url.toString():'';
  }catch{return '';}
}

function short(value,limit){
  const text=String(value||'').replace(/\s+/gu,' ').trim();
  return text.length>limit?`${text.slice(0,Math.max(0,limit-1)).trimEnd()}…`:text;
}

function money(cents){
  return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100);
}

function esc(value){
  return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}
