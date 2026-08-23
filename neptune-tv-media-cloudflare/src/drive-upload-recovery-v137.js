const RELEASE='neptune-drive-upload-recovery-20260824-v137';
const STAGING_PREFIX='.__neptune_uploading__';
const SOURCE='studio-v94';
const UPLOADING='uploading';
const COMPLETE='complete';
const MAX_RECOVERIES=25;

export async function recoverDriveStagingUploadsV137(env){
  if(!env?.STUDIO)return {ok:false,skipped:true,reason:'studio_binding_missing'};
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const [tokenResponse,planResponse]=await Promise.all([
    callStore(studio,'/portal/drive-token-get',{}),
    callStore(studio,'/portal/drive-sync-plan',{}),
  ]);
  const token=await tokenResponse.json().catch(()=>({}));
  const plan=await planResponse.json().catch(()=>({}));
  if(!tokenResponse.ok||!token.accessToken)return {ok:false,skipped:true,reason:'drive_access_missing'};
  if(!planResponse.ok)return {ok:false,skipped:true,reason:'drive_plan_unavailable'};

  const passages=new Map((Array.isArray(plan.passages)?plan.passages:[]).map((item)=>[String(item.orderId||''),item]));
  if(!passages.size)return {ok:true,recovered:0,scanned:0};

  const candidates=await listStagedFiles(token.accessToken);
  let recovered=0;
  let scanned=0;
  const errors=[];
  for(const file of candidates.slice(0,MAX_RECOVERIES)){
    scanned+=1;
    try{
      const properties=file?.appProperties&&typeof file.appProperties==='object'?file.appProperties:{};
      const orderId=String(properties.neptuneOrderId||'').trim();
      const category=String(properties.neptuneCategory||'').trim().toLowerCase();
      const passage=passages.get(orderId);
      if(!passage||!['long','short'].includes(category))continue;
      const expectedFolder=category==='long'?String(passage.longFolderId||''):String(passage.shortsFolderId||'');
      const parents=Array.isArray(file.parents)?file.parents.map(String):[];
      if(!expectedFolder||!parents.includes(expectedFolder))continue;

      const expectedSize=positiveInteger(properties.neptuneExpectedSize);
      const actualSize=positiveInteger(file.size);
      if(!expectedSize||actualSize!==expectedSize)continue;
      if(String(properties.neptuneSource||'')!==SOURCE||String(properties.neptuneUploadState||'')!==UPLOADING)continue;
      const name=originalName(file.name);
      if(!name)continue;

      const finalized=await finalizeFile(token.accessToken,file,name);
      if(!finalized)continue;
      const registered=await registerInventory(studio,orderId,category,finalized);
      if(!registered.ok){
        errors.push({fileId:String(file.id||''),orderId,error:registered.error||'drive_registration_failed'});
        continue;
      }
      recovered+=1;
    }catch(error){
      errors.push({fileId:String(file?.id||''),error:safeError(error)});
    }
  }
  if(errors.length)console.warn('drive_upload_v137_recovery_partial',{recovered,scanned,errors:errors.slice(0,10)});
  return {ok:true,release:RELEASE,recovered,scanned,errors:errors.length};
}

async function listStagedFiles(accessToken){
  const url=new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q',`trashed = false and appProperties has { key='neptuneSource' and value='${SOURCE}' } and appProperties has { key='neptuneUploadState' and value='${UPLOADING}' }`);
  url.searchParams.set('fields','files(id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties)');
  url.searchParams.set('pageSize',String(MAX_RECOVERIES));
  url.searchParams.set('supportsAllDrives','true');
  url.searchParams.set('includeItemsFromAllDrives','true');
  const response=await fetch(url.toString(),{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}});
  if(!response.ok){
    console.warn('drive_upload_v137_recovery_list_failed',{status:response.status});
    return [];
  }
  const data=await response.json().catch(()=>({}));
  return Array.isArray(data.files)?data.files:[];
}

async function finalizeFile(accessToken,file,name){
  const fileId=String(file?.id||'').trim();
  if(!fileId)return null;
  const properties={...(file.appProperties&&typeof file.appProperties==='object'?file.appProperties:{}),neptuneUploadState:COMPLETE};
  const url=new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('supportsAllDrives','true');
  url.searchParams.set('fields','id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties');
  const response=await fetch(url.toString(),{
    method:'PATCH',
    headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','Content-Type':'application/json; charset=UTF-8'},
    body:JSON.stringify({name,appProperties:properties}),
  });
  const finalized=await response.json().catch(()=>({}));
  if(!response.ok){
    console.warn('drive_upload_v137_recovery_finalize_failed',{fileId,status:response.status});
    return null;
  }
  const expectedSize=positiveInteger(properties.neptuneExpectedSize);
  const actualSize=positiveInteger(finalized.size);
  if(!expectedSize||actualSize!==expectedSize||String(finalized.appProperties?.neptuneUploadState||'')!==COMPLETE||String(finalized.name||'')!==name){
    console.warn('drive_upload_v137_recovery_integrity_failed',{fileId,expectedSize,actualSize});
    return null;
  }
  return finalized;
}

async function registerInventory(studio,orderId,category,file){
  const response=await callStore(studio,'/portal/drive-files',{
    orderId,
    scannedAt:new Date().toISOString(),
    files:[{
      driveFileId:String(file.id||''),
      name:String(file.name||''),
      mimeType:String(file.mimeType||'application/octet-stream'),
      modifiedAt:validIso(file.modifiedTime)||new Date().toISOString(),
      category,
      webViewUrl:String(file.webViewLink||''),
      sizeBytes:positiveInteger(file.size),
    }],
  });
  const data=await response.json().catch(()=>({}));
  return response.ok?{ok:true,data}:{ok:false,error:data.error||`http_${response.status}`};
}

function callStore(studio,path,body){
  return studio.fetch(`https://store${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
}

function originalName(value){
  const name=String(value||'');
  if(!name.startsWith(STAGING_PREFIX))return '';
  return name.slice(STAGING_PREFIX.length).replace(/[\r\n"\\/]/gu,'_').slice(0,180).trim();
}

function positiveInteger(value){
  const number=Math.trunc(Number(value||0));
  return Number.isSafeInteger(number)&&number>0?number:0;
}

function validIso(value){
  const date=new Date(value||'');
  return Number.isNaN(date.getTime())?'':date.toISOString();
}

function safeError(error){return String(error?.message||error||'unknown').slice(0,300);}
