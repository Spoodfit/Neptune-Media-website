(() => {
  const RELEASE='neptune-client-reservation-truth-ui-20260904-v179';
  const FINAL=new Set(['delivered','completed']);
  let order=null,scheduled=false;
  document.documentElement.dataset.clientReservationTruthRelease=RELEASE;
  if(!['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname))return;
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});
  hydrate();schedule();setInterval(hydrate,60000);

  async function hydrate(){
    try{
      const response=await fetch('/api/client/session',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
      if(!response.ok)return;
      const data=await response.json();
      const orders=Array.isArray(data?.orders)?data.orders:[];
      order=orders.find(item=>item?.id&&!FINAL.has(String(item.status||'').toLowerCase()))||orders[0]||null;
      schedule();
    }catch(error){console.warn('[client-reservation-truth-v179] session unavailable',error);}
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
  function apply(){scheduled=false;if(!order?.reservationSnapshot)return;const region=document.querySelector('#ccDetailRegion');if(!region||region.hidden)return;const stage=region.dataset.stage||'';if(region.querySelector(`[data-client-reservation-truth-v179="${stage}"]`))return;if(stage==='format')renderFormat(region);if(stage==='payment')renderPayment(region);if(stage==='date')renderDate(region);}
  function renderFormat(region){
    const s=order.reservationSnapshot,c=s.concept||{},city=s.city||{},physical=s.physical||{};
    const body=region.querySelector('.cc-v118-stage-layout,.cc-v118-facts');if(!body)return;
    const visual=physical.imageUrl?`<div class="cc-v118-stage-visual"><img src="${esc(physical.imageUrl)}" alt="" loading="lazy" decoding="async"></div>`:'';
    const html=`${visual}${facts([['Format',c.name||order.format||'À confirmer'],['Concept',c.editorialLine||'Neptune Media'],['Ville',city.name||'À confirmer'],['Décor',physical.label||'Selon le format'],['Durée',c.durationLabel||'Selon le format']])}`;
    const layout=region.querySelector('.cc-v118-stage-layout');if(layout){layout.dataset.clientReservationTruthV179='format';layout.innerHTML=html;return;}body.outerHTML=`<div class="cc-v118-stage-layout" data-client-reservation-truth-v179="format">${html}</div>`;
  }
  function renderPayment(region){
    const paid=order.reservationSnapshot?.order||{};const target=region.querySelector('.cc-v118-facts');if(!target)return;
    target.outerHTML=facts([['Statut','Paiement validé'],['Montant payé',money(paid.paidAmountCents,paid.currency)],['Dossier',paid.reference||order.reference||order.id||'Neptune Media'],['Référence snapshot',order.reservationSnapshot?.capturedAt?dateTime(order.reservationSnapshot.capturedAt):'Enregistrée']],'payment');
  }
  function renderDate(region){
    const r=order.reservation||{},initial=order.reservationSnapshot?.reservation||{};const target=region.querySelector('.cc-v118-facts');if(!target)return;
    const status=({confirmed:'Confirmée',cancelled:'Annulée',conflict:'À régulariser',pending:'En attente'})[r.status]||'À confirmer';
    target.outerHTML=facts([['Date actuelle',r.currentDate?dateOnly(r.currentDate):'À confirmer'],['Créneau',daypart(r.currentDaypart)],['Date réservée initialement',initial.initialDate?dateOnly(initial.initialDate):'—'],['Statut',status]],'date');
  }
  function facts(items,stage=''){const marker=stage?` data-client-reservation-truth-v179="${stage}"`:'';return `<div class="cc-v118-facts"${marker}>${items.map(([label,value])=>`<article><span>${esc(label)}</span><strong>${esc(value||'—')}</strong></article>`).join('')}</div>`;}
  function money(cents,currency='eur'){const value=Number(cents||0)/100;try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:String(currency||'eur').toUpperCase(),maximumFractionDigits:2}).format(value);}catch{return`${value.toFixed(2)} €`;}}
  function daypart(value){return value==='morning'?'Matin · 9h–12h':value==='afternoon'?'Après-midi · 14h–17h':value||'À confirmer';}
  function dateOnly(value){const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d);}
  function dateTime(value){const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);}
  function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
})();
