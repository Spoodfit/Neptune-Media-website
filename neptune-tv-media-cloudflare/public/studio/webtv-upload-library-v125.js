const RELEASE='neptune-webtv-upload-library-20260819-v125';
if(location.pathname.includes('/studio/webtv'))boot();

async function boot(){
  document.documentElement.dataset.webtvUploadLibraryV125=RELEASE;
  const ready=await waitFor(()=>window.NeptuneWebTvProgram,6000);if(!ready)return;
  const program=window.NeptuneWebTvProgram;
  const originalToast=typeof program.toast==='function'?program.toast.bind(program):null;
  program.addImportedMedia=item=>{
    window.dispatchEvent(new CustomEvent('neptune:webtv-library-changed',{detail:{item}}));
    return Boolean(item?.mediaUrl);
  };
  if(originalToast)program.toast=(message,error=false)=>originalToast(rewrite(String(message||'')),error);
  patchUploadDialog();
  new MutationObserver(patchUploadDialog).observe(document.body,{subtree:true,childList:true,characterData:true});
}

function patchUploadDialog(){
  const dialog=document.getElementById('webtvUploadDialog');if(!dialog)return;
  const start=dialog.querySelector('[data-upload-start]');if(start&&!start.disabled&&!/Import en cours|Vérification/iu.test(start.textContent||''))start.textContent='Importer dans la bibliothèque';
  const titleLabel=dialog.querySelector('[data-upload-title]')?.closest('label')?.querySelector('span');if(titleLabel)titleLabel.textContent='Titre dans la bibliothèque';
  const header=dialog.querySelector('header p:last-child');if(header)header.textContent='Ajoutez une vidéo à la bibliothèque Cloudflare. Elle ne sera diffusée que lorsque vous l’ajouterez au programme.';
  const status=dialog.querySelector('[data-upload-status]');if(status)status.textContent=rewrite(status.textContent||'');
  const detail=dialog.querySelector('[data-upload-detail]');if(detail)detail.textContent=rewrite(detail.textContent||'');
}
function rewrite(value){return value.replace(/Ajoutée au programme\. Cliquez ensuite sur « Appliquer à l’antenne »\./giu,'Disponible dans la bibliothèque.').replace(/Émission importée et ajoutée au programme\. Appliquez les changements à l’antenne\./giu,'Vidéo importée dans la bibliothèque Cloudflare.').replace(/ajoutée au programme/giu,'ajoutée à la bibliothèque');}
function waitFor(predicate,timeout){return new Promise(resolve=>{const start=Date.now();const tick=()=>{try{if(predicate())return resolve(true);}catch{}if(Date.now()-start>=timeout)return resolve(false);setTimeout(tick,50);};tick();});}
