import {ensureSalesTunnelV96Schema} from './portal-sales-tunnel-v96.js';
import {json,randomToken,sanitizeText,sha256} from './security.js';
import {normalizeEmail} from './portal-utils.js';

export const SALES_PROSPECT_V121_RELEASE='neptune-sales-prospect-20260831-company-first-v163';
const TOKEN_TTL_SECONDS=7*24*60*60;
const PENDING_EMAIL_DOMAIN='pending.neptune.invalid';

export async function startTunnelProspectV121(store,raw={}){
  ensureSalesTunnelV96Schema(store);
  ensureCompanyProspectSchema(store);

  const companyIdentity=sanitizeText(raw.companyIdentity||raw.company||raw.organization,220).trim();
  if(!companyIdentity)return json({error:'company_required'},400);

  const firstName=sanitizeText(raw.firstName||raw.first_name,80).trim();
  const lastName=sanitizeText(raw.lastName||raw.last_name,100).trim();
  const providedEmail=normalizeEmail(raw.email);
  const phone=normalizePhone(raw.phone);
  const websiteHint=extractWebsiteHint(companyIdentity);
  const company=companyIdentity;
  const now=new Date(),at=now.toISOString(),prospectId=crypto.randomUUID();
  const email=providedEmail||`lead+${prospectId.replace(/-/gu,'')}@${PENDING_EMAIL_DOMAIN}`;
  const fullName=`${firstName} ${lastName}`.trim()||company;

  let client=providedEmail?store.sql.exec('SELECT id FROM portal_clients WHERE email=? LIMIT 1',providedEmail).toArray()[0]:null;
  if(!client){
    client={id:crypto.randomUUID()};
    store.sql.exec('INSERT INTO portal_clients(id,email,full_name,company,active,created_at,updated_at,last_access_at) VALUES(?,?,?,?,1,?,?,NULL)',client.id,email,fullName,company,at,at);
  }else{
    store.sql.exec('UPDATE portal_clients SET full_name=CASE WHEN ?<>\'\' THEN ? ELSE full_name END,company=?,active=1,updated_at=? WHERE id=?',fullName,fullName,company,at,client.id);
  }
  store.sql.exec('INSERT INTO portal_client_profiles_v96(client_id,phone,updated_at) VALUES(?,?,?) ON CONFLICT(client_id) DO UPDATE SET phone=CASE WHEN excluded.phone<>\'\' THEN excluded.phone ELSE portal_client_profiles_v96.phone END,updated_at=excluded.updated_at',client.id,phone,at);
  if(providedEmail)store.sql.exec("UPDATE portal_prospects SET status='replaced',updated_at=? WHERE client_id=? AND status IN ('captured','tunnel_started')",at,client.id);

  const token=randomToken(32),tokenHash=await sha256(token),expiresAt=new Date(now.getTime()+TOKEN_TTL_SECONDS*1000).toISOString();
  store.sql.exec(`INSERT INTO portal_prospects(id,client_id,first_name,last_name,company,email,token_hash,status,source,intent,consent_at,expires_at,created_at,updated_at,tunnel_started_at,paid_at,order_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,prospectId,client.id,firstName,lastName,company,email,tokenHash,'captured','neptune_media_tunnel_v163_company_first','book_passage',at,expiresAt,at,at);
  store.sql.exec("INSERT INTO portal_reservation_intents_v96(prospect_id,status,created_at,updated_at) VALUES(?,'contact_captured',?,?)",prospectId,at,at);
  store.sql.exec(`INSERT INTO portal_prospect_company_v163(prospect_id,company_query,website_hint,enrichment_status,created_at,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(prospect_id) DO UPDATE SET company_query=excluded.company_query,website_hint=excluded.website_hint,enrichment_status='pending',updated_at=excluded.updated_at`,prospectId,companyIdentity,websiteHint,'pending',at,at);

  return json({
    ok:true,
    release:'neptune-sales-tunnel-20260811-v96',
    enhancementRelease:'neptune-sales-tunnel-20260811-v97',
    catalogRelease:'neptune-sales-catalog-20260811-v98',
    productionReadinessRelease:SALES_PROSPECT_V121_RELEASE,
    token,prospectId,expiresIn:TOKEN_TTL_SECONDS,
    contact:{firstName,lastName,fullName,company,companyIdentity,websiteHint,email:providedEmail||'',phone,enrichmentStatus:'pending'},
  });
}

export async function enrichProspectContextV121(store,response){
  ensureCompanyProspectSchema(store);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.prospectId)return json(data,response.status);
  const row=store.sql.exec(`SELECT p.company,c.company_query AS companyIdentity,c.website_hint AS websiteHint,c.enrichment_status AS enrichmentStatus
    FROM portal_prospects p LEFT JOIN portal_prospect_company_v163 c ON c.prospect_id=p.id WHERE p.id=? LIMIT 1`,data.prospectId).toArray()[0];
  if(row?.company)data.contact={...(data.contact||{}),company:row.company,companyIdentity:row.companyIdentity||row.company,websiteHint:row.websiteHint||'',enrichmentStatus:row.enrichmentStatus||'pending'};
  if(String(data.contact?.email||'').endsWith(`@${PENDING_EMAIL_DOMAIN}`))data.contact.email='';
  data.productionReadinessRelease=SALES_PROSPECT_V121_RELEASE;
  return json(data,response.status);
}

export function isCompanyOnlyProspectV163(store,token=''){
  ensureCompanyProspectSchema(store);
  const raw=String(token||'');if(raw.length<32)return false;
  return false;
}

function ensureCompanyProspectSchema(store){
  store.sql.exec(`CREATE TABLE IF NOT EXISTS portal_prospect_company_v163(
    prospect_id TEXT PRIMARY KEY REFERENCES portal_prospects(id) ON DELETE CASCADE,
    company_query TEXT NOT NULL DEFAULT '',website_hint TEXT NOT NULL DEFAULT '',enrichment_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,updated_at TEXT NOT NULL
  );`);
}

function extractWebsiteHint(value){
  const raw=String(value||'').trim();
  try{
    const candidate=/^https?:\/\//iu.test(raw)?raw:/^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/iu.test(raw)?`https://${raw}`:'';
    if(!candidate)return'';
    const url=new URL(candidate);return url.protocol==='https:'||url.protocol==='http:'?url.toString():'';
  }catch{return'';}
}

function normalizePhone(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const plus=raw.startsWith('+'),digits=raw.replace(/\D/gu,'');
  return digits.length>=8&&digits.length<=15?`${plus?'+':''}${digits}`:'';
}
