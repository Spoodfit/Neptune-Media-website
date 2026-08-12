const RELEASE='neptune-media-catalog-preview-sync-20260813-v109';
let selectedFamilyKey='';
let syncQueued=false;

document.body.dataset.mediaCatalogPreviewSync=RELEASE;
document.addEventListener('click',event=>{
  const preview=event.target.closest('[data-preview]');
  if(preview?.dataset.preview)selectedFamilyKey=preview.dataset.preview;
  if(preview||event.target.closest('[data-c98-tab]'))scheduleSync(80);
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
  const frame=document.querySelector('#c98Preview iframe');
  if(!frame)return;
  const familySelect=document.querySelector('[data-c99-family]');
  if(familySelect?.value)selectedFamilyKey=familySelect.value;
  const active=document.querySelector('[data-c98-tab].is-active')?.dataset.c98Tab||'formats';
  const params=new URLSearchParams({catalog_preview:'studio',catalog_view:active==='configurations'?'configuration':'format'});
  if(selectedFamilyKey)params.set('catalog_family',selectedFamilyKey);
  const next=`/reserver?${params}`;
  const current=new URL(frame.src,location.href);
  const target=new URL(next,location.href);
  if(current.pathname===target.pathname&&current.search===target.search)return;
  frame.src=next;
}
