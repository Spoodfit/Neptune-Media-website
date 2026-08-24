const RELEASE='neptune-drive-manual-validation-20260824-v138';
const API='/api/admin/drive-manual-validation-v138';
let scheduled=false;

start();

function start(){
  document.readyState==='loading'
    ?document.addEventListener('DOMContentLoaded',boot,{once:true})
    :boot();
}

function boot(){
  document.documentElement.dataset.driveManualValidationV138='ready';
  enhance();
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open']});
  window.addEventListener('hashchange',schedule);
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;enhance();});
}

function enhance(){
  const detail=document.querySelector('#clientDetail.v92-detail');
  const mount=detail?.querySelector('.v94-drive-upload');
  const head=mount?.querySelector('.v94-head');
  if(!detail||!mount||!head||head.querySelector('[data-v138-manual-drive]'))return;
  const orderId=String(detail.dataset.orderId||decodeURIComponent(location.hash.slice(1))||'').trim();
  if(!orderId)return;

  const button=document.createElement('button');
  button.type='button';
  button.className='v94-drive-link v138-manual-drive';
  button.dataset.v138ManualDrive='';
  button.textContent='Valider depuis le Drive';
  button.title='Vérifier et enregistrer les fichiers déjà déposés directement dans Google Drive';
  const link=head.querySelector('.v94-drive-link[href]');
  if(link)link.insertAdjacentElement('afterend',button);
  else head.append(button);

  button.addEventListener('click',()=>validateFromDrive({button,mount,orderId}));
}

async function validateFromDrive({button,mount,orderId}){
  if(button.disabled)return;
  const initial=button.textContent;
  button.disabled=true;
  button.textContent='Vérification…';
  setStatus(mount,'Vérification des fichiers déjà déposés dans les dossiers Long format et Shorts…');
  try{
    const result=await api({orderId});
    const validated=Number(result.validated||0);
    const changed=Number(result.changed||0);
    const failed=Number(result.failed||0);
    const skipped=Number(result.skipped||0);
    if(validated>0&&failed===0){
      setStatus(mount,changed>0
        ?`${validated} fichier(s) validé(s) depuis Drive et enregistré(s) dans Neptune. Aucun réupload nécessaire.`
        :`${validated} fichier(s) déjà valide(s) dans Drive. Aucun réupload nécessaire.`);
      clearFailedUploadRows(mount);
      setTimeout(()=>document.querySelector('[data-v92-refresh]')?.click(),450);
      return;
    }
    if(validated>0&&failed>0){
      setStatus(mount,`${validated} fichier(s) validé(s), mais ${failed} fichier(s) nécessitent encore une vérification.`,true);
      return;
    }
    if(failed>0){
      setStatus(mount,'Des fichiers sont présents dans Drive mais Neptune n’a pas pu tous les valider. Réessayez la vérification.',true);
      return;
    }
    if(skipped>0){
      setStatus(mount,'Aucun nouveau livrable complet à valider. Vérifiez que le fichier est bien dans Long format ou Shorts et que son transfert Drive est terminé.',true);
      return;
    }
    setStatus(mount,'Aucun fichier complet trouvé. Ouvrez le Drive, déposez le livrable dans Long format ou Shorts, attendez la fin du transfert Google, puis cliquez à nouveau.');
  }catch(error){
    setStatus(mount,errorMessage(String(error?.message||error||'')),true);
  }finally{
    button.disabled=false;
    button.textContent=initial;
  }
}

async function api(payload,retried=false){
  const csrf=sessionStorage.getItem('neptune_csrf')||'';
  let response;
  try{
    response=await fetch(API,{
      method:'POST',
      credentials:'same-origin',
      cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json',
        ...(csrf?{'X-CSRF-Token':csrf}:{}),
      },
      body:JSON.stringify(payload||{}),
    });
  }catch{
    throw new Error('drive_manual_network_error');
  }
  const data=await response.json().catch(()=>({}));
  const code=String(data.error||`http_${response.status}`);
  if(response.ok)return data;
  if(!retried&&response.status===403&&/csrf/iu.test(code)){
    const renewed=await renewCsrf();
    if(renewed)return api(payload,true);
  }
  throw new Error(code);
}

async function renewCsrf(){
  try{
    const response=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    const token=String(data.csrfToken||data.csrf||'').trim();
    if(!response.ok||!token)return false;
    sessionStorage.setItem('neptune_csrf',token);
    return true;
  }catch{return false;}
}

function clearFailedUploadRows(mount){
  const queue=mount.querySelector('[data-v94-queue]');
  if(!queue)return;
  queue.querySelectorAll('.v94-file.is-error').forEach((row)=>row.remove());
  if(!queue.querySelector('.v94-file'))queue.hidden=true;
}

function setStatus(mount,text,error=false){
  const status=mount.querySelector('[data-v94-status]');
  if(!status)return;
  status.textContent=text;
  status.classList.toggle('is-error',error);
}

function errorMessage(code){
  const labels={
    drive_access_missing:'Google Drive n’est pas connecté au Studio.',
    drive_passage_not_ready:'Les dossiers Drive de ce passage ne sont pas encore prêts.',
    drive_manual_scan_failed:'Neptune n’a pas pu lire le dossier Drive. Réessayez dans quelques instants.',
    drive_manual_validation_unavailable:'La validation depuis Drive est momentanément indisponible.',
    drive_manual_network_error:'Connexion interrompue pendant la vérification. Le fichier reste dans Drive : réessayez simplement la validation.',
    origin_forbidden:'La session Studio doit être actualisée avant cette validation.',
    csrf_failed:'La session de sécurité a expiré. Actualisez le Studio puis réessayez.',
  };
  return labels[code]||'Neptune n’a pas pu valider les fichiers présents dans Drive. Le fichier n’est pas supprimé : réessayez la vérification.';
}

const style=document.createElement('style');
style.dataset.driveManualValidationV138=RELEASE;
style.textContent=`
.v138-manual-drive{font:inherit;cursor:pointer;white-space:nowrap}
.v138-manual-drive:disabled{opacity:.55;cursor:progress}
@media(max-width:760px){.v94-head .v138-manual-drive{width:100%;justify-content:center}}
`;
document.head.append(style);
