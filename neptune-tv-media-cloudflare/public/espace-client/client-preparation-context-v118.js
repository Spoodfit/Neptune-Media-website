const RELEASE='neptune-client-preparation-context-20260814-v118';
const V77_SEEN='neptune_hors_norme_preparation_seen_v77';
const V118_SEEN_ALIAS='neptune:hors-norme-preparation:v77';
let importing=false;
let queued=false;

document.documentElement.dataset.clientPreparationContext=RELEASE;
start();

function start(){
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
}

function boot(){
  syncSeenAlias();
  document.addEventListener('click',onClick,true);
  new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
  queue();
}

function onClick(event){
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

function syncSeenAlias(){
  let values=[];
  try{
    const parsed=JSON.parse(localStorage.getItem(V77_SEEN)||'[]');
    if(Array.isArray(parsed))values=parsed.map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<10);
  }catch{}
  const mapped=[...new Set(values)].sort((a,b)=>a-b).map(index=>`hn-${String(index+1).padStart(2,'0')}`);
  let current='';
  try{current=localStorage.getItem(V118_SEEN_ALIAS)||'';}catch{}
  const next=JSON.stringify(mapped);
  if(current===next)return;
  try{localStorage.setItem(V118_SEEN_ALIAS,next);}catch{}
}
