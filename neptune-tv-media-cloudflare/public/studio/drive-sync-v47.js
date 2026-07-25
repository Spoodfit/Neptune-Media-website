const $=(selector,root=document)=>root.querySelector(selector);
let driveAdminState=null;
let refreshTimer=0;

bootDriveStudio();

function bootDriveStudio(){
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',startDriveStudio,{once:true}):startDriveStudio();
}

function startDriveStudio(){
  const root=$('.clients-main');
  if(!root)return;
  new MutationObserver(decorateDriveUi).observe(root,{childList:true,subtree:true});
  window.addEventListener('focus',refreshDriveState);
  $('#refresh')?.addEventListener('click',()=>setTimeout(refreshDriveState,180));
  refreshDriveState();
}

async function refreshDriveState(){
  clearTimeout(refreshTimer);
  try{
    driveAdminState=await api('/api/admin/clients');
    decorateDriveUi();
  }catch(error){console.error('studio_drive_state_failed',error);}
  refreshTimer=setTimeout(refreshDriveState,60_000);
}

function decorateDriveUi(){
  if(!driveAdminState)return;
  document.querySelectorAll('[data-order-card]').forEach((card)=>decorateCard(card));
  decorateDrawer();
}

function decorateCard(card){
  const order=orderById(card.dataset.orderCard);
  if(!order)return;
  let summary=$('.studio-drive-summary',card);
  if(!summary){
    summary=document.createElement('div');
    summary.className='studio-drive-summary';
    const button=$('.workflow-open-button',card)||$('button',card);
    button?.before(summary);
  }
  const drive=order.drive||{};
  const ready=drive.syncStatus==='ready';
  const content=Number(drive.totalCount||0);
  summary.classList.toggle('is-ready',ready);
  summary.classList.toggle('has-content',content>0);
  summary.innerHTML=`<small>Drive client</small><strong>${esc(content?`${drive.longCount||0} long · ${drive.shortCount||0} shorts`:ready?'Dossier prêt':'Création en attente')}</strong><span>${esc(drive.lastScanAt?`Synchronisé ${relativeDate(drive.lastScanAt)}`:'Automatique')}</span>`;
}

function decorateDrawer(){
  const root=$('#clientDetail');
  if(!root||!root.children.length)return;
  const orderId=decodeURIComponent(location.hash.slice(1));
  const order=orderById(orderId);
  if(!order)return;
  const command=$('#workflowCommandCenter',root);
  if(!command)return;
  let panel=$('#studioDrivePanel',command);
  if(!panel){
    panel=document.createElement('section');
    panel.id='studioDrivePanel';
    panel.className='studio-drive-panel';
    const actions=$('.workflow-actions',command);
    actions?.before(panel);
  }
  const drive=order.drive||{};
  const ready=drive.syncStatus==='ready';
  panel.innerHTML=`<header><div><small>SYNCHRONISATION DRIVE</small><strong>${esc(ready?'Dossier du passage connecté':'Création automatique en attente')}</strong></div><span class="${ready?'is-ok':'is-pending'}"><i></i>${ready?'Actif':'En attente'}</span></header><div class="studio-drive-stats"><article><small>Long format</small><strong>${Number(drive.longCount||0)}</strong></article><article><small>Shorts</small><strong>${Number(drive.shortCount||0)}</strong></article><article><small>Dernier contrôle</small><strong>${esc(drive.lastScanAt?relativeDate(drive.lastScanAt):'À venir')}</strong></article></div><footer>${drive.passageFolderUrl?`<a href="${esc(drive.passageFolderUrl)}" target="_blank" rel="noopener">Ouvrir le dossier Drive</a>`:'<span>Le dossier sera créé lors du prochain cycle Apps Script.</span>'}<small>Contrôle automatique toutes les 5 minutes</small></footer>`;
}

function orderById(id){return (driveAdminState?.orders||[]).find((item)=>item.id===id);}
function relativeDate(value){const date=new Date(value||'');if(Number.isNaN(date.getTime()))return'À venir';const minutes=Math.max(0,Math.round((Date.now()-date.getTime())/60000));if(minutes<1)return'à l’instant';if(minutes<60)return`il y a ${minutes} min`;const hours=Math.round(minutes/60);if(hours<24)return`il y a ${hours} h`;return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'Europe/Paris'}).format(date);}
async function api(url){const response=await fetch(url,{headers:{Accept:'application/json','X-CSRF-Token':sessionStorage.getItem('neptune_csrf')||''},credentials:'same-origin'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
