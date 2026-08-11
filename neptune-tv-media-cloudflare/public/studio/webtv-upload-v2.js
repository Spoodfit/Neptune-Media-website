const API='/api/admin/webtv/media';
const MAX_BYTES=20*1024*1024*1024;
const PART_GAP_MS=1150;
const PART_RETRY_DELAYS_MS=[0,1500,3500,7000,12000,20000];
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
  const actions=document.createElement('div');
  actions.className='webtv-program-actions';
  addButton.before(actions);
  const button=document.createElement('button');
  button.id='importVideo';button.type='button';button.className='button button-import-video';
  button.innerHTML='<span aria-hidden="true">↑</span> Importer une vidéo';
  actions.append(button,addButton);

  const dialog=document.createElement('dialog');
  dialog.id='webtvUploadDialog';dialog.className='webtv-upload-dialog';
  dialog.innerHTML=`<section class="webtv-upload-card">
    <header><div><p class="eyebrow">MÉDIATHÈQUE WEB TV</p><h2>Importer une vidéo</h2><p>Ajoutez une vidéo depuis votre ordinateur. Neptune l’envoie directement dans Cloudflare R2 puis l’ajoute au programme.</p></div><button type="button" class="icon-button" data-upload-close aria-label="Fermer">×</button></header>
    <div class="webtv-upload-drop" data-upload-drop tabindex="0" role="button" aria-label="Choisir une vidéo à importer">
      <span class="webtv-upload-icon">↑</span><strong>Glissez votre vidéo ici</strong><small>ou cliquez pour choisir un fichier · MP4, MOV, WebM, MKV · 20 Go max.</small>
    </div>
    <input data-upload-file type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv" hidden>
    <div class="webtv-upload-selection" data-upload-selection hidden>
      <div class="webtv-upload-fileline"><span class="webtv-upload-fileicon">▶</span><div><strong data-upload-filename></strong><small data-upload-filesize></small></div><button type="button" class="button" data-upload-change>Changer</button></div>
      <label><span>Titre à afficher dans le programme</span><input data-upload-title maxlength="180" autocomplete="off"></label>
    </div>
    <div class="webtv-upload-progress" data-upload-progress hidden><div><strong data-upload-status>Préparation…</strong><span data-upload-percent>0 %</span></div><progress data-upload-bar max="100" value="0"></progress><small data-upload-detail></small></div>
    <div class="webtv-upload-error" data-upload-error hidden></div>
    <footer><button type="button" class="button" data-upload-cancel>Annuler</button><button type="button" class="button button-primary" data-upload-start disabled>Importer et ajouter au programme</button></footer>
  </section>`;
  document.body.append(dialog);

  const input=dialog.querySelector('[data-upload-file]');
  const drop=dialog.querySelector('[data-upload-drop]');
  button.addEventListener('click',()=>openDialog(dialog));
  drop.addEventListener('click',()=>input.click());
  drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('is-dragover');});
  for(const type of ['dragleave','drop'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('is-dragover');});
  drop.addEventListener('drop',e=>{const file=e.dataTransfer?.files?.[0];if(file)selectFile(dialog,file);});
  input.addEventListener('change',()=>{const file=input.files?.[0];if(file)selectFile(dialog,file);});
  dialog.querySelector('[data-upload-change]').addEventListener('click',()=>input.click());
  dialog.querySelector('[data-upload-start]').addEventListener('click',()=>upload(dialog));
  dialog.querySelector('[data-upload-cancel]').addEventListener('click',()=>closeOrCancel(dialog));
  dialog.querySelector('[data-upload-close]').addEventListener('click',()=>closeOrCancel(dialog));
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeOrCancel(dialog);});
}

function openDialog(dialog){if(activeUpload)return;reset(dialog);dialog.showModal();}

