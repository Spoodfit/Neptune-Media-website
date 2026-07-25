const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const FINAL_TYPES=new Set(['final','emission','full','master','episode','long']);
const SHORT_TYPES=new Set(['short','shorts','reel','teaser']);
const PAGE_SIZE=8;
let orders=[];
let activeFilter='final';
let activeOrderId='';
let activePage=1;

$('#filters')?.addEventListener('click',(event)=>{
  const button=event.target.closest('[data-filter]');
  if(!button)return;
  activeFilter=button.dataset.filter==='short'?'short':'final';
  activePage=1;
  $$('[data-filter]').forEach((entry)=>{
    const active=entry===button;
    entry.classList.toggle('active',active);
    entry.setAttribute('aria-pressed',String(active));
  });
  renderLibrary();
});

load();

async function load(){
  try{
    const state=await api('/api/client/session');
    orders=(Array.isArray(state.orders)?state.orders:[])
      .map(normalizeOrder)
      .filter((order)=>order.files.some((file)=>['final','short'].includes(categoryOf(file))))
      .sort((a,b)=>timestamp(b)-timestamp(a));
    activeOrderId=orders[0]?.id||'';
    renderSummary();
    prepareLibraryShell();
    renderLibrary();
  }catch(error){
    if(['unauthorized','http_401'].includes(error.message)){location.href='/espace-client/';return;}
    $('#resultLabel').textContent='Impossible de charger votre bibliothèque.';
    $('#contentGrid').innerHTML='<div class="empty-state"><div><strong>Bibliothèque indisponible</strong>Rechargez la page ou revenez au tableau de bord.</div></div>';
  }
}

function normalizeOrder(order){
  return {...order,files:(order.files||[]).map((file)=>({...file,orderId:order.id}))};
}

function prepareLibraryShell(){
  const grid=$('#contentGrid');
  if(!grid)return;
  if(!$('#passageSelector')){
    const selector=document.createElement('nav');
    selector.id='passageSelector';
    selector.className='passage-selector';
    selector.setAttribute('aria-label','Choisir un passage');
    grid.before(selector);
  }
  if(!$('#videoPreviewDialog')){
    const dialog=document.createElement('dialog');
    dialog.id='videoPreviewDialog';
    dialog.className='video-preview-dialog';
    dialog.innerHTML='<button type="button" class="preview-close" aria-label="Fermer">×</button><div class="preview-content"></div>';
    document.body.append(dialog);
    $('.preview-close',dialog).addEventListener('click',()=>closePreview(dialog));
    dialog.addEventListener('click',(event)=>{if(event.target===dialog)closePreview(dialog);});
  }
}

function renderSummary(){
  const items=orders.flatMap((order)=>order.files).filter((file)=>['final','short'].includes(categoryOf(file)));
  $('#contentCount').textContent=items.length;
  $('#shortCount').textContent=items.filter((file)=>categoryOf(file)==='short').length;
  $('#projectCount').textContent=orders.length;
}

function renderLibrary(){
  if(!orders.length){
    $('#resultLabel').textContent='Aucun contenu disponible pour le moment';
    $('#contentGrid').innerHTML='<div class="empty-state"><div><strong>Vos vidéos apparaîtront ici</strong>Neptune les classe automatiquement par passage.</div></div>';
    $('#passageSelector').replaceChildren();
    return;
  }
  if(!orders.some((order)=>order.id===activeOrderId))activeOrderId=orders[0].id;
  renderPassageSelector();
  const order=orders.find((item)=>item.id===activeOrderId)||orders[0];
  const files=order.files.filter((file)=>categoryOf(file)===activeFilter);
  const totalPages=Math.max(1,Math.ceil(files.length/PAGE_SIZE));
  activePage=Math.min(activePage,totalPages);
  const visible=files.slice((activePage-1)*PAGE_SIZE,activePage*PAGE_SIZE);
  const label=activeFilter==='final'?'émission':'short';
  $('#resultLabel').textContent=files.length?`${files.length} ${label}${files.length>1?'s':''} · ${order.title||order.format||'Passage Neptune Media'}`:`Aucun ${label} disponible pour ce passage`;
  $('#contentGrid').dataset.view=activeFilter;
  $('#contentGrid').innerHTML=files.length?`<section class="active-passage-summary"><div><span>${esc(order.format||'NEPTUNE MEDIA')}</span><h3>${esc(order.title||'Passage Neptune Media')}</h3><p>${esc(formatDate(order.filmingAt||order.createdAt))}</p></div><div><b>${order.files.filter((file)=>categoryOf(file)==='final').length}</b><small>long</small><b>${order.files.filter((file)=>categoryOf(file)==='short').length}</b><small>shorts</small></div></section><div class="compact-media-grid compact-media-grid--${activeFilter}">${visible.map(cardMarkup).join('')}</div>${pagerMarkup(totalPages)}`:`<div class="empty-state"><div><strong>${activeFilter==='final'?'Aucune émission livrée':'Aucun short livré'}</strong>Les vidéos apparaîtront automatiquement ici après leur livraison par Neptune.</div></div>`;
  $$('[data-open-video]').forEach((button)=>button.addEventListener('click',()=>openPreview(button.dataset.openVideo,order)));
  $('[data-page-prev]')?.addEventListener('click',()=>{activePage=Math.max(1,activePage-1);renderLibrary();});
  $('[data-page-next]')?.addEventListener('click',()=>{activePage=Math.min(totalPages,activePage+1);renderLibrary();});
}

