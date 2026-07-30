const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const ACTIVE_STATUSES=new Set(['uploading','queued','processing','exporting']);
const REVIEW_STATUSES=new Set(['review_ready','approved']);
const STATUS_LABELS={uploading:'Import en cours',queued:'En attente',processing:'Traitement IA',review_ready:'À valider',approved:'Validé',exporting:'Envoi Drive',delivered:'Livré',failed:'Échec',cancelled:'Annulé'};
const STAGE_LABELS={upload:'Import du fichier',queued:'Mise en file',starting:'Démarrage du moteur vidéo',download:'Téléchargement sécurisé',transcription:'Transcription intégrale',visual_analysis:'Analyse visuelle',selection:'Sélection TOFU / MOFU / BOFU',rendering:'Montage vertical et sous-titres',review:'Validation interne',approved:'Prêt pour Drive',drive_export:'Envoi dans Google Drive',delivered:'Livré au client',dispatch:'Démarrage impossible'};
const SCORE_LABELS={hook:'Accroche',autonomy:'Autonomie',value:'Valeur',retention:'Rétention',emotion:'Émotion',originality:'Originalité',marketing:'Marketing',technical:'Technique'};

let csrfToken=sessionStorage.getItem('neptune_csrf')||'';
let state={orders:[],jobs:[],policy:{minimumScore:60},viewer:null};
let selectedFile=null;
let currentJob=null;
let currentClips=[];
let jobFilter='all';
let funnelFilter='all';
let pollTimer=0;
let uploadInProgress=false;

bindStaticEvents();
initialize();

async function initialize(){
  try{
    const auth=await api('/api/auth/status',{},false);
    csrfToken=auth.csrfToken||csrfToken;
    if(csrfToken)sessionStorage.setItem('neptune_csrf',csrfToken);
    await loadBootstrap();
    const requested=new URL(location.href).searchParams.get('job');
    if(requested)await openJob(requested);
  }catch(error){
    if(['unauthorized','http_401'].includes(error.message)){location.href='/studio/';return;}
    runtimeError(errorText(error.message));
  }
}

function bindStaticEvents(){
  $('#refreshButton').addEventListener('click',async()=>{await loadBootstrap();if(currentJob)await openJob(currentJob.id,{preserveScroll:true});});
  $('#videoInput').addEventListener('change',(event)=>selectFile(event.target.files?.[0]||null));
  $('#dropZone').addEventListener('keydown',(event)=>{if(['Enter',' '].includes(event.key)){event.preventDefault();$('#videoInput').click();}});
  for(const type of ['dragenter','dragover'])$('#dropZone').addEventListener(type,(event)=>{event.preventDefault();$('#dropZone').classList.add('dragging');});
  for(const type of ['dragleave','drop'])$('#dropZone').addEventListener(type,(event)=>{event.preventDefault();$('#dropZone').classList.remove('dragging');});
  $('#dropZone').addEventListener('drop',(event)=>selectFile(event.dataTransfer?.files?.[0]||null));
  $('#uploadForm').addEventListener('submit',startUpload);
  $('#backToJobs').addEventListener('click',()=>{stopPolling();currentJob=null;currentClips=[];$('#reviewWorkspace').hidden=true;history.replaceState({},'',location.pathname);window.scrollTo({top:0,behavior:'smooth'});});
  $('#approveAll').addEventListener('click',approveVisibleClips);
  $('#exportApproved').addEventListener('click',exportApprovedClips);
  $$('[data-job-filter]').forEach(button=>button.addEventListener('click',()=>{jobFilter=button.dataset.jobFilter;$$('[data-job-filter]').forEach(item=>item.classList.toggle('active',item===button));renderJobs();}));
  $$('[data-funnel]').forEach(button=>button.addEventListener('click',()=>{funnelFilter=button.dataset.funnel;$$('[data-funnel]').forEach(item=>item.classList.toggle('active',item===button));renderClips();}));
  $('#jobsList').addEventListener('click',(event)=>{const card=event.target.closest('[data-job-id]');if(card)openJob(card.dataset.jobId);});
  $('#clipsGrid').addEventListener('click',handleClipAction);
  $('#clipsGrid').addEventListener('change',handleClipChange);
}

