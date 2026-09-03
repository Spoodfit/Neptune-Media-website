(() => {
  const RELEASE='neptune-reservation-focus-20260903-v174';
  const STORAGE='neptune_media_reservation_v163';
  const host=document.getElementById('app-content');
  if(!host)return;

  const order={company:0,concept:1,city:2,physical:3,date:4,payment:5,done:6};
  let lastStage='';
  let lastSignature='';
  let scheduled=false;

  document.body.dataset.tunnelFocusRelease=RELEASE;
  installIdentityBridge();

  const observer=new MutationObserver(schedule);
  observer.observe(host,{childList:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(enhance);
  }

  function enhance(){
    scheduled=false;
    const stage=detectStage();
    if(!stage)return;

    ensureBrand();
    if(stage==='company')simplifyCompanyStep();

    const title=host.querySelector(':scope > h1, :scope > .confirmation-hero h1, :scope .sales-v165-intro h1')?.textContent?.trim()||'';
    const signature=`${stage}|${title}`;
    document.body.dataset.focusStage=stage;

    if(signature!==lastSignature){
      const direction=!lastStage||order[stage]>=order[lastStage]?'forward':'back';
      animate(direction);
      lastSignature=signature;
      lastStage=stage;
    }
  }

  function ensureBrand(){
    if(host.querySelector(':scope > .tunnel-focus-brand-v172'))return;
    const brand=document.createElement('a');
    brand.className='tunnel-focus-brand-v172';
    brand.href='/';
    brand.setAttribute('aria-label','Neptune Media');
    brand.innerHTML='<img src="/assets/logo-neptune.svg" alt=""><span><b>Neptune Media</b><span>Réservation</span></span>';
    host.prepend(brand);
  }

  function simplifyCompanyStep(){
    const form=host.querySelector('#companyForm');
    if(!form)return;

    const eyebrow=host.querySelector(':scope > .eyebrow');
    const title=host.querySelector(':scope > h1');
    const lead=host.querySelector(':scope > .lead');
    const legal=form.querySelector('.legal-note');
    const label=form.querySelector('.company-field > span');
    const input=form.querySelector('input[name="companyIdentity"]');
    const button=form.querySelector('button[type="submit"]');
    const actions=form.querySelector('.actions');

    eyebrow?.remove();
    if(title)title.textContent='Quel est le nom de votre entreprise ?';
    lead?.remove();
    legal?.remove();
    label?.remove();

    if(input){
      input.placeholder='Ex. Neptune Business';
      input.setAttribute('aria-label','Nom de votre entreprise');
      input.setAttribute('autocomplete','organization');
      input.setAttribute('enterkeyhint','next');
      input.setAttribute('autocapitalize','words');
      if(!input.dataset.focusedOnce){
        input.dataset.focusedOnce='1';
        requestAnimationFrame(()=>{try{input.focus({preventScroll:true});}catch{input.focus();}});
      }
    }

    if(actions){
      actions.querySelector(':scope > span')?.remove();
      actions.style.gridTemplateColumns='1fr';
    }
    if(button){
      button.textContent='Continuer';
      button.style.width='100%';
    }
  }

  function installIdentityBridge(){
    if(window.__neptuneReservationIdentityBridgeV174)return;
    window.__neptuneReservationIdentityBridgeV174=true;
    const nativeFetch=window.fetch.bind(window);

    window.fetch=async(input,init={})=>{
      const requestUrl=typeof input==='string'?input:String(input?.url||'');
      const method=String(init?.method||input?.method||'GET').toUpperCase();
      if(method!=='POST'||!requestUrl.includes('/api/reservation/prospect/start'))return nativeFetch(input,init);

      let payload={};
      try{
        if(typeof init?.body==='string')payload=JSON.parse(init.body)||{};
      }catch{}

      const identity=readIdentity();
      if(identity.email&&!payload.email)payload.email=identity.email;
      if(identity.token&&!payload.reservationToken)payload.reservationToken=identity.token;

      const headers=new Headers(init?.headers||input?.headers||{});
      headers.set('Content-Type','application/json');
      headers.set('Accept','application/json');
      return nativeFetch(input,{...init,method:'POST',headers,body:JSON.stringify(payload)});
    };
  }

  function readIdentity(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{}
    const params=new URLSearchParams(location.search);
    const email=String(saved?.contact?.email||'').trim().toLowerCase();
    const token=String(params.get('reservation_token')||saved?.token||'').trim();
    return{email,token};
  }

  function detectStage(){
    if(host.querySelector('.prep-embedded,.confirmation-hero'))return'done';
    if(host.querySelector('#payLink,.payment-box,.payment-box-v97,.terms-box'))return'payment';
    if(host.querySelector('.calendar-shell,#daysGrid,#continuePayment'))return'date';
    if(host.querySelector('.configuration-grid,[data-physical]'))return'physical';
    if(host.querySelector('.city-choice-grid-v163,[data-city]'))return'city';
    if(host.querySelector('.concept-grid-v163,[data-concept],.sales-v165-grid,[data-v165-concept]'))return'concept';
    if(host.querySelector('#companyForm,.company-first-panel'))return'company';
    const text=(host.querySelector(':scope > .eyebrow')?.textContent||'').toLowerCase();
    if(text.includes('paiement'))return'payment';
    if(text.includes('créneau'))return'date';
    if(text.includes('format physique'))return'physical';
    if(text.includes('ville')||text.includes('où tourner'))return'city';
    if(text.includes('concept')||text.includes('expérience'))return'concept';
    if(text.includes('réservation commence')||text.includes('votre entreprise'))return'company';
    return'';
  }

  function animate(direction){
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(reduced)return;
    const start=direction==='back'?-34:48;
    const children=[...host.children].filter(node=>!node.classList.contains('tunnel-focus-brand-v172')&&!node.classList.contains('booking-macro-v166'));
    host.classList.remove('tunnel-focus-pulse-v172');
    void host.offsetWidth;
    host.classList.add('tunnel-focus-pulse-v172');
    children.forEach((node,index)=>{
      try{
        node.animate([
          {opacity:0,transform:`translate3d(${start}px,0,0)`},
          {opacity:1,transform:'translate3d(0,0,0)'}
        ],{
          duration:direction==='back'?300:390,
          delay:Math.min(index*22,88),
          easing:direction==='back'?'cubic-bezier(.2,.8,.2,1)':'cubic-bezier(.16,1,.3,1)',
          fill:'both'
        });
      }catch{}
    });
    window.setTimeout(()=>host.classList.remove('tunnel-focus-pulse-v172'),520);
  }
})();
