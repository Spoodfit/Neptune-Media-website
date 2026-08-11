const API='/api/admin/webtv/media';
const MAX_BYTES=5*1024*1024*1024;
const PUT_RETRY_DELAYS_MS=[0,2500,8000];
const DIRECT_PUT_TRANSPORT='direct-r2-put-v1';
let selectedFile=null;
let selectedDuration=0;
let activeUpload=null;

start();

async function start(){
  await waitFor(()=>document.getElementById('addFromLibrary')&&window.NeptuneWebTvProgram,5000);
  const addButton=document.getElementById('addFromLibrary');
  if(!addButton||!window.NeptuneWebTvProgram)return;
  installUploadUi(addButton);
  await refreshImportedLibrary();
}

function installUploadUi(addButton){
  const actions=document.createElement('div');actions.className='webtv-program-actions';addButton.before(actions);
  const button=document.createElement('button');button.id='importVideo';button.type='button';button.className='button button-import-video';button.innerHTML='<span aria-hidden="true">↑</span> Importer une vidéo';actions.append(button,addButton);
  const dialog=document.createElement('dialog');dialog.id='webtvUploadDialog';dialog.className='webtv-upload-dialog';
  dialog.innerHTML=`<section class="webtv-upload-card">
    <header><div><p class="eyebrow">MÉDIATHÈQUE WEB TV</p><h2>Importer une émission</h2><p>Sélectionnez votre vidéo : Neptune l’envoie directement et en une seule opération sécurisée vers Cloudflare R2.</p></div><button type="button" class="icon-button" data-upload-close aria-label="Fermer">×</button></header>
    <div class="webtv-upload-drop" data-upload-drop tabindex="0" role="button" aria-label="Choisir une vidéo à importer"><span class="webtv-upload-icon">↑</span><strong>Glissez votre vidéo ici</strong><small>ou cliquez pour choisir un fichier · MP4, MOV, WebM, MKV · 5 Go max.</small></div>
    <input data-upload-file type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv" hidden>
    <div class="webtv-upload-selection" data-upload-selection hidden><div class="webtv-upload-fileline"><span class="webtv-upload-fileicon">▶</span><div><strong data-upload-filename></strong><small data-upload-filesize></small></div><button type="button" class="button" data-upload-change>Changer</button></div><label><span>Titre à afficher dans le programme</span><input data-upload-title maxlength="180" autocomplete="off"></label></div>
    <div class="webtv-upload-progress" data-upload-progress hidden><div><strong data-upload-status>Préparation…</strong><span data-upload-percent>0 %</span></div><progress data-upload-bar max="100" value="0"></progress><small data-upload-detail></small></div>
    <div class="webtv-upload-error" data-upload-error hidden></div>
    <footer><button type="button" class="button" data-upload-cancel>Annuler</button><button type="button" class="button button-primary" data-upload-start disabled>Importer et ajouter au programme</button></footer>
  </section>`;
  document.body.append(dialog);
  const input=dialog.querySelector('[data-upload-file]'),drop=dialog.querySelector('[data-upload-drop]');
  button.addEventListener('click',()=>openDialog(dialog));drop.addEventListener('click',()=>input.click());drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('is-dragover');});
  for(const type of ['dragleave','drop'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('is-dragover');});
  drop.addEventListener('drop',e=>{const file=e.dataTransfer?.files?.[0];if(file)selectFile(dialog,file);});input.addEventListener('change',()=>{const file=input.files?.[0];if(file)selectFile(dialog,file);});
  dialog.querySelector('[data-upload-change]').addEventListener('click',()=>input.click());dialog.querySelector('[data-upload-start]').addEventListener('click',()=>upload(dialog));dialog.querySelector('[data-upload-cancel]').addEventListener('click',()=>closeOrCancel(dialog));dialog.querySelector('[data-upload-close]').addEventListener('click',()=>closeOrCancel(dialog));dialog.addEventListener('cancel',e=>{e.preventDefault();closeOrCancel(dialog);});
}