async function loadBootstrap(){
  $('#runtimeState').classList.remove('error');
  $('#runtimeState').innerHTML='<i></i> Synchronisation…';
  const result=await api('/api/admin/video-ai/bootstrap');
  state=result;
  renderOrderOptions();
  renderJobs();
  renderMetrics();
  $('#runtimeState').innerHTML='<i></i> Studio opérationnel';
}

function renderOrderOptions(){
  const select=$('#orderSelect');
  const current=select.value;
  select.innerHTML='<option value="">Choisir le client et le passage</option>'+state.orders.map(order=>`<option value="${esc(order.id)}">${esc(order.company||order.fullName||order.email)} · ${esc(order.title||order.format||'Passage Neptune Media')}</option>`).join('');
  if(state.orders.some(order=>order.id===current))select.value=current;
}

function renderMetrics(){
  $('#activeJobsCount').textContent=state.jobs.filter(job=>ACTIVE_STATUSES.has(job.status)).length;
  $('#reviewJobsCount').textContent=state.jobs.filter(job=>REVIEW_STATUSES.has(job.status)).length;
  $('#readyClipsCount').textContent=state.jobs.reduce((sum,job)=>sum+Number(job.clipCount||0),0);
}

function renderJobs(){
  const jobs=state.jobs.filter(job=>jobFilter==='all'||(jobFilter==='active'&&ACTIVE_STATUSES.has(job.status))||(jobFilter==='review'&&REVIEW_STATUSES.has(job.status)));
  $('#jobsList').innerHTML=jobs.length?jobs.map(jobCard).join(''):'<p class="empty-state">Aucune vidéo dans cette vue.</p>';
}

function jobCard(job){
  const progress=Number(job.progress||0);
  return `<article class="job-card" data-job-id="${esc(job.id)}">
    <div class="job-card-main"><div class="job-card-top"><span class="status-pill ${esc(job.status)}">${esc(STATUS_LABELS[job.status]||job.status)}</span></div><h3>${esc(job.sourceName)}</h3><p>${esc(job.company||job.clientName||'Client Neptune Media')} · ${esc(job.orderTitle||'Passage')}</p><div class="job-card-meta"><span>${formatDate(job.createdAt)}</span><span>${formatDuration(job.durationSeconds)}</span>${job.errorCode?`<span>${esc(errorText(job.errorCode))}</span>`:''}</div></div>
    <div class="job-card-count"><b>${Number(job.clipCount||0)}</b><span>SHORTS</span></div>
    ${ACTIVE_STATUSES.has(job.status)?`<progress class="mini-progress" max="100" value="${progress}"></progress>`:''}
  </article>`;
}

function selectFile(file){
  if(!file){selectedFile=null;$('#selectedFile').hidden=true;$('#startUpload').disabled=true;return;}
  if(!String(file.type||'').startsWith('video/')){toast('Sélectionnez un fichier vidéo MP4, MOV, WEBM ou M4V.',true);return;}
  if(file.size>80*1024*1024*1024){toast('Le fichier dépasse la limite de 80 Go.',true);return;}
  selectedFile=file;
  $('#selectedFile').hidden=false;
  $('#selectedFile').innerHTML=`<strong>${esc(file.name)}</strong><span>${formatBytes(file.size)} · ${esc(file.type||'vidéo')}</span>`;
  $('#startUpload').disabled=uploadInProgress||!$('#orderSelect').value;
}

$('#orderSelect').addEventListener('change',()=>{$('#startUpload').disabled=uploadInProgress||!selectedFile||!$('#orderSelect').value;});

