(() => {
  const RELEASE='neptune-reservation-runtime-20260904-v179';
  const host=document.getElementById('app-content');
  if(!host)return;

  const TITLES={company:'Quel est le nom de votre entreprise ?',concept:'Quel concept vous ressemble ?',city:'Où souhaitez-vous tourner ?',physical:'Quel décor vous ressemble ?',date:'Quand souhaitez-vous tourner ?',payment:'Finalisez votre réservation.',done:'Votre passage est réservé.'};
  const LEADS={
    concept:'Choisissez simplement l’intention qui correspond le mieux à votre prise de parole.',
    city:'Choisissez la ville qui vous convient parmi les studios réellement disponibles.',
    physical:'Choisissez uniquement l’ambiance visuelle dans laquelle vous souhaitez apparaître.',
    date:'Choisissez un créneau réellement disponible. Le studio confirme ensuite votre passage.',
    payment:'Vérifiez votre réservation puis confirmez-la avec le paiement sécurisé.',
  };
  let scheduled=false;
  let conceptDescriptions=new Map();
  document.body.dataset.tunnelRuntimeRelease=RELEASE;

  new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  loadConceptDescriptions();

  async function loadConceptDescriptions(){
    try{
      const response=await fetch('/api/reservation/catalog-v96',{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json().catch(()=>null);
      if(!data)return;
      const map=new Map();
      for(const concept of data.concepts||[]){if(concept?.id&&concept?.description)map.set(String(concept.id),String(concept.description).trim());}
      if(!map.size){for(const city of data.cities||[])for(const format of city.formats||[]){if(format?.id&&format?.description&&!map.has(String(format.id)))map.set(String(format.id),String(format.description).trim());}}
      conceptDescriptions=map;schedule();
    }catch(error){console.warn('[tunnel-v179] catalog copy unavailable',error);}
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
  function apply(){scheduled=false;const stage=detectStage();if(!stage)return;document.body.dataset.tunnelRuntimeStage=stage;const heading=findHeading();if(heading&&TITLES[stage])heading.textContent=TITLES[stage];const lead=findLead();if(lead&&LEADS[stage])lead.textContent=LEADS[stage];if(stage==='concept')syncConceptDescriptions();if(stage==='date')enhanceDate();if(stage==='payment')enhancePayment();}
  function detectStage(){if(host.querySelector('.prep-embedded,.confirmation-hero'))return'done';if(host.querySelector('#payLink,.payment-box,.payment-box-v97,.terms-box'))return'payment';if(host.querySelector('.calendar-shell,#daysGrid,#continuePayment'))return'date';if(host.querySelector('.configuration-grid,[data-physical]'))return'physical';if(host.querySelector('.city-choice-grid-v163,[data-city]'))return'city';if(host.querySelector('.concept-grid-v163,[data-concept]'))return'concept';if(host.querySelector('#companyForm,.company-first-panel'))return'company';return'';}
  function findHeading(){return host.querySelector(':scope > h1,:scope .confirmation-hero h1');}
  function findLead(){return host.querySelector(':scope > .lead,:scope .confirmation-hero .lead');}
  function syncConceptDescriptions(){if(!conceptDescriptions.size)return;host.querySelectorAll('[data-concept]').forEach(card=>{const description=conceptDescriptions.get(String(card.dataset.concept||''));const target=card.querySelector('.concept-benefit-v163');if(description&&target&&target.textContent.trim()!==description)target.textContent=description;});}
  function enhanceDate(){const button=document.getElementById('continuePayment');if(button)button.textContent='Réserver ce créneau →';}
  function enhancePayment(){
    host.querySelectorAll('.payment-wait').forEach(node=>node.remove());
    const payLink=document.getElementById('payLink');if(payLink&&/^Payer\s+/u.test(payLink.textContent||''))payLink.textContent=payLink.textContent.replace(/^Payer\s+/u,'Confirmer et payer ');
    const pricing=host.querySelector('.pricing-alert');if(!pricing||pricing.classList.contains('pricing-alert-v179'))return;
    pricing.classList.add('pricing-alert-v179','pricing-alert-v176');
    const main=pricing.firstElementChild,sentence=pricing.querySelector(':scope > p'),current=main?.querySelector('strong'),crossed=main?.querySelector('s');
    const currentValue=parseMoney(current?.textContent||''),crossedValue=parseMoney(crossed?.textContent||'');
    if(main&&crossedValue>currentValue&&currentValue>0&&!main.querySelector('.pricing-saving-v176')){const saving=document.createElement('div');saving.className='pricing-saving-v176';saving.textContent=`Vous économisez ${formatMoney(crossedValue-currentValue)} aujourd’hui.`;main.appendChild(saving);}
    const remaining=parseRemaining(sentence?.textContent||'');if(sentence)sentence.remove();
    if(remaining!==null&&!pricing.querySelector('.pricing-urgency-v176')){const urgency=document.createElement('div');urgency.className='pricing-urgency-v176';urgency.innerHTML=`<span class="pricing-urgency-number-v176">${remaining}</span><span class="pricing-urgency-copy-v176"><b>${remaining===1?'place restante':'places restantes'}</b><small>à ce tarif</small></span>`;pricing.appendChild(urgency);}
  }
  function parseRemaining(text){const match=String(text||'').match(/(\d+)\s+place/iu);return match?Number(match[1]):null;}
  function parseMoney(text){const digits=String(text||'').replace(/[^0-9]/gu,'');return digits?Number(digits):0;}
  function formatMoney(value){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);}
})();
