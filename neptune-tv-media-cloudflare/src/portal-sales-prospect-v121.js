import {ensureSalesTunnelV96Schema} from './portal-sales-tunnel-v96.js';
import {json,randomToken,sanitizeText,sha256} from './security.js';
import {normalizeEmail} from './portal-utils.js';

export const SALES_PROSPECT_V121_RELEASE='neptune-sales-prospect-20260817-v121';
const TOKEN_TTL_SECONDS=7*24*60*60;

export async function startTunnelProspectV121(store,raw={}){
  ensureSalesTunnelV96Schema(store);
  const firstName=sanitizeText(raw.firstName||raw.first_name,80).trim();
  const lastName=sanitizeText(raw.lastName||raw.last_name,100).trim();
  const company=sanitizeText(raw.company||raw.organization,180).trim();
  const email=normalizeEmail(raw.email);
  const phone=normalizePhone(raw.phone);
  if(!firstName||!lastName||!company||!email)return json({error:'invalid_contact'},400);

  const now=new Date(),at=now.toISOString(),fullName=`${firstName} ${lastName}`.trim();
  let client=store.sql.exec('SELECT id FROM portal_clients WHERE email=? LIMIT 1',email).toArray()[0];
  if(!client){
    client={id:crypto.randomUUID()};
    store.sql.exec('INSERT INTO portal_clients(id,email,full_name,company,active,created_at,updated_at,last_access_at) VALUES(?,?,?,?,1,?,?,NULL)',client.id,email,fullName,company,at,at);
  }else{
    store.sql.exec('UPDATE portal_clients SET full_name=?,company=?,active=1,updated_at=? WHERE id=?',fullName,company,at,client.id);
  }
  store.sql.exec('INSERT INTO portal_client_profiles_v96(client_id,phone,updated_at) VALUES(?,?,?) ON CONFLICT(client_id) DO UPDATE SET phone=CASE WHEN excluded.phone<>\'\' THEN excluded.phone ELSE portal_client_profiles_v96.phone END,updated_at=excluded.updated_at',client.id,phone,at);
  store.sql.exec("UPDATE portal_prospects SET status='replaced',updated_at=? WHERE client_id=? AND status IN ('captured','tunnel_started')",at,client.id);

  const token=randomToken(32),tokenHash=await sha256(token),prospectId=crypto.randomUUID(),expiresAt=new Date(now.getTime()+TOKEN_TTL_SECONDS*1000).toISOString();
  store.sql.exec(`INSERT INTO portal_prospects(id,client_id,first_name,last_name,company,email,token_hash,status,source,intent,consent_at,expires_at,created_at,updated_at,tunnel_started_at,paid_at,order_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,prospectId,client.id,firstName,lastName,company,email,tokenHash,'captured','neptune_media_tunnel_v121','book_passage',at,expiresAt,at,at);
  store.sql.exec("INSERT INTO portal_reservation_intents_v96(prospect_id,status,created_at,updated_at) VALUES(?,'contact_captured',?,?)",prospectId,at,at);

  return json({
    ok:true,
    release:'neptune-sales-tunnel-20260811-v96',
    enhancementRelease:'neptune-sales-tunnel-20260811-v97',
    catalogRelease:'neptune-sales-catalog-20260811-v98',
    productionReadinessRelease:SALES_PROSPECT_V121_RELEASE,
    token,prospectId,expiresIn:TOKEN_TTL_SECONDS,
    contact:{firstName,lastName,fullName,company,email,phone},
  });
}

export async function enrichProspectContextV121(store,response){
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.prospectId)return json(data,response.status);
  const row=store.sql.exec('SELECT company FROM portal_prospects WHERE id=? LIMIT 1',data.prospectId).toArray()[0];
  if(row?.company)data.contact={...(data.contact||{}),company:row.company};
  data.productionReadinessRelease=SALES_PROSPECT_V121_RELEASE;
  return json(data,response.status);
}

function normalizePhone(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const plus=raw.startsWith('+'),digits=raw.replace(/\D/gu,'');
  return digits.length>=8&&digits.length<=15?`${plus?'+':''}${digits}`:'';
}
