const $=(selector,root=document)=>root.querySelector(selector);
let snapshotState={orders:[]};
let activeOrderId='';
let snapshotTimer=0;

start();

function start(){
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
}

function boot(){
  if(!$('#dashboard'))return;
  refreshSnapshot();
}

async function refreshSnapshot(){
  clearTimeout(snapshotTimer);
  try{
    const response=await fetch('/api/client/session',{headers:{Accept:'application/json'},credentials:'same-origin'});
    if(!response.ok)return;
    snapshotState=await response.json();
    renderSnapshot();
  }catch(error){console.error('client_content_snapshot_failed',error);}
  snapshotTimer=setTimeout(refreshSnapshot,60_000);
}

function renderSnapshot(){
  const orders=(snapshotState.orders||[])
    .filter((order)=>(order.files||[]).length)
    .sort((a,b)=>timestamp(b)-timestamp(a));
  if(!orders.length)return;
  if(!orders.some((order)=>order.id===activeOrderId))activeOrderId=orders[0].id;
  const order=orders.find((item)=>item.id===activeOrderId)||orders[0];
  const longFiles=(order.files||[]).filter((file)=>category(file)==='long');
  const shortFiles=(order.files||[]).filter((file)=>category(file)==='short');
  const anchor=$('.overview-grid');
  if(!anchor)return;
  let section=$('#clientContentSnapshot');
  if(!section){
    section=document.createElement('section');
    section.id='clientContentSnapshot';
    section.className='client-content-snapshot';
    anchor.after(section);
  }
  const passageOptions=orders.map((item,index)=>`<option value="${esc(item.id)}" ${item.id===order.id?'selected':''}>Passage ${String(index+1).padStart(2,'0')} · ${esc(item.title||item.format||'Neptune Media')}</option>`).join('');
  const hero=longFiles[0]?mediaTile(longFiles[0],'hero'):`<div class="snapshot-empty snapshot-empty--hero"><span>ÉMISSION</span><strong>La vidéo longue apparaîtra ici</strong></div>`;
  const shorts=shortFiles.slice(0,4).map((file)=>mediaTile(file,'short')).join('')||'<div class="snapshot-empty"><span>SHORTS</span><strong>Les formats courts seront ajoutés progressivement</strong></div>';
  section.innerHTML=`<header><div><p>VOS CONTENUS</p><h2>Tout voir sans parcourir une longue liste</h2></div><a href="/espace-client/videos/">Ouvrir la bibliothèque</a></header><div class="snapshot-toolbar"><label><span>Passage</span><select data-snapshot-passage>${passageOptions}</select></label><div><span><b>${longFiles.length}</b> long</span><span><b>${shortFiles.length}</b> shorts</span></div></div><div class="snapshot-layout"><section class="snapshot-long"><div class="snapshot-section-head"><strong>Émission complète</strong><span>${longFiles.length}</span></div>${hero}</section><section class="snapshot-shorts"><div class="snapshot-section-head"><strong>Derniers shorts</strong><span>${shortFiles.length}</span></div><div>${shorts}</div>${shortFiles.length>4?`<a class="snapshot-more" href="/espace-client/videos/">Voir les ${shortFiles.length} shorts</a>`:''}</section></div><dialog class="snapshot-preview" data-snapshot-preview><button type="button" data-preview-close aria-label="Fermer">×</button><div data-preview-body></div></dialog>`;
  section.querySelector('[data-snapshot-passage]')?.addEventListener('change',(event)=>{activeOrderId=event.target.value;renderSnapshot();});
  section.querySelectorAll('[data-snapshot-file]').forEach((button)=>button.addEventListener('click',()=>openPreview(button.dataset.snapshotFile,order)));
  section.querySelector('[data-preview-close]')?.addEventListener('click',()=>closePreview(section));
  const dialog=section.querySelector('[data-snapshot-preview]');
  dialog?.addEventListener('click',(event)=>{if(event.target===dialog)closePreview(section);});
}

function mediaTile(file,kind){
  const url=safeUrl(file.downloadUrl||file.externalUrl);
  const title=cleanName(file.name)||(kind==='hero'?'Émission complète':'Short Neptune Media');
  return `<button type="button" class="snapshot-media snapshot-media--${kind}" data-snapshot-file="${esc(file.id||file.driveFileId||title)}"><video muted playsinline preload="metadata" src="${esc(url)}" aria-hidden="true"></video><span class="snapshot-media-overlay"><i>▶</i><small>${kind==='hero'?'ÉMISSION COMPLÈTE':'SHORT / REEL'}</small><strong>${esc(title)}</strong></span></button>`;
}

function openPreview(id,order){
  const section=$('#clientContentSnapshot');
  const file=(order.files||[]).find((item)=>String(item.id||item.driveFileId||cleanName(item.name))===String(id));
  const dialog=section?.querySelector('[data-snapshot-preview]');
  const body=section?.querySelector('[data-preview-body]');
  if(!file||!dialog||!body)return;
  const url=safeUrl(file.downloadUrl||file.externalUrl);
  body.innerHTML=`<video controls autoplay playsinline preload="metadata" src="${esc(url)}"></video><div><span>${esc(category(file)==='short'?'SHORT / REEL':'ÉMISSION COMPLÈTE')}</span><h3>${esc(cleanName(file.name)||'Contenu Neptune Media')}</h3><p>${esc(file.sizeLabel||'Disponible dans votre espace client')}</p><a href="${esc(url)}" download>Télécharger</a></div>`;
  dialog.showModal();
}

function closePreview(section){
  const dialog=section?.querySelector('[data-snapshot-preview]');
  const video=dialog?.querySelector('video');
  video?.pause();
  dialog?.close();
}

function category(file){
  const type=String(file.fileType||'').toLowerCase();
  return ['short','shorts','reel','teaser'].includes(type)?'short':'long';
}
function timestamp(order){const date=new Date(order.filmingAt||order.updatedAt||order.createdAt||0);return Number.isNaN(date.getTime())?0:date.getTime();}
function cleanName(value){return String(value||'').replace(/\.[a-z0-9]{2,5}$/iu,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim();}
function safeUrl(value){const text=String(value||'');return /^(https?:\/\/|\/)/iu.test(text)?text:'#';}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
