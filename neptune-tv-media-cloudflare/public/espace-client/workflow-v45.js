const $=(selector,root=document)=>root.querySelector(selector);
let state=null;
let timer=0;

start();

function start(){
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
}

function boot(){
  const dashboard=$('#dashboard');
  if(!dashboard)return;
  new MutationObserver(()=>{if(!dashboard.hidden)refresh();}).observe(dashboard,{attributes:true,attributeFilter:['hidden']});
  if(!dashboard.hidden)refresh();
}

async function refresh(){
  clearTimeout(timer);
  try{
    const response=await fetch('/api/client/session',{headers:{Accept:'application/json'},credentials:'same-origin'});
    if(!response.ok)return;
    state=await response.json();
    render();
  }catch{}
  timer=setTimeout(refresh,60_000);
}

function render(){
  const order=(state?.orders||[]).find((item)=>item.status!=='completed')||(state?.orders||[])[0];
  const flow=order?.workflow;
  if(!order||!flow)return;

  const card=$('.production-card');
  if(!card)return;
  let panel=$('#clientMinimalFlow');
  if(!panel){
    panel=document.createElement('section');
    panel.id='clientMinimalFlow';
    panel.className='client-minimal-flow';
    $('.production-card-header',card)?.after(panel);
  }

  const appointmentAt=validDate(order.appointmentAt)?order.appointmentAt:null;
  const filmingAt=validDate(order.filmingAt)?order.filmingAt:null;
  const requestedAt=validDate(flow.requestedFilmingAt)?flow.requestedFilmingAt:null;
  const studioConfirmed=flow.supplierStatus==='confirmed'&&filmingAt;
  const stage=macroStage(order,flow);
  const next=clientMessage(order,flow,stage);

  panel.innerHTML=`
    <div class="client-focus-row">
      <div class="client-focus-copy">
        <small>PROCHAINE ÉTAPE</small>
        <h2>${esc(next.title)}</h2>
        <p>${esc(next.detail)}</p>
      </div>
      <button type="button" class="client-focus-action" data-minimal-tracking>Voir le suivi</button>
    </div>
    <div class="client-date-row">
      <article>
        <span>Visio de préparation</span>
        <strong>${esc(appointmentAt?formatDate(appointmentAt):'À réserver')}</strong>
        <small>${esc(flow.preparationStatus==='completed'?'Réalisée':appointmentAt?'Réservée':'Aucun créneau')}</small>
      </article>
      <article>
        <span>Passage au studio</span>
        <strong>${esc(studioConfirmed?formatDate(filmingAt):requestedAt?formatDate(requestedAt):'À définir')}</strong>
        <small>${esc(studioConfirmed?'Confirmé':requestedAt?'Confirmation en cours':'Pas encore planifié')}</small>
      </article>
    </div>
    <footer class="client-progress-minimal">
      <span>Étape ${stage.index} sur 5</span>
      <div aria-hidden="true"><i style="width:${stage.progress}%"></i></div>
      <strong>${esc(stage.label)}</strong>
    </footer>`;

  setText($('#passageBadge'),stage.label);
  setText($('#appointmentBadge'),appointmentAt?`Visio · ${formatCompact(appointmentAt)}`:'Visio à réserver');
  panel.querySelector('[data-minimal-tracking]')?.addEventListener('click',()=>openTracking(order));
  renderDeliveries();
}

function renderDeliveries(){
  const orders=state?.orders||[];
  const total=orders.reduce((sum,item)=>sum+(item.files||[]).length,0);
  setText($('#videoBadge'),`${total} contenu${total>1?'s':''}`);
  const anchor=$('.overview-grid');
  if(!anchor)return;
  let section=$('#clientDriveDeliveries');
  if(!section){
    section=document.createElement('section');
    section.id='clientDriveDeliveries';
    section.className='client-drive-deliveries';
    anchor.after(section);
  }

  const passages=orders.filter((item)=>(item.files||[]).length||item.drive?.syncStatus==='ready');
  if(!passages.length){section.hidden=true;return;}
  section.hidden=false;
  section.innerHTML=`<header><div><p class="section-label">VOS LIVRAISONS</p><h2>Vos contenus, classés par passage</h2><p>Chaque ajout dans votre dossier Neptune Media apparaît automatiquement ici.</p></div><span class="drive-sync-pill"><i></i> Synchronisé</span></header><div class="client-passage-list">${passages.map((item,index)=>passageMarkup(item,index===0)).join('')}</div>`;

  const latestLong=passages.flatMap((item)=>(item.files||[]).filter((file)=>isLong(file.fileType)).map((file)=>({...file,order:item}))).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))[0];
  const preview=$('#broadcastPreview');
  if(preview&&latestLong){
    preview.innerHTML=`<a href="${esc(latestLong.downloadUrl)}"><span>▶</span><small>${esc(latestLong.name)}</small></a>`;
  }
}

