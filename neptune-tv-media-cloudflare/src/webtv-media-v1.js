const API_PREFIX='/api/admin/webtv/media';
const PUBLIC_PREFIX='/media/webtv/';
const R2_PREFIX='webtv/uploads/';
const MAX_FILE_BYTES=20*1024*1024*1024;
const MULTIPART_CHUNK_BYTES=10*1024*1024;
const LIST_PAGE_SIZE=500;
const MAX_LIBRARY_ITEMS=2000;
export const WEBTV_MEDIA_RELEASE='neptune-webtv-media-20260811-v3';

export function isWebTvMediaRoute(pathname){
  return pathname===API_PREFIX||pathname.startsWith(`${API_PREFIX}/`)||pathname.startsWith(PUBLIC_PREFIX);
}

export async function handleWebTvMediaRequest(request,env,{user=null,authenticated=false}={}){
  const url=new URL(request.url);
  if(url.pathname.startsWith(PUBLIC_PREFIX))return servePublicMedia(request,env,url);
  if(!url.pathname.startsWith(API_PREFIX))return null;
  if(!authenticated)return json({error:'studio_forbidden'},403);
  if(!sameOrigin(request))return json({error:'origin_forbidden'},403);

  if(request.method==='GET'&&url.pathname===API_PREFIX)return listMedia(env);
  if(request.method==='POST'&&url.pathname===`${API_PREFIX}/init`)return initUpload(request,env,user);
  if(request.method==='PUT'&&url.pathname===`${API_PREFIX}/part`)return uploadPart(request,env,url);
  if(request.method==='POST'&&url.pathname===`${API_PREFIX}/complete`)return completeUpload(request,env);
  if(request.method==='POST'&&url.pathname===`${API_PREFIX}/abort`)return abortUpload(request,env);
  return json({error:'not_found'},404);
}

async function listMedia(env){
  const objects=[];
  let cursor;
  do{
    const page=await env.MEDIA.list({prefix:R2_PREFIX,limit:LIST_PAGE_SIZE,cursor,include:['httpMetadata','customMetadata']});
    objects.push(...(page.objects||[]));
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor&&objects.length<MAX_LIBRARY_ITEMS);
  const items=objects.slice(0,MAX_LIBRARY_ITEMS).filter(object=>object.key&&!object.key.endsWith('/')).map(object=>objectToMedia(object));
  items.sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')));
  return json({ok:true,release:WEBTV_MEDIA_RELEASE,items,truncated:Boolean(cursor)});
}

async function initUpload(request,env,user){
  const body=await request.json().catch(()=>({}));
  const originalName=clean(body.filename,220);
  const size=Number(body.size||0);
  const mime=normalizeMime(body.type,originalName);
  const durationSeconds=clampNumber(body.durationSeconds,0,12*60*60);
  const title=clean(body.title,180)||titleFromFilename(originalName)||'Vidéo Web TV';
  if(!originalName)return json({error:'filename_required'},400);
  if(!Number.isFinite(size)||size<=0||size>MAX_FILE_BYTES)return json({error:'invalid_file_size',maxBytes:MAX_FILE_BYTES},413);
  if(!isVideoType(mime,originalName))return json({error:'unsupported_video_type'},415);

  const id=crypto.randomUUID();
  const ext=safeExtension(originalName,mime);
  const key=`${R2_PREFIX}${id}-${slug(title)}${ext}`;
  const uploadedAt=new Date().toISOString();
  const upload=await env.MEDIA.createMultipartUpload(key,{
    httpMetadata:{contentType:mime,cacheControl:'public, max-age=3600'},
    customMetadata:{
      title,
      originalName:originalName.slice(0,220),
      durationSeconds:String(durationSeconds||0),
      uploadedAt,
      uploadedBy:clean(user?.fullName||user?.email||'Studio Admin',180),
      release:WEBTV_MEDIA_RELEASE,
    },
  });
  return json({ok:true,uploadId:upload.uploadId,key,mediaUrl:publicUrlForKey(key),title,durationSeconds,chunkSize:MULTIPART_CHUNK_BYTES});
}

