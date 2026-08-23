import {adminAuth} from './portal-http-utils.js';
import {ensureSalesTunnelV96Schema} from './portal-sales-tunnel-v96.js';
import {requireOperator} from './workflow-db-v5.js';
import {isSameOrigin,json,sanitizeText} from './security.js';

export const STUDIO_OPERATING_V135_RELEASE='neptune-studio-operating-ux-20260821-v135';
export const STUDIO_OPERATING_V135_JS='/studio/studio-operating-v135.js?v=2';
export const STUDIO_OPERATING_V135_CSS='/studio/studio-operating-v135.css?v=2';
const WIZARD_PATH='/studio/client-passage-wizard-v118.js';
const CATALOG_VISUAL_PATH='/studio/studio-catalog-visual-v132.js';
const CONTACT_API='/api/admin/contact-profile-v135';
const CONTACT_STORE='/portal/studio-contact-v135/upsert';
const WEBTV_MONITOR_CONTROLS_V135='/studio/webtv-monitor-controls-v135.js?v=1';
const WEBTV_LEGACY_SCRIPTS=['/studio/webtv-workspace-v1.js','/studio/webtv-control-room-v122.js'];
const WEBTV_LEGACY_STYLES=['/studio/webtv-workspace-v1.css','/studio/webtv-control-room-v122.css'];

export async function handleStudioOperatingStoreV135(store,request){
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!==CONTACT_STORE)return null;
  const body=await request.clone().json().catch(()=>({}));
  return upsertStudioContactV135(store,body);
}

export async function handleStudioOperatingHttpV135(request,env){
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!==CONTACT_API)return null;
  if(!isSameOrigin(request))return secure(json({error:'origin_forbidden'},403));
  const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const payload=await request.json().catch(()=>({}));
  return secure(await studio.fetch(`https://store${CONTACT_STORE}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...adminAuth(request),payload}),
  }));
}

export async function transformStudioOperatingAssetV135(response,pathname){
  if(pathname===WIZARD_PATH)return hardenPassageWizard(response);
  if(pathname===CATALOG_VISUAL_PATH)return stabilizeCatalogTyping(response);
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
    body=removeAsset(body,'script',WEBTV_MONITOR_CONTROLS_V135.split('?')[0]);
  }
  body=body.replace('</head>',`<link rel="stylesheet" href="${STUDIO_OPERATING_V135_CSS}"></head>`);
  const webTvMonitor=isWebTv(pathname)?`<script type="module" src="${WEBTV_MONITOR_CONTROLS_V135}"></script>`:'';
  body=body.replace('</body>',`${webTvMonitor}<script type="module" src="${STUDIO_OPERATING_V135_JS}"></script></body>`);
  const headers=rewritten(response);headers.set('X-Neptune-Studio-Operating-UX',STUDIO_OPERATING_V135_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export async function augmentStudioOperatingReleaseV135(response){
  const current=await response.json().catch(()=>({}));
  const headers=rewritten(response);headers.set('Content-Type','application/json; charset=utf-8');headers.set('X-Neptune-Studio-Operating-UX',STUDIO_OPERATING_V135_RELEASE);
  return new Response(JSON.stringify({...current,studioOperatingUx:STUDIO_OPERATING_V135_RELEASE,studioDiffusionLayout:'single-cockpit-no-legacy-workspace-v135',studioAgenda:'global-interactive-v135',studioPassageWizardSecurity:'csrf-refresh-v135',studioCatalogInput:'stable-focus-v135'}),{status:response.status,statusText:response.statusText,headers});
}

export function isStudioOperatingAssetV135(pathname){return pathname===WIZARD_PATH||pathname===CATALOG_VISUAL_PATH;}
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
  if(!body.includes('function renderCatalogResultsV135()')){
    body+=`\nfunction renderCatalogResultsV135(){const content=$('.v132-content');if(!content)return;content.innerHTML=state.mode==='structure'?renderStructure():renderCatalog();}\n`;
  }
  const headers=rewritten(response);headers.set('Content-Type','application/javascript; charset=utf-8');headers.set('X-Neptune-Catalog-Input-Stability',STUDIO_OPERATING_V135_RELEASE);
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

function normalizePhone(value){const raw=String(value||'').trim();if(!raw)return'';const phone=raw.replace(/[^0-9+().\s-]/gu,'').trim().slice(0,40);return phone.replace(/\D/gu,'').length>=8?phone:'';}
function isStudioOperationalDocument(path){return isClients(path)||isWebTv(path);}
function isClients(path){return path==='/studio/clients'||path==='/studio/clients/'||path==='/studio/clients.html';}
function isWebTv(path){return path==='/studio/webtv'||path==='/studio/webtv/'||path==='/studio/webtv.html';}
function secure(response){const headers=rewritten(response);headers.set('X-Neptune-Studio-Operating-UX',STUDIO_OPERATING_V135_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function rewritten(response){const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);headers.set('Cache-Control','private, no-store, max-age=0');return headers;}
function removeAsset(body,type,path){const escaped=path.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');return type==='link'?body.replace(new RegExp(`<link\\b[^>]*href=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*`,'giu'),''):body.replace(new RegExp(`<script\\b[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>\\s*`,'giu'),'');}
