import { ensureSalesTunnelV96Schema } from './portal-sales-tunnel-v96.js';
import { json, sanitizeText, sha256 } from './security.js';

export const RESERVATION_SLOTS_V172_RELEASE='neptune-reservation-slots-20260903-v172';
const HOLD_MINUTES=20;
const VIEW_ROLES=new Set(['admin','editor','analyst']);
const EDIT_ROLES=new Set(['admin','editor']);

export function ensureReservationSlotsV172Schema(store){
  ensureSalesTunnelV96Schema(store);
  if(!store.reservationSlotsV172Ready){
    store.sql.exec(`CREATE TABLE IF NOT EXISTS portal_reservation_slots_v172(
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES portal_media_suppliers_v95(id) ON DELETE RESTRICT,
      offer_id TEXT REFERENCES portal_media_offers_v96(id) ON DELETE SET NULL,
      prospect_id TEXT REFERENCES portal_prospects(id) ON DELETE SET NULL,
      client_id TEXT REFERENCES portal_clients(id) ON DELETE SET NULL,
      order_id TEXT NOT NULL DEFAULT '',
      slot_date TEXT NOT NULL,
      daypart TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'hold',
      source TEXT NOT NULL DEFAULT 'tunnel',
      note TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_slots_active_v172
      ON portal_reservation_slots_v172(supplier_id,slot_date,daypart)
      WHERE status IN ('hold','confirmed','blocked');
    CREATE INDEX IF NOT EXISTS idx_reservation_slots_date_v172
      ON portal_reservation_slots_v172(slot_date,status,supplier_id);
    CREATE INDEX IF NOT EXISTS idx_reservation_slots_prospect_v172
      ON portal_reservation_slots_v172(prospect_id,status,updated_at);
    CREATE INDEX IF NOT EXISTS idx_reservation_slots_order_v172
      ON portal_reservation_slots_v172(order_id,status);`);
    store.reservationSlotsV172Ready=true;
  }
  cleanupExpiredHolds(store);
  syncMaterializedPaidOrders(store);
}

export async function reservationAvailabilityV172(store,raw={}){
  ensureReservationSlotsV172Schema(store);
  const prospect=await prospectByToken(store,raw.token||raw.reservationToken,{allowPaid:true});
  if(!prospect)return json({error:'prospect_token_expired'},401);
  const offer=offerContext(store,clean(raw.offerId));
  if(!offer||!offer.active)return json({error:'offer_not_available'},404);
  const month=cleanMonth(raw.month);
  if(!month)return json({error:'invalid_month'},400);
  const [start,end]=monthBounds(month);
  const rows=store.sql.exec(`SELECT slot_date AS slotDate,daypart,status,prospect_id AS prospectId
    FROM portal_reservation_slots_v172
    WHERE supplier_id=? AND slot_date>=? AND slot_date<? AND status IN ('hold','confirmed','blocked')
    ORDER BY slot_date,daypart`,offer.supplierId,start,end).toArray();
  const unavailable={};
  for(const row of rows){
    if(row.status==='hold'&&row.prospectId===prospect.id)continue;
    if(!unavailable[row.slotDate])unavailable[row.slotDate]=[];
    if(!unavailable[row.slotDate].includes(row.daypart))unavailable[row.slotDate].push(row.daypart);
  }
  return json({ok:true,release:RESERVATION_SLOTS_V172_RELEASE,offerId:offer.id,month,unavailable});
}