async function uploadPart(request,env,url){
  const key=validateUploadKey(url.searchParams.get('key'));
  const uploadId=clean(url.searchParams.get('uploadId'),300);
  const partNumber=Number(url.searchParams.get('partNumber')||0);
  if(!key||!uploadId||!Number.isInteger(partNumber)||partNumber<1||partNumber>10000)return json({error:'invalid_upload_part'},400);
  if(!request.body)return json({error:'empty_upload_part'},400);

  const contentLength=Number(request.headers.get('Content-Length')||0);
  if(Number.isFinite(contentLength)&&contentLength>0&&contentLength>MULTIPART_CHUNK_BYTES)return json({error:'upload_part_too_large',maxBytes:MULTIPART_CHUNK_BYTES},413);

  try{
    const multipart=env.MEDIA.resumeMultipartUpload(key,uploadId);
    // Keep the request body as a stream all the way into R2. Cloudflare's
    // Worker multipart API is designed for this path and it avoids buffering
    // every video part in Worker memory before R2 receives it.
    const part=await multipart.uploadPart(partNumber,request.body);
    return json({ok:true,partNumber,etag:part.etag});
  }catch(error){
    const detail=clean(error?.message||String(error||'R2 multipart upload failed'),400);
    const providerCode=clean(error?.code||error?.name||'',120);
    return json({error:'upload_part_failed',detail,providerCode,stage:'r2'},503);
  }
}

async function completeUpload(request,env){
  const body=await request.json().catch(()=>({}));
  const key=validateUploadKey(body.key);
  const uploadId=clean(body.uploadId,300);
  const parts=Array.isArray(body.parts)?body.parts.map(part=>({partNumber:Number(part.partNumber),etag:clean(part.etag,300)})).filter(part=>Number.isInteger(part.partNumber)&&part.partNumber>0&&part.etag):[];
  if(!key||!uploadId||!parts.length)return json({error:'invalid_complete_payload'},400);
  parts.sort((a,b)=>a.partNumber-b.partNumber);
  try{
    const multipart=env.MEDIA.resumeMultipartUpload(key,uploadId);
    const object=await multipart.complete(parts);
    const head=await env.MEDIA.head(key);
    return json({ok:true,item:objectToMedia(head||object,key)});
  }catch(error){
    return json({error:'upload_complete_failed',detail:clean(error?.message,240)},502);
  }
}

async function abortUpload(request,env){
  const body=await request.json().catch(()=>({}));
  const key=validateUploadKey(body.key);
  const uploadId=clean(body.uploadId,300);
  if(!key||!uploadId)return json({error:'invalid_abort_payload'},400);
  try{await env.MEDIA.resumeMultipartUpload(key,uploadId).abort();}catch{}
  return json({ok:true});
}

async function servePublicMedia(request,env,url){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405});
  const tail=safeDecode(url.pathname.slice(PUBLIC_PREFIX.length));
  if(!tail||tail.includes('/')||tail.includes('\\')||tail.includes('..'))return new Response('Not Found',{status:404});
  const key=`${R2_PREFIX}${tail}`;
  const head=await env.MEDIA.head(key);
  if(!head)return new Response('Not Found',{status:404});
  const headers=new Headers();
  head.writeHttpMetadata?.(headers);
  headers.set('Accept-Ranges','bytes');
  if(head.httpEtag||head.etag)headers.set('ETag',head.httpEtag||head.etag);
  headers.set('Cache-Control',head.httpMetadata?.cacheControl||'public, max-age=3600');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Neptune-WebTV-Media',WEBTV_MEDIA_RELEASE);
  if(request.method==='HEAD'){
    headers.set('Content-Length',String(head.size||0));
    return new Response(null,{status:200,headers});
  }

  const range=parseRange(request.headers.get('Range'),Number(head.size||0));
  if(range===false){headers.set('Content-Range',`bytes */${head.size||0}`);return new Response(null,{status:416,headers});}
  const object=range?await env.MEDIA.get(key,{range}):await env.MEDIA.get(key);
  if(!object)return new Response('Not Found',{status:404});
  if(range){
    const end=range.offset+range.length-1;
    headers.set('Content-Range',`bytes ${range.offset}-${end}/${head.size}`);
    headers.set('Content-Length',String(range.length));
    return new Response(object.body,{status:206,headers});
  }
  headers.set('Content-Length',String(head.size||0));
  return new Response(object.body,{status:200,headers});
}

