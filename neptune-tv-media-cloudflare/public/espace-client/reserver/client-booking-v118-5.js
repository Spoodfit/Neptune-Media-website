const RELEASE='neptune-client-direct-booking-ui-20260905-v118.5-v181';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const params=new URLSearchParams(location.search);

let selected={city:null,format:null,offer:null,configuration:''};

document.documentElement.dataset.clientDirectBookingRelease=RELEASE;
$('#logoutButton')?.addEventListener('click',logout);
$('#bookingForm')?.addEventListener('submit',submitBooking);
$('#requestedDate')?.addEventListener('change',()=>{validateDate(false);syncSummary();});
document.addEventListener('change',event=>{
  if(event.target.matches('[name="requestedDaypart"]'))syncSummary();
  if(event.target.matches('[name="configurationChoice"]')){
    selected.configuration=String(event.target.value||'');
    syncSummary();
  }
});

boot();

async function boot(){
  try{
    const [session,catalog]=await Promise.all([
      api('/api/client/session'),
      api('/api/reservation/catalog-v96'),
    ]);
    if(session?.authenticated!==true)throw new Error('unauthorized');
    selected=resolveSelection(catalog);
    renderSelection();
    setDateMinimum();
    $('#bookingLoading').hidden=true;
    $('#bookingForm').hidden=false;
  }catch(error){
    if(['unauthorized','http_401'].includes(String(error.message||''))){
      location.replace('/espace-client/');
      return;
    }
    $('#bookingLoading').hidden=true;
    $('#bookingError').hidden=false;
    $('#bookingErrorText').textContent=errorMessage(error);
  }
}

function resolveSelection(catalog){
  const citySlug=String(params.get('city')||'').trim();
  const formatSlug=String(params.get('format')||'').trim();
  const cities=Array.isArray(catalog?.cities)?catalog.cities:[];
  const city=cities.find(item=>String(item.slug||'')===citySlug)||null;
  const format=city?.formats?.find(item=>String(item.slug||'')===formatSlug)||null;
  const offer=Array.isArray(format?.offers)&&format.offers.length?format.offers[0]:null;
  if(!city||!format||!offer)throw new Error('selection_not_available');
  return {city,format,offer,configuration:''};
}

function renderSelection(){
  const {city,format,offer}=selected;
  $('#cityLabel').textContent=String(city.name||'Neptune Media').toUpperCase();
  $('#selectedFormatTitle').textContent=format.name||'Format Neptune Media';
  $('#formatDescription').textContent=format.description||'Votre prochain passage Neptune Media.';
  $('#formatDuration').textContent=format.durationLabel||format.concept||'';
  $('#formatPrice').textContent=money(offer.clientPriceCents,offer.currency);
  $('#summaryFormat').textContent=format.name||'Passage Neptune Media';
  $('#summaryCity').textContent=city.name||'—';
  $('#summaryFormatLine').textContent=format.name||'—';
  $('#summaryPrice').textContent=money(offer.clientPriceCents,offer.currency);
  renderFormatVisual(format.imagePublicUrl||format.image||'');
  renderConfigurations(offer.configurations||[]);
  syncSummary();
}

function renderFormatVisual(value){
  const host=$('#formatVisual');
  const src=safeImage(value);
  host.innerHTML=src?`<img src="${esc(src)}" alt="" decoding="async">`:'<span class="visual-fallback">NEPTUNE MEDIA</span>';
}

function renderConfigurations(configurations){
  const section=$('#configurationSection');
  const root=$('#configurationChoices');
  const items=(Array.isArray(configurations)?configurations:[]).map(option=>typeof option==='string'?{label:option}:option).filter(option=>option?.label);
  if(!items.length){section.hidden=true;selected.configuration='';return;}
  section.hidden=false;
  root.innerHTML=items.map((option,index)=>{
    const src=safeImage(option.image||'');
    const base64=String(option.imageBase64||'');
    return `<label class="configuration-choice"><input type="radio" name="configurationChoice" value="${esc(option.label)}" ${index===0?'checked':''}><span class="config-visual" ${base64?`data-base64-src="${esc(base64)}"`:''}>${src?`<img src="${esc(src)}" alt="" loading="lazy">`:`<span class="config-fallback">${esc(option.label)}</span>`}</span><span>${esc(option.label)}</span></label>`;
  }).join('');
  selected.configuration=items[0].label;
  hydrateBase64Visuals();
}