export async function holdReservationSlotV172(store,raw={}){
  ensureReservationSlotsV172Schema(store);
  const prospect=await prospectByToken(store,raw.token||raw.reservationToken,{allowPaid:false});
  if(!prospect)return json({error:'prospect_token_expired'},401);
  const offer=offerContext(store,clean(raw.offerId));
  if(!offer||!offer.active)return json({error:'offer_not_available'},404);
  const slotDate=cleanDate(raw.requestedDate),daypart=cleanDaypart(raw.requestedDaypart);
  if(!isPublicBookableDate(slotDate))return json({error:'invalid_requested_date'},400);
  if(!daypart)return json({error:'requested_slot_required'},400);

  const now=new Date(),at=now.toISOString(),expiresAt=new Date(now.getTime()+HOLD_MINUTES*60000).toISOString();
  cleanupExpiredHolds(store,at);
  const active=activeSlot(store,offer.supplierId,slotDate,daypart);
  if(active){
    if(active.status==='hold'&&active.prospectId===prospect.id){
      store.sql.exec(`UPDATE portal_reservation_slots_v172 SET offer_id=?,client_id=?,expires_at=?,updated_at=? WHERE id=?`,offer.id,prospect.clientId,expiresAt,at,active.id);
      return json({ok:true,release:RESERVATION_SLOTS_V172_RELEASE,slotId:active.id,expiresAt,holdMinutes:HOLD_MINUTES});
    }
    return json({error:'slot_unavailable'},409);
  }

  const id=crypto.randomUUID();
  try{
    store.sql.exec(`INSERT INTO portal_reservation_slots_v172(
      id,supplier_id,offer_id,prospect_id,client_id,order_id,slot_date,daypart,status,source,note,expires_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,'',?,?,'hold','tunnel','',?,?,?)`,
      id,offer.supplierId,offer.id,prospect.id,prospect.clientId,slotDate,daypart,expiresAt,at,at);
  }catch{
    return json({error:'slot_unavailable'},409);
  }
  store.sql.exec(`UPDATE portal_reservation_slots_v172 SET status='expired',updated_at=?
    WHERE prospect_id=? AND id<>? AND status='hold'`,at,prospect.id,id);
  return json({ok:true,release:RESERVATION_SLOTS_V172_RELEASE,slotId:id,expiresAt,holdMinutes:HOLD_MINUTES});
}

export function confirmReservationSlotForOrderV172(store,orderId){
  ensureReservationSlotsV172Schema(store);
  const cleanOrder=clean(orderId);
  if(!cleanOrder)return {ok:false,error:'order_required'};
  const prospect=store.sql.exec(`SELECT id,client_id AS clientId FROM portal_prospects WHERE order_id=? ORDER BY updated_at DESC LIMIT 1`,cleanOrder).toArray()[0]||null;
  if(!prospect)return {ok:false,error:'prospect_not_found'};
  const intent=store.sql.exec(`SELECT offer_id AS offerId,requested_date AS requestedDate,requested_daypart AS requestedDaypart
    FROM portal_reservation_intents_v96 WHERE prospect_id=? LIMIT 1`,prospect.id).toArray()[0]||null;
  const offer=intent?.offerId?offerContext(store,intent.offerId):null;
  const slotDate=cleanDate(intent?.requestedDate),daypart=cleanDaypart(intent?.requestedDaypart);
  if(!offer||!slotDate||!daypart)return {ok:false,error:'reservation_slot_missing'};
  const at=new Date().toISOString();
  const existing=activeSlot(store,offer.supplierId,slotDate,daypart);
  if(existing&&existing.prospectId!==prospect.id&&existing.orderId!==cleanOrder){
    const conflictId=crypto.randomUUID();
    store.sql.exec(`INSERT INTO portal_reservation_slots_v172(
      id,supplier_id,offer_id,prospect_id,client_id,order_id,slot_date,daypart,status,source,note,expires_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?, 'payment_conflict','stripe','Paiement reçu alors que le créneau était déjà occupé',NULL,?,?)`,
      conflictId,offer.supplierId,offer.id,prospect.id,prospect.clientId,cleanOrder,slotDate,daypart,at,at);
    return {ok:false,error:'slot_payment_conflict',conflict:true,slotId:conflictId};
  }

  let own=store.sql.exec(`SELECT id,status FROM portal_reservation_slots_v172
    WHERE prospect_id=? AND supplier_id=? AND slot_date=? AND daypart=?
    ORDER BY CASE status WHEN 'hold' THEN 0 WHEN 'expired' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END,updated_at DESC LIMIT 1`,
    prospect.id,offer.supplierId,slotDate,daypart).toArray()[0]||null;
  if(existing&&existing.prospectId===prospect.id)own=existing;
  if(own){
    store.sql.exec(`UPDATE portal_reservation_slots_v172 SET status='confirmed',offer_id=?,client_id=?,order_id=?,source='stripe',expires_at=NULL,updated_at=? WHERE id=?`,
      offer.id,prospect.clientId,cleanOrder,at,own.id);
  }else{
    own={id:crypto.randomUUID()};
    try{
      store.sql.exec(`INSERT INTO portal_reservation_slots_v172(
        id,supplier_id,offer_id,prospect_id,client_id,order_id,slot_date,daypart,status,source,note,expires_at,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?, 'confirmed','stripe','',NULL,?,?)`,
        own.id,offer.supplierId,offer.id,prospect.id,prospect.clientId,cleanOrder,slotDate,daypart,at,at);
    }catch{
      return {ok:false,error:'slot_payment_conflict',conflict:true};
    }
  }
  store.sql.exec(`UPDATE portal_reservation_slots_v172 SET status='expired',updated_at=? WHERE prospect_id=? AND id<>? AND status='hold'`,at,prospect.id,own.id);
  return {ok:true,slotId:own.id,status:'confirmed'};
}

