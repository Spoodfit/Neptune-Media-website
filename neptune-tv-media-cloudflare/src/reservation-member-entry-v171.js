import { ensureSalesTunnelV96Schema } from './portal-sales-tunnel-v96.js';
import { json, randomToken, sanitizeText, sha256 } from './security.js';
import { normalizeEmail } from './portal-utils.js';

export const MEMBER_ENTRY_V171_RELEASE='neptune-reservation-member-entry-20260903-v171';

const TOKEN_TTL_SECONDS=7*24*60*60;
const VIEW_ROLES=new Set(['admin','editor','analyst']);
const PENDING_EMAIL_SUFFIX='@pending.neptune.invalid';

export async function createReservationMemberEntryV171(store,raw={}){
  ensureMemberEntryV171Schema(store);
  const email=normalizeEmail(raw.email);
  if(!email)return json({error:'email_invalid'},400);

  const now=new Date(),at=now.toISOString();
  let client=store.sql.exec(`SELECT id,email,full_name AS fullName,company,active,created_at AS createdAt
    FROM portal_clients WHERE email=? LIMIT 1`,email).toArray()[0]||null;
  const knownBefore=Boolean(client);

  if(!client){
    client={id:crypto.randomUUID(),email,fullName:'',company:'',active:1,createdAt:at};
    store.sql.exec(`INSERT INTO portal_clients(id,email,full_name,company,active,created_at,updated_at,last_access_at)
      VALUES(?,?,?,?,1,?,?,NULL)`,client.id,email,'','',at,at);
  }else{
    store.sql.exec('UPDATE portal_clients SET active=1,updated_at=? WHERE id=?',at,client.id);
  }
  store.sql.exec(`INSERT INTO portal_client_profiles_v96(client_id,phone,updated_at) VALUES(?,?,?)
    ON CONFLICT(client_id) DO NOTHING`,client.id,'',at);

  let token=String(raw.reservationToken||raw.token||'').trim();
  let prospect=await reusableProspectByToken(store,token,at);
  if(prospect){
    const sameEmail=normalizeEmail(prospect.email)===email;
    const pendingEmail=isPendingEmail(prospect.email)||isPendingEmail(prospect.clientEmail);
    if(!sameEmail&&!pendingEmail){
      prospect=null;token='';
    }else if(pendingEmail||prospect.clientId!==client.id){
      const names=splitFullName(client.fullName||'');
      store.sql.exec(`UPDATE portal_prospects SET client_id=?,first_name=?,last_name=?,company=?,email=?,updated_at=? WHERE id=?`,
        client.id,names.firstName,names.lastName,client.company||'',email,at,prospect.id);
      prospect={...prospect,clientId:client.id,email};
    }
  }

  if(!prospect){
    token=randomToken(32);
    const tokenHash=await sha256(token),prospectId=crypto.randomUUID(),expiresAt=new Date(now.getTime()+TOKEN_TTL_SECONDS*1000).toISOString();
    const names=splitFullName(client.fullName||'');
    store.sql.exec(`INSERT INTO portal_prospects(
      id,client_id,first_name,last_name,company,email,token_hash,status,source,intent,consent_at,expires_at,created_at,updated_at,tunnel_started_at,paid_at,order_id
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,
      prospectId,client.id,names.firstName,names.lastName,client.company||'',email,tokenHash,'captured','neptune_media_tunnel_v171_email_gate','book_passage',at,expiresAt,at,at);
    prospect={id:prospectId,clientId:client.id,email,status:'captured',expiresAt};
  }

  store.sql.exec(`INSERT INTO portal_reservation_intents_v96(prospect_id,status,created_at,updated_at)
    VALUES(?,'contact_captured',?,?) ON CONFLICT(prospect_id) DO NOTHING`,prospect.id,at,at);

  const entrySessionId=cleanSessionId(raw.entrySessionId)||crypto.randomUUID();
  const sessionKey=`${client.id}:${entrySessionId}`;
  store.sql.exec(`INSERT OR IGNORE INTO portal_reservation_member_visits_v171(
    id,client_id,prospect_id,email,session_key,known_before,first_seen_at,last_seen_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?)`,crypto.randomUUID(),client.id,prospect.id,email,sessionKey,knownBefore?1:0,at,at,at,at);
  store.sql.exec(`UPDATE portal_reservation_member_visits_v171
    SET prospect_id=?,email=?,last_seen_at=?,updated_at=? WHERE session_key=?`,prospect.id,email,at,at,sessionKey);

  return json({ok:true,release:MEMBER_ENTRY_V171_RELEASE,token,prospectId:prospect.id,expiresIn:TOKEN_TTL_SECONDS});
}

export async function listReservationMemberVisitsV171(store,body={}){
  ensureMemberEntryV171Schema(store);
  const actor=await store.requireSession(String(body.token||''));
  if(!actor||!VIEW_ROLES.has(actor.role))return json({error:'unauthorized'},401);

  const rows=store.sql.exec(`SELECT
      v.client_id AS clientId,
      v.email,
      c.full_name AS fullName,
      c.company,
      COUNT(*) AS visitCount,
      MIN(v.first_seen_at) AS firstSeenAt,
      MAX(v.last_seen_at) AS lastSeenAt,
      MIN(v.known_before) AS firstKnownBefore,
      MAX(v.prospect_id) AS lastProspectId
    FROM portal_reservation_member_visits_v171 v
    JOIN portal_clients c ON c.id=v.client_id
    GROUP BY v.client_id,v.email,c.full_name,c.company
    ORDER BY MAX(v.last_seen_at) DESC
    LIMIT 100`).toArray().map(row=>{
      const visitCount=Number(row.visitCount||0),knownBefore=Number(row.firstKnownBefore||0)===1;
      const state=visitCount>1?'returning':knownBefore?'known':'new';
      return {...row,visitCount,knownBefore,state,label:state==='returning'?'Retour':state==='known'?'Déjà client':'Nouveau'};
    });

  return json({ok:true,release:MEMBER_ENTRY_V171_RELEASE,entries:rows});
}

export function ensureMemberEntryV171Schema(store){
  ensureSalesTunnelV96Schema(store);
  if(store.memberEntryV171Ready)return;
  store.sql.exec(`CREATE TABLE IF NOT EXISTS portal_reservation_member_visits_v171(
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
    prospect_id TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    session_key TEXT NOT NULL UNIQUE,
    known_before INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_member_visits_v171_client ON portal_reservation_member_visits_v171(client_id,last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_member_visits_v171_last_seen ON portal_reservation_member_visits_v171(last_seen_at);`);
  store.memberEntryV171Ready=true;
}

async function reusableProspectByToken(store,token,nowIso){
  const raw=String(token||'').trim();
  if(raw.length<32)return null;
  try{
    const hash=await sha256(raw);
    const row=store.sql.exec(`SELECT p.id,p.client_id AS clientId,p.email,p.status,p.expires_at AS expiresAt,c.email AS clientEmail
      FROM portal_prospects p JOIN portal_clients c ON c.id=p.client_id
      WHERE p.token_hash=? LIMIT 1`,hash).toArray()[0]||null;
    if(!row||String(row.expiresAt||'')<=nowIso||row.status==='replaced')return null;
    return row;
  }catch{return null;}
}

function isPendingEmail(value){return String(value||'').toLowerCase().endsWith(PENDING_EMAIL_SUFFIX);}
function cleanSessionId(value){return sanitizeText(value,120).trim().replace(/[^a-zA-Z0-9_.:-]/g,'').slice(0,120);}
function splitFullName(value){const parts=String(value||'').trim().split(/\s+/u).filter(Boolean);return{firstName:parts.shift()||'',lastName:parts.join(' ')||''};}
