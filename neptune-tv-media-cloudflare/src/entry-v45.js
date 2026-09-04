import base,{StudioStore as BaseStudioStore,WebTvEncoder} from './entry-v44.js';
import {ensureSalesTunnelV96Schema} from './portal-sales-tunnel-v96.js';
import {requireOperator} from './workflow-db-v5.js';
import {adminAuth} from './portal-http-utils.js';
import {isSameOrigin,json,randomToken,sanitizeText,sha256} from './security.js';
import {reservationDatePolicyV173} from './reservation-policy-v173.js';

export {WebTvEncoder};

const RELEASE='neptune-sales-journey-20260831-v165';
const TOKEN_TTL_SECONDS=7*24*60*60;
const STUDIO_CALLBACK_JS='/studio/studio-callbacks-v165.js?v=1';
const STUDIO_CALLBACK_CSS='/studio/studio-callbacks-v165.css?v=1';

export class StudioStore extends BaseStudioStore{
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/sales-v165/anonymous'&&request.method==='POST')return createAnonymousProspect(this);
    if(url.pathname==='/sales-v165/callback'&&request.method==='POST')return createCallback(this,await request.json().catch(()=>({})));
    if(url.pathname==='/sales-v165/callbacks'&&request.method==='POST')return listCallbacks(this,await request.json().catch(()=>({})));
    if(url.pathname==='/sales-v165/callback-resolve'&&request.method==='POST')return resolveCallback(this,await request.json().catch(()=>({})));
    return super.fetch(request);
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/reservation/prospect/anonymous-v165'&&request.method==='POST'){
      if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
      return callStore(env,'/sales-v165/anonymous',{});
    }
    if(url.pathname==='/api/reservation/callback-v165'&&request.method==='POST'){
      if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
      const payload=await request.json().catch(()=>({}));
      const response=await callStore(env,'/sales-v165/callback',payload),data=await response.clone().json().catch(()=>({}));
      if(response.ok)ctx?.waitUntil?.(sendCallbackEmail(env,data).catch(error=>console.error('callback_email_failed',String(error?.message||error))));
      return response;
    }
    if(url.pathname==='/api/admin/callbacks-v165'&&request.method==='GET')return callStore(env,'/sales-v165/callbacks',adminAuth(request));
    if(url.pathname==='/api/admin/callbacks-v165/resolve'&&request.method==='POST'){
      if(!isSameOrigin(request))return json({error:'origin_forbidden'},403);
      const payload=await request.json().catch(()=>({}));
      return callStore(env,'/sales-v165/callback-resolve',{...adminAuth(request),id:payload.id});
    }
    if(request.method==='POST'&&(url.pathname==='/api/reservation/selection-v96'||url.pathname==='/api/reservation/selection')){
      const payload=await request.clone().json().catch(()=>({}));
      if(payload.requestedDate){
        const policy=reservationDatePolicyV173(payload.requestedDate);
        if(!policy.ok)return json({error:policy.reason==='lead_time'?'reservation_lead_time_15_days':'invalid_requested_date',policy},400);
      }
    }
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')&&isStudio(url.pathname))response=await injectStudioCallbacks(response);
    return response;
  },
  scheduled:base.scheduled,
};

