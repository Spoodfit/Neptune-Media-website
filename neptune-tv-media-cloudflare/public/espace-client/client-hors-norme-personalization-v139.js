const RELEASE='neptune-client-preparation-simplification-20260827-v146';
const SESSION_API='/api/client/session';
const CATALOG_API='/api/reservation/catalog-v96';
let session=null,catalog=null,loading=false,refreshTimer=0;

document.documentElement.dataset.clientPreparationSimplification=RELEASE;
start();

function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}
function boot(){
  if(!['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname))return;
  removeQuestionPersonalization();
  window.addEventListener('click',captureIntent,true);
  new MutationObserver(scheduleRefresh).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-stage']});
  window.addEventListener('focus',()=>hydrate(true));
  hydrate(false);
  scheduleRefresh();
}

function captureIntent(event){
  const stage=event.target.closest?.('[data-cc-stage],[data-cc-track]');
  if(stage){
    const region=document.getElementById('ccDetailRegion');
    if(region){region.dataset.neptuneUserOpen='1';region.hidden=false;}
    setTimeout(()=>{compactDetail();mountFormatPreparation();},0);
    return;
  }
  if(event.target.closest?.('[data-v118-close]')){
    const region=document.getElementById('ccDetailRegion');
    if(region)delete region.dataset.neptuneUserOpen;
  }
}

function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{removeQuestionPersonalization();compactDetail();mountFormatPreparation();},45);}
function removeQuestionPersonalization(){
  for(const id of ['hnPersonalizationV139','hnPersonalizationDialogV139','hnToastV139'])document.getElementById(id)?.remove();
  document.querySelectorAll('.hn-personalization-v139,.hn-personalization-dialog-v139,.hn-toast-v139').forEach(node=>node.remove());
}
function compactDetail(){
  const region=document.getElementById('ccDetailRegion');
  if(!region)return;
  if(region.dataset.neptuneUserOpen!=='1')region.hidden=true;
}

async function hydrate(force=false){
  if(loading||(!force&&session&&catalog))return;
  loading=true;
  try{
    const [sessionResponse,catalogResponse]=await Promise.all([
      fetch(SESSION_API,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}}),
      fetch(CATALOG_API,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}}),
    ]);
    const [sessionData,catalogData]=await Promise.all([sessionResponse.json().catch(()=>({})),catalogResponse.json().catch(()=>({}))]);
    if(sessionResponse.ok&&sessionData.authenticated!==false)session=sessionData;
    if(catalogResponse.ok)catalog=catalogData;
    mountFormatPreparation();
  }catch(error){console.error('client_preparation_simplification_v146_failed',error);}
  finally{loading=false;}
}

function mountFormatPreparation(){
  const region=document.getElementById('ccDetailRegion');
  if(!region||region.dataset.stage!=='preparation'||region.dataset.neptuneUserOpen!=='1')return;
  const order=currentOrder();
  if(!order||/hors\s*norme/iu.test(String(order.format||order.title||'')))return;
  const format=findFormat(order);
  const cards=formatPreparationCards(format);
  let section=document.getElementById('formatPreparationCardsV146');
  if(!cards.length){section?.remove();return;}
  if(!section){
    section=document.createElement('section');
    section.id='formatPreparationCardsV146';
    section.className='format-preparation-v146';
    const anchor=region.querySelector('.cc-v118-note')||region.querySelector('.cc-v118-facts');
    anchor?.after(section);
  }
  const signature=cards.map(card=>`${card.label}|${card.image||card.imageBase64||''}|${card.description||''}`).join('||');
  if(section.dataset.signature===signature)return;
  section.dataset.signature=signature;
  section.innerHTML=`<header><div><span>PRÉPARER VOTRE FORMAT</span><h4>${esc(format?.name||order.format||'Votre passage')}</h4><p>Les cartes configurées pour ce format apparaissent automatiquement ici.</p></div><small>${cards.length} carte${cards.length>1?'s':''}</small></header><div class="format-preparation-track-v146">${cards.map((card,index)=>cardMarkup(card,index)).join('')}</div>`;
  hydrateBase64(section);
}

function currentOrder(){const orders=Array.isArray(session?.orders)?session.orders:[];return orders.find(order=>order?.id&&!['delivered','completed'].includes(String(order.status||'').toLowerCase()))||orders[0]||null;}
function findFormat(order){
  const key=normal(order?.format||order?.title||'');if(!key)return null;
  for(const city of catalog?.cities||[])for(const format of city?.formats||[]){
    if([format.id,format.slug,format.name].some(value=>normal(value)===key))return format;
  }
  return null;
}
function formatPreparationCards(format){
  const seen=new Set(),cards=[];
  for(const offer of format?.offers||[])for(const raw of offer?.configurations||[]){
    const card=typeof raw==='string'?{label:raw}:raw||{},label=String(card.label||'').trim();
    const key=normal(label);if(!key||seen.has(key))continue;seen.add(key);
    cards.push({label,description:String(card.description||'').trim(),image:safeImage(card.image||''),imageBase64:safePath(card.imageBase64||'')});
  }
  return cards;
}
function cardMarkup(card,index){
  const visual=card.image?`<img src="${esc(card.image)}" alt="" loading="lazy" decoding="async">`:card.imageBase64?`<img data-v146-b64="${esc(card.imageBase64)}" alt="" loading="lazy">`:`<span class="format-preparation-fallback-v146">${String(index+1).padStart(2,'0')}</span>`;
  return `<article class="format-preparation-card-v146"><div>${visual}</div><strong>${esc(card.label)}</strong>${card.description?`<p>${esc(card.description)}</p>`:''}</article>`;
}
async function hydrateBase64(root){for(const image of root.querySelectorAll('img[data-v146-b64]')){if(image.dataset.loaded)return;image.dataset.loaded='1';try{const response=await fetch(image.dataset.v146B64,{cache:'force-cache'});if(!response.ok)throw new Error('image');const text=(await response.text()).trim();image.src=`data:image/webp;base64,${text}`;}catch{image.remove();}}}
function safeImage(value){const raw=String(value||'').trim();if(!raw)return'';if(raw.startsWith('/'))return raw;try{const url=new URL(raw);return url.protocol==='https:'?url.toString():'';}catch{return'';}}
function safePath(value){const raw=String(value||'').trim();return raw.startsWith('/')?raw:'';}
function normal(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-|-$/gu,'');}
function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