function openDialog(dialog){if(activeUpload)return;reset(dialog);dialog.showModal();}
async function selectFile(dialog,file){
  clearError(dialog);if(!isVideo(file)){showError(dialog,'Ce fichier n’est pas reconnu comme une vidéo compatible.');return;}if(file.size<=0||file.size>MAX_BYTES){showError(dialog,'La vidéo doit peser moins de 5 Go.');return;}
  selectedFile=file;selectedDuration=await videoDuration(file);dialog.querySelector('[data-upload-selection]').hidden=false;dialog.querySelector('[data-upload-filename]').textContent=file.name;dialog.querySelector('[data-upload-filesize]').textContent=`${formatBytes(file.size)}${selectedDuration?` · ${formatDuration(selectedDuration)}`:''}`;dialog.querySelector('[data-upload-title]').value=titleFromFilename(file.name);dialog.querySelector('[data-upload-start]').disabled=false;
}

async function upload(dialog){
  if(!selectedFile||activeUpload)return;
  const file=selectedFile,title=dialog.querySelector('[data-upload-title]').value.trim()||titleFromFilename(file.name),controller=new AbortController();
  activeUpload={controller,key:'',transport:DIRECT_PUT_TRANSPORT};setBusy(dialog,true);clearError(dialog);showProgress(dialog,true);setProgress(dialog,0,'Préparation de l’import…','Création d’un lien d’envoi sécurisé vers Cloudflare R2');
  try{
    const init=await apiJson(`${API}/init`,{method:'POST',body:{filename:file.name,size:file.size,type:file.type,title,durationSeconds:selectedDuration},signal:controller.signal});
    if(init.transport!==DIRECT_PUT_TRANSPORT||!init.uploadUrl)throw appError('direct_put_transport_unavailable',init,503);
    activeUpload.key=init.key;
    await putWithRetry(init.uploadUrl,file,init.contentType||file.type||'application/octet-stream',controller.signal,{
      onProgress:({loaded,total,attempt})=>{const percent=Math.min(99,Math.round(loaded/Math.max(1,total)*100));setProgress(dialog,percent,attempt>1?`Reprise de l’import · ${percent} %`:`Import vers R2 · ${percent} %`,`${formatBytes(loaded)} sur ${formatBytes(total)} · transfert direct sécurisé`);},
      onRetry:({attempt,max,waitMs,reason})=>setProgress(dialog,0,'Reprise automatique',`Nouvelle tentative ${attempt}/${max} dans ${Math.max(1,Math.round(waitMs/1000))} s · ${reason}`),
    });
    setProgress(dialog,99,'Vérification…','Neptune vérifie que la vidéo complète est bien disponible dans R2');
    const completed=await apiJson(`${API}/complete`,{method:'POST',body:{key:init.key,transport:init.transport,expectedSize:file.size,title,durationSeconds:selectedDuration,originalName:file.name},signal:controller.signal});
    const item=completed.item;if(!item?.mediaUrl)throw appError('upload_result_invalid');
    await refreshImportedLibrary();const added=window.NeptuneWebTvProgram?.addImportedMedia?.(item);if(!added)throw appError('program_not_ready');
    setProgress(dialog,100,'Émission importée','Ajoutée au programme. Cliquez ensuite sur « Appliquer à l’antenne ».');window.NeptuneWebTvProgram?.toast?.('Émission importée et ajoutée au programme. Appliquez les changements à l’antenne.');setTimeout(()=>{activeUpload=null;dialog.close();location.hash='#program';},750);
  }catch(error){
    if(error?.name==='AbortError')showError(dialog,'Import annulé.');else showError(dialog,uploadError(error));
    if(activeUpload?.key){try{await apiJson(`${API}/abort`,{method:'POST',body:{key:activeUpload.key,transport:DIRECT_PUT_TRANSPORT}});}catch{}}
    activeUpload=null;setBusy(dialog,false);
  }
}