async function startUpload(event){
  event.preventDefault();
  if(uploadInProgress||!selectedFile||!$('#orderSelect').value)return;
  uploadInProgress=true;
  $('#startUpload').disabled=true;
  $('#uploadProgress').hidden=false;
  setUploadProgress(1,'Calcul de l’empreinte du fichier…');
  setFormMessage('');
  let uploadState=null;
  try{
    const fingerprint=await fileFingerprint(selectedFile);
    const objective=buildObjective();
    setUploadProgress(3,'Création du dossier de production…');
    const initialized=await api('/api/admin/video-ai/upload/init',{method:'POST',body:JSON.stringify({
      orderId:$('#orderSelect').value,
      sourceName:selectedFile.name,
      sourceFingerprint:fingerprint,
      mimeType:selectedFile.type||'video/mp4',
      sizeBytes:selectedFile.size,
      objective,
    })});
    uploadState=initialized;
    if(initialized.deduplicated&&initialized.job?.status!=='uploading'){
      toast('Cette version de la vidéo existe déjà. Ouverture du traitement existant.');
      await loadBootstrap();
      await openJob(initialized.job.id);
      return;
    }
    const {job,partSize}=initialized;
    if(!job?.id||!job?.uploadId||!job?.sourceKey)throw new Error('invalid_upload_session');
    const parts=await multipartUpload(selectedFile,job,Number(partSize||16*1024*1024));
    setUploadProgress(97,'Finalisation de l’import…');
    await api('/api/admin/video-ai/upload/complete',{method:'POST',body:JSON.stringify({jobId:job.id,key:job.sourceKey,uploadId:job.uploadId,parts})});
    setUploadProgress(100,'Vidéo importée. Analyse lancée en arrière-plan.');
    setFormMessage('La vidéo est sécurisée dans Neptune. La transcription et le montage sont en cours.','success');
    selectedFile=null;
    $('#videoInput').value='';
    $('#selectedFile').hidden=true;
    await loadBootstrap();
    await openJob(job.id);
  }catch(error){
    if(uploadState?.job?.id&&uploadState?.job?.uploadId){
      await api('/api/admin/video-ai/upload/abort',{method:'POST',body:JSON.stringify({jobId:uploadState.job.id,key:uploadState.job.sourceKey,uploadId:uploadState.job.uploadId})}).catch(()=>{});
    }
    setFormMessage(errorText(error.message),'error');
    toast(errorText(error.message),true);
  }finally{
    uploadInProgress=false;
    $('#startUpload').disabled=!selectedFile||!$('#orderSelect').value;
  }
}

async function multipartUpload(file,job,partSize){
  const count=Math.ceil(file.size/partSize);
  const parts=new Array(count);
  let cursor=0;
  let uploadedBytes=0;
  const workers=Math.min(3,count);
  const uploadWorker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=count)return;
      const start=index*partSize;
      const blob=file.slice(start,Math.min(file.size,start+partSize));
      const query=new URLSearchParams({jobId:job.id,key:job.sourceKey,uploadId:job.uploadId,partNumber:String(index+1)});
      const response=await fetch(`/api/admin/video-ai/upload/part?${query}`,{method:'PUT',body:blob,headers:{Accept:'application/json','Content-Type':'application/octet-stream','X-CSRF-Token':csrfToken},credentials:'same-origin'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||`http_${response.status}`);
      parts[index]={partNumber:Number(result.partNumber),etag:result.etag};
      uploadedBytes+=blob.size;
      const percent=Math.min(96,4+Math.round((uploadedBytes/file.size)*91));
      setUploadProgress(percent,`Import sécurisé · partie ${index+1}/${count}`);
    }
  };
  await Promise.all(Array.from({length:workers},uploadWorker));
  return parts.sort((a,b)=>a.partNumber-b.partNumber);
}

function buildObjective(){
  const preset=$('#objectivePreset').value;
  const directives={balanced:'Répartition équilibrée des opportunités TOFU, MOFU et BOFU selon la matière réelle.',awareness:'Prioriser les passages TOFU capables de créer portée, surprise, identification et commentaires.',expertise:'Prioriser les passages MOFU démontrant expertise, méthode, pédagogie et réponses aux objections.',conversion:'Prioriser les passages BOFU apportant preuve, différenciation, bénéfice et réduction du risque de décision.'};
  return [directives[preset],$('#objectiveText').value.trim()].filter(Boolean).join(' ');
}

