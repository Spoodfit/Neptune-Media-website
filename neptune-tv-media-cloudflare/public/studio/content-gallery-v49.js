const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const PAGE_SIZE=8;
let adminState={orders:[]};
let currentOrderId='';
let activeFilter='all';
let activePage=1;
let observer=null;
let observedRoot=null;
let frame=0;
let refreshTimer=0;

start();

function start(){
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
}

function boot(){
  observedRoot=$('#clientDetail');
  if(!observedRoot)return;
  observer=new MutationObserver(scheduleDecoration);
  observe();
  window.addEventListener('focus',refreshState);
  $('#refresh')?.addEventListener('click',()=>setTimeout(refreshState,180));
  ensurePreviewDialog();
  refreshState();
}

function observe(){
  if(observer&&observedRoot)observer.observe(observedRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
}

function scheduleDecoration(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=0;decorate();});
}

async function refreshState(){
  clearTimeout(refreshTimer);
  try{
    adminState=await api('/api/admin/clients');
    scheduleDecoration();
  }catch(error){console.error('studio_content_gallery_failed',error);}
  refreshTimer=setTimeout(refreshState,60_000);
}

function decorate(){
  observer?.disconnect();
  try{
    const root=$('#clientDetail');
    if(!root||!root.children.length)return;
    const activeTab=$('.tabs button.active',root)?.dataset.detailTab;
    if(activeTab!=='content')return;
    const orderId=decodeURIComponent(location.hash.slice(1));
    const order=(adminState.orders||[]).find((item)=>item.id===orderId);
    if(!order)return;
    if(currentOrderId!==orderId){currentOrderId=orderId;activeFilter='all';activePage=1;}
    const detailGrid=$('#detailBody .detail-grid',root);
    const panel=$(':scope > .panel',detailGrid);
    if(!detailGrid||!panel)return;
    compactUpload(detailGrid);
    renderPanel(panel,order);
  }finally{
    observe();
  }
}

function compactUpload(detailGrid){
  const aside=$(':scope > aside',detailGrid);
  const form=$('#uploadForm',aside);
  if(!aside||!form||form.closest('.studio-upload-details'))return;
  aside.classList.add('studio-content-side');
  const details=document.createElement('details');
  details.className='studio-upload-details';
  details.innerHTML='<summary><span>AJOUT MANUEL</span><strong>Importer un contenu hors Drive</strong><i>+</i></summary>';
  form.before(details);
  details.append(form);
}

function renderPanel(panel,order){
  const files=order.files||[];
  const counts={all:files.length,long:0,short:0,rush:0,document:0};
  files.forEach((file)=>{counts[category(file)]=(counts[category(file)]||0)+1;});
  const filtered=activeFilter==='all'?files:files.filter((file)=>category(file)===activeFilter);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  activePage=Math.min(activePage,totalPages);
  const visible=filtered.slice((activePage-1)*PAGE_SIZE,activePage*PAGE_SIZE);
  const signature=[order.id,activeFilter,activePage,...files.map((file)=>`${file.id||file.driveFileId}:${file.updatedAt||file.createdAt||file.name}`)].join('|');
  if(panel.dataset.contentGallerySignature===signature)return;
  panel.dataset.contentGallerySignature=signature;
  panel.className='panel studio-content-gallery-panel';
  panel.innerHTML=`<header class="studio-content-head"><div><p class="eyebrow">CONTENUS DU PASSAGE</p><h3>Bibliothèque visuelle</h3><p>Un aperçu, huit éléments maximum et le détail au clic.</p></div><div class="studio-content-counts"><span><b>${counts.long}</b> long</span><span><b>${counts.short}</b> shorts</span><span><b>${counts.rush}</b> rushs</span></div></header><nav class="studio-content-filters" aria-label="Filtrer les contenus">${filterButton('all','Tous',counts.all)}${filterButton('long','Long format',counts.long)}${filterButton('short','Shorts',counts.short)}${filterButton('rush','Rushs',counts.rush)}${filterButton('document','Documents',counts.document)}</nav>${filtered.length?`<div class="studio-media-grid">${visible.map(mediaCard).join('')}</div>${pager(totalPages)}`:'<div class="studio-content-empty"><strong>Aucun contenu dans cette catégorie</strong><span>Les fichiers ajoutés dans Drive apparaîtront automatiquement ici.</span></div>'}`;
  $$('[data-studio-filter]',panel).forEach((button)=>button.addEventListener('click',()=>{activeFilter=button.dataset.studioFilter;activePage=1;panel.dataset.contentGallerySignature='';renderPanel(panel,order);}));
  $$('[data-studio-media]',panel).forEach((button)=>button.addEventListener('click',()=>openPreview(button.dataset.studioMedia,order)));
  $('[data-studio-prev]',panel)?.addEventListener('click',()=>{activePage=Math.max(1,activePage-1);panel.dataset.contentGallerySignature='';renderPanel(panel,order);});
  $('[data-studio-next]',panel)?.addEventListener('click',()=>{activePage=Math.min(totalPages,activePage+1);panel.dataset.contentGallerySignature='';renderPanel(panel,order);});
}

