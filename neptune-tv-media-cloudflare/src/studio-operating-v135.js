import {adminAuth,clientToken} from './portal-http-utils.js';
import {ensureSalesTunnelV96Schema} from './portal-sales-tunnel-v96.js';
import {requireClient} from './portal-auth.js';
import {requireOperator} from './workflow-db-v5.js';
import {isSameOrigin,json,sanitizeText} from './security.js';

export const STUDIO_OPERATING_V135_RELEASE='neptune-studio-operating-ux-20260821-v135';
export const STUDIO_OPERATING_V135_JS='/studio/studio-operating-v135.js?v=2';
export const STUDIO_OPERATING_V135_CSS='/studio/studio-operating-v135.css?v=2';
export const CLIENT_SOCIAL_V136_RELEASE='neptune-client-social-preview-20260822-v136';
export const CLIENT_SOCIAL_V136_JS='/espace-client/calendrier/client-social-preview-v136.js?v=1';
export const CLIENT_SOCIAL_V136_CSS='/espace-client/calendrier/client-social-preview-v136.css?v=1';
const WIZARD_PATH='/studio/client-passage-wizard-v118.js';
const CATALOG_VISUAL_PATH='/studio/studio-catalog-visual-v132.js';
const CALENDAR_JS_PATH='/espace-client/calendrier/calendar.js';
const CONTACT_API='/api/admin/contact-profile-v135';
const CONTACT_STORE='/portal/studio-contact-v135/upsert';
const CONTENT_CALENDAR_API='/api/client/content-calendar';
const CONTENT_REPLACE_API='/api/client/content-calendar/replace';
const CONTENT_REPLACE_STORE='/portal/content-replace-v136';
const CALENDAR_DOCUMENTS=new Set(['/espace-client/calendrier/','/espace-client/calendrier/index.html']);
const WEBTV_LEGACY_SCRIPTS=['/studio/webtv-workspace-v1.js','/studio/webtv-control-room-v122.js'];
const WEBTV_LEGACY_STYLES=['/studio/webtv-workspace-v1.css','/studio/webtv-control-room-v122.css'];
const SOCIAL_PLATFORMS=['instagram','tiktok','youtube'];
const MIN_REUSE_MS=30*86_400_000;

export async function handleStudioOperatingStoreV135(store,request){
  const url=new URL(request.url);
  if(request.method!=='POST')return null;
  const body=await request.clone().json().catch(()=>({}));
  if(url.pathname===CONTACT_STORE)return upsertStudioContactV135(store,body);
  if(url.pathname===CONTENT_REPLACE_STORE)return replaceClientContentV136(store,body);
  return null;
}

export async function handleStudioOperatingHttpV135(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&CALENDAR_DOCUMENTS.has(url.pathname)){
    const assetUrl=new URL(request.url);assetUrl.pathname='/espace-client/calendrier/index.html';
    const response=await env.ASSETS.fetch(new Request(assetUrl.toString(),request));
    if(response.ok&&(response.headers.get('Content-Type')||'').includes('text/html'))return injectClientSocialDocumentV136(response);
    return response;
  }
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  if(request.method==='GET'&&url.pathname===CONTENT_CALENDAR_API){
    const response=await studio.fetch('https://store/portal/content-calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:clientToken(request)})});
    return response.ok?augmentClientContentCalendarV136(response):response;
  }
  if(request.method==='POST'&&url.pathname===CONTENT_REPLACE_API){
    if(!isSameOrigin(request))return clientSecure(json({error:'origin_forbidden'},403));
    const payload=await request.json().catch(()=>({}));
    const response=await studio.fetch(`https://store${CONTENT_REPLACE_STORE}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:clientToken(request),payload})});
    return clientSecure(response);
  }
  if(request.method==='POST'&&url.pathname===CONTACT_API){
    if(!isSameOrigin(request))return secure(json({error:'origin_forbidden'},403));
    const payload=await request.json().catch(()=>({}));
    return secure(await studio.fetch(`https://store${CONTACT_STORE}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...adminAuth(request),payload}),
    }));
  }
  return null;
}