async function putWithRetry(url,file,contentType,signal,{onProgress,onRetry}={}){
  let lastError=null;const max=PUT_RETRY_DELAYS_MS.length;
  for(let attempt=1;attempt<=max;attempt+=1){
    if(attempt>1){const waitMs=PUT_RETRY_DELAYS_MS[attempt-1];onRetry?.({attempt,max,waitMs,reason:retryReason(lastError)});await delay(waitMs,signal);}
    try{return await xhrPut(url,file,contentType,signal,(loaded,total)=>onProgress?.({loaded,total,attempt}));}
    catch(error){if(error?.name==='AbortError')throw error;lastError=error;if(!isRetryablePutError(error)||attempt===max)throw error;}
  }
  throw lastError||appError('direct_put_network');
}

function xhrPut(url,file,contentType,signal,onProgress){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();let settled=false;
    const finish=(fn,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);fn(value);};
    const abort=()=>{try{xhr.abort();}catch{}finish(reject,new DOMException('Aborted','AbortError'));};
    xhr.open('PUT',url,true);xhr.setRequestHeader('Content-Type',contentType);xhr.timeout=0;
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(event.loaded,event.total||file.size);};
    xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)return finish(resolve,{status:xhr.status,etag:xhr.getResponseHeader('ETag')||''});finish(reject,appError('direct_put_http',{detail:String(xhr.responseText||'').replace(/\s+/gu,' ').trim().slice(0,320)},xhr.status));};
    xhr.onerror=()=>finish(reject,appError('direct_put_network',{detail:'Le navigateur n’a pas pu maintenir la connexion avec R2.'},0));
    xhr.onabort=()=>finish(reject,new DOMException('Aborted','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});xhr.send(file);
  });
}

