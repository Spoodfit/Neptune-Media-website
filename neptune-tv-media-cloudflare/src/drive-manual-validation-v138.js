import {adminAuth} from './portal-http-utils.js';
import {isSameOrigin,json} from './security.js';
import {recoverDriveStagingUploadsV137} from './drive-upload-recovery-v137.js';

export const DRIVE_MANUAL_VALIDATION_V138_RELEASE='neptune-drive-manual-validation-20260824-v138';
export const DRIVE_MANUAL_VALIDATION_V138_API='/api/admin/drive-manual-validation-v138';
const STAGING_PREFIX='.__neptune_uploading__';
const ALLOWED_MIME=new Set(['video/mp4','video/quicktime','video/x-m4v','video/webm','application/zip','application/octet-stream']);
const MAX_FILES_PER_FOLDER=250;

export async function handleDriveManualValidationV138(request,env){
  const url=new URL(request.url);
  if(url.pathname!==DRIVE_MANUAL_VALIDATION_V138_API)return null;
  if(request.method!=='POST')return secure(json({error:'method_not_allowed'},405,{Allow:'POST'}));
  if(!isSameOrigin(request))return secure(json({error:'origin_forbidden'},403));

  const payload=await request.json().catch(()=>({}));
  const orderId=cleanId(payload.orderId);
  if(!orderId)return secure(json({error:'invalid_order'},400));
  if(!env?.STUDIO)return secure(json({error:'drive_manual_validation_unavailable'},503));

  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const targetResponse=await callStore(studio,'/portal/drive-upload-target-v94',{
    ...adminAuth(request),
    payload:{orderId,category:''},
  });
  const target=await targetResponse.json().catch(()=>({}));
  if(!targetResponse.ok)return secure(json(target,targetResponse.status));

  const tokenResponse=await callStore(studio,'/portal/drive-token-get',{});
  const token=await tokenResponse.json().catch(()=>({}));
  if(!tokenResponse.ok||!token.accessToken)return secure(json({error:'drive_access_missing'},503));

  // Recover a browser upload whose bytes reached Drive but whose final response was lost.
  await recoverDriveStagingUploadsV137(env).catch((error)=>console.warn('drive_manual_v138_staging_recovery_failed',safeError(error)));

  const categories=[
    {category:'long',folderId:String(target.longFolderId||'')},
    {category:'short',folderId:String(target.shortsFolderId||'')},
  ].filter((item)=>item.folderId);
  if(categories.length!==2)return secure(json({error:'drive_passage_not_ready'},409));

  const details=[];
  let found=0;
  let validated=0;
  let changed=0;
  let skipped=0;
  let failed=0;

  for(const item of categories){
    let files;
    try{
      files=await listFolderFiles(token.accessToken,item.folderId);
    }catch(error){
      return secure(json({error:'drive_manual_scan_failed',detail:safeError(error)},502));
    }
    for(const rawFile of files){
      found+=1;
      const outcome=await validateFile({
        accessToken:token.accessToken,
        studio,
        orderId,
        category:item.category,
        folderId:item.folderId,
        file:rawFile,
      });
      if(outcome.ok){validated+=1;changed+=Number(outcome.changed||0);}
      else if(outcome.skipped)skipped+=1;
      else failed+=1;
      details.push({
        id:String(rawFile?.id||''),
        name:String(rawFile?.name||''),
        category:item.category,
        ok:Boolean(outcome.ok),
        skipped:Boolean(outcome.skipped),
        reason:outcome.reason||null,
      });
    }
  }

  return secure(json({
    ok:failed===0,
    release:DRIVE_MANUAL_VALIDATION_V138_RELEASE,
    orderId,
    found,
    validated,
    changed,
    skipped,
    failed,
    passageFolderUrl:String(target.passageFolderUrl||''),
    details:details.slice(0,250),
    // This endpoint never sends client e-mail. Notification remains owned by validated Drive sync.
    notificationMode:'drive-sync-after-explicit-validation',
  },failed?207:200));
}