function renderPassageSelector(){
  const nav=$('#passageSelector');
  nav.innerHTML=orders.map((order,index)=>{
    const active=order.id===activeOrderId;
    const longCount=order.files.filter((file)=>categoryOf(file)==='final').length;
    const shortCount=order.files.filter((file)=>categoryOf(file)==='short').length;
    return `<button type="button" class="${active?'active':''}" data-passage-id="${esc(order.id)}" aria-pressed="${active}"><span>Passage ${String(index+1).padStart(2,'0')}</span><strong>${esc(order.title||order.format||'Neptune Media')}</strong><small>${longCount} long · ${shortCount} shorts</small></button>`;
  }).join('');
  $$('[data-passage-id]',nav).forEach((button)=>button.addEventListener('click',()=>{activeOrderId=button.dataset.passageId;activePage=1;renderLibrary();}));
}

function cardMarkup(file){
  const url=safeUrl(file.downloadUrl||file.externalUrl);
  const title=cleanName(file.name)||(activeFilter==='final'?'Émission complète':'Short Neptune Media');
  return `<article class="compact-media-card compact-media-card--${activeFilter}"><button type="button" class="compact-media-open" data-open-video="${esc(file.id||file.driveFileId||title)}"><span class="compact-media-preview"><video muted playsinline preload="metadata" src="${esc(url)}" aria-hidden="true"></video><i>▶</i><em>${activeFilter==='final'?'ÉMISSION':'SHORT'}</em></span><span class="compact-media-copy"><strong>${esc(title)}</strong><small>${esc(file.sizeLabel||formatDate(file.createdAt))}</small></span></button><div class="compact-media-actions"><a href="${esc(url)}" download>Télécharger</a>${activeFilter==='short'?'<a href="/espace-client/calendrier/">Planifier</a>':''}</div></article>`;
}

function pagerMarkup(totalPages){
  if(totalPages<=1)return'';
  return `<nav class="library-pager" aria-label="Pagination des contenus"><button type="button" data-page-prev ${activePage===1?'disabled':''}>← Précédent</button><span>Page ${activePage} sur ${totalPages}</span><button type="button" data-page-next ${activePage===totalPages?'disabled':''}>Suivant →</button></nav>`;
}

function openPreview(id,order){
  const file=order.files.find((item)=>String(item.id||item.driveFileId||cleanName(item.name))===String(id));
  const dialog=$('#videoPreviewDialog');
  const content=$('.preview-content',dialog);
  if(!file||!dialog||!content)return;
  const url=safeUrl(file.downloadUrl||file.externalUrl);
  const type=categoryOf(file)==='short'?'SHORT / REEL':'ÉMISSION COMPLÈTE';
  content.innerHTML=`<video controls autoplay playsinline preload="metadata" src="${esc(url)}"></video><section><span>${type}</span><h2>${esc(cleanName(file.name)||'Contenu Neptune Media')}</h2><p>${esc(file.sizeLabel||'Disponible dans votre espace Neptune Media')}</p><div><a href="${esc(url)}" download>Télécharger</a>${categoryOf(file)==='short'?'<a href="/espace-client/calendrier/">Planifier ce short</a>':''}</div></section>`;
  dialog.showModal();
}

function closePreview(dialog){dialog.querySelector('video')?.pause();dialog.close();}
function categoryOf(file){const type=String(file.fileType||'').toLowerCase();if(SHORT_TYPES.has(type))return'short';if(FINAL_TYPES.has(type))return'final';return/\.(mp4|webm|mov|m4v)(\?|$)/iu.test(String(file.name||file.downloadUrl||''))?'final':'other';}
function timestamp(order){const date=new Date(order.filmingAt||order.updatedAt||order.createdAt||0);return Number.isNaN(date.getTime())?0:date.getTime();}
function formatDate(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'Date à confirmer':new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(date);}
function cleanName(value){return String(value||'').replace(/\.[a-z0-9]{2,5}$/iu,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim();}
function safeUrl(value){const text=String(value||'');return /^(https?:\/\/|\/)/iu.test(text)?text:'#';}
async function api(url){const response=await fetch(url,{headers:{Accept:'application/json'},credentials:'same-origin'});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`http_${response.status}`);return payload;}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