async function fileFingerprint(file){
  const sampleSize=Math.min(file.size,1024*1024);
  const first=await file.slice(0,sampleSize).arrayBuffer();
  const last=file.size>sampleSize?await file.slice(Math.max(0,file.size-sampleSize),file.size).arrayBuffer():new ArrayBuffer(0);
  const metadata=new TextEncoder().encode(`${file.name}|${file.size}|${file.lastModified}|${file.type}`);
  const bytes=new Uint8Array(metadata.byteLength+first.byteLength+last.byteLength);
  bytes.set(metadata,0);bytes.set(new Uint8Array(first),metadata.byteLength);bytes.set(new Uint8Array(last),metadata.byteLength+first.byteLength);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function openJob(jobId,options={}){
  stopPolling();
  const result=await api(`/api/admin/video-ai/jobs/${encodeURIComponent(jobId)}`);
  currentJob=result.job;
  currentClips=result.clips||[];
  history.replaceState({},'',`${location.pathname}?job=${encodeURIComponent(jobId)}`);
  renderReview();
  if(!options.preserveScroll)$('#reviewWorkspace').scrollIntoView({behavior:'smooth',block:'start'});
  if(ACTIVE_STATUSES.has(currentJob.status))startPolling();
}

function renderReview(){
  if(!currentJob)return;
  $('#reviewWorkspace').hidden=false;
  $('#reviewTitle').textContent=currentJob.sourceName||'Shorts générés';
  $('#reviewSubtitle').textContent=`${currentJob.company||currentJob.clientName||'Client Neptune Media'} · ${currentJob.orderTitle||'Passage'} · ${currentClips.length} contenu(s) retenu(s)`;
  const active=ACTIVE_STATUSES.has(currentJob.status);
  $('#jobProgressPanel').hidden=!active&&!currentJob.errorCode;
  $('#jobProgressBar').value=Number(currentJob.progress||0);
  $('#jobProgressText').textContent=`${Number(currentJob.progress||0)} %`;
  $('#jobStageText').textContent=STAGE_LABELS[currentJob.stage]||STATUS_LABELS[currentJob.status]||currentJob.stage;
  $('#jobProgressHint').textContent=currentJob.errorCode?errorText(currentJob.errorCode):active?'Le traitement continue en arrière-plan. Vous pouvez quitter cet écran sans l’interrompre.':'';
  const counts={TOFU:0,MOFU:0,BOFU:0};for(const clip of currentClips)counts[clip.funnel]=(counts[clip.funnel]||0)+1;
  $('#allCount').textContent=currentClips.length;$('#tofuCount').textContent=counts.TOFU||0;$('#mofuCount').textContent=counts.MOFU||0;$('#bofuCount').textContent=counts.BOFU||0;
  $('#approveAll').disabled=!currentClips.some(clip=>clip.status==='generated');
  $('#exportApproved').disabled=!currentClips.some(clip=>clip.status==='approved');
  renderClips();
}

function renderClips(){
  if(!currentJob)return;
  const clips=currentClips.filter(clip=>funnelFilter==='all'||clip.funnel===funnelFilter);
  if(!clips.length){
    $('#clipsGrid').innerHTML=ACTIVE_STATUSES.has(currentJob.status)?'<p class="empty-state">Neptune transcrit, analyse et monte les meilleurs passages. Les contenus apparaîtront ici après le rendu.</p>':'<p class="empty-state">Aucun contenu dans cette catégorie.</p>';
    return;
  }
  $('#clipsGrid').innerHTML=clips.map(clipCard).join('');
}

function clipCard(clip){
  const proposals=Array.isArray(clip.editorialProposals)?clip.editorialProposals:[];
  const selected=proposals.find(item=>item.id===clip.selectedProposalId)||proposals[0]||{};
  const mediaUrl=`/api/admin/video-ai/jobs/${encodeURIComponent(currentJob.id)}/clips/${encodeURIComponent(clip.id)}/media?v=${encodeURIComponent(clip.updatedAt||'1')}`;
  return `<article class="clip-card ${esc(clip.status)}" data-clip-id="${esc(clip.id)}">
    <div class="clip-preview"><video controls preload="metadata" playsinline src="${mediaUrl}"></video><div class="clip-score"><b>${Number(clip.score||0)}</b><span>/100</span></div><span class="funnel-pill ${esc(clip.funnel)}">${esc(clip.funnel)}</span></div>
    <div class="clip-body"><div class="clip-head"><h3>${esc(clip.title)}</h3><small>${formatTimecode(clip.startSeconds)} → ${formatTimecode(clip.endSeconds)}</small></div><p class="clip-rationale">${esc(clip.rationale||'Passage retenu pour sa cohérence et son potentiel éditorial.')}</p>
      <div class="score-breakdown">${Object.entries(clip.scoreBreakdown||{}).map(([key,value])=>`<div><b>${Number(value||0)}</b><span>${esc(SCORE_LABELS[key]||key)}</span></div>`).join('')}</div>
      <div class="clip-editor"><input data-field="title" value="${esc(clip.title)}" aria-label="Titre interne"><select data-field="funnel" aria-label="Niveau de tunnel">${['TOFU','MOFU','BOFU'].map(value=>`<option value="${value}" ${clip.funnel===value?'selected':''}>${value}</option>`).join('')}</select><select data-field="captionPreset" aria-label="Style de sous-titres">${[['neptune-contrast','Contraste maximum'],['neptune-light','Clair sur fond sombre'],['neptune-boxed','Bloc haute lisibilité'],['neptune-premium','Premium minimal']].map(([value,label])=>`<option value="${value}" ${clip.captionPreset===value?'selected':''}>${label}</option>`).join('')}</select></div>
      <div class="proposal-tabs">${proposals.map(proposal=>`<button class="${proposal.id===selected.id?'active':''}" data-select-proposal="${esc(proposal.id)}" type="button">${esc(proposal.label||proposal.id)}</button>`).join('')}</div>
      ${proposalPanel(selected)}
      <div class="clip-actions"><button data-save-clip type="button">Enregistrer</button>${clip.status!=='approved'&&clip.status!=='delivered'?'<button class="approve" data-approve-clip type="button">Valider</button>':''}${clip.status!=='rejected'&&clip.status!=='delivered'?'<button class="reject" data-reject-clip type="button">Refuser</button>':''}${clip.status==='approved'?'<button class="export" data-export-clip type="button">Envoyer dans Drive</button>':''}${clip.status==='delivered'?`<a class="export" href="${esc(clip.driveWebViewUrl||'#')}" target="_blank" rel="noopener">Voir dans Drive</a>`:''}</div>
    </div>
  </article>`;
}

function proposalPanel(proposal){
  if(!proposal?.id)return '<div class="proposal-panel"><p>Propositions éditoriales indisponibles.</p></div>';
  return `<div class="proposal-panel" data-proposal-panel data-proposal-id="${esc(proposal.id)}"><strong>${esc(proposal.hook)}</strong><p>${esc(proposal.description)}</p><p class="cta">${esc(proposal.cta)}</p><small>${esc((proposal.hashtags||[]).join(' '))}</small><div class="proposal-actions"><button data-copy-proposal type="button">Copier le post</button><button data-use-proposal type="button">Sélectionner cette proposition</button></div></div>`;
}

async function handleClipAction(event){
  const card=event.target.closest('[data-clip-id]');if(!card)return;
  const clip=currentClips.find(item=>item.id===card.dataset.clipId);if(!clip)return;
  const proposalButton=event.target.closest('[data-select-proposal]');
  if(proposalButton){clip.selectedProposalId=proposalButton.dataset.selectProposal;renderClips();return;}
  if(event.target.closest('[data-copy-proposal]')){const proposal=selectedProposal(clip);await copyText(proposal?.fullPost||buildPost(proposal));return;}
  if(event.target.closest('[data-use-proposal]')){await clipAction(clip,'select-proposal',{selectedProposalId:clip.selectedProposalId});toast('Proposition éditoriale sélectionnée.');return;}
  if(event.target.closest('[data-save-clip]')){await saveClipEditor(card,clip);return;}
  if(event.target.closest('[data-approve-clip]')){await clipAction(clip,'approve');toast('Contenu validé. Il peut maintenant être envoyé dans Drive.');return;}
  if(event.target.closest('[data-reject-clip]')){await clipAction(clip,'reject');toast('Contenu refusé. Il ne sera pas envoyé au client.');return;}
  if(event.target.closest('[data-export-clip]')){await exportClip(clip);return;}
}

function handleClipChange(event){
  const card=event.target.closest('[data-clip-id]');if(!card)return;
  if(event.target.matches('[data-field="funnel"]'))card.querySelector('.funnel-pill').textContent=event.target.value;
}

async function saveClipEditor(card,clip){
  const title=card.querySelector('[data-field="title"]').value.trim();
  const funnel=card.querySelector('[data-field="funnel"]').value;
  const captionPreset=card.querySelector('[data-field="captionPreset"]').value;
  await clipAction(clip,'update',{title,funnel,captionPreset,editorialProposals:clip.editorialProposals});
  toast('Réglages du short enregistrés.');
}

async function clipAction(clip,action,extra={}){
  const result=await api(`/api/admin/video-ai/clips/${encodeURIComponent(clip.id)}/action`,{method:'POST',body:JSON.stringify({action,...extra})});
  currentJob=result.job;
  currentClips=result.clips||[];
  renderReview();
  await loadBootstrap();
  return result;
}

async function approveVisibleClips(){
  const visible=currentClips.filter(clip=>(funnelFilter==='all'||clip.funnel===funnelFilter)&&clip.status==='generated');
  if(!visible.length)return;
  $('#approveAll').disabled=true;
  try{for(const clip of visible)await api(`/api/admin/video-ai/clips/${encodeURIComponent(clip.id)}/action`,{method:'POST',body:JSON.stringify({action:'approve'})});toast(`${visible.length} contenu(s) validé(s).`);await openJob(currentJob.id,{preserveScroll:true});await loadBootstrap();}
  catch(error){toast(errorText(error.message),true);}
}

async function exportClip(clip){
  const button=$(`[data-clip-id="${cssEscape(clip.id)}"] [data-export-clip]`);if(button){button.disabled=true;button.textContent='Envoi…';}
  try{const result=await api(`/api/admin/video-ai/clips/${encodeURIComponent(clip.id)}/export`,{method:'POST',body:'{}'});toast(result.alreadyDelivered?'Ce contenu est déjà dans Drive.':'Contenu envoyé dans le dossier Drive du client.');await openJob(currentJob.id,{preserveScroll:true});await loadBootstrap();}
  catch(error){toast(errorText(error.message),true);if(button){button.disabled=false;button.textContent='Envoyer dans Drive';}}
}

async function exportApprovedClips(){
  const clips=currentClips.filter(clip=>clip.status==='approved');
  if(!clips.length)return;
  $('#exportApproved').disabled=true;
  let delivered=0;
  try{for(const clip of clips){await api(`/api/admin/video-ai/clips/${encodeURIComponent(clip.id)}/export`,{method:'POST',body:'{}'});delivered++;}toast(`${delivered} contenu(s) envoyé(s) dans Drive.`);await openJob(currentJob.id,{preserveScroll:true});await loadBootstrap();}
  catch(error){toast(`${delivered} contenu(s) envoyé(s), puis une erreur : ${errorText(error.message)}`,true);await openJob(currentJob.id,{preserveScroll:true});}
}

function startPolling(){
  stopPolling();
  pollTimer=window.setInterval(async()=>{try{await openJob(currentJob.id,{preserveScroll:true});await loadBootstrap();}catch(error){console.error('video_ai_poll_failed',error);}},6000);
}
function stopPolling(){if(pollTimer)window.clearInterval(pollTimer);pollTimer=0;}

function selectedProposal(clip){return (clip.editorialProposals||[]).find(item=>item.id===clip.selectedProposalId)||(clip.editorialProposals||[])[0];}
function buildPost(proposal){if(!proposal)return '';return [proposal.hook,proposal.description,proposal.cta,(proposal.hashtags||[]).join(' ')].filter(Boolean).join('\n\n');}
async function copyText(text){try{await navigator.clipboard.writeText(String(text||''));toast('Publication copiée.');}catch{toast('La copie automatique est indisponible sur cet appareil.',true);}}

function setUploadProgress(percent,stage){$('#uploadProgress').hidden=false;$('#uploadPercent').textContent=`${percent} %`;$('#uploadProgressBar').value=percent;$('#uploadStage').textContent=stage;}
function setFormMessage(text,type=''){const element=$('#uploadMessage');element.textContent=text;element.className=`form-message${type?` ${type}`:''}`;}
function runtimeError(text){$('#runtimeState').classList.add('error');$('#runtimeState').innerHTML='<i></i> Indisponible';$('#jobsList').innerHTML=`<p class="empty-state">${esc(text)}</p>`;}
function toast(text,error=false){const element=$('#toast');element.textContent=text;element.className=`toast${error?' error':''}`;element.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.hidden=true,4200);}

