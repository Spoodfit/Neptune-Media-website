const RELEASE='neptune-payment-confirmation-20260827-v146';
const STORAGE='neptune_media_reservation_v96';
const CONTEXT_API='/api/reservation/prospect/context';
const MAX_FAST_POLLS=18;
let token='',fastPolls=0,timer=0,busy=false;

document.documentElement.dataset.paymentConfirmation=RELEASE;
boot();

function boot(){
  const params=new URLSearchParams(location.search),saved=readSaved();
  token=String(params.get('reservation_token')||saved?.token||'').trim();
  document.getElementById('retry')?.addEventListener('click',()=>check(true));
  if(!token){renderMissingContext();return;}
  check(true);
}

async function check(immediate=false){
  clearTimeout(timer);if(busy)return;busy=true;
  try{
    const response=await fetch(`${CONTEXT_API}?reservation_token=${encodeURIComponent(token)}`,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache, no-store'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`http_${response.status}`);
    if(String(data.status||'').toLowerCase()==='paid'){renderPaid(data);return;}
    renderPending(data);
    fastPolls+=1;
    timer=setTimeout(()=>check(false),fastPolls<MAX_FAST_POLLS?1400:4500);
  }catch(error){
    console.error('payment_confirmation_v146_failed',error);
    renderDelayed();
    timer=setTimeout(()=>check(false),5000);
  }finally{busy=false;}
}

function renderPaid(data){
  clearTimeout(timer);
  const icon=document.getElementById('stateIcon'),title=document.getElementById('confirmationTitle'),text=document.getElementById('confirmationText'),booking=document.getElementById('booking'),link=document.getElementById('bookingLink'),summary=document.getElementById('summary'),support=document.getElementById('support');
  icon.className='state-icon is-paid';
  title.textContent='Votre passage est confirmé.';
  text.textContent='Le paiement a été validé automatiquement par Stripe. Votre dossier Neptune est créé et prêt pour la suite.';
  support.hidden=true;
  const preparationUrl=safeUrl(data.preparationBookingUrl||data.selection?.offer?.preparationUrl||data.preparationUrl||'');
  if(preparationUrl){link.href=preparationUrl;booking.hidden=false;}else booking.hidden=true;
  const selection=data.selection||{},contact=data.contact||{};
  summary.innerHTML=[
    ['Format',selection.format?.name||'Passage Neptune Media'],
    ['Ville',selection.city?.name||'À confirmer'],
    ['Contact',contact.email||'Votre dossier Neptune'],
  ].map(([label,value])=>`<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('');
  summary.hidden=false;
}

function renderPending(data){
  const icon=document.getElementById('stateIcon'),title=document.getElementById('confirmationTitle'),text=document.getElementById('confirmationText'),support=document.getElementById('support');
  icon.className='state-icon is-loading';
  title.textContent='Nous confirmons votre paiement.';
  text.textContent='Stripe vient de nous transmettre votre retour. Neptune attend la confirmation serveur sécurisée avant d’ouvrir la prise de rendez-vous.';
  if(fastPolls>=MAX_FAST_POLLS){support.hidden=false;}else support.hidden=true;
  document.getElementById('booking').hidden=true;
  document.getElementById('summary').hidden=true;
}

function renderDelayed(){
  const icon=document.getElementById('stateIcon');icon.className='state-icon is-error';
  document.getElementById('confirmationTitle').textContent='La vérification continue automatiquement.';
  document.getElementById('confirmationText').textContent='Ne payez pas une seconde fois. Nous réessayons de synchroniser la confirmation Stripe avec votre dossier.';
  document.getElementById('support').hidden=false;
  document.getElementById('booking').hidden=true;
}
function renderMissingContext(){
  const icon=document.getElementById('stateIcon');icon.className='state-icon is-error';
  document.getElementById('confirmationTitle').textContent='Retrouvons votre réservation.';
  document.getElementById('confirmationText').textContent='Ouvrez cette page depuis le même navigateur que celui utilisé pour réserver. Si besoin, revenez au tunnel pour retrouver votre dossier.';
  const support=document.getElementById('support');support.hidden=false;support.innerHTML='<strong>Votre paiement n’est pas perdu.</strong><p>Le statut est conservé par Stripe. Revenez au tunnel avec le même navigateur pour réassocier votre réservation.</p><a class="primary" href="/reserver">Retrouver ma réservation →</a>';
}
function readSaved(){try{return JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{return null;}}
function safeUrl(value){const raw=String(value||'').trim();if(!raw)return'';try{const url=new URL(raw,location.origin);return ['https:','http:'].includes(url.protocol)?url.toString():'';}catch{return'';}}
function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