export async function listAdminReservationSlotsV172(store,body={}){
  ensureReservationSlotsV172Schema(store);
  const actor=await store.requireSession(String(body.token||''));
  if(!actor||!VIEW_ROLES.has(actor.role))return json({error:'unauthorized'},401);
  const from=new Date();from.setDate(from.getDate()-14);
  const fromDate=toIsoDate(from);
  const slots=store.sql.exec(`SELECT
      r.id,r.supplier_id AS supplierId,r.offer_id AS offerId,r.prospect_id AS prospectId,r.client_id AS clientId,r.order_id AS orderId,
      r.slot_date AS slotDate,r.daypart,r.status,r.source,r.note,r.expires_at AS expiresAt,r.created_at AS createdAt,r.updated_at AS updatedAt,
      s.name AS supplierName,o.name AS offerName,c.name AS cityName,f.name AS formatName,
      cl.email,cl.full_name AS fullName,cl.company
    FROM portal_reservation_slots_v172 r
    JOIN portal_media_suppliers_v95 s ON s.id=r.supplier_id
    LEFT JOIN portal_media_offers_v96 o ON o.id=r.offer_id
    LEFT JOIN portal_media_cities_v96 c ON c.id=o.city_id
    LEFT JOIN portal_media_formats_v95 f ON f.id=o.format_id
    LEFT JOIN portal_clients cl ON cl.id=r.client_id
    WHERE r.slot_date>=? AND r.status IN ('hold','confirmed','blocked','payment_conflict')
    ORDER BY CASE r.status WHEN 'payment_conflict' THEN 0 WHEN 'hold' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END,r.slot_date,r.daypart
    LIMIT 300`,fromDate).toArray();
  const suppliers=store.sql.exec(`SELECT id,name,active FROM portal_media_suppliers_v95 ORDER BY active DESC,name`).toArray().map(x=>({...x,active:Boolean(x.active)}));
  return json({ok:true,release:RESERVATION_SLOTS_V172_RELEASE,editable:EDIT_ROLES.has(actor.role),holdMinutes:HOLD_MINUTES,slots,suppliers});
}