export async function injectDriveManualValidationV138(response){
  let body=await response.text();
  body=body.replace(/<script\b[^>]*src=["'][^"']*\/studio\/drive-manual-validation-v138\.js[^"']*["'][^>]*>\s*<\/script>\s*/giu,'');
  body=body.replace('</body>','<script type="module" src="/studio/drive-manual-validation-v138.js?v=138"></script></body>');
  const headers=rewrittenHeaders(response);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Drive-Manual-Validation',DRIVE_MANUAL_VALIDATION_V138_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export async function augmentDriveManualValidationReleaseV138(response){
  const current=await response.json().catch(()=>({}));
  const headers=rewrittenHeaders(response);
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Neptune-Drive-Manual-Validation',DRIVE_MANUAL_VALIDATION_V138_RELEASE);
  return new Response(JSON.stringify({
    ...current,
    driveManualValidation:DRIVE_MANUAL_VALIDATION_V138_RELEASE,
    driveManualValidationMode:'upload-directly-to-drive-then-explicit-studio-validation',
  }),{status:response.status,statusText:response.statusText,headers});
}

async function validateFile({accessToken,studio,orderId,category,folderId,file}){
  let current=file&&typeof file==='object'?file:{};
  const fileId=cleanDriveFileId(current.id);
  const name=String(current.name||'').trim();
  const size=positiveInteger(current.size);
  const mime=String(current.mimeType||'application/octet-stream').toLowerCase();
  const parents=Array.isArray(current.parents)?current.parents.map(String):[];
  if(!fileId||!name||!size||!parents.includes(folderId))return {ok:false,skipped:true,reason:'invalid_file'};
  if(!isSupportedFile(name,mime))return {ok:false,skipped:true,reason:'unsupported_file'};

  const properties=current.appProperties&&typeof current.appProperties==='object'?current.appProperties:{};
  if(properties.neptuneOrderId&&String(properties.neptuneOrderId)!==orderId)return {ok:false,skipped:true,reason:'conflicting_order'};
  if(properties.neptuneCategory&&String(properties.neptuneCategory)!==category)return {ok:false,skipped:true,reason:'conflicting_category'};

  if(name.startsWith(STAGING_PREFIX)){
    const expected=positiveInteger(properties.neptuneExpectedSize);
    const source=String(properties.neptuneSource||'');
    const state=String(properties.neptuneUploadState||'');
    if(source!=='studio-v94'||state!=='uploading'||expected!==size)return {ok:false,skipped:true,reason:'staging_incomplete'};
    current=await patchDriveFile(accessToken,current,{
      name:originalName(name),
      appProperties:{...properties,neptuneUploadState:'complete',neptuneManualValidatedAt:new Date().toISOString()},
    });
    if(!current)return {ok:false,reason:'drive_finalize_failed'};
  }else{
    const needsTag=String(properties.neptuneOrderId||'')!==orderId
      ||String(properties.neptuneCategory||'')!==category
      ||String(properties.neptuneUploadState||'')!=='complete';
    if(needsTag){
      current=await patchDriveFile(accessToken,current,{
        appProperties:{
          ...properties,
          neptuneOrderId:orderId,
          neptuneCategory:category,
          neptuneSource:String(properties.neptuneSource||'manual-drive-v138'),
          neptuneExpectedSize:String(size),
          neptuneUploadState:'complete',
          neptuneManualValidatedAt:String(properties.neptuneManualValidatedAt||new Date().toISOString()),
        },
      });
      if(!current)return {ok:false,reason:'drive_tag_failed'};
    }
  }

  const finalSize=positiveInteger(current.size);
  const finalParents=Array.isArray(current.parents)?current.parents.map(String):parents;
  if(finalSize!==size)return {ok:false,reason:'drive_size_changed'};
  if(!finalParents.includes(folderId))return {ok:false,reason:'drive_parent_changed'};

  const registered=await registerInventory(studio,orderId,category,current);
  return registered.ok?{ok:true,changed:Number(registered.data.changed||0)}:{ok:false,reason:registered.error||'drive_registration_failed'};
}

async function listFolderFiles(accessToken,folderId){
  const files=[];
  let pageToken='';
  for(let page=0;page<5&&files.length<MAX_FILES_PER_FOLDER;page+=1){
    const url=new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q',`'${folderId.replace(/'/gu,"\\'")}' in parents and trashed = false`);
    url.searchParams.set('fields','nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties)');
    url.searchParams.set('pageSize','100');
    url.searchParams.set('supportsAllDrives','true');
    url.searchParams.set('includeItemsFromAllDrives','true');
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const response=await fetch(url.toString(),{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`drive_manual_list_${response.status}`);
    if(Array.isArray(data.files))files.push(...data.files);
    pageToken=String(data.nextPageToken||'');
    if(!pageToken)break;
  }
  return files.slice(0,MAX_FILES_PER_FOLDER);
}

async function patchDriveFile(accessToken,file,patch){
  const fileId=cleanDriveFileId(file?.id);
  if(!fileId)return null;
  const url=new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('supportsAllDrives','true');
  url.searchParams.set('fields','id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties');
  const response=await fetch(url.toString(),{
    method:'PATCH',
    headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','Content-Type':'application/json; charset=UTF-8'},
    body:JSON.stringify(patch),
  });
  const data=await response.json().catch(()=>({}));
  return response.ok?data:null;
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
function cleanId(value){return String(value||'').trim().slice(0,100);}
function cleanDriveFileId(value){const id=String(value||'').trim();return /^[A-Za-z0-9_-]{10,240}$/u.test(id)?id:'';}
function positiveInteger(value){const number=Math.trunc(Number(value||0));return Number.isSafeInteger(number)&&number>0?number:0;}
function originalName(value){return String(value||'').slice(STAGING_PREFIX.length).replace(/[\r\n"\\/]/gu,'_').slice(0,180).trim();}
function isSupportedFile(name,mime){return mime.startsWith('video/')||ALLOWED_MIME.has(mime)||/\.(mp4|mov|m4v|webm|zip)$/iu.test(name);}
function validIso(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'':date.toISOString();}
function safeError(error){return String(error?.message||error||'unknown').slice(0,300);}
function secure(response){const headers=rewrittenHeaders(response);headers.set('Cache-Control','no-store');headers.set('X-Neptune-Drive-Manual-Validation',DRIVE_MANUAL_VALIDATION_V138_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function rewrittenHeaders(response){const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);return headers;}
