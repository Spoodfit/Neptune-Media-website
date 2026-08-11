const RELEASE='neptune-client-media-catalog-20260811-v95';
const API='/api/public/media-catalog-v95';
let loading=false;
start();
function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}
function boot(){document.body.dataset.mediaCatalogRelease=RELEASE;mount();new MutationObserver(()=>requestAnimationFrame(mount)).observe(document.body,{childList:true,subtree:true});}
async function mount(){
  const existing=document.querySelector('.formats-panel');
  const grid=existing?.querySelector('.format-grid');
  if(!existing||!grid||loading||existing.dataset.mediaCatalogV95==='ready')return;
  loading=true;
  existing.dataset.mediaCatalogV95='loading';
  const title=existing.querySelector('#formatsTitle,.section-heading h2');
  const description=existing.querySelector('.section-heading p:not(.section-label)');
  const legacyLink=existing.querySelector('.section-heading .inline-action');
  if(title)title.textContent='Choisir votre prochain format';
  if(description)description.textContent='Les formats disponibles sont synchronisés avec le catalogue Neptune Media.';
  if(legacyLink){legacyLink.textContent='Réserver un passage';legacyLink.href='https://media.neptunebusiness.com';}
  grid.innerHTML='<div class="cmc95-loading">Chargement des formats Neptune Media…</div>';
  try{
    const response=await fetch(API,{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`http_${response.status}`);
    render(existing,grid,data.formats||[]);
  }catch{
    existing.dataset.mediaCatalogV95='error';
    grid.innerHTML='<p class="cmc95-error">Les formats sont momentanément indisponibles. Utilisez « Réserver un passage » pour continuer.</p>';
  }finally{loading=false;}
}
function render(section,grid,formats){
  if(!formats.length){section.dataset.mediaCatalogV95='empty';grid.innerHTML='<p class="cmc95-error">Aucun format n’est actuellement ouvert à la réservation.</p>';return;}
  section.dataset.mediaCatalogV95='ready';
  grid.innerHTML=formats.map(card).join('');
}
function card(format){
  const url=format.bookingUrl||fallbackBooking(format.slug);
  const symbol=/hors norme/iu.test(format.name||'')?'▶':'✦';
  return `<article class="format-card cmc95-card" data-format="${esc(format.slug||format.name||'format')}"><span class="format-symbol">${symbol}</span><div class="cmc95-copy"><span class="cmc95-concept">${esc(format.concept||'NEPTUNE MEDIA')}</span><strong>${esc(format.name)}</strong>${format.durationLabel?`<small>${esc(format.durationLabel)}</small>`:''}<p>${esc(format.description||'Format Neptune Media disponible à la réservation.')}</p></div><div class="cmc95-footer">${Number(format.priceCents||0)>0?`<strong>${money(format.priceCents)}</strong>`:'<strong>Inclus selon votre offre</strong>'}<a href="${esc(url)}">Choisir ce format</a></div></article>`;
}
function fallbackBooking(slug){const url=new URL('https://media.neptunebusiness.com/reserver');if(slug)url.searchParams.set('format',slug);return url.toString();}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(cents||0)/100);}
function esc(value){return String(value??'').replace(/[&<>"']/gu,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);}