function passageMarkup(order,open){
  const files=order.files||[];
  const longFiles=files.filter((file)=>isLong(file.fileType));
  const shorts=files.filter((file)=>isShort(file.fileType));
  const number=Math.max(1,Number(order.drive?.passageNumber||passageNumber(order)));
  const summary=[longFiles.length?`${longFiles.length} long format${longFiles.length>1?'s':''}`:'',shorts.length?`${shorts.length} short${shorts.length>1?'s':''}`:''].filter(Boolean).join(' · ')||'Dossier prêt';
  return `<details class="client-passage-card" ${open?'open':''}><summary><span><small>PASSAGE ${String(number).padStart(2,'0')}</small><strong>${esc(order.title||order.format||'Passage Neptune Media')}</strong></span><b>${esc(summary)}</b></summary><div class="client-passage-content">${fileGroup('Long format',longFiles,'Votre émission complète apparaîtra ici.')}${fileGroup('Shorts',shorts,'Les formats courts seront ajoutés progressivement.')}${order.drive?.passageFolderUrl?`<p class="client-drive-meta">Dernière synchronisation : ${esc(order.drive.lastScanAt?formatDate(order.drive.lastScanAt):'en attente du premier contrôle')}</p>`:''}</div></details>`;
}

function fileGroup(label,files,emptyText){
  return `<section class="client-file-group"><header><span>${esc(label)}</span><b>${files.length}</b></header>${files.length?`<div>${files.map((file)=>`<a class="client-file-row" href="${esc(file.downloadUrl)}"><span><strong>${esc(file.name)}</strong><small>${esc(file.sizeLabel||'Fichier vidéo')}</small></span><b>Télécharger</b></a>`).join('')}</div>`:`<p>${esc(emptyText)}</p>`}</section>`;
}

function passageNumber(order){
  const orders=(state?.orders||[]).slice().sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
  return orders.findIndex((item)=>item.id===order.id)+1;
}

function isShort(value){return ['short','shorts','reel','teaser'].includes(String(value||'').toLowerCase());}
function isLong(value){return ['final','emission','full','master','episode','long'].includes(String(value||'').toLowerCase());}

function openTracking(order){
  const trigger=document.querySelector('[data-open-panel="tracking"]');
  if(trigger){trigger.click();return;}
  location.hash=encodeURIComponent(order.id||'');
}

function macroStage(order,flow){
  if(flow.broadcastStatus==='published'||order.status==='completed')return{index:5,label:'Diffusion terminée',progress:100};
  if(flow.deliveredAt||order.status==='delivered')return{index:5,label:'Diffusion',progress:88};
  if(flow.editingStartedAt||['editing','approval','videos_received'].includes(order.status))return{index:4,label:'Montage',progress:68};
  if(flow.sourceReceivedAt||['filmed','videos_pending'].includes(order.status))return{index:3,label:'Fichiers studio',progress:48};
  if(flow.supplierStatus==='confirmed'||['filming_scheduled','filming_confirmed'].includes(order.status))return{index:2,label:'Passage studio',progress:28};
  return{index:1,label:'Préparation',progress:10};
}

function clientMessage(order,flow,stage){
  if(flow.supplierStatus==='pending'||flow.supplierStatus==='alternate_proposed')return{
    title:'Nous confirmons votre passage au studio',
    detail:'Votre visio est enregistrée. Neptune attend la validation du studio ; aucune action n’est requise de votre part.',
  };
  if(flow.supplierStatus==='rejected')return{
    title:'Une nouvelle date va vous être proposée',
    detail:'Le premier créneau n’est pas disponible. Neptune revient vers vous avec une alternative.',
  };
  if(stage.index===2)return{title:'Votre passage studio est confirmé',detail:'Retrouvez ci-dessous la date définitive. Les rappels pratiques seront envoyés automatiquement.'};
  if(stage.index===3)return{title:'Vos fichiers sont en cours de transfert',detail:'Le studio transmet les sources à Neptune avant le démarrage du montage.'};
  if(stage.index===4)return{title:'Votre émission est en montage',detail:'Neptune prépare l’émission complète et les contenus courts.'};
  if(stage.index===5&&flow.broadcastStatus!=='published')return{title:'Vos contenus sont disponibles',detail:'Vous pouvez consulter vos vidéos. La diffusion Neptune est en cours de programmation.'};
  if(stage.index===5)return{title:'Votre émission a été diffusée',detail:'Vos contenus et votre replay restent accessibles dans votre espace.'};
  if(order.appointmentAt)return{title:'Votre visio de préparation est réservée',detail:'Le prochain jalon est la confirmation de votre passage au studio.'};
  return{title:'Réservez votre visio de préparation',detail:'Cet échange de 30 minutes permet de préparer simplement votre intervention.'};
}

function validDate(value){return !Number.isNaN(new Date(value||'').getTime());}
function formatDate(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À définir':new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(date).replace(' à ',' · ');}
function formatCompact(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À définir':new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',timeZone:'Europe/Paris'}).format(date);}
function setText(element,value){if(element)element.textContent=value;}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
