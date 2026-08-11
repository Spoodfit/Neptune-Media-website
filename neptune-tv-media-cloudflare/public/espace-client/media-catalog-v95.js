const RELEASE='neptune-client-media-catalog-20260811-v95';
const API='/api/public/media-catalog-v95';
let loaded=false;
start();
function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}
function boot(){document.body.dataset.mediaCatalogRelease=RELEASE;mount();new MutationObserver(()=>requestAnimationFrame(mount)).observe(document.body,{childList:true,subtree:true});}
async function mount(){
  if(document.querySelector('[data-media-catalog-v95]'))return;
  const host=document.querySelector('.dashboard-main,.client-main,main');
  if(!host||loaded)return;
  loaded=true;
  const section=document.createElement('section');section.className='client-media-catalog-v95';section.dataset.mediaCatalogV95='';
  section.innerHTML='<div class="cmc95-loading">Chargement des formats Neptune Media…</div>';
  host.append(section);
  try{const response=await fetch(API,{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);render(section,data.formats||[]);}catch{section.remove();loaded=false;}
}
function render(section,formats){
  if(!formats.length){section.remove();return;}
  section.innerHTML=`<header class="cmc95-head"><div><span>NOUVEAU PASSAGE</span><h2>Choisir un format Neptune Media</h2><p>Les formats disponibles sont gérés par l’équipe Neptune et restent synchronisés avec le Studio.</p></div></header><div class="cmc95-grid">${formats.map(card).join('')}</div>`;
}
function card(format){
  const url=format.bookingUrl||fallbackBooking(format.slug);
  return `<article class="cmc95-card"><div><span>${esc(format.concept||'NEPTUNE MEDIA')}</span><h3>${esc(format.name)}</h3>${format.durationLabel?`<small>${esc(format.durationLabel)}</small>`:''}<p>${esc(format.description||'Format Neptune Media disponible à la réservation.')}</p></div><div class="cmc95-footer">${Number(format.priceCents||0)>0?`<strong>${money(format.priceCents)}</strong>`:'<strong>Sur votre offre Neptune</strong>'}<a href="${esc(url)}">Choisir ce format</a></div></article>`;
}
function fallbackBooking(slug){const url=new URL('https://media.neptunebusiness.com/reserver');if(slug)url.searchParams.set('format',slug);return url.toString();}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(cents||0)/100);}
function esc(value){return String(value??'').replace(/[&<>"']/gu,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);}