async function createAnonymousProspect(store){
  ensureSalesTunnelV96Schema(store);
  const now=new Date(),at=now.toISOString(),clientId=crypto.randomUUID(),prospectId=crypto.randomUUID(),email=`visitor+${prospectId.replace(/-/g,'')}@pending.neptune.invalid`,token=randomToken(32),tokenHash=await sha256(token),expiresAt=new Date(now.getTime()+TOKEN_TTL_SECONDS*1000).toISOString();
  store.sql.exec('INSERT INTO portal_clients(id,email,full_name,company,active,created_at,updated_at,last_access_at) VALUES(?,?,?,?,1,?,?,NULL)',clientId,email,'Prospect Neptune Media','',at,at);
  store.sql.exec('INSERT INTO portal_client_profiles_v96(client_id,phone,updated_at) VALUES(?,?,?)',clientId,'',at);
  store.sql.exec(`INSERT INTO portal_prospects(id,client_id,first_name,last_name,company,email,token_hash,status,source,intent,consent_at,expires_at,created_at,updated_at,tunnel_started_at,paid_at,order_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,prospectId,clientId,'','','',email,tokenHash,'captured','neptune_media_tunnel_v165_direct_concept','book_passage',at,expiresAt,at,at);
  store.sql.exec("INSERT INTO portal_reservation_intents_v96(prospect_id,status,created_at,updated_at) VALUES(?,'contact_captured',?,?)",prospectId,at,at);
  return json({ok:true,release:RELEASE,token,prospectId,expiresIn:TOKEN_TTL_SECONDS});
}

async function createCallback(store,raw={}){
  ensureSalesTunnelV96Schema(store);ensureCallbackSchema(store);
  const firstName=sanitizeText(raw.firstName,80).trim(),lastName=sanitizeText(raw.lastName,100).trim(),email=String(raw.email||'').trim().toLowerCase().slice(0,240),phone=normalizePhone(raw.phone),page=sanitizeText(raw.page||'/reserver',180);
  if(!firstName||!lastName||!validEmail(email)||!phone)return json({error:'callback_contact_invalid'},400);
  const now=new Date(),requestedAt=now.toISOString(),dueAt=new Date(now.getTime()+24*3600000).toISOString(),id=crypto.randomUUID();
  let prospectId='',clientId='';
  const token=String(raw.reservationToken||'').trim();
  if(token){const hash=await sha256(token),row=store.sql.exec('SELECT id,client_id AS clientId FROM portal_prospects WHERE token_hash=? LIMIT 1',hash).toArray()[0];if(row){prospectId=row.id;clientId=row.clientId||'';}}
  store.sql.exec(`INSERT INTO portal_prospect_callbacks_v165(id,prospect_id,client_id,first_name,last_name,email,phone,page,status,requested_at,due_at,resolved_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'pending',?,?,NULL,?,?)`,id,prospectId,clientId,firstName,lastName,email,phone,page,requestedAt,dueAt,requestedAt,requestedAt);
  return json({ok:true,release:RELEASE,callback:{id,firstName,lastName,email,phone,requestedAt,dueAt,prospectId,clientId}});
}

async function listCallbacks(store,body={}){
  ensureCallbackSchema(store);const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const callbacks=store.sql.exec(`SELECT id,prospect_id AS prospectId,client_id AS clientId,first_name AS firstName,last_name AS lastName,email,phone,page,status,requested_at AS requestedAt,due_at AS dueAt,resolved_at AS resolvedAt FROM portal_prospect_callbacks_v165 WHERE status='pending' ORDER BY due_at ASC`).toArray();
  return json({ok:true,release:RELEASE,callbacks});
}

async function resolveCallback(store,body={}){
  ensureCallbackSchema(store);const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const id=String(body.id||'').trim();if(!id)return json({error:'callback_id_required'},400);
  const at=new Date().toISOString();store.sql.exec("UPDATE portal_prospect_callbacks_v165 SET status='resolved',resolved_at=?,updated_at=? WHERE id=?",at,at,id);
  return json({ok:true,id,resolvedAt:at});
}

function ensureCallbackSchema(store){
  store.sql.exec(`CREATE TABLE IF NOT EXISTS portal_prospect_callbacks_v165(id TEXT PRIMARY KEY,prospect_id TEXT NOT NULL DEFAULT '',client_id TEXT NOT NULL DEFAULT '',first_name TEXT NOT NULL,last_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,page TEXT NOT NULL DEFAULT '/reserver',status TEXT NOT NULL DEFAULT 'pending',requested_at TEXT NOT NULL,due_at TEXT NOT NULL,resolved_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS idx_callbacks_v165_pending ON portal_prospect_callbacks_v165(status,due_at);`);
}

async function sendCallbackEmail(env,data){
  if(!env.RESEND_API_KEY||!data?.callback)return;
  const c=data.callback,from=env.RESEND_FROM_EMAIL||'Neptune Media <contact@media.neptunebusiness.com>';
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:['contact@neptunebusiness.com'],reply_to:c.email,subject:`Rappel demandé · ${c.firstName} ${c.lastName}`,text:`Un prospect Neptune Media souhaite être rappelé sous 24 heures.\n\nNom : ${c.firstName} ${c.lastName}\nTéléphone : ${c.phone}\nE-mail : ${c.email}\nÉchéance : ${c.dueAt}\n\nLa demande est également visible dans le Studio.`})});
  if(!response.ok)throw new Error(`resend_${response.status}`);
}

function normalizePhone(value){const raw=String(value||'').trim(),digits=raw.replace(/\D/g,'');return digits.length>=8&&digits.length<=15?raw.slice(0,40):'';}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(String(value||''));}
function callStore(env,path,body){const studio=env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));return studio.fetch(`https://store${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});}
function isStudio(path){return path==='/studio'||path==='/studio/'||path.startsWith('/studio/');}
async function injectStudioCallbacks(response){let body=await response.text();if(!body.includes(STUDIO_CALLBACK_CSS.split('?')[0]))body=body.replace('</head>',`<link rel="stylesheet" href="${STUDIO_CALLBACK_CSS}"></head>`);if(!body.includes(STUDIO_CALLBACK_JS.split('?')[0]))body=body.replace('</body>',`<script src="${STUDIO_CALLBACK_JS}"></script></body>`);const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);headers.set('Cache-Control','private, no-store, max-age=0');headers.set('X-Neptune-Callback-SLA',RELEASE);return new Response(body,{status:response.status,statusText:response.statusText,headers});}
