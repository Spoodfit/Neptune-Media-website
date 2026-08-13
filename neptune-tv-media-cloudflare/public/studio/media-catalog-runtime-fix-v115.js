const RELEASE='neptune-media-catalog-runtime-fix-20260813-v115';
let remountQueued=false;

document.body.dataset.mediaCatalogRuntimeFix=RELEASE;
installStyles();

const observer=new MutationObserver(()=>{
  ensureCatalogueMounted();
  repairPreview();
});
observer.observe(document.body,{subtree:true,childList:true});

document.addEventListener('click',event=>{
  if(event.target.closest('#refresh'))setTimeout(ensureCatalogueMounted,0);
  if(event.target.closest('[data-c98-tab],[data-preview]'))setTimeout(repairPreview,0);
},true);

queueMicrotask(()=>{
  ensureCatalogueMounted();
  repairPreview();
});

function catalogueActive(){
  return decodeURIComponent(location.hash.slice(1)).trim()==='programs';
}

function ensureCatalogueMounted(){
  if(!catalogueActive()||remountQueued)return;
  const content=document.getElementById('content');
  if(!content||content.querySelector('.c98-page')||content.dataset.c98==='loading')return;
  if(!document.body.dataset.mediaCatalogManager)return;

  remountQueued=true;
  content.dataset.c98='';
  setTimeout(()=>{
    try{
      const tab=document.querySelector('#studioLegacyTabControlsV105 [data-tab="programs"]')||document.querySelector('[data-tab="programs"]');
      if(tab)tab.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    }finally{
      remountQueued=false;
    }
  },0);
}

function repairPreview(){
  const host=document.getElementById('c98Preview');
  if(!host)return;
  const frame=host.querySelector('iframe[data-catalog-preview-v109]');
  if(!frame)return;
  const currentShell=frame.closest('[data-catalog-preview-shell-v115]');
  if(currentShell){
    host.dataset.catalogPreviewOwner='v115';
    return;
  }

  const currentFullscreen=host.querySelector('[data-catalog-preview-fullscreen-v109]');
  const shell=document.createElement('div');
  shell.className='c98-preview-sticky c99-preview c115-preview-shell';
  shell.dataset.catalogPreviewShellV115='1';

  const head=document.createElement('div');
  head.className='c115-preview-head';
  const copy=document.createElement('div');
  const eyebrow=document.createElement('p');
  eyebrow.className='c98-eyebrow';
  eyebrow.textContent='APERÇU TUNNEL RÉEL';
  const title=document.createElement('h3');
  title.textContent='Ce que voit le client';
  const live=document.createElement('span');
  live.className='c98-live';
  live.textContent='RÉEL';
  copy.append(eyebrow,title);
  head.append(copy,live);

  const note=document.createElement('p');
  note.className='c115-preview-note';
  note.textContent='Aperçu interactif du tunnel réellement publié. Les actions de prévisualisation restent isolées de la session d’un client.';

  const device=document.createElement('div');
  device.className='c115-preview-device';
  device.append(frame);

  const actions=document.createElement('div');
  actions.className='c99-preview-actions c115-preview-actions';
  const reload=document.createElement('button');
  reload.type='button';
  reload.className='c98-button c98-button--ghost';
  reload.dataset.catalogPreviewReloadV109='1';
  reload.textContent='Recharger';
  const fullscreen=document.createElement('a');
  fullscreen.className='c98-button';
  fullscreen.dataset.catalogPreviewFullscreenV109='1';
  fullscreen.target='_blank';
  fullscreen.rel='noopener';
  fullscreen.href=currentFullscreen?.href||frame.src||'/reserver?catalog_preview=studio';
  fullscreen.textContent='Plein écran ↗';
  actions.append(reload,fullscreen);

  shell.append(head,note,device,actions);
  host.replaceChildren(shell);
  host.dataset.c99='1';
  host.dataset.catalogPreviewOwner='v115';
}

function installStyles(){
  if(document.getElementById('mediaCatalogRuntimeFixV115Style'))return;
  const style=document.createElement('style');
  style.id='mediaCatalogRuntimeFixV115Style';
  style.textContent=`
    #c98Preview[data-catalog-preview-owner="v115"]{min-width:0}
    .c115-preview-shell{gap:14px!important;padding:18px!important;overflow:hidden}
    .c115-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
    .c115-preview-head .c98-eyebrow{margin:0 0 6px!important}
    .c115-preview-head h3{margin:0;color:#101828;font-size:1.05rem;line-height:1.18;letter-spacing:-.025em}
    .c115-preview-note{margin:0;color:#667085;font-size:.68rem;line-height:1.5}
    .c115-preview-device{width:100%;height:clamp(620px,72vh,820px);overflow:hidden;border:1px solid #d6dbe5;border-radius:16px;background:#071229;box-shadow:0 12px 30px rgba(16,24,40,.1)}
    .c115-preview-device iframe{display:block;width:100%!important;height:100%!important;min-width:0!important;border:0!important;background:#fff}
    .c115-preview-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:9px!important}
    .c115-preview-actions>*{width:100%!important;min-height:44px!important}
    @media(min-width:1480px){.c98-layout{grid-template-columns:minmax(0,1fr) minmax(500px,.82fr)!important}}
    @media(max-width:980px){.c115-preview-device{height:min(720px,74vh)}.c115-preview-actions{grid-template-columns:1fr!important}}
  `;
  document.head.append(style);
}