async function selectFile(dialog,file){
  clearError(dialog);
  if(!isVideo(file)){showError(dialog,'Ce fichier n’est pas reconnu comme une vidéo compatible.');return;}
  if(file.size<=0||file.size>MAX_BYTES){showError(dialog,'La vidéo doit peser moins de 20 Go.');return;}
  selectedFile=file;selectedDuration=await videoDuration(file);
  dialog.querySelector('[data-upload-selection]').hidden=false;
  dialog.querySelector('[data-upload-filename]').textContent=file.name;
  dialog.querySelector('[data-upload-filesize]').textContent=`${formatBytes(file.size)}${selectedDuration?` · ${formatDuration(selectedDuration)}`:''}`;
  dialog.querySelector('[data-upload-title]').value=titleFromFilename(file.name);
  dialog.querySelector('[data-upload-start]').disabled=false;
}

async function upload(dialog){
  if(!selectedFile||activeUpload)return;
  const file=selectedFile;
  const title=dialog.querySelector('[data-upload-title]').value.trim()||titleFromFilename(file.name);
  const controller=new AbortController();
  activeUpload={controller,key:'',uploadId:''};
  setBusy(dialog,true);clearError(dialog);showProgress(dialog,true);
  setProgress(dialog,0,'Préparation de l’import…','Création de l’espace sécurisé Cloudflare R2');
  try{
    const init=await apiJson(`${API}/init`,{method:'POST',body:{filename:file.name,size:file.size,type:file.type,title,durationSeconds:selectedDuration},signal:controller.signal});
    activeUpload.key=init.key;activeUpload.uploadId=init.uploadId;
    const chunkSize=Number(init.chunkSize||10*1024*1024),total=Math.ceil(file.size/chunkSize),parts=new Array(total);
    let completedBytes=0;

    await delay(PART_GAP_MS,controller.signal);
    for(let index=0;index<total;index+=1){
      const start=index*chunkSize,end=Math.min(file.size,start+chunkSize),blob=file.slice(start,end);
      const query=new URLSearchParams({key:init.key,uploadId:init.uploadId,partNumber:String(index+1)});
      const basePercent=Math.min(99,Math.round(completedBytes/file.size*100));
      const part=await apiRawWithRetry(`${API}/part?${query}`,blob,controller.signal,({attempt,max,waitMs})=>{
        setProgress(dialog,basePercent,`Cloudflare temporise · bloc ${index+1}/${total}`,`Nouvelle tentative ${attempt}/${max} dans ${Math.max(1,Math.round(waitMs/1000))} s · la vidéo déjà envoyée est conservée`);
      });
      parts[index]={partNumber:index+1,etag:part.etag};
      completedBytes+=blob.size;
      const percent=Math.min(99,Math.round(completedBytes/file.size*100));
      setProgress(dialog,percent,`Import en cours · ${percent} %`,`${formatBytes(completedBytes)} sur ${formatBytes(file.size)} · bloc ${index+1}/${total}`);
      if(index<total-1)await delay(PART_GAP_MS,controller.signal);
    }

    setProgress(dialog,99,'Finalisation…','Assemblage de la vidéo dans Cloudflare R2');
    await delay(PART_GAP_MS,controller.signal);
    const completed=await apiJson(`${API}/complete`,{method:'POST',body:{key:init.key,uploadId:init.uploadId,parts},signal:controller.signal});
    const item=completed.item;if(!item?.mediaUrl)throw appError('upload_result_invalid');
    await refreshImportedLibrary();
    const added=window.NeptuneWebTvProgram?.addImportedMedia?.(item);if(!added)throw appError('program_not_ready');
    setProgress(dialog,100,'Vidéo importée','Ajoutée au programme. Cliquez ensuite sur « Appliquer à l’antenne ».');
    window.NeptuneWebTvProgram?.toast?.('Vidéo importée et ajoutée au programme. Appliquez les changements à l’antenne.');
    setTimeout(()=>{activeUpload=null;dialog.close();location.hash='#program';},650);
  }catch(error){
    if(error?.name==='AbortError')showError(dialog,'Import annulé.');else showError(dialog,uploadError(error));
    if(activeUpload?.key&&activeUpload?.uploadId){try{await delay(PART_GAP_MS);await apiJson(`${API}/abort`,{method:'POST',body:{key:activeUpload.key,uploadId:activeUpload.uploadId}});}catch{}}
    activeUpload=null;setBusy(dialog,false);
  }
}

