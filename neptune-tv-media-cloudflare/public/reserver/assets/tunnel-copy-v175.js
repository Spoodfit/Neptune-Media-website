(() => {
  const RELEASE='neptune-reservation-copy-20260904-v175.1';
  const host=document.getElementById('app-content');
  if(!host)return;

  const TITLES={
    company:'Quel est le nom de votre entreprise ?',
    concept:'Quel concept vous ressemble ?',
    city:'Où souhaitez-vous tourner ?',
    physical:'Quel décor vous ressemble ?',
    date:'Quand souhaitez-vous tourner ?',
    payment:'Finalisez votre réservation.',
    done:'Votre passage est réservé.'
  };

  let scheduled=false;
  let conceptDescriptions=new Map();
  document.body.dataset.tunnelCopyRelease=RELEASE;

  const observer=new MutationObserver(schedule);
  observer.observe(host,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
  loadConceptDescriptions();

  async function loadConceptDescriptions(){
    try{
      const response=await fetch('/api/reservation/catalog-v96',{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)return;
      const catalog=await response.json().catch(()=>null);
      if(!catalog)return;
      conceptDescriptions=buildDescriptionMap(catalog);
      schedule();
    }catch(error){
      console.warn('[tunnel-copy] concept descriptions unavailable',error);
    }
  }

  function buildDescriptionMap(catalog){
    const map=new Map();
    const concepts=Array.isArray(catalog?.concepts)?catalog.concepts:[];
    for(const concept of concepts){
      const description=String(concept?.description||'').trim();
      if(concept?.id&&description)map.set(String(concept.id),description);
    }
    if(map.size)return map;
    for(const city of catalog?.cities||[]){
      for(const format of city?.formats||[]){
        const description=String(format?.description||'').trim();
        if(format?.id&&description&&!map.has(String(format.id)))map.set(String(format.id),description);
      }
    }
    return map;
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }

  function apply(){
    scheduled=false;
    const stage=detectStage();
    if(!stage)return;
    const heading=findHeading();
    const next=TITLES[stage];
    if(heading&&next&&heading.textContent.trim()!==next)heading.textContent=next;
    if(stage==='concept')syncConceptDescriptions();
  }

  function syncConceptDescriptions(){
    if(!conceptDescriptions.size)return;
    host.querySelectorAll('[data-concept]').forEach(card=>{
      const description=conceptDescriptions.get(String(card.dataset.concept||''));
      const target=card.querySelector('.concept-benefit-v163');
      if(description&&target&&target.textContent.trim()!==description)target.textContent=description;
    });
  }

  function findHeading(){
    return host.querySelector(':scope > h1, :scope .sales-v165-intro h1, :scope .confirmation-hero h1');
  }

  function detectStage(){
    if(host.querySelector('.prep-embedded,.confirmation-hero'))return'done';
    if(host.querySelector('#payLink,.payment-box,.payment-box-v97,.terms-box'))return'payment';
    if(host.querySelector('.calendar-shell,#daysGrid,#continuePayment'))return'date';
    if(host.querySelector('.configuration-grid,[data-physical]'))return'physical';
    if(host.querySelector('.city-choice-grid-v163,[data-city]'))return'city';
    if(host.querySelector('.concept-grid-v163,[data-concept],.sales-v165-grid,[data-v165-concept]'))return'concept';
    if(host.querySelector('#companyForm,.company-first-panel'))return'company';
    return'';
  }
})();
