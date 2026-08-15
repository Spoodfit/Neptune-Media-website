const RELEASE='neptune-client-catalog-interaction-20260815-v118.6';
const ROOT=document.documentElement;
let queued=false;

if(!window.__neptuneClientCatalogInteractionV1186){
  window.__neptuneClientCatalogInteractionV1186=true;
  ROOT.dataset.clientCatalogInteractionV1186='1';
  ROOT.dataset.clientCatalogInteractionRelease=RELEASE;
  installStyles();
  start();
}

function start(){
  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded',boot,{once:true})
    : boot();
}

function boot(){
  if(!home())return;
  normalizeCatalog();
  new MutationObserver(queue).observe(document.body,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['class','aria-current'],
  });
  document.addEventListener('pointerover',queueFromTarget,true);
  document.addEventListener('pointerdown',queueFromTarget,true);
  document.addEventListener('focusin',queueFromTarget,true);
}

function home(){
  return ['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname);
}

function queueFromTarget(event){
  if(event.target?.closest?.('.cc-v118-catalog-card,.formats-panel'))queue();
}

function queue(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{
    queued=false;
    normalizeCatalog();
  });
}

function normalizeCatalog(){
  const grid=document.querySelector('.formats-panel .format-grid');
  if(!grid)return;

  grid.querySelectorAll('article.cc-v118-catalog-card').forEach(upgradeLegacyCard);
  grid.querySelectorAll('a.cc-v118-catalog-card-link').forEach(stabilizeCard);
}

function upgradeLegacyCard(article){
  const href=clientBookingHref(article.querySelector('a[href]')?.getAttribute('href')||'');
  const card=document.createElement('a');
  card.className='cc-v118-catalog-card cc-v118-catalog-card-link cc-v1186-format-card';
  card.href=href;
  card.dataset.v1186Owner='true';
  if(article.dataset.v1182CityCard)card.dataset.v1182CityCard=article.dataset.v1182CityCard;

  const visualSource=article.querySelector('.cc-v118-catalog-visual');
  const visual=document.createElement('div');
  visual.className='cc-v118-catalog-visual';
  if(visualSource)visual.innerHTML=visualSource.innerHTML;
  card.append(visual);

  const copy=article.querySelector('.cc-v118-catalog-copy')?.cloneNode(true);
  if(copy)card.append(copy);

  const footer=document.createElement('footer');
  const price=article.querySelector('footer b')?.cloneNode(true);
  if(price)footer.append(price);
  const cta=document.createElement('span');
  cta.className='cc-v118-catalog-cta';
  cta.innerHTML='Choisir <span aria-hidden="true">→</span>';
  footer.append(cta);
  card.append(footer);

  const title=copy?.querySelector('strong')?.textContent?.trim()||'ce format';
  const city=visual.querySelector('i')?.textContent?.trim()||'Neptune Media';
  card.setAttribute('aria-label',`Réserver ${title} à ${city}`);
  article.replaceWith(card);
  stabilizeCard(card);
}

function stabilizeCard(card){
  card.classList.remove('format-card','active');
  card.classList.add('cc-v118-catalog-card','cc-v118-catalog-card-link','cc-v1186-format-card');
  card.dataset.v1186Owner='true';
  card.removeAttribute('aria-current');
  card.setAttribute('draggable','false');

  const href=clientBookingHref(card.getAttribute('href')||'');
  if(card.getAttribute('href')!==href)card.setAttribute('href',href);

  card.querySelectorAll('a').forEach(nested=>{
    const span=document.createElement('span');
    span.className=nested.className||'cc-v118-catalog-cta';
    span.innerHTML=nested.innerHTML;
    nested.replaceWith(span);
  });
  card.querySelectorAll('img').forEach(image=>image.setAttribute('draggable','false'));
}

function clientBookingHref(raw){
  try{
    const url=new URL(raw||'/espace-client/reserver/',location.origin);
    if(url.origin!==location.origin)return '/espace-client/reserver/';
    if(url.pathname==='/reserver'||url.pathname==='/reserver/')url.pathname='/espace-client/reserver/';
    if(!url.pathname.startsWith('/espace-client/reserver'))url.pathname='/espace-client/reserver/';
    return `${url.pathname}${url.search}${url.hash}`;
  }catch{
    return '/espace-client/reserver/';
  }
}

function installStyles(){
  if(document.querySelector('style[data-client-catalog-interaction-v1186]'))return;
  const style=document.createElement('style');
  style.dataset.clientCatalogInteractionV1186='';
  style.textContent=`
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card,
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card:link,
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card:visited{
  position:relative!important;
  min-width:0!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  justify-content:flex-start!important;
  gap:0!important;
  padding:0!important;
  overflow:hidden!important;
  border:1px solid rgba(26,52,92,.13)!important;
  border-radius:20px!important;
  background:#fff!important;
  color:inherit!important;
  text-decoration:none!important;
  box-shadow:0 12px 30px rgba(11,31,68,.055)!important;
  outline:0!important;
  cursor:pointer!important;
  transform:none!important;
  -webkit-tap-highlight-color:transparent!important;
  touch-action:manipulation;
  transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease!important;
}
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card>*{pointer-events:none}
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card::before,
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card::after{display:none!important;content:none!important}
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card .cc-v118-catalog-visual img{transform:none!important}
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card:focus-visible{
  outline:3px solid rgba(111,84,239,.38)!important;
  outline-offset:3px!important;
  border-color:rgba(111,84,239,.55)!important;
}
html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card:active{
  transform:scale(.995)!important;
  border-color:rgba(111,84,239,.38)!important;
  box-shadow:0 8px 20px rgba(11,31,68,.07)!important;
}
@media(hover:hover) and (pointer:fine){
  html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card:hover{
    transform:translateY(-2px)!important;
    border-color:rgba(111,84,239,.32)!important;
    box-shadow:0 18px 38px rgba(26,41,82,.10)!important;
  }
  html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card:hover .cc-v118-catalog-visual img{transform:scale(1.012)!important}
  html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card:hover .cc-v118-catalog-cta{
    border-color:#bdb4fb!important;
    background:#f7f5ff!important;
    color:#503dcc!important;
  }
}
@media(prefers-reduced-motion:reduce){
  html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card,
  html[data-client-catalog-interaction-v1186="1"] .dashboard-v37 a.cc-v1186-format-card .cc-v118-catalog-visual img{transition:none!important;transform:none!important}
}`;
  document.head.append(style);
}