async function closeOrCancel(dialog){if(activeUpload){activeUpload.controller.abort();return;}dialog.close();}
async function refreshImportedLibrary(){try{const response=await fetch(API,{credentials:'same-origin',headers:{Accept:'application/json'}});const data=await response.json().catch(()=>({}));if(response.ok)window.NeptuneWebTvProgram?.setImportedMedia?.(Array.isArray(data.items)?data.items:[]);}catch{}}

async function apiJson(url,{method='GET',body=null,signal}={}){
  const headers={Accept:'application/json'};if(body!==null)headers['Content-Type']='application/json';const csrf=sessionStorage.getItem('neptune_csrf')||'';if(method!=='GET'&&csrf)headers['X-CSRF-Token']=csrf;
  const response=await fetch(url,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:'same-origin',signal});const data=await response.json().catch(()=>({}));if(!response.ok)throw appError(data.error||`http_${response.status}`,data,response.status);return data;
}
async function apiRawWithRetry(url,blob,signal,onRetry){
  let lastError=null;
  const max=PART_RETRY_DELAYS_MS.length;
  for(let attempt=1;attempt<=max;attempt+=1){
    if(attempt>1){
      const waitMs=jitter(PART_RETRY_DELAYS_MS[attempt-1]);
      onRetry?.({attempt,max,waitMs});
      await delay(waitMs,signal);
    }
    try{return await apiRawOnce(url,blob,signal);}catch(error){
      if(error?.name==='AbortError')throw error;
      lastError=error;
      if(!isRetryablePartError(error)||attempt===max)throw error;
    }
  }
  throw lastError||appError('upload_part_failed');
}
async function apiRawOnce(url,blob,signal){
  const headers={'Content-Type':'application/octet-stream',Accept:'application/json'};const csrf=sessionStorage.getItem('neptune_csrf')||'';if(csrf)headers['X-CSRF-Token']=csrf;
  let response;
  try{response=await fetch(url,{method:'PUT',headers,body:blob,credentials:'same-origin',signal});}
  catch(error){if(error?.name==='AbortError')throw error;throw appError('upload_part_network',{stage:'network',detail:String(error?.message||'Network request failed')},0);}
  const data=await response.json().catch(()=>({}));if(!response.ok)throw appError(data.error||`http_${response.status}`,data,response.status);return data;
}

