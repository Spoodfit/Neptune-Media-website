(() => {
  const RELEASE='neptune-reservation-conversion-20260903-v176';
  const host=document.getElementById('app-content');
  if(!host)return;

  document.body.dataset.tunnelConversionRelease=RELEASE;
  let scheduled=false;

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
    const pricing=host.querySelector('.pricing-alert');
    if(pricing)enhancePricing(pricing);
    host.querySelectorAll('.payment-wait').forEach(node=>node.remove());
  }

  function enhancePricing(pricing){
    if(pricing.classList.contains('pricing-alert-v176'))return;
    pricing.classList.add('pricing-alert-v176');

    const main=pricing.firstElementChild;
    const sentence=pricing.querySelector(':scope > p');
    const current=main?.querySelector('strong');
    const crossed=main?.querySelector('s');
    const remaining=parseRemaining(sentence?.textContent||'');

    const currentValue=parseMoney(current?.textContent||'');
    const crossedValue=parseMoney(crossed?.textContent||'');
    if(main&&crossedValue>currentValue&&currentValue>0){
      const saving=document.createElement('div');
      saving.className='pricing-saving-v176';
      saving.textContent=`Vous économisez ${formatMoney(crossedValue-currentValue)} aujourd’hui.`;
      main.appendChild(saving);
    }

    if(sentence)sentence.remove();
    if(remaining===null)return;

    const urgency=document.createElement('div');
    urgency.className='pricing-urgency-v176';
    urgency.innerHTML=`<span class="pricing-urgency-number-v176">${remaining}</span><span class="pricing-urgency-copy-v176"><b>${remaining===1?'place restante':'places restantes'}</b><small>à ce tarif</small></span>`;
    pricing.appendChild(urgency);
  }

  function parseRemaining(text){
    const match=String(text||'').match(/(\d+)\s+place/iu);
    return match?Number(match[1]):null;
  }

  function parseMoney(text){
    const digits=String(text||'').replace(/[^0-9]/gu,'');
    return digits?Number(digits):0;
  }

  function formatMoney(value){
    return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);
  }
})();
