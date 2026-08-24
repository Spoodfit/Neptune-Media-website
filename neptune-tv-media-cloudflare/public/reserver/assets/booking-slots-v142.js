const RELEASE='neptune-booking-slots-20260824-v142';
const LEGACY_STORAGE='neptune_media_reservation_v96';
const SLOT_STORAGE='neptune_media_exact_slot_v142';
const nativeFetch=window.fetch.bind(window);
let requestKey='',loading=false;
window.__neptuneBookingSlotsV142=RELEASE;
document.documentElement.dataset.bookingSlotsV142=RELEASE;

window.fetch=async(input,init={})=>{
  const url=typeof input==='string'?input:input?.url||'';
  if(String(url).includes('/api/reservation/selection-v96')&&String(init?.method||input?.method||'GET').toUpperCase()==='POST'){
    try{
      const body=JSON.parse(String(init.body||'{}')),slot=readSlot();
      if(slot&&slot.offerId===String(body.offerId||'')&&slot.date===String(body.requestedDate||'')){
        init={...init,body:JSON.stringify({...body,slotStart:slot.startAt,slotEnd:slot.endAt,bookingEngine:RELEASE})};
      }
    }catch{}
  }
  return nativeFetch(input,init);
};

start();
function start(){const run=()=>{observe();sync()};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();}
function observe(){const host=document.getElementById('app-content');if(!host)return;new MutationObserver(()=>queueMicrotask(sync)).observe(host,{childList:true,subtree:true});}
async function sync(){
  const slotHost=document.querySelector('.calendar-shell .slots');if(!slotHost)return;
  const legacy=readLegacy(),offerId=String(legacy?.offerId||''),date=String(legacy?.requestedDate||'');
  if(!offerId||!date){clearSlot();return;}
  const key=`${offerId}|${date}`;if(slotHost.dataset.v142Key===key||loading)return;
  const selected=readSlot();if(selected&&(selected.offerId!==offerId||selected.date!==date))clearSlot();
  loading=true;slotHost.dataset.v142Key=key;requestKey=key;
  const morning=slotHost.querySelector('[data-slot="morning"]'),afternoon=slotHost.querySelector('[data-slot="afternoon"]');
  if(morning)morning.hidden=true;if(afternoon)afternoon.hidden=true;
  slotHost.insertAdjacentHTML('beforeend','<div class="v142-slot-loading">Vérification des disponibilités du studio…</div>');
  try{
    const r=await nativeFetch(`/api/reservation/slots-v142?offer_id=${encodeURIComponent(offerId)}&date=${encodeURIComponent(date)}`,{headers:{Accept:'application/json'},cache:'no-store'}),data=await r.json().catch(()=>({}));
    if(requestKey!==key)return;
    renderSlots(slotHost,data.slots||[],{offerId,date,morning,afternoon});
  }catch{renderUnavailable(slotHost,'Impossible de vérifier les disponibilités. Réessayez.')}
  finally{loading=false;patchSummary();}
}
function renderSlots(host,slots,ctx){host.querySelectorAll('.v142-slot-loading,.v142-exact-slot,.v142-slot-empty').forEach(x=>x.remove());if(!slots.length){renderUnavailable(host,'Aucun créneau disponible ce jour avec ce fournisseur.');return;}const selected=readSlot();for(const slot of slots){const active=selected?.startAt===slot.startAt&&selected?.endAt===slot.endAt,b=document.createElement('button');b.type='button';b.className=`slot v142-exact-slot${active?' active':''}`;b.dataset.start=slot.startAt;b.dataset.end=slot.endAt;b.innerHTML=`<b>${esc(slot.label)}</b><span>${durationLabel(slot.startAt,slot.endAt)}</span>`;b.addEventListener('click',()=>{writeSlot({...slot,offerId:ctx.offerId,date:ctx.date});const hour=localHour(slot.startAt),legacyButton=hour<13?ctx.morning:ctx.afternoon;if(legacyButton){legacyButton.click();setTimeout(patchSummary,0)}else patchSummary();});host.appendChild(b);}}
function renderUnavailable(host,text){host.querySelectorAll('.v142-slot-loading,.v142-exact-slot,.v142-slot-empty').forEach(x=>x.remove());const p=document.createElement('p');p.className='v142-slot-empty';p.textContent=text;host.appendChild(p);}
function patchSummary(){const slot=readSlot();if(!slot)return;const legacy=readLegacy();if(slot.offerId!==String(legacy?.offerId||'')||slot.date!==String(legacy?.requestedDate||''))return;const label=`${prettyDate(slot.date)} · ${slot.label}`;document.querySelectorAll('.selection-summary>div').forEach(div=>{const small=div.querySelector('small');if(small?.textContent?.includes('CRÉNEAU')){const strong=div.querySelector('strong');if(strong)strong.textContent=label;}});const result=document.querySelector('.slot-result');if(result)result.innerHTML=`Créneau : <strong>${esc(label)}</strong>`;const prep=document.querySelector('.confirmation-hero .lead strong');if(prep&&prep.textContent.includes(prettyDate(slot.date)))prep.textContent=label;}
function readLegacy(){try{return JSON.parse(localStorage.getItem(LEGACY_STORAGE)||'null')}catch{return null}}
function readSlot(){try{return JSON.parse(localStorage.getItem(SLOT_STORAGE)||'null')}catch{return null}}
function writeSlot(slot){localStorage.setItem(SLOT_STORAGE,JSON.stringify(slot));}
function clearSlot(){localStorage.removeItem(SLOT_STORAGE);}
function localHour(value){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(new Date(value)));}
function durationLabel(start,end){const min=Math.round((new Date(end)-new Date(start))/60000),h=Math.floor(min/60),r=min%60;return h?(r?`${h} h ${r} min`:`${h} h`):`${min} min`;}
function prettyDate(value){const [y,m,d]=String(value||'').split('-').map(Number),date=new Date(y,m-1,d);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(date);}
function esc(v){return String(v??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