async function closeOrCancel(dialog){if(activeUpload){activeUpload.controller.abort();return;}dialog.close();}
async function refreshImportedLibrary(){try{const response=await fetch(API,{credentials:'same-origin',headers:{Accept:'application/json'}}),data=await response.json().catch(()=>({}));if(response.ok)window.NeptuneWebTvProgram?.setImportedMedia?.(Array.isArray(data.items)?data.items:[]);}catch{}}
async function apiJson(url,{method='GET',body=null,signal}={}){const headers={Accept:'application/json'};if(body!==null)headers['Content-Type']='application/json';const csrf=sessionStorage.getItem('neptune_csrf')||'';if(method!=='GET'&&csrf)headers['X-CSRF-Token']=csrf;const response=await fetch(url,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:'same-origin',signal}),data=await response.json().catch(()=>({}));if(!response.ok)throw appError(data.error||`http_${response.status}`,data,response.status);return data;}
function appError(code,data={},status=0){const error=new Error(code);error.code=code;error.data=data||{};error.status=status;return error;}
function isRetryablePutError(error){const status=Number(error?.status||0);return error?.code==='direct_put_network'||status===408||status===429||status===500||status===502||status===503||status===504;}
function retryReason(error){const status=Number(error?.status||0);if(status)return`Cloudflare a répondu HTTP ${status}`;return'connexion interrompue';}
function uploadError(error){
  const code=error?.code||error?.message||'upload_failed',status=Number(error?.status||0),detail=String(error?.data?.detail||'').trim().slice(0,260);
  if(code==='direct_r2_not_configured'||code==='direct_put_transport_unavailable')return'L’import R2 n’est pas configuré correctement côté Cloudflare.';
  if(code==='direct_put_network')return`La connexion vers Cloudflare R2 a été interrompue malgré les reprises automatiques.${detail?` Détail : ${detail}`:''}`;
  if(code==='direct_put_http')return`Cloudflare R2 a refusé l’envoi${status?` (HTTP ${status})`:''}.${detail?` Détail : ${detail}`:''}`;
  if(code==='upload_size_mismatch')return`La vidéo reçue par R2 est incomplète (${formatBytes(error?.data?.actualSize||0)} reçus sur ${formatBytes(error?.data?.expectedSize||0)}). Neptune l’a rejetée pour éviter une émission corrompue.`;
  return({invalid_file_size:'Fichier trop volumineux : 5 Go maximum.',unsupported_video_type:'Format vidéo non pris en charge.',upload_complete_head_missing:'La vidéo a été envoyée mais R2 ne la rend pas encore disponible. Relancez l’import.',studio_forbidden:'Votre session Studio a expiré.',origin_forbidden:'Import refusé pour des raisons de sécurité.',program_not_ready:'La vidéo est importée, mais le programme n’est pas prêt. Rechargez la page : elle restera dans la médiathèque.',upload_result_invalid:'La vidéo est stockée mais son adresse n’a pas pu être récupérée.'})[code]||`Import impossible (${code}).`;
}
function setBusy(dialog,busy){dialog.querySelector('[data-upload-start]').disabled=busy||!selectedFile;dialog.querySelector('[data-upload-change]').disabled=busy;dialog.querySelector('[data-upload-title]').disabled=busy;dialog.querySelector('[data-upload-drop]').classList.toggle('is-disabled',busy);dialog.querySelector('[data-upload-cancel]').textContent=busy?'Annuler l’import':'Annuler';}
function showProgress(dialog,visible){dialog.querySelector('[data-upload-progress]').hidden=!visible;}function setProgress(dialog,value,status,detail){dialog.querySelector('[data-upload-bar]').value=value;dialog.querySelector('[data-upload-percent]').textContent=`${value} %`;dialog.querySelector('[data-upload-status]').textContent=status;dialog.querySelector('[data-upload-detail]').textContent=detail||'';}function showError(dialog,message){const el=dialog.querySelector('[data-upload-error]');el.textContent=message;el.hidden=false;}function clearError(dialog){dialog.querySelector('[data-upload-error]').hidden=true;}function reset(dialog){selectedFile=null;selectedDuration=0;dialog.querySelector('[data-upload-file]').value='';dialog.querySelector('[data-upload-selection]').hidden=true;dialog.querySelector('[data-upload-title]').value='';dialog.querySelector('[data-upload-start]').disabled=true;showProgress(dialog,false);clearError(dialog);setBusy(dialog,false);}
function isVideo(file){return String(file.type||'').startsWith('video/')||/\.(mp4|mov|webm|mkv)$/iu.test(file.name||'');}function titleFromFilename(name){return String(name||'Vidéo').replace(/\.[^.]+$/u,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim().slice(0,180)||'Vidéo Web TV';}function formatBytes(bytes){const units=['o','Ko','Mo','Go','To'];let n=Number(bytes||0),i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return`${n>=10||i===0?n.toFixed(0):n.toFixed(1)} ${units[i]}`;}function formatDuration(seconds){const s=Math.round(Number(seconds||0)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;return h?`${h} h ${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`:`${m}:${String(r).padStart(2,'0')}`;}
function videoDuration(file){return new Promise(resolve=>{const video=document.createElement('video'),url=URL.createObjectURL(file);let done=false;const finish=value=>{if(done)return;done=true;URL.revokeObjectURL(url);resolve(Number.isFinite(value)?Math.round(value):0);};video.preload='metadata';video.onloadedmetadata=()=>finish(video.duration);video.onerror=()=>finish(0);video.src=url;setTimeout(()=>finish(0),6000);});}
function delay(ms,signal){return new Promise((resolve,reject)=>{const timer=setTimeout(resolve,ms);if(signal)signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});}function waitFor(predicate,timeout){return new Promise(resolve=>{const start=Date.now();const tick=()=>{if(predicate())return resolve(true);if(Date.now()-start>timeout)return resolve(false);setTimeout(tick,50);};tick();});}
window.addEventListener('beforeunload',event=>{if(!activeUpload)return;event.preventDefault();event.returnValue='';});
