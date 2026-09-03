(() => {
  const RELEASE='neptune-reservation-availability-ui-20260903-v172';
  const STORAGE='neptune_media_reservation_v163';
  const AVAILABILITY='/api/reservation/availability-v172';
  const HOLD='/api/reservation/hold-v172';
  const nativeFetch=window.fetch.bind(window);
  const cache=new Map();
  let decorateTimer=0;

  document.documentElement.dataset.reservationAvailabilityRelease=RELEASE;

  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    if(url.includes('/api/reservation/selection-v96')&&String(init?.method||'GET').toUpperCase()==='POST'){
      let payload={};
      try{payload=JSON.parse(String(init.body||'{}'));}catch{}
      if(payload?.token&&payload?.offerId&&payload?.requestedDate&&payload?.requestedDaypart){
        const holdResponse=await nativeFetch(HOLD,{
          method:'POST',
          credentials:'same-origin',
          headers:{'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify({token:payload.token,offerId:payload.offerId,requestedDate:payload.requestedDate,requestedDaypart:payload.requestedDaypart}),
        });
        if(!holdResponse.ok){
          const holdData=await holdResponse.json().catch(()=>({}));
          cache.clear();
          scheduleDecorate();
          setTimeout(()=>{const error=document.getElementById('error');if(error)error.textContent=holdData.error==='slot_unavailable'?'Ce créneau vient d’être réservé. Choisissez-en un autre.':'Impossible de sécuriser ce créneau. Réessayez.';},0);
          return new Response(JSON.stringify({error:holdData.error||'slot_unavailable'}),{
            status:holdResponse.status||409,
            headers:{'Content-Type':'application/json'},
          });
        }
        cache.clear();
      }
    }
    return nativeFetch(input,init);
  };

  const observer=new MutationObserver(scheduleDecorate);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('popstate',scheduleDecorate);
  scheduleDecorate();

  function scheduleDecorate(){
    clearTimeout(decorateTimer);
    decorateTimer=setTimeout(decorateCalendar,40);
  }

  async function decorateCalendar(){
    const saved=readSaved();
    const paymentToken=saved?.token||new URLSearchParams(location.search).get('reservation_token')||'';
    if(document.getElementById('payLink')&&paymentToken&&saved?.offerId)wirePaymentRefresh(paymentToken,saved.offerId);
    const shell=document.querySelector('.calendar-shell');
    if(!shell)return;
    const token=saved?.token||new URLSearchParams(location.search).get('reservation_token')||'';
    const offerId=saved?.offerId||'';
    const monthLabel=document.getElementById('monthLabel');
    const dayButtons=[...document.querySelectorAll('#daysGrid [data-date]')];
    if(!token||!offerId||!monthLabel||!dayButtons.length)return;
    const firstDate=dayButtons.find(x=>x.dataset.date)?.dataset.date||'';
    const month=firstDate.slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(month))return;

    let data=cache.get(`${offerId}:${month}`);
    if(!data){
      try{
        const response=await nativeFetch(AVAILABILITY,{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify({token,offerId,month}),
        });
        data=await response.json().catch(()=>({}));
        if(!response.ok)return;
        cache.set(`${offerId}:${month}`,data);
      }catch{return;}
    }

    const unavailable=data.unavailable||{};
    dayButtons.forEach(button=>{
      const slots=unavailable[button.dataset.date]||[];
      const fullyUnavailable=slots.includes('morning')&&slots.includes('afternoon');
      if(fullyUnavailable){
        button.disabled=true;
        button.classList.add('is-booked-v172');
        button.title='Complet';
      }else{
        button.classList.remove('is-booked-v172');
        if(button.title==='Complet')button.removeAttribute('title');
      }
    });

    const selectedDate=String(saved?.requestedDate||document.querySelector('#daysGrid .selected')?.dataset.date||'');
    const selectedUnavailable=unavailable[selectedDate]||[];
    const selectedBusy=Boolean(saved?.requestedDaypart&&selectedUnavailable.includes(saved.requestedDaypart));
    const continueButton=document.getElementById('continuePayment');
    if(selectedBusy&&continueButton){continueButton.disabled=true;const error=document.getElementById('error');if(error)error.textContent='Ce créneau n’est plus disponible. Choisissez un autre horaire.';}
    document.querySelectorAll('[data-slot]').forEach(button=>{
      const busy=selectedUnavailable.includes(button.dataset.slot);
      if(busy){
        button.disabled=true;
        button.classList.add('is-booked-v172');
        button.setAttribute('aria-disabled','true');
        const span=button.querySelector('span');
        if(span&&!span.dataset.originalSlotText){span.dataset.originalSlotText=span.textContent||'';span.textContent='Indisponible';}
      }else{
        button.classList.remove('is-booked-v172');
        if(selectedDate)button.disabled=false;
        button.removeAttribute('aria-disabled');
        const span=button.querySelector('span');
        if(span?.dataset.originalSlotText){span.textContent=span.dataset.originalSlotText;delete span.dataset.originalSlotText;}
      }
    });

    const lead=shell.parentElement?.querySelector('.lead')||null;
    if(lead&&!lead.dataset.availabilityCopyV172){
      lead.dataset.availabilityCopyV172='1';
      lead.textContent='Choisissez un créneau réellement disponible. Il est temporairement sécurisé pendant votre paiement, puis confirmé automatiquement.';
    }
  }

  function wirePaymentRefresh(token,offerId){
    const link=document.getElementById('payLink');
    if(!link||link.dataset.slotRefreshV172)return;
    link.dataset.slotRefreshV172='1';
    link.addEventListener('click',async event=>{
      if(link.classList.contains('is-disabled')||link.getAttribute('aria-disabled')==='true')return;
      const saved=readSaved();
      if(!saved?.requestedDate||!saved?.requestedDaypart)return;
      event.preventDefault();
      const href=link.href;
      link.setAttribute('aria-busy','true');
      try{
        const response=await nativeFetch(HOLD,{
          method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify({token,offerId,requestedDate:saved.requestedDate,requestedDaypart:saved.requestedDaypart}),
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok){
          cache.clear();
          const status=document.getElementById('paymentStatus');
          if(status)status.textContent=data.error==='slot_unavailable'?'Ce créneau vient d’être réservé. Choisissez-en un autre.':'Le créneau doit être revérifié.';
          return;
        }
        location.href=href;
      }catch{
        const status=document.getElementById('paymentStatus');
        if(status)status.textContent='Impossible de sécuriser le créneau. Réessayez.';
      }finally{link.removeAttribute('aria-busy');}
    },true);
  }

  function readSaved(){try{return JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{return null;}}
})();
