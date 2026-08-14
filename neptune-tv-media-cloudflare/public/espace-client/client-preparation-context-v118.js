const RELEASE='neptune-client-preparation-context-20260814-v118.1';
const V77_SEEN='neptune_hors_norme_preparation_seen_v77';
const V118_SEEN_ALIAS='neptune:hors-norme-preparation:v77';
const ACK_PREFIX='neptune:preparation-ack:v118:';
const FINISHED=new Set(['filmed','videos_pending','videos_received','editing','approval','delivered','completed']);
let importing=false;
let queued=false;
let order=null;

document.documentElement.dataset.clientPreparationContext=RELEASE;
start();

function start(){
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
}

function boot(){
  syncSeenAlias();
  document.addEventListener('click',onClick,true);
  new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
  loadOrder();
  queue();
}

async function loadOrder(){
  try{
    const response=await fetch('/api/client/session',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(response.ok){
      const orders=Array.isArray(data.orders)?data.orders:[];
      order=orders.find(item=>item?.id&&String(item.status||'')!=='completed')||orders[0]||null;
    }
  }catch(error){
    console.error('client_preparation_context_v118_session_failed',error);
  }
  queue();
}

function onClick(event){
  const ack=event.target.closest?.('[data-v118-prep-ack]');
  if(ack){
    event.preventDefault();
    event.stopImmediatePropagation();
    confirmPreparation();
    return;
  }
  if(event.target.closest?.('[data-preparation-card]')){
    setTimeout(()=>{syncSeenAlias();queue();},40);
  }
}

function queue(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;sync();});
}

function sync(){
  document.querySelector('#clientPreparationActionV77')?.remove();
  syncSeenAlias();
  claimStatusHost();
  renderStatus();
  const mount=document.querySelector('#ccPreparationDeckV118');
  if(!mount)return;
  const deck=document.querySelector('#horsNormePreparationV77');
  if(deck){
    if(deck.parentElement!==mount)mount.replaceChildren(deck);
    return;
  }
  if(importing)return;
  importing=true;
  import('/espace-client/client-preparation-v77.js?v=2')
    .catch(error=>console.error('client_preparation_context_v118_import_failed',error))
    .finally(()=>{importing=false;setTimeout(queue,220);});
}

function claimStatusHost(){
  const legacy=document.querySelector('[data-v118-prep-status]');
  if(!legacy)return;
  legacy.removeAttribute('data-v118-prep-status');
  legacy.setAttribute('data-v118-prep-status-bridge','1');
  legacy.removeAttribute('data-v118-status-signature');
}

function renderStatus(){
  const host=document.querySelector('[data-v118-prep-status-bridge]');
  if(!host||!order)return;
  const values=readSeen();
  const count=values.length;
  const all=count===10;
  const ack=readAck();
  const before=prePassage(order);
  const signature=[order.id,count,all?'all':'partial',ack?.confirmedAt||'',before?'before':'after'].join('|');
  if(host.dataset.v118StatusSignature===signature)return;
  host.dataset.v118StatusSignature=signature;
  if(!before){
    host.innerHTML=`<div><span>PRÉPARATION</span><strong>${count}/10 cartes consultées</strong><p>Votre passage a déjà eu lieu : la préparation reste disponible comme référence.</p></div>`;
    return;
  }
  if(ack){
    host.innerHTML=`<div><span>PRÉPARATION VALIDÉE</span><strong>Vous avez confirmé avoir lu et compris la préparation</strong><p>${ack.confirmedAt?`Confirmé le ${escapeHtml(formatDateTime(new Date(ack.confirmedAt)))}`:'Confirmation enregistrée.'}</p></div><span class="cc-v118-prep-confirmed">✓ Compris</span>`;
    return;
  }
  host.innerHTML=`<div><span>AVANT VOTRE PASSAGE</span><strong>${count}/10 cartes consultées</strong><p>${all?'Toute la préparation a été consultée. Confirmez maintenant que les consignes sont comprises.':'Ouvrez chaque carte ci-dessous avant de confirmer votre préparation.'}</p></div><button type="button" data-v118-prep-ack ${all?'':'disabled'}>${all?'J’ai lu et compris ma préparation':`Encore ${10-count} carte${10-count>1?'s':''} à consulter`}</button>`;
}

function confirmPreparation(){
  if(!order||readSeen().length!==10||!prePassage(order))return;
  try{
    localStorage.setItem(ACK_PREFIX+String(order.id),JSON.stringify({
      orderId:String(order.id),
      format:String(order.format||''),
      confirmedAt:new Date().toISOString(),
      release:RELEASE,
    }));
  }catch{}
  queue();
}

function readAck(){
  if(!order)return null;
  try{
    const parsed=JSON.parse(localStorage.getItem(ACK_PREFIX+String(order.id))||'null');
    return parsed?.orderId===String(order.id)?parsed:null;
  }catch{return null;}
}

function readSeen(){
  try{
    const parsed=JSON.parse(localStorage.getItem(V77_SEEN)||'[]');
    if(!Array.isArray(parsed))return [];
    return [...new Set(parsed.map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<10))].sort((a,b)=>a-b);
  }catch{return [];}
}

function syncSeenAlias(){
  const mapped=readSeen().map(index=>`hn-${String(index+1).padStart(2,'0')}`);
  let current='';
  try{current=localStorage.getItem(V118_SEEN_ALIAS)||'';}catch{}
  const next=JSON.stringify(mapped);
  if(current===next)return;
  try{localStorage.setItem(V118_SEEN_ALIAS,next);}catch{}
}

function prePassage(item){
  if(FINISHED.has(String(item?.status||'').toLowerCase()))return false;
  const filming=new Date(item?.filmingAt||'');
  return Number.isNaN(filming.getTime())||filming.getTime()>Date.now();
}

function formatDateTime(date){
  return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(date).replace(' à ',' · ');
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/gu,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);
}