function appError(code,data={},status=0){const error=new Error(code);error.code=code;error.data=data||{};error.status=status;return error;}
function isRetryablePartError(error){const status=Number(error?.status||0),code=String(error?.code||'');return code==='upload_part_network'||code==='upload_part_failed'||status===429||status===500||status===502||status===503||status===504;}
function jitter(ms){if(!ms)return 0;return Math.max(250,Math.round(ms*(0.85+Math.random()*0.3)));}
function setBusy(dialog,busy){dialog.querySelector('[data-upload-start]').disabled=busy||!selectedFile;dialog.querySelector('[data-upload-change]').disabled=busy;dialog.querySelector('[data-upload-title]').disabled=busy;dialog.querySelector('[data-upload-drop]').classList.toggle('is-disabled',busy);dialog.querySelector('[data-upload-cancel]').textContent=busy?'Annuler l’import':'Annuler';}
function showProgress(dialog,visible){dialog.querySelector('[data-upload-progress]').hidden=!visible;}
function setProgress(dialog,value,status,detail){dialog.querySelector('[data-upload-bar]').value=value;dialog.querySelector('[data-upload-percent]').textContent=`${value} %`;dialog.querySelector('[data-upload-status]').textContent=status;dialog.querySelector('[data-upload-detail]').textContent=detail||'';}
function showError(dialog,message){const el=dialog.querySelector('[data-upload-error]');el.textContent=message;el.hidden=false;}
function clearError(dialog){dialog.querySelector('[data-upload-error]').hidden=true;}
function reset(dialog){selectedFile=null;selectedDuration=0;dialog.querySelector('[data-upload-file]').value='';dialog.querySelector('[data-upload-selection]').hidden=true;dialog.querySelector('[data-upload-title]').value='';dialog.querySelector('[data-upload-start]').disabled=true;showProgress(dialog,false);clearError(dialog);setBusy(dialog,false);}
function isVideo(file){return String(file.type||'').startsWith('video/')||/\.(mp4|mov|webm|mkv)$/iu.test(file.name||'');}
function titleFromFilename(name){return String(name||'Vidéo').replace(/\.[^.]+$/u,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' ').trim().slice(0,180)||'Vidéo Web TV';}
function formatBytes(bytes){const units=['o','Ko','Mo','Go','To'];let n=Number(bytes||0),i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return`${n>=10||i===0?n.toFixed(0):n.toFixed(1)} ${units[i]}`;}
function formatDuration(seconds){const s=Math.round(Number(seconds||0));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;return h?`${h} h ${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`:`${m}:${String(r).padStart(2,'0')}`;}
function videoDuration(file){return new Promise(resolve=>{const video=document.createElement('video');const url=URL.createObjectURL(file);let done=false;const finish=value=>{if(done)return;done=true;URL.revokeObjectURL(url);resolve(Number.isFinite(value)?Math.round(value):0);};video.preload='metadata';video.onloadedmetadata=()=>finish(video.duration);video.onerror=()=>finish(0);video.src=url;setTimeout(()=>finish(0),6000);});}
function uploadError(error){
  const code=error?.code||error?.message||'upload_failed';
  const stage=error?.data?.stage||'';
  const status=Number(error?.status||0);
  const detail=String(error?.data?.detail||'').trim().slice(0,220);
  if(code==='upload_part_failed'&&stage==='r2')return`Cloudflare R2 refuse toujours ce bloc après ${PART_RETRY_DELAYS_MS.length} tentatives${status?` (HTTP ${status})`:''}.${detail?` Détail technique : ${detail}`:''}`;
  if((code==='upload_part_network'||code==='upload_part_failed')&&stage==='network')return`Le navigateur n’arrive pas à transmettre durablement ce bloc malgré les reprises automatiques.${detail?` Détail : ${detail}`:''}`;
  if(code==='upload_part_failed'&&stage==='receive')return'Le navigateur n’a pas pu transmettre complètement un bloc au serveur. Relancez l’import.';
  return({invalid_file_size:'Fichier trop volumineux.',unsupported_video_type:'Format vidéo non pris en charge.',upload_part_too_large:'Bloc vidéo trop volumineux pour le serveur.',upload_part_failed:'Une partie de la vidéo n’a pas pu être envoyée. Relancez l’import.',upload_complete_failed:'Cloudflare n’a pas pu finaliser la vidéo.',studio_forbidden:'Votre session Studio a expiré.',origin_forbidden:'Import refusé pour des raisons de sécurité.',program_not_ready:'La vidéo est importée, mais le programme n’est pas prêt. Rechargez la page : elle restera dans la médiathèque.',upload_result_invalid:'La vidéo a été envoyée mais son adresse n’a pas pu être récupérée.'})[code]||`Import impossible (${code}).`;
}
function delay(ms,signal){return new Promise((resolve,reject)=>{const timer=setTimeout(resolve,ms);if(signal)signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});}
function waitFor(predicate,timeout){return new Promise(resolve=>{const start=Date.now();const tick=()=>{if(predicate())return resolve(true);if(Date.now()-start>timeout)return resolve(false);setTimeout(tick,50);};tick();});}
window.addEventListener('beforeunload',event=>{if(!activeUpload)return;event.preventDefault();event.returnValue='';});