function filterButton(id,label,count){
  const active=activeFilter===id;
  return `<button type="button" class="${active?'active':''}" data-studio-filter="${id}" aria-pressed="${active}"><span>${label}</span><b>${count||0}</b></button>`;
}

function mediaCard(file){
  const kind=category(file);
  const url=safeUrl(file.downloadUrl||file.externalUrl);
  const title=cleanName(file.name)||label(kind);
  const video=['long','short','rush'].includes(kind);
  return `<article class="studio-media-card studio-media-card--${kind}"><button type="button" data-studio-media="${esc(file.id||file.driveFileId||title)}"><span class="studio-media-preview">${video?`<video muted playsinline preload="metadata" src="${esc(url)}" aria-hidden="true"></video>`:''}<i>${video?'▶':'DOC'}</i><em>${esc(label(kind))}</em></span><span class="studio-media-copy"><strong>${esc(title)}</strong><small>${esc(file.sizeLabel||relativeDate(file.createdAt))}</small></span></button></article>`;
}

function pager(totalPages){
  if(totalPages<=1)return'';
  return `<nav class="studio-content-pager" aria-label="Pagination des contenus"><button type="button" data-studio-prev ${activePage===1?'disabled':''}>←</button><span>Page ${activePage} / ${totalPages}</span><button type="button" data-studio-next ${activePage===totalPages?'disabled':''}>→</button></nav>`;
}

function ensurePreviewDialog(){
  if($('#studioMediaPreview'))return;
  const dialog=document.createElement('dialog');
  dialog.id='studioMediaPreview';
  dialog.className='studio-media-dialog';
  dialog.innerHTML='<button type="button" class="studio-media-close" aria-label="Fermer">×</button><div data-studio-preview-body></div>';
  document.body.append(dialog);
  $('.studio-media-close',dialog).addEventListener('click',()=>closePreview(dialog));
  dialog.addEventListener('click',(event)=>{if(event.target===dialog)closePreview(dialog);});
}

function openPreview(id,order){
  const file=(order.files||[]).find((item)=>String(item.id||item.driveFileId||cleanName(item.name))===String(id));
  const dialog=$('#studioMediaPreview');
  const body=$('[data-studio-preview-body]',dialog);
  if(!file||!dialog||!body)return;
  const kind=category(file);
  const url=safeUrl(file.downloadUrl||file.externalUrl);
  const video=['long','short','rush'].includes(kind);
  body.innerHTML=`<section class="studio-preview-media">${video?`<video controls autoplay playsinline preload="metadata" src="${esc(url)}"></video>`:'<div class="studio-document-preview">DOCUMENT</div>'}</section><section class="studio-preview-info"><span>${esc(label(kind))}</span><h2>${esc(cleanName(file.name)||'Contenu Neptune Media')}</h2><p>${esc(file.sizeLabel||'Fichier synchronisé avec le dossier du client')}</p><div><a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir</a><a href="${esc(url)}" download>Télécharger</a></div></section>`;
  dialog.showModal();
}

function closePreview(dialog){dialog.querySelector('video')?.pause();dialog.close();}
function category(file){const type=String(file.fileType||'').toLowerCase();if(['short','shorts','reel','teaser'].includes(type))return'short';if(['final','emission','full','master','episode','long'].includes(type))return'long';if(['rush','rushes','source','sources'].includes(type))return'rush';return'document';}
function label(kind){return({long:'Long format',short:'Short / Reel',rush:'Rushes',document:'Document'})[kind]||'Contenu';}
function cleanName(value){return String(value||'').replace(/\.[a-z0-9]{2,5}$/iu,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim();}
function safeUrl(value){const text=String(value||'');return /^(https?:\/\/|\/)/iu.test(text)?text:'#';}
function relativeDate(value){const date=new Date(value||'');if(Number.isNaN(date.getTime()))return'Fichier synchronisé';return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(date);}
async function api(url){const response=await fetch(url,{headers:{Accept:'application/json','X-CSRF-Token':sessionStorage.getItem('neptune_csrf')||''},credentials:'same-origin'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