async function hydrateBase64Visuals(){
  await Promise.all($$('[data-base64-src]').map(async host=>{
    const path=String(host.dataset.base64Src||'');
    if(!/^\/assets\//u.test(path))return;
    try{
      const response=await fetch(path,{cache:'force-cache'});
      if(!response.ok)return;
      const raw=(await response.text()).trim();
      if(!raw)return;
      const src=raw.startsWith('data:')?raw:`data:image/png;base64,${raw.replace(/\s+/gu,'')}`;
      host.innerHTML=`<img src="${esc(src)}" alt="" loading="lazy">`;
    }catch{}
  }));
}

function setDateMinimum(){
  const input=$('#requestedDate');
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  input.min=localIsoDate(tomorrow);
}

function validateDate(showMessage=true){
  const input=$('#requestedDate');
  const error=$('#slotError');
  const value=String(input.value||'');
  if(!value){if(showMessage)setFieldError('Choisissez le jour souhaité.');return false;}
  const date=localDate(value);
  const minimum=localDate(input.min);
  if(!date||date<minimum){if(showMessage)setFieldError('Choisissez une date à partir de demain.');return false;}
  if(date.getDay()===0||date.getDay()===6){if(showMessage)setFieldError('Les passages sont proposés du lundi au vendredi.');return false;}
  error.hidden=true;error.textContent='';
  return true;
}

function setFieldError(message){const error=$('#slotError');error.textContent=message;error.hidden=false;}

function syncSummary(){
  const date=$('#requestedDate')?.value||'';
  const daypart=$('[name="requestedDaypart"]:checked')?.value||'';
  $('#summaryDate').textContent=date?dateLabel(date):'À choisir';
  $('#summaryDaypart').textContent=daypartLabel(daypart)||'À choisir';
  const row=$('#summaryConfigurationRow');
  if(selected.configuration){row.hidden=false;$('#summaryConfiguration').textContent=selected.configuration;}
  else row.hidden=true;
}

async function submitBooking(event){
  event.preventDefault();
  const error=$('#submitError');
  error.hidden=true;error.textContent='';
  if(!validateDate(true))return;
  const daypart=$('[name="requestedDaypart"]:checked')?.value||'';
  if(!daypart){setFieldError('Choisissez votre préférence de créneau.');return;}
  const configRequired=!$('#configurationSection').hidden;
  const configuration=$('[name="configurationChoice"]:checked')?.value||'';
  if(configRequired&&!configuration){error.textContent='Choisissez votre configuration de plateau.';error.hidden=false;return;}

  const button=$('#paymentButton');
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  const original=button.innerHTML;
  button.innerHTML='<span>Préparation du paiement…</span><b>···</b>';
  try{
    const result=await api('/api/client/reservation/prepare-payment',{
      method:'POST',
      body:JSON.stringify({
        cityId:selected.city.id,
        formatId:selected.format.id,
        offerId:selected.offer.id,
        configurationChoice:configuration,
        requestedDate:$('#requestedDate').value,
        requestedDaypart:daypart,
      }),
    });
    const paymentUrl=String(result?.paymentUrl||'');
    if(!/^https?:\/\//iu.test(paymentUrl)&&!paymentUrl.startsWith('/'))throw new Error('payment_url_missing');
    location.assign(paymentUrl);
  }catch(submitError){
    const code=String(submitError?.message||'');
    if(code==='offer_tier_changed'){
      const refreshed=await refreshEffectiveOffer();
      error.textContent=refreshed?'Le précédent tarif vient d’être épuisé. Le tarif suivant disponible a été chargé automatiquement. Vérifiez le nouveau total puis continuez.':'Ce tarif vient d’être épuisé. Revenez aux formats pour voir la disponibilité actuelle.';
    }else if(code==='offer_capacity_exhausted'){
      const refreshed=await refreshEffectiveOffer();
      error.textContent=refreshed?'La disponibilité a changé. Le tarif actuellement réservable a été chargé.':'Toutes les places actuellement configurées pour ce format sont réservées.';
    }else error.textContent=errorMessage(submitError);
    error.hidden=false;
    button.disabled=false;
    button.removeAttribute('aria-busy');
    button.innerHTML=original;
  }
}

async function refreshEffectiveOffer(){
  try{
    const currentCity=String(selected.city?.slug||params.get('city')||'');
    const currentFormat=String(selected.format?.slug||params.get('format')||'');
    const catalog=await api('/api/reservation/catalog-v96');
    const city=(catalog?.cities||[]).find(item=>String(item.slug||'')===currentCity);
    const format=city?.formats?.find(item=>String(item.slug||'')===currentFormat);
    const offer=(format?.offers||[])[0]||null;
    if(!city||!format||!offer)return false;
    selected={city,format,offer,configuration:''};
    renderSelection();
    return true;
  }catch{return false;}
}

async function logout(){
  const button=$('#logoutButton');if(button)button.disabled=true;
  try{await fetch('/api/client/logout',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});}catch{}
  location.assign('/espace-client/');
}

async function api(url,options={}){
  const headers={Accept:'application/json',...(options.headers||{})};
  if(options.body)headers['Content-Type']='application/json';
  const response=await fetch(url,{...options,headers,credentials:'same-origin',cache:options.method?'no-store':'no-store'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(payload.error||`http_${response.status}`);error.payload=payload;throw error;}
  return payload;
}

function errorMessage(error){
  const code=String(error?.message||'');
  if(code==='selection_not_available'||code==='offer_not_available')return 'Ce format n’est plus disponible à la réservation. Revenez à l’accueil pour voir les formats disponibles.';
  if(code==='offer_tier_changed')return 'Ce tarif vient d’être épuisé. Le tarif suivant disponible va être chargé.';
  if(code==='offer_capacity_exhausted')return 'Toutes les places actuellement configurées pour ce format sont réservées.';
  if(code==='invalid_requested_date')return 'Ce jour n’est pas disponible. Choisissez un autre jour ouvré.';
  if(code==='requested_slot_required')return 'Choisissez votre préférence de créneau.';
  if(code==='configuration_required')return 'Choisissez votre configuration de plateau.';
  if(code==='configuration_not_available')return 'Cette configuration n’est plus disponible. Rechargez la page et choisissez-en une autre.';
  if(code==='payment_url_missing')return 'Le paiement n’est pas disponible pour le moment. Votre réservation n’a pas été débitée.';
  return 'La réservation n’a pas pu être préparée. Réessayez dans quelques instants.';
}
function safeImage(value){const text=String(value||'').trim();if(/^\/(?:assets|media)\//u.test(text))return text;try{const url=new URL(text);return url.protocol==='https:'?url.toString():'';}catch{return '';}}
function money(cents,currency='eur'){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:String(currency||'eur').toUpperCase(),maximumFractionDigits:0}).format(Number(cents||0)/100);}
function daypartLabel(value){return ({morning:'Matin',afternoon:'Après-midi',flexible:'Flexible'})[value]||'';}
function dateLabel(value){const date=localDate(value);return date?new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'long',year:'numeric'}).format(date):'À choisir';}
function localDate(value){if(!/^\d{4}-\d{2}-\d{2}$/u.test(String(value||'')))return null;const [y,m,d]=value.split('-').map(Number);const date=new Date(y,m-1,d);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;}
function localIsoDate(date){const pad=value=>String(value).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;}
function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);}