export async function transformStudioOperatingAssetV135(response,pathname){
  if(pathname===WIZARD_PATH)return hardenPassageWizard(response);
  if(pathname===CATALOG_VISUAL_PATH)return stabilizeCatalogTyping(response);
  if(pathname===CALENDAR_JS_PATH)return bridgeClientCalendarV136(response);
  return response;
}

export async function injectStudioOperatingDocumentV135(response,pathname){
  if(!isStudioOperationalDocument(pathname))return response;
  let body=await response.text();
  body=removeAsset(body,'script',STUDIO_OPERATING_V135_JS.split('?')[0]);
  body=removeAsset(body,'link',STUDIO_OPERATING_V135_CSS.split('?')[0]);
  if(isWebTv(pathname)){
    for(const asset of WEBTV_LEGACY_SCRIPTS)body=removeAsset(body,'script',asset);
    for(const asset of WEBTV_LEGACY_STYLES)body=removeAsset(body,'link',asset);
  }
  body=body.replace('</head>',`<link rel="stylesheet" href="${STUDIO_OPERATING_V135_CSS}"></head>`);
  body=body.replace('</body>',`<script type="module" src="${STUDIO_OPERATING_V135_JS}"></script></body>`);
  const headers=rewritten(response);headers.set('X-Neptune-Studio-Operating-UX',STUDIO_OPERATING_V135_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export async function augmentStudioOperatingReleaseV135(response){
  const current=await response.json().catch(()=>({}));
  const headers=rewritten(response);headers.set('Content-Type','application/json; charset=utf-8');headers.set('X-Neptune-Studio-Operating-UX',STUDIO_OPERATING_V135_RELEASE);headers.set('X-Neptune-Client-Social-Preview',CLIENT_SOCIAL_V136_RELEASE);
  return new Response(JSON.stringify({...current,studioOperatingUx:STUDIO_OPERATING_V135_RELEASE,studioDiffusionLayout:'single-cockpit-no-legacy-workspace-v135',studioAgenda:'global-interactive-v135',studioPassageWizardSecurity:'csrf-refresh-v135',studioCatalogInput:'stable-focus-v135',clientSocialPreview:CLIENT_SOCIAL_V136_RELEASE}),{status:response.status,statusText:response.statusText,headers});
}

export function isStudioOperatingAssetV135(pathname){return pathname===WIZARD_PATH||pathname===CATALOG_VISUAL_PATH||pathname===CALENDAR_JS_PATH;}
export function isStudioOperationalDocumentV135(pathname){return isStudioOperationalDocument(pathname);}

async function upsertStudioContactV135(store,body={}){
  ensureSalesTunnelV96Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=body?.payload&&typeof body.payload==='object'?body.payload:body;
  const email=String(p.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))return json({error:'invalid_contact_email'},400);
  const client=store.sql.exec('SELECT id,full_name AS fullName,company FROM portal_clients WHERE email=? LIMIT 1',email).toArray()[0];
  if(!client)return json({error:'client_not_found'},404);
  const firstName=sanitizeText(p.firstName,80).trim(),lastName=sanitizeText(p.lastName,100).trim();
  const fullName=sanitizeText(`${firstName} ${lastName}`.trim()||p.fullName||client.fullName,180).trim();
  const company=sanitizeText(p.company,180).trim();
  const phone=normalizePhone(p.phone);
  if((p.phone||'')&&!phone)return json({error:'invalid_contact_phone'},400);
  const at=new Date().toISOString();
  store.sql.exec('UPDATE portal_clients SET full_name=?,company=?,active=1,updated_at=? WHERE id=?',fullName||client.fullName,company||client.company||'',at,client.id);
  store.sql.exec('INSERT INTO portal_client_profiles_v96(client_id,phone,updated_at) VALUES(?,?,?) ON CONFLICT(client_id) DO UPDATE SET phone=excluded.phone,updated_at=excluded.updated_at',client.id,phone,at);
  store.audit?.(access.actor?.id||'studio','studio_contact_synced_v135','client',client.id,{email,hasPhone:Boolean(phone)});
  return json({ok:true,release:STUDIO_OPERATING_V135_RELEASE,clientId:client.id,contact:{firstName,lastName,fullName:fullName||client.fullName,email,phone,company:company||client.company||''}});
}

async function replaceClientContentV136(store,body={}){
  const client=await requireClient(store,body.token);if(!client)return json({error:'unauthorized'},401);
  const p=body?.payload&&typeof body.payload==='object'?body.payload:{};
  const occurrenceId=sanitizeText(p.occurrenceId,100),replacementFileId=sanitizeText(p.fileId||p.replacementFileId,100);
  if(!occurrenceId||!replacementFileId)return json({error:'replacement_fields_required'},400);
  const occurrence=store.sql.exec(`SELECT x.id AS occurrenceId,x.file_id AS fileId,x.order_id AS orderId,x.source_schedule_id AS sourceScheduleId,x.publish_at AS publishAt,x.network,x.title,x.description,x.hashtags,x.caption FROM portal_content_occurrences x JOIN portal_orders o ON o.id=x.order_id WHERE x.id=? AND o.client_id=? LIMIT 1`,occurrenceId,client.id).toArray()[0];
  if(!occurrence)return json({error:'content_not_found'},404);
  const published=store.sql.exec(`SELECT platform FROM portal_content_occurrence_publications WHERE occurrence_id=? AND status='published'`,occurrenceId).toArray().map(row=>String(row.platform||'')).filter(Boolean);
  if(published.length)return json({error:'published_content_immutable',publishedPlatforms:published,allowedAction:'create_version'},409);
  const replacement=store.sql.exec(`SELECT f.id AS fileId,f.order_id AS orderId,f.name,LOWER(f.file_type) AS fileType,a.title,a.description,a.hashtags FROM portal_files f JOIN portal_orders o ON o.id=f.order_id LEFT JOIN portal_content_ai a ON a.file_id=f.id WHERE f.id=? AND o.client_id=? AND LOWER(f.file_type) IN ('short','shorts','reel','teaser') LIMIT 1`,replacementFileId,client.id).toArray()[0];
  if(!replacement)return json({error:'replacement_content_not_found'},404);
  const publishTime=new Date(occurrence.publishAt).getTime();
  if(Number.isFinite(publishTime)){
    for(const row of store.sql.exec('SELECT publish_at AS publishAt FROM portal_content_occurrences WHERE file_id=? AND id<>?',replacementFileId,occurrenceId).toArray()){
      const other=new Date(row.publishAt).getTime();if(Number.isFinite(other)&&Math.abs(other-publishTime)<MIN_REUSE_MS)return json({error:'reuse_too_soon',minimumDays:30},409);
    }
  }
  const preserveCopy=p.preserveCopy===true;
  const hashtags=preserveCopy?parseArray(occurrence.hashtags):parseArray(replacement.hashtags);
  const title=sanitizeText(preserveCopy?occurrence.title:(replacement.title||cleanName(replacement.name)),140);
  const description=sanitizeText(preserveCopy?occurrence.description:(replacement.description||''),1800);
  const caption=buildCaption(title,description,hashtags);
  const useIndex=Number(store.sql.exec('SELECT COUNT(*) AS count FROM portal_content_occurrences WHERE file_id=? AND id<>?',replacementFileId,occurrenceId).one().count||0)+1;
  const at=new Date().toISOString();
  store.sql.exec(`UPDATE portal_content_occurrences SET order_id=?,file_id=?,source_schedule_id=NULL,title=?,description=?,hashtags=?,caption=?,use_index=?,status='ready',updated_at=? WHERE id=?`,replacement.orderId,replacement.fileId,title,description,JSON.stringify(hashtags),caption,useIndex,at,occurrenceId);
  if(occurrence.sourceScheduleId)store.sql.exec("UPDATE portal_content_schedule SET status='replaced',updated_at=? WHERE id=?",at,occurrence.sourceScheduleId);
  store.sql.exec("DELETE FROM portal_content_occurrence_publications WHERE occurrence_id=? AND status<>'published'",occurrenceId);
  return json({ok:true,release:CLIENT_SOCIAL_V136_RELEASE,occurrence:{occurrenceId,fileId:replacement.fileId,orderId:replacement.orderId,publishAt:occurrence.publishAt,networks:normalizeNetworks(occurrence.network),title,description,hashtags,caption,useIndex},allowedActions:['edit_copy','edit_schedule','replace_media']});
}

async function augmentClientContentCalendarV136(response){
  const current=await response.json().catch(()=>({}));
  const modes=current.platformModes||{};
  const platformCapabilities=Object.fromEntries(SOCIAL_PLATFORMS.map(platform=>[platform,platformCapability(platform,modes[platform]||'express')]));
  const headers=rewritten(response);headers.set('Content-Type','application/json; charset=utf-8');headers.set('X-Neptune-Client-Social-Preview',CLIENT_SOCIAL_V136_RELEASE);
  return new Response(JSON.stringify({...current,socialPreviewRelease:CLIENT_SOCIAL_V136_RELEASE,platformCapabilities}),{status:response.status,statusText:response.statusText,headers});
}

function platformCapability(platform,mode){
  const api=mode==='api'||mode==='connected';
  const published=['open_external','create_version'];
  if(platform==='youtube'&&api)published.push('edit_metadata','delete_remote');
  return{mode,connected:api,profile:{gridRatio:platform==='instagram'?'3:4':platform==='tiktok'?'3:4':'9:16',sourceRatio:'9:16'},scheduled:{replaceMedia:true,editCopy:true,editSchedule:true,editNetworks:true,allowedActions:['edit_copy','edit_schedule','replace_media']},published:{replaceMedia:false,editMetadata:platform==='youtube'&&api,deleteRemote:platform==='youtube'&&api,allowedActions:published}};
}

async function injectClientSocialDocumentV136(response){
  let body=await response.text();
  body=removeAsset(body,'link',CLIENT_SOCIAL_V136_CSS.split('?')[0]);body=removeAsset(body,'script',CLIENT_SOCIAL_V136_JS.split('?')[0]);
  body=body.replace('</head>',`<link rel="stylesheet" href="${CLIENT_SOCIAL_V136_CSS}"></head>`).replace('</body>',`<script type="module" src="${CLIENT_SOCIAL_V136_JS}"></script></body>`);
  const headers=rewritten(response);headers.set('X-Neptune-Client-Social-Preview',CLIENT_SOCIAL_V136_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function bridgeClientCalendarV136(response){
  const type=response.headers.get('Content-Type')||'';if(!type.includes('javascript')&&!type.includes('text/plain'))return response;
  let body=await response.text();
  if(!body.includes('neptune:content-calendar-refresh'))body+=`\nwindow.addEventListener('neptune:content-calendar-refresh',()=>load({keepMonth:true}));\nwindow.addEventListener('neptune:content-calendar-open',event=>{const occurrenceId=String(event.detail?.occurrenceId||'');if(!occurrenceId)return;switchView('calendar');openEditor(occurrenceId);});\n`;
  const headers=rewritten(response);headers.set('Content-Type','application/javascript; charset=utf-8');headers.set('X-Neptune-Client-Social-Preview',CLIENT_SOCIAL_V136_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function hardenPassageWizard(response){
  const type=response.headers.get('Content-Type')||'';if(!type.includes('javascript')&&!type.includes('text/plain'))return response;
  let body=await response.text();
  const legacy="async function loadContext(){try{const [clients,catalog,sales]=await Promise.all([get('/api/admin/clients'),post('/api/admin/media-catalog-v98/context',{}),get('/api/reservation/catalog-v96').catch(()=>({cities:[]}))]);";
  const hardened="async function loadContext(){try{const auth=await get('/api/auth/status');if(auth.csrfToken)sessionStorage.setItem('neptune_csrf',auth.csrfToken);const [clients,catalog,sales]=await Promise.all([get('/api/admin/clients'),post('/api/admin/media-catalog-v98/context',{},true),get('/api/reservation/catalog-v96').catch(()=>({cities:[]}))]);";
  if(body.includes(legacy))body=body.replace(legacy,hardened);
  else if(!body.includes("post('/api/admin/media-catalog-v98/context',{},true)"))throw new Error('studio_v135_wizard_contract_changed');
  if(!body.includes("dataset.passageWizardSecurity='v135'"))body=body.replace("document.body.dataset.passageWizardV118=RELEASE;","document.body.dataset.passageWizardV118=RELEASE;document.body.dataset.passageWizardSecurity='v135';");
  const headers=rewritten(response);headers.set('Content-Type','application/javascript; charset=utf-8');headers.set('X-Neptune-Passage-Wizard-Security',STUDIO_OPERATING_V135_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

async function stabilizeCatalogTyping(response){
  const type=response.headers.get('Content-Type')||'';if(!type.includes('javascript')&&!type.includes('text/plain'))return response;
  let body=await response.text();
  const legacy="if(event.target.matches('[data-v132-search]')){state.query=event.target.value;render();}";
  const stable="if(event.target.matches('[data-v132-search]')){state.query=event.target.value;renderCatalogResultsV135();}";
  if(body.includes(legacy))body=body.replace(legacy,stable);
  else if(!body.includes('renderCatalogResultsV135()'))throw new Error('studio_v135_catalog_input_contract_changed');
  if(!body.includes('function renderCatalogResultsV135()'))body+=`\nfunction renderCatalogResultsV135(){const content=$('.v132-content');if(!content)return;content.innerHTML=state.mode==='structure'?renderStructure():renderCatalog();}\n`;
  const headers=rewritten(response);headers.set('Content-Type','application/javascript; charset=utf-8');headers.set('X-Neptune-Catalog-Input-Stability',STUDIO_OPERATING_V135_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function normalizePhone(value){const raw=String(value||'').trim();if(!raw)return'';const phone=raw.replace(/[^0-9+().\s-]/gu,'').trim().slice(0,40);return phone.replace(/\D/gu,'').length>=8?phone:'';}
function normalizeNetworks(value){return[...new Set(String(value||'').split(',').map(v=>v.trim().toLowerCase()).filter(v=>SOCIAL_PLATFORMS.includes(v)))];}
function parseArray(value){if(Array.isArray(value))return value;try{const parsed=JSON.parse(String(value||'[]'));return Array.isArray(parsed)?parsed:[];}catch{return[];}}
function buildCaption(title,description,hashtags){return[title,description,(hashtags||[]).map(tag=>`#${String(tag).replace(/^#+/u,'')}`).join(' ')].filter(Boolean).join('\n\n').slice(0,2200);}
function cleanName(value){return String(value||'').replace(/\.[a-z0-9]{2,5}$/iu,'').replace(/[_-]+/gu,' ').trim();}
function isStudioOperationalDocument(path){return isClients(path)||isWebTv(path);}
function isClients(path){return path==='/studio/clients'||path==='/studio/clients/'||path==='/studio/clients.html';}
function isWebTv(path){return path==='/studio/webtv'||path==='/studio/webtv/'||path==='/studio/webtv.html';}
function secure(response){const headers=rewritten(response);headers.set('X-Neptune-Studio-Operating-UX',STUDIO_OPERATING_V135_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function clientSecure(response){const headers=rewritten(response);headers.set('X-Neptune-Client-Social-Preview',CLIENT_SOCIAL_V136_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function rewritten(response){const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);headers.set('Cache-Control','private, no-store, max-age=0');return headers;}
function removeAsset(body,type,path){const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');return type==='link'?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),''):body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');}