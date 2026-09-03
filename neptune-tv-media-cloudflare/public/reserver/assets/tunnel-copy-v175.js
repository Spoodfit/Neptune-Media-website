(() => {
  const RELEASE='neptune-reservation-copy-20260903-v175';
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
  document.body.dataset.tunnelCopyRelease=RELEASE;

  const observer=new MutationObserver(schedule);
  observer.observe(host,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

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
