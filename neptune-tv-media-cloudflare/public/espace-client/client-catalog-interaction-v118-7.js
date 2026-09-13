const RELEASE='neptune-client-catalog-interaction-20260913-v118.9';
const ROOT=document.documentElement;
const CARD_SELECTOR='.formats-panel .cc-v118-catalog-card';
const LINK_SELECTOR='.formats-panel a.cc-v118-catalog-card-link';
let queued=false;
let pointerGesture=null;
let lastNavigationAt=0;

if(!window.__neptuneClientCatalogInteractionV1187){
  window.__neptuneClientCatalogInteractionV1187=true;
  ROOT.dataset.clientCatalogInteractionV1187='1';
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
  installInteractionOwner();
  normalizeCatalog();
  new MutationObserver(queue).observe(document.body,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['class','aria-current'],
  });
  // Never mutate/replace a card between pointerdown and click: doing so can
  // cancel the browser click sequence. Keyboard focus may still normalize.
  document.addEventListener('focusin',queueFromTarget,true);
}

function home(){
  return ['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname);
}

function installInteractionOwner(){
  // Own the interaction at window capture level. Older client runtimes also
  // listen on document capture and can cancel/replace the native anchor click.
  // Handling the completed pointer gesture here makes the card deterministic
  // without depending on listener registration order lower in the DOM tree.
  window.addEventListener('pointerdown',event=>{
    if(!plainPrimary(event))return;
    const card=catalogCardFromTarget(event.target);
    if(!card)return;
    pointerGesture={
      pointerId:event.pointerId,
      href:bookingHrefFromCard(card),
      x:event.clientX,
      y:event.clientY,
    };
  },true);

  window.addEventListener('pointerup',event=>{
    const gesture=pointerGesture;
    pointerGesture=null;
    if(!gesture||gesture.pointerId!==event.pointerId||!plainPrimary(event))return;
    if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>14)return;
    const card=catalogCardFromPoint(event.clientX,event.clientY)||catalogCardFromTarget(event.target);
    if(!card)return;
    const currentHref=bookingHrefFromCard(card);
    if(!sameBookingTarget(gesture.href,currentHref))return;
    navigateCatalog(event,gesture.href||currentHref);
  },true);

  window.addEventListener('pointercancel',()=>{pointerGesture=null;},true);

  // Keyboard activation and browsers that do not emit Pointer Events still use
  // click. It is also a fallback when the pointer gesture was not recorded.
  window.addEventListener('click',event=>{
    const card=catalogCardFromTarget(event.target);
    if(!card||!plainPrimary(event))return;
    if(Date.now()-lastNavigationAt<750){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    navigateCatalog(event,bookingHrefFromCard(card));
  },true);
}

function catalogCardFromTarget(target){
  if(!(target instanceof Element))return null;
  return target.closest(CARD_SELECTOR);
}

function catalogCardFromPoint(x,y){
  const target=document.elementFromPoint(x,y);
  return catalogCardFromTarget(target);
}

function bookingHrefFromCard(card){
  if(!card)return '/espace-client/reserver/';
  const raw=card.getAttribute('href')||card.dataset.bookingHref||card.querySelector('a[href]')?.getAttribute('href')||'';
  return clientBookingHref(raw);
}

function sameBookingTarget(a,b){
  try{
    return new URL(a,location.origin).href===new URL(b,location.origin).href;
  }catch{
    return a===b;
  }
}

function plainPrimary(event){
  return (typeof event.button!=='number'||event.button===0)
    &&event.isPrimary!==false
    &&!event.metaKey
    &&!event.ctrlKey
    &&!event.shiftKey
    &&!event.altKey;
}

function navigateCatalog(event,rawHref){
  const href=clientBookingHref(rawHref);
  event.preventDefault();
  event.stopImmediatePropagation();
  lastNavigationAt=Date.now();
  window.location.assign(href);
}

function queueFromTarget(event){
  if(event.target?.closest?.('.cc-v118-catalog-card,.formats-panel'))queue();
}

function queue(){
  if(queued||pointerGesture)return;
  queued=true;
  requestAnimationFrame(()=>{
    queued=false;
    if(pointerGesture)return;
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
  card.className='cc-v118-catalog-card cc-v118-catalog-card-link cc-v1187-format-card';
  card.href=href;
  card.dataset.bookingHref=href;
  card.dataset.v1187Owner='true';
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
  if(card.classList.contains('format-card'))card.classList.remove('format-card');
  if(card.classList.contains('active'))card.classList.remove('active');
  for(const name of ['cc-v118-catalog-card','cc-v118-catalog-card-link','cc-v1187-format-card']){
    if(!card.classList.contains(name))card.classList.add(name);
  }
  if(card.dataset.v1187Owner!=='true')card.dataset.v1187Owner='true';
  if(card.hasAttribute('aria-current'))card.removeAttribute('aria-current');
  if(card.getAttribute('draggable')!=='false')card.setAttribute('draggable','false');

  const href=clientBookingHref(card.getAttribute('href')||card.dataset.bookingHref||'');
  if(card.getAttribute('href')!==href)card.setAttribute('href',href);
  if(card.dataset.bookingHref!==href)card.dataset.bookingHref=href;

  card.querySelectorAll('a').forEach(nested=>{
    const span=document.createElement('span');
    span.className=nested.className||'cc-v118-catalog-cta';
    span.innerHTML=nested.innerHTML;
    nested.replaceWith(span);
  });
  card.querySelectorAll('img').forEach(image=>{
    if(image.getAttribute('draggable')!=='false')image.setAttribute('draggable','false');
  });
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
  if(document.querySelector('style[data-client-catalog-interaction-v1187]'))return;
  const style=document.createElement('style');
  style.dataset.clientCatalogInteractionV1187='';
  style.textContent=`
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card,
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card:link,
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card:visited{
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
  pointer-events:auto!important;
  transform:none!important;
  -webkit-tap-highlight-color:transparent!important;
  touch-action:manipulation;
  transition:border-color .12s ease,box-shadow .12s ease,background-color .12s ease!important;
}
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card>*{pointer-events:none!important}
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card::before,
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card::after{display:none!important;content:none!important;pointer-events:none!important}
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card .cc-v118-catalog-visual img{
  transform:none!important;
  transition:none!important;
}
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card:focus-visible{
  outline:3px solid rgba(111,84,239,.38)!important;
  outline-offset:3px!important;
  border-color:rgba(111,84,239,.55)!important;
}
html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card:active{
  transform:none!important;
  border-color:rgba(111,84,239,.42)!important;
  box-shadow:0 10px 24px rgba(26,41,82,.09),inset 0 0 0 1px rgba(111,84,239,.08)!important;
}
@media(hover:hover) and (pointer:fine){
  html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card:hover{
    transform:none!important;
    border-color:rgba(111,84,239,.34)!important;
    box-shadow:0 16px 34px rgba(26,41,82,.09)!important;
  }
  html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card:hover .cc-v118-catalog-visual img{
    transform:none!important;
  }
  html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card:hover .cc-v118-catalog-cta{
    border-color:#bdb4fb!important;
    background:#f7f5ff!important;
    color:#503dcc!important;
  }
}
@media(prefers-reduced-motion:reduce){
  html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card,
  html[data-client-catalog-interaction-v1187="1"] .dashboard-v37 a.cc-v1187-format-card .cc-v118-catalog-visual img,
  html[data-client-catalog-interaction-v1187="1"] .cc-v118-catalog-cta{
    transition:none!important;
    transform:none!important;
  }
}`;
  document.head.append(style);
}
