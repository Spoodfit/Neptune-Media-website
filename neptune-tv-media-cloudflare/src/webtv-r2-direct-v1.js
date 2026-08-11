import { AwsClient } from 'aws4fetch';

export const DIRECT_R2_TRANSPORT='direct-r2-s3-v1';
export const DIRECT_R2_BUCKET='neptune-media-assets';
const PRESIGN_TTL_SECONDS=30*60;
const S3_RETRIES=3;

export function directR2Configured(env){
  return Boolean(endpoint(env)&&clean(env?.R2_ACCESS_KEY_ID,200)&&clean(env?.R2_SECRET_ACCESS_KEY,300));
}

export async function createDirectMultipart(env,key,{contentType='application/octet-stream',cacheControl='public, max-age=3600',metadata={}}={}){
  requireConfig(env);
  const headers=new Headers({'Content-Type':contentType,'Cache-Control':cacheControl});
  for(const [name,value] of Object.entries(metadata||{})){
    const safeName=String(name||'').toLowerCase().replace(/[^a-z0-9-]/gu,'').slice(0,80);
    if(!safeName)continue;
    headers.set(`x-amz-meta-${safeName}`,encodeMeta(value));
  }
  const response=await client(env).fetch(`${objectUrl(env,key)}?uploads`,{method:'POST',headers});
  const text=await response.text();
  if(!response.ok)throw providerError('r2_direct_init_failed',response.status,text);
  const uploadId=xmlTag(text,'UploadId');
  if(!uploadId)throw providerError('r2_direct_init_invalid',502,text);
  return{uploadId,transport:DIRECT_R2_TRANSPORT};
}

export async function presignDirectPart(env,key,uploadId,partNumber){
  requireConfig(env);
  const url=new URL(objectUrl(env,key));
  url.searchParams.set('partNumber',String(partNumber));
  url.searchParams.set('uploadId',String(uploadId));
  url.searchParams.set('X-Amz-Expires',String(PRESIGN_TTL_SECONDS));
  const signed=await client(env).sign(url.toString(),{method:'PUT',aws:{signQuery:true}});
  return{url:signed.url,expiresIn:PRESIGN_TTL_SECONDS,transport:DIRECT_R2_TRANSPORT};
}

export async function completeDirectMultipart(env,key,uploadId,parts){
  requireConfig(env);
  const url=new URL(objectUrl(env,key));
  url.searchParams.set('uploadId',String(uploadId));
  const body=`<CompleteMultipartUpload>${parts.map(part=>`<Part><PartNumber>${Number(part.partNumber)}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  const response=await client(env).fetch(url.toString(),{method:'POST',headers:{'Content-Type':'application/xml'},body});
  const text=await response.text();
  if(!response.ok)throw providerError('r2_direct_complete_failed',response.status,text);
  return{ok:true,etag:xmlTag(text,'ETag'),transport:DIRECT_R2_TRANSPORT};
}

export async function abortDirectMultipart(env,key,uploadId){
  if(!directR2Configured(env))return{ok:false,skipped:true};
  const url=new URL(objectUrl(env,key));
  url.searchParams.set('uploadId',String(uploadId));
  const response=await client(env).fetch(url.toString(),{method:'DELETE'});
  if(!response.ok&&response.status!==404){
    const text=await response.text().catch(()=> '');
    throw providerError('r2_direct_abort_failed',response.status,text);
  }
  return{ok:true,transport:DIRECT_R2_TRANSPORT};
}

function client(env){
  return new AwsClient({
    accessKeyId:clean(env.R2_ACCESS_KEY_ID,200),
    secretAccessKey:clean(env.R2_SECRET_ACCESS_KEY,300),
    service:'s3',
    region:'auto',
    retries:S3_RETRIES,
    initRetryMs:200,
  });
}

function endpoint(env){
  const explicit=clean(env?.R2_S3_ENDPOINT,300).replace(/\/+$/u,'');
  if(explicit){
    try{const url=new URL(explicit);if(url.protocol==='https:'&&/\.r2\.cloudflarestorage\.com$/iu.test(url.hostname))return url.origin;}catch{}
  }
  const accountId=clean(env?.R2_ACCOUNT_ID,80);
  return accountId?`https://${accountId}.r2.cloudflarestorage.com`:'';
}

function objectUrl(env,key){
  const encodedKey=String(key||'').split('/').map(segment=>encodeURIComponent(segment)).join('/');
  return`${endpoint(env)}/${DIRECT_R2_BUCKET}/${encodedKey}`;
}

function requireConfig(env){if(!directR2Configured(env))throw providerError('direct_r2_not_configured',503,'R2 direct endpoint or credentials missing');}
function xmlTag(xml,name){const match=String(xml||'').match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`,'iu'));return match?decodeXml(match[1]).trim():'';}
function encodeMeta(value){return encodeURIComponent(String(value??'').slice(0,900));}
export function decodeDirectMeta(value){try{return decodeURIComponent(String(value??''));}catch{return String(value??'');}}
function escapeXml(value){return String(value??'').replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&apos;');}
function decodeXml(value){return String(value??'').replace(/&quot;/gu,'"').replace(/&apos;/gu,"'").replace(/&gt;/gu,'>').replace(/&lt;/gu,'<').replace(/&amp;/gu,'&');}
function providerError(code,status,detail){const error=new Error(code);error.code=code;error.status=Number(status||0);error.detail=String(detail||'').replace(/\s+/gu,' ').trim().slice(0,600);return error;}
function clean(value,max){return String(value??'').trim().slice(0,max);}