export async function mutateAdminReservationSlotV172(store,body={}){
  ensureReservationSlotsV172Schema(store);
  const actor=await store.requireSession(String(body.token||''));
  if(!actor||!EDIT_ROLES.has(actor.role))return json({error:'forbidden'},403);
  const action=clean(body.action),at=new Date().toISOString();

  if(action==='block'){
    const supplierId=clean(body.supplierId),slotDate=cleanDate(body.slotDate),daypart=cleanDaypart(body.daypart),note=sanitizeText(body.note||'',240);
    if(!supplierId||!slotDate||!daypart)return json({error:'invalid_slot'},400);
    if(!store.sql.exec('SELECT id FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',supplierId).toArray()[0])return json({error:'supplier_not_found'},404);
    if(activeSlot(store,supplierId,slotDate,daypart))return json({error:'slot_unavailable'},409);
    try{
      store.sql.exec(`INSERT INTO portal_reservation_slots_v172(
        id,supplier_id,offer_id,prospect_id,client_id,order_id,slot_date,daypart,status,source,note,expires_at,created_at,updated_at
      ) VALUES(?,?,NULL,NULL,NULL,'',?,?,'blocked','studio',?,NULL,?,?)`,crypto.randomUUID(),supplierId,slotDate,daypart,note,at,at);
    }catch{return json({error:'slot_unavailable'},409);}
    return json({ok:true,release:RESERVATION_SLOTS_V172_RELEASE});
  }

  const id=clean(body.id),slot=slotById(store,id);
  if(!slot)return json({error:'slot_not_found'},404);

  if(action==='cancel'||action==='release'){
    store.sql.exec(`UPDATE portal_reservation_slots_v172 SET status='cancelled',source='studio',expires_at=NULL,updated_at=? WHERE id=?`,at,id);
    if(slot.prospectId)store.sql.exec(`UPDATE portal_reservation_intents_v96 SET status='cancelled_by_studio',updated_at=? WHERE prospect_id=?`,at,slot.prospectId);
    return json({ok:true,release:RESERVATION_SLOTS_V172_RELEASE});
  }

  if(action==='confirm'){
    const occupied=activeSlot(store,slot.supplierId,slot.slotDate,slot.daypart);
    if(occupied&&occupied.id!==slot.id)return json({error:'slot_unavailable'},409);
    try{store.sql.exec(`UPDATE portal_reservation_slots_v172 SET status='confirmed',source='studio',expires_at=NULL,updated_at=? WHERE id=?`,at,id);}
    catch{return json({error:'slot_unavailable'},409);}
    return json({ok:true,release:RESERVATION_SLOTS_V172_RELEASE});
  }

  if(action==='move'){
    const slotDate=cleanDate(body.slotDate),daypart=cleanDaypart(body.daypart);
    if(!slotDate||!daypart)return json({error:'invalid_slot'},400);
    const occupied=activeSlot(store,slot.supplierId,slotDate,daypart);
    if(occupied&&occupied.id!==slot.id)return json({error:'slot_unavailable'},409);
    try{store.sql.exec(`UPDATE portal_reservation_slots_v172 SET slot_date=?,daypart=?,source='studio',updated_at=? WHERE id=?`,slotDate,daypart,at,id);}
    catch{return json({error:'slot_unavailable'},409);}
    if(slot.prospectId)store.sql.exec(`UPDATE portal_reservation_intents_v96 SET requested_date=?,requested_daypart=?,updated_at=? WHERE prospect_id=?`,slotDate,daypart,at,slot.prospectId);
    if(slot.orderId)store.sql.exec(`UPDATE portal_order_sales_v96 SET requested_date=?,requested_daypart=?,updated_at=? WHERE order_id=?`,slotDate,daypart,at,slot.orderId);
    return json({ok:true,release:RESERVATION_SLOTS_V172_RELEASE});
  }

  return json({error:'invalid_action'},400);
}

function cleanupExpiredHolds(store,nowIso=new Date().toISOString()){
  store.sql.exec(`UPDATE portal_reservation_slots_v172 SET status='expired',updated_at=?
    WHERE status='hold' AND expires_at IS NOT NULL AND expires_at<=?`,nowIso,nowIso);
}