async function api(url,options={},includeCsrf=true){
  const headers={Accept:'application/json',...(options.headers||{})};
  if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
  if(includeCsrf)headers['X-CSRF-Token']=csrfToken;
  const response=await fetch(url,{...options,headers,credentials:'same-origin'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`http_${response.status}`);
  return data;
}

function errorText(code){return ({unauthorized:'Reconnectez-vous au Studio.',csrf_failed:'La session de sécurité a expiré. Actualisez la page.',invalid_video_ai_job:'Le fichier ou le dossier client est incomplet.',order_not_found:'Le dossier client est introuvable.',video_file_too_large:'La vidéo dépasse la limite autorisée.',invalid_upload_session:'La session d’import n’a pas pu être créée.',invalid_upload_part:'Une partie du fichier est invalide.',upload_part_too_large:'Une partie du fichier dépasse la taille autorisée.',invalid_upload_completion:'L’import n’a pas pu être finalisé.',media_storage_unavailable:'Le stockage vidéo Neptune est indisponible.',video_processor_unavailable:'Le moteur de montage vidéo ne répond pas.',video_ai_internal_secret_missing:'La sécurité interne du moteur vidéo doit être configurée.',transcription_failed:'La transcription a échoué.',semantic_analysis_failed:'Aucun passage suffisamment qualitatif n’a été détecté.',video_render_failed:'Le rendu vidéo a échoué.',output_upload_failed:'Le short généré n’a pas pu être enregistré.',video_ai_job_not_found:'Ce traitement est introuvable.',video_ai_clip_not_found:'Ce short est introuvable.',clip_not_approved:'Validez le short avant de l’envoyer dans Drive.',drive_short_folder_missing:'Le dossier Shorts du client n’est pas encore provisionné dans Drive.',drive_access_token_missing:'La connexion Google Drive doit être resynchronisée.',drive_access_token_expired:'La connexion Google Drive vient d’expirer. Relancez la synchronisation.',drive_resumable_session_failed:'Google Drive n’a pas accepté la préparation de l’envoi.',drive_video_upload_failed:'La vidéo n’a pas pu être envoyée dans Google Drive.',video_ai_operation_failed:'Le traitement vidéo n’a pas abouti.',video_ai_store_failed:'Les données de production sont momentanément indisponibles.',invalid_editorial_proposal:'Cette proposition éditoriale n’est plus disponible.',invalid_clip_update:'Le titre et les trois propositions doivent rester complets.',no_candidate_above_minimum_score:'Aucun passage ne dépasse le seuil qualitatif de 60/100.'})[code]||(/^http_/.test(code)?`Erreur réseau ${code.replace('http_','')}.`:'Une erreur est survenue. Réessayez.');}
function formatDate(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(date);}
function formatDuration(seconds){const value=Number(seconds||0);if(!value)return 'Durée en analyse';return value>=3600?`${Math.floor(value/3600)} h ${Math.round((value%3600)/60)} min`:`${Math.max(1,Math.round(value/60))} min`;}
function formatTimecode(seconds){const value=Math.max(0,Math.round(Number(seconds||0)));return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
function formatBytes(bytes){const value=Number(bytes||0);if(value<1024)return `${value} o`;const units=['Ko','Mo','Go','To'];let size=value/1024,index=0;while(size>=1024&&index<units.length-1){size/=1024;index++;}return `${size>=10?size.toFixed(1):size.toFixed(2)} ${units[index]}`;}
function cssEscape(value){return globalThis.CSS?.escape?CSS.escape(String(value)):String(value).replace(/[^A-Za-z0-9_-]/gu,'\\$&');}
function esc(value){return String(value??'').replace(/[&<>"']/gu,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