function objectToMedia(object,keyOverride=''){
  const key=String(keyOverride||object?.key||'');
  const meta=object?.customMetadata||{};
  return{
    id:`upload:${key.split('/').pop()||crypto.randomUUID()}`,
    title:clean(meta.title,180)||titleFromFilename(meta.originalName||key.split('/').pop()||'Vidéo Web TV'),
    mediaUrl:publicUrlForKey(key),
    durationSeconds:clampNumber(meta.durationSeconds,0,12*60*60),
    size:Number(object?.size||0),
    contentType:object?.httpMetadata?.contentType||'video/mp4',
    originalName:clean(meta.originalName,220),
    uploadedAt:clean(meta.uploadedAt,60),
    uploadedBy:clean(meta.uploadedBy,180),
    type:'episode',enabled:true,
  };
}

function publicUrlForKey(key){return `${PUBLIC_PREFIX}${encodeURIComponent(String(key).slice(R2_PREFIX.length))}`;}
function validateUploadKey(value){const key=clean(value,500);if(!key.startsWith(R2_PREFIX))return'';const tail=key.slice(R2_PREFIX.length);return tail&&!tail.includes('/')&&!tail.includes('\\')&&!tail.includes('..')?key:'';}
function parseRange(value,size){
  if(!value)return null;
  const match=String(value).match(/^bytes=(\d*)-(\d*)$/u);if(!match||!size)return false;
  let start=match[1]?Number(match[1]):null,end=match[2]?Number(match[2]):null;
  if(start===null){const suffix=end;if(!Number.isFinite(suffix)||suffix<=0)return false;start=Math.max(0,size-suffix);end=size-1;}
  else{if(!Number.isFinite(start)||start<0||start>=size)return false;end=Number.isFinite(end)?Math.min(end,size-1):size-1;if(end<start)return false;}
  return{offset:start,length:end-start+1};
}
function normalizeMime(value,name){const raw=clean(value,120).toLowerCase();if(raw.startsWith('video/'))return raw;if(/\.mp4$/iu.test(name))return'video/mp4';if(/\.mov$/iu.test(name))return'video/quicktime';if(/\.webm$/iu.test(name))return'video/webm';if(/\.mkv$/iu.test(name))return'video/x-matroska';return raw||'application/octet-stream';}
function isVideoType(mime,name){return mime.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/iu.test(name);}
function safeExtension(name,mime){const match=String(name).toLowerCase().match(/\.(mp4|mov|webm|mkv)$/u);if(match)return`.${match[1]}`;return mime==='video/webm'?'.webm':mime==='video/quicktime'?'.mov':mime==='video/x-matroska'?'.mkv':'.mp4';}
function titleFromFilename(name){return clean(String(name||'').replace(/\.[^.]+$/u,'').replace(/[_-]+/gu,' ').replace(/\s+/gu,' '),180);}
function slug(value){const s=String(value||'video').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,60);return s||'video';}
function safeDecode(value){try{return decodeURIComponent(value);}catch{return'';}}
function clean(value,max){return String(value??'').trim().slice(0,max);}
function clampNumber(value,min,max){const n=Number(value||0);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):0;}
function sameOrigin(request){const origin=request.headers.get('Origin');if(!origin)return true;try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}}
function json(payload,status=200){return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Neptune-WebTV-Media':WEBTV_MEDIA_RELEASE}});}