function syncMaterializedPaidOrders(store){
  const rows=store.sql.exec(`SELECT s.order_id AS orderId,s.prospect_id AS prospectId,p.client_id AS clientId,s.offer_id AS offerId,s.supplier_id AS supplierId,
      s.requested_date AS slotDate,s.requested_daypart AS daypart
    FROM portal_order_sales_v96 s LEFT JOIN portal_prospects p ON p.id=s.prospect_id
    WHERE s.requested_date<>'' AND s.requested_daypart IN ('morning','afternoon')
    ORDER BY s.updated_at DESC LIMIT 500`).toArray();
  const at=new Date().toISOString();
  for(const row of rows){
    if(store.sql.exec(`SELECT id FROM portal_reservation_slots_v172 WHERE order_id=? AND status IN ('confirmed','payment_conflict') LIMIT 1`,row.orderId).toArray()[0])continue;
    const occupied=activeSlot(store,row.supplierId,row.slotDate,row.daypart);
    if(occupied&&occupied.prospectId===row.prospectId){
      store.sql.exec(`UPDATE portal_reservation_slots_v172 SET status='confirmed',order_id=?,offer_id=?,client_id=?,source='legacy_sync',expires_at=NULL,updated_at=? WHERE id=?`,row.orderId,row.offerId,row.clientId||null,at,occupied.id);
      continue;
    }
    if(occupied){
      store.sql.exec(`INSERT INTO portal_reservation_slots_v172(id,supplier_id,offer_id,prospect_id,client_id,order_id,slot_date,daypart,status,source,note,expires_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?, 'payment_conflict','legacy_sync','Réservation payée en conflit avec un créneau déjà occupé',NULL,?,?)`,crypto.randomUUID(),row.supplierId,row.offerId,row.prospectId||null,row.clientId||null,row.orderId,row.slotDate,row.daypart,at,at);
      continue;
    }
    try{
      store.sql.exec(`INSERT INTO portal_reservation_slots_v172(id,supplier_id,offer_id,prospect_id,client_id,order_id,slot_date,daypart,status,source,note,expires_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?, 'confirmed','legacy_sync','',NULL,?,?)`,crypto.randomUUID(),row.supplierId,row.offerId,row.prospectId||null,row.clientId||null,row.orderId,row.slotDate,row.daypart,at,at);
    }catch{}
  }
}

async function prospectByToken(store,token,{allowPaid=false}={}){
  const raw=String(token||'').trim();
  if(raw.length<32)return null;
  try{
    const hash=await sha256(raw),now=new Date().toISOString();
    const row=store.sql.exec(`SELECT id,client_id AS clientId,status,expires_at AS expiresAt FROM portal_prospects WHERE token_hash=? LIMIT 1`,hash).toArray()[0]||null;
    if(!row||String(row.expiresAt||'')<=now)return null;
    const allowed=allowPaid?new Set(['captured','tunnel_started','paid']):new Set(['captured','tunnel_started']);
    return allowed.has(row.status)?row:null;
  }catch{return null;}
}

function offerContext(store,id){
  const row=store.sql.exec(`SELECT o.id,o.supplier_id AS supplierId,o.active,c.active AS cityActive,f.active AS formatActive,s.active AS supplierActive
    FROM portal_media_offers_v96 o JOIN portal_media_cities_v96 c ON c.id=o.city_id JOIN portal_media_formats_v95 f ON f.id=o.format_id JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id
    WHERE o.id=? LIMIT 1`,id).toArray()[0]||null;
  if(row)row.active=Boolean(row.active&&row.cityActive&&row.formatActive&&row.supplierActive);
  return row;
}
function activeSlot(store,supplierId,slotDate,daypart){return store.sql.exec(`SELECT id,prospect_id AS prospectId,order_id AS orderId,status FROM portal_reservation_slots_v172 WHERE supplier_id=? AND slot_date=? AND daypart=? AND status IN ('hold','confirmed','blocked') LIMIT 1`,supplierId,slotDate,daypart).toArray()[0]||null;}
function slotById(store,id){return store.sql.exec(`SELECT id,supplier_id AS supplierId,prospect_id AS prospectId,order_id AS orderId,slot_date AS slotDate,daypart,status FROM portal_reservation_slots_v172 WHERE id=? LIMIT 1`,id).toArray()[0]||null;}
function clean(value){return String(value||'').trim().slice(0,160);}
function cleanDate(value){const v=clean(value);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:'';}
function cleanMonth(value){const v=clean(value);return /^\d{4}-\d{2}$/.test(v)?v:'';}
function cleanDaypart(value){const v=clean(value);return v==='morning'||v==='afternoon'?v:'';}
function monthBounds(month){const [year,number]=month.split('-').map(Number),start=`${year}-${String(number).padStart(2,'0')}-01`;const next=new Date(Date.UTC(year,number,1));return[start,toIsoDate(next)];}
function isPublicBookableDate(value){if(!cleanDate(value))return false;const date=new Date(`${value}T12:00:00Z`);if(Number.isNaN(date.getTime()))return false;const day=date.getUTCDay();if(day===0||day===6)return false;const tomorrow=new Date();tomorrow.setUTCHours(0,0,0,0);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);return value>=toIsoDate(tomorrow);}
function toIsoDate(date){return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;}
