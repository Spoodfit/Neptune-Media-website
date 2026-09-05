(() => {
  const RELEASE='neptune-reservation-runtime-20260905-v179.4';
  const STORAGE='neptune_media_reservation_v163';
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
  const EYEBROWS={company:'VOTRE ENTREPRISE',concept:'VOTRE CONCEPT',city:'VOTRE VILLE',physical:'VOTRE DÉCOR',date:'VOTRE CRÉNEAU',payment:'VOTRE RÉSERVATION',done:'CONFIRMATION'};
  const LEADS={
    concept:'Choisissez simplement l’intention qui correspond le mieux à votre prise de parole.',
    city:'Choisissez la ville qui vous convient parmi les studios réellement disponibles.',
    physical:'Choisissez uniquement l’ambiance visuelle dans laquelle vous souhaitez apparaître.',
    date:'Choisissez un créneau réellement disponible. Le studio confirme ensuite votre passage.',
    payment:'Vérifiez votre réservation puis confirmez-la avec le paiement sécurisé.'
  };
  let scheduled=false;
  document.body.dataset.tunnelRuntimeRelease=RELEASE;
  installEffectiveOfferRecovery();
  installPreStripeValidation();

  new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();

  function installEffectiveOfferRecovery(){
    if(window.__neptuneEffectiveOfferFetchV181)return;
    window.__neptuneEffectiveOfferFetchV181=true;
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(input,init={})=>{
      const response=await nativeFetch(input,init);
      try{
        const url=new URL(typeof input==='string'?input:input?.url||'',location.origin);
        const method=String(init?.method||input?.method||'GET').toUpperCase();
        if(method==='POST'&&url.pathname==='/api/reservation/selection-v96'&&response.status===409){
          const data=await response.clone().json().catch(()=>({}));
          if(data.error==='offer_tier_changed'||data.error==='offer_capacity_exhausted'){
            showTierRefresh(data.error);
          }
        }
      }catch{}
      return response;
    };
  }

  function installPreStripeValidation(){
    if(window.__neptunePreStripeEffectiveOfferV181)return;
    window.__neptunePreStripeEffectiveOfferV181=true;
    document.addEventListener('click',event=>{
      const link=event.target?.closest?.('#payLink');
      if(!link||link.dataset.v181Navigating==='1')return;
      const terms=host.querySelector('#termsAccepted');
      if(!terms?.checked)return;
      const saved=readSaved();
      if(!saved?.token||!saved?.cityId||!saved?.offerId||!saved?.requestedDate||!saved?.requestedDaypart)return;
      event.preventDefault();
      link.dataset.v181Navigating='1';
      link.setAttribute('aria-busy','true');
      setTimeout(()=>revalidateBeforeStripe(link,saved),0);
    },true);
  }

  async function revalidateBeforeStripe(link,saved){
    try{
      const catalogResponse=await fetch('/api/reservation/catalog-v96',{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache, no-store'}});
      const catalog=await catalogResponse.json().catch(()=>({}));
      if(!catalogResponse.ok)throw new Error(catalog.error||`http_${catalogResponse.status}`);
      const city=(catalog.cities||[]).find(item=>String(item.id||'')===String(saved.cityId||''));
      const format=(city?.formats||[]).find(item=>(item.offers||[]).some(offer=>String(offer.id||'')===String(saved.offerId||'')));
      const currentOffer=format?.offers?.find(offer=>String(offer.id||'')===String(saved.offerId||''));
      if(!city||!format||!currentOffer){
        showTierRefresh('offer_tier_changed');
        return;
      }
      const response=await fetch('/api/reservation/selection-v96',{
        method:'POST',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({
          token:saved.token,
          cityId:city.id,
          formatId:format.id,
          offerId:currentOffer.id,
          configurationChoice:String(saved.physicalFormat||''),
          requestedDate:String(saved.requestedDate||''),
          requestedDaypart:String(saved.requestedDaypart||''),
          accepted:true,
        }),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        if(data.error==='offer_tier_changed'||data.error==='offer_capacity_exhausted')return;
        throw new Error(data.error||`http_${response.status}`);
      }
      const paymentUrl=String(data.paymentUrl||'').trim();
      if(!/^https:\/\//iu.test(paymentUrl))throw new Error('payment_url_missing');
      location.assign(paymentUrl);
    }catch(error){
      link.dataset.v181Navigating='';
      link.removeAttribute('aria-busy');
      const target=host.querySelector('#error,.error');
      if(target)target.textContent='Impossible de revérifier ce tarif pour le moment. Aucun paiement n’a été lancé. Réessayez.';
      console.warn('[reservation-v181] pre-stripe validation failed',error);
    }
  }

  function showTierRefresh(code){
    const message=code==='offer_tier_changed'
      ?'Ce tarif vient d’être épuisé. Le tarif suivant disponible est chargé automatiquement…'
      :'Les places de ce palier viennent d’être épuisées. Mise à jour des disponibilités…';
    setTimeout(()=>{const error=host.querySelector('#error,.error');if(error)error.textContent=message;},0);
    setTimeout(()=>location.reload(),850);
  }

  function readSaved(){try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{return null}}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
  function apply(){
    scheduled=false;
    const stage=detectStage();if(!stage)return;
    document.body.dataset.tunnelRuntimeStage=stage;
    const heading=findHeading();if(heading&&TITLES[stage]&&heading.textContent!==TITLES[stage])heading.textContent=TITLES[stage];
    const eyebrow=findEyebrow();if(eyebrow&&EYEBROWS[stage]&&eyebrow.textContent!==EYEBROWS[stage])eyebrow.textContent=EYEBROWS[stage];
    const lead=findLead();
    if(stage==='company')enhanceCompany(lead);
    else if(lead&&LEADS[stage]&&lead.textContent!==LEADS[stage])lead.textContent=LEADS[stage];
    if(stage==='date')enhanceDate();
    if(stage==='payment')enhancePayment();
  }
  function detectStage(){if(host.querySelector('.prep-embedded,.confirmation-hero'))return'done';if(host.querySelector('#payLink,.payment-box,.payment-box-v97,.terms-box'))return'payment';if(host.querySelector('.calendar-shell,#daysGrid,#continuePayment'))return'date';if(host.querySelector('.configuration-grid,[data-physical]'))return'physical';if(host.querySelector('.city-choice-grid-v163,[data-city]'))return'city';if(host.querySelector('.concept-grid-v163,[data-concept]'))return'concept';if(host.querySelector('#companyForm,.company-first-panel'))return'company';return'';}
  function findHeading(){return host.querySelector(':scope > h1,:scope .confirmation-hero h1');}
  function findEyebrow(){return host.querySelector(':scope > .eyebrow,:scope .confirmation-hero .eyebrow');}
  function findLead(){return host.querySelector(':scope > .lead,:scope .confirmation-hero .lead');}
  function enhanceCompany(lead){
    if(lead)lead.remove();
    const panel=host.querySelector('.company-first-panel');if(!panel)return;
    panel.querySelector('.legal-note')?.remove();
    const field=panel.querySelector('.company-field');const label=field?.querySelector(':scope > span');const input=field?.querySelector('input');const button=panel.querySelector('button[type="submit"]');
    if(label)label.textContent='Nom de l’entreprise';
    if(input){input.placeholder='Ex. Neptune Business';input.setAttribute('autocomplete','organization');if(!input.dataset.focusedV179){input.dataset.focusedV179='1';requestAnimationFrame(()=>{if(document.activeElement===document.body||document.activeElement===document.documentElement)input.focus({preventScroll:true});});}}
    if(button)button.textContent='Continuer';
  }
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
