const API='/api/admin/webtv/library';
const UPLOAD_PREFIX='webtv/uploads/';
const META_PREFIX='webtv/library-meta/';
const PAGE_SIZE=500;
const MAX_ITEMS=2000;
export const WEBTV_LIBRARY_V125_RELEASE='neptune-webtv-library-20260819-v125';

export function isWebTvLibraryV125Route(pathname){return pathname===API;}

export async function handleWebTvLibraryV125(request,env,ctx,fetchBase){
  if(!isWebTvLibraryV125Route(new URL(request.url).pathname))return null;
  if(!['GET','PATCH','DELETE'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(!sameOrigin(request))return json({error:'origin_forbidden'},403);
  const auth=await studioAuth(request,env,ctx,fetchBase);
  if(!auth.ok)return json({error:'studio_forbidden'},403);
  if(request.method==='GET')return listLibrary(env);
  if(request.method==='PATCH')return updateLibraryItem(request,env,auth.user);
  return deleteLibraryItem(request,env);
}

async function listLibrary(env){
  const [objects,metadata]=await Promise.all([listObjects(env,UPLOAD_PREFIX),listMetadata(env)]);
  const items=objects
    .filter(object=>object.key&&!object.key.endsWith('/'))
    .slice(0,MAX_ITEMS)
    .map(object=>objectToItem(object,metadata.get(assetIdFromKey(object.key))||{}));
  items.sort((a,b)=>String(b.updatedAt||b.uploadedAt||'').localeCompare(String(a.updatedAt||a.uploadedAt||'')));
  return json({ok:true,release:WEBTV_LIBRARY_V125_RELEASE,items});
}

async function updateLibraryItem(request,env,user){
  const body=await request.json().catch(()=>({}));
  const key=keyFromPayload(body);if(!key)return json({error:'media_not_found'},404);
  const head=await env.MEDIA.head(key);if(!head)return json({error:'media_not_found'},404);
  const assetId=assetIdFromKey(key);if(!assetId)return json({error:'invalid_media_key'},400);
  const title=clean(body.title,180)||titleFromKey(key);
  const durationSeconds=clampNumber(body.durationSeconds,0,12*60*60);
  const metaKey=`${META_PREFIX}${assetId}`;
  const customMetadata={title,durationSeconds:String(durationSeconds),updatedAt:new Date().toISOString(),updatedBy:clean(user?.fullName||user?.email||'Studio Admin',180),originalName:clean(body.originalName,220)};
  await env.MEDIA.put(metaKey,new Uint8Array(0),{httpMetadata:{contentType:'application/octet-stream',cacheControl:'no-store'},customMetadata});
  return json({ok:true,item:objectToItem(head,customMetadata)});
}

async function deleteLibraryItem(request,env){
  const body=await request.json().catch(()=>({}));
  const key=keyFromPayload(body);if(!key)return json({error:'media_not_found'},404);
  const head=await env.MEDIA.head(key);if(!head)return json({ok:true,deleted:false});
  const assetId=assetIdFromKey(key);
  const keys=[key];if(assetId)keys.push(`${META_PREFIX}${assetId}`);
  await env.MEDIA.delete(keys);
  return json({ok:true,deleted:true,mediaUrl:publicUrl(key)});
}

async function listObjects(env,prefix){
  const objects=[];let cursor;
  do{
    const page=await env.MEDIA.list({prefix,limit:PAGE_SIZE,cursor,include:['httpMetadata','customMetadata']});
    objects.push(...(page.objects||[]));cursor=page.truncated?page.cursor:undefined;
  }while(cursor&&objects.length<MAX_ITEMS);
  return objects.slice(0,MAX_ITEMS);
}

async function listMetadata(env){
  const map=new Map();let cursor,count=0;
  do{
    const page=await env.MEDIA.list({prefix:META_PREFIX,limit:PAGE_SIZE,cursor,include:['customMetadata']});
    for(const object of page.objects||[]){const id=String(object.key||'').slice(META_PREFIX.length);if(id)map.set(id,object.customMetadata||{});count+=1;if(count>=MAX_ITEMS)break;}
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor&&count<MAX_ITEMS);
  return map;
}

function objectToItem(object,override={}){
  const key=String(object?.key||''),keyMeta=parseKey(key),meta={...(object?.customMetadata||{}),...(override||{})};
  const title=clean(meta.title,180)||keyMeta.title||'Vidéo Web TV';
  const durationSeconds=clampNumber(meta.durationSeconds||keyMeta.durationSeconds,0,12*60*60);
  const uploadedAt=object?.uploaded instanceof Date?object.uploaded.toISOString():'';
  return {id:`upload:${key.slice(UPLOAD_PREFIX.length)}`,assetId:assetIdFromKey(key),title,mediaUrl:publicUrl(key),durationSeconds,size:Number(object?.size||0),contentType:object?.httpMetadata?.contentType||'video/mp4',originalName:clean(meta.originalName,220),uploadedAt,updatedAt:clean(meta.updatedAt,60),updatedBy:clean(meta.updatedBy,180),source:'cloudflare-r2',type:'episode',enabled:true};
}

function keyFromPayload(body){
  const fromId=String(body?.id||'').startsWith('upload:')?String(body.id).slice(7):'';
  if(fromId)return validateKey(`${UPLOAD_PREFIX}${safeDecode(fromId)}`);
  const raw=clean(body?.mediaUrl,800);if(!raw)return'';
  try{
    const url=new URL(raw,'https://neptune.invalid');
    if(!url.pathname.startsWith('/media/webtv/'))return'';
    return validateKey(`${UPLOAD_PREFIX}${safeDecode(url.pathname.slice('/media/webtv/'.length))}`);
  }catch{return'';}
}
function validateKey(key){const value=clean(key,900);if(!value.startsWith(UPLOAD_PREFIX))return'';const tail=value.slice(UPLOAD_PREFIX.length);return tail&&!tail.includes('/')&&!tail.includes('\\')&&!tail.includes('..')?value:'';}
function assetIdFromKey(key){const tail=String(key||'').slice(UPLOAD_PREFIX.length);const match=tail.match(/^([0-9a-f-]{20,})--d\d+--/iu);return match?.[1]||'';}
function parseKey(key){const tail=String(key||'').slice(UPLOAD_PREFIX.length),match=tail.match(/^[0-9a-f-]+--d(\d+)--(.+)\.(mp4|mov|webm|mkv)$/iu);return match?{durationSeconds:Number(match[1]||0),title:match[2]}:{durationSeconds:0,title:''};}
function titleFromKey(key){return parseKey(key).title||'Vidéo Web TV';}
function publicUrl(key){return `/media/webtv/${encodeURIComponent(String(key).slice(UPLOAD_PREFIX.length))}`;}
function sameOrigin(request){const origin=request.headers.get('Origin');if(!origin)return true;try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}}
async function studioAuth(request,env,ctx,fetchBase){const url=new URL(request.url);url.pathname='/api/auth/status';url.search='';const probe=new Request(url.toString(),{method:'GET',headers:request.headers});const response=await fetchBase(probe,env,ctx);if(!response.ok)return{ok:false};const data=await response.json().catch(()=>({})),user=data.user||{};if(data.authenticated===false||!['admin','editor'].includes(String(user.role||'')))return{ok:false};return{ok:true,user};}
function safeDecode(value){try{return decodeURIComponent(String(value||''));}catch{return'';}}
function clean(value,max){return String(value??'').trim().slice(0,max);}
function clampNumber(value,min,max){const n=Number(value||0);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):0;}
function json(payload,status=200){return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Neptune-WebTV-Library':WEBTV_LIBRARY_V125_RELEASE}});}
