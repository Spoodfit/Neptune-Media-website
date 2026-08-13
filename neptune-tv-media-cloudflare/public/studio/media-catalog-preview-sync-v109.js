const RELEASE='neptune-media-catalog-preview-sync-20260813-v109';
let selectedFamilyKey='';
let syncQueued=false;

document.body.dataset.mediaCatalogPreviewSync=RELEASE;
document.addEventListener('click',event=>{
  const preview=event.target.closest('[data-preview]');
  if(preview?.dataset.preview)selectedFamilyKey=preview.dataset.preview;
  if(preview||event.target.closest('[data-c98-tab]'))scheduleSync(80);
  if(event.target.closest('[data-catalog-preview-reload-v109]'))reloadPreview();
},true);
document.addEventListener('change',event=>{
  const family=event.target.closest('[data-c99-family]');
  if(!family)return;
  selectedFamilyKey=family.value||'';
  scheduleSync(0);
},true);
new MutationObserver(()=>scheduleSync(0)).observe(document.body,{subtree:true,childList:true});
scheduleSync(0);

function scheduleSync(delay=0){
  if(syncQueued)return;
  syncQueued=true;
  setTimeout(()=>{syncQueued=false;syncPreview();},delay);
}

function syncPreview(){
  const frame=ensurePreview();
  if(!frame)return;
  const familySelect=document.querySelector('[data-c99-family]');
  if(familySelect?.value)selectedFamilyKey=familySelect.value;
  const next=previewUrl();
  updateFullscreen(next);
  const current=new URL(frame.src||'about:blank',location.href);
  const target=new URL(next,location.href);
  if(current.pathname===target.pathname&&current.search===target.search)return;
  frame.src=next;
}

function ensurePreview(){
  const preview=document.getElementById('c98Preview');
  if(!preview)return null;
  let frame=preview.querySelector('iframe[data-catalog-preview-v109]');
  if(frame)return frame;

  preview.dataset.c99='1';
  preview.dataset.catalogPreviewOwner='v109';
  preview.replaceChildren();

  const head=document.createElement('div');
  head.className='c99-preview-head';
  const copy=document.createElement('div');
  const eyebrow=document.createElement('small');
  eyebrow.textContent='APERÇU TUNNEL RÉEL';
  const title=document.createElement('strong');
  title.textContent='Ce que voit le client';
  copy.append(eyebrow,title);

  const actions=document.createElement('div');
  actions.className='c99-preview-actions';
  const reload=document.createElement('button');
  reload.type='button';
  reload.className='c98-button';
  reload.dataset.catalogPreviewReloadV109='1';
  reload.textContent='Recharger';
  const fullscreen=document.createElement('a');
  fullscreen.className='c98-button';
  fullscreen.dataset.catalogPreviewFullscreenV109='1';
  fullscreen.target='_blank';
  fullscreen.rel='noopener';
  fullscreen.textContent='Plein écran ↗';
  actions.append(reload,fullscreen);
  head.append(copy,actions);

  frame=document.createElement('iframe');
  frame.dataset.catalogPreviewV109='1';
  frame.dataset.c99LivePreview='v109';
  frame.title='Aperçu réel du tunnel Neptune Media';
  frame.loading='eager';
  frame.referrerPolicy='same-origin';

  preview.append(head,frame);
  return frame;
}

function previewUrl(){
  const active=document.querySelector('[data-c98-tab].is-active')?.dataset.c98Tab||'formats';
  const params=new URLSearchParams({catalog_preview:'studio',catalog_view:active==='configurations'?'configuration':'format'});
  if(selectedFamilyKey)params.set('catalog_family',selectedFamilyKey);
  return `/reserver?${params}`;
}

function updateFullscreen(url){
  const link=document.querySelector('[data-catalog-preview-fullscreen-v109]');
  if(link)link.href=url;
}

function reloadPreview(){
  const frame=ensurePreview();
  if(!frame)return;
  const url=new URL(previewUrl(),location.href);
  url.searchParams.set('_preview',String(Date.now()));
  frame.src=`${url.pathname}${url.search}`;
  updateFullscreen(`${url.pathname}${url.search}`);
}
