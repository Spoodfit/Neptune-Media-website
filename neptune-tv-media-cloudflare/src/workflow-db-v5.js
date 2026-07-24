import { json, sanitizeText } from './security.js';
import { statusRank } from './portal-utils.js';

export const ADMIN_EMAIL='contact@neptunebusiness.com';
export const SUPPLIER_EMAIL='contact@recbox.fr';
export const SUPPLIER_NAME='REC BOX Studio';
export const DAY=86400000, HOUR=3600000;
const VIEW=new Set(['admin','editor','analyst']), ACTION=new Set(['admin','editor']);
const SOURCE=new Set(['rushes','raw','source','video']), FINAL=new Set(['final','emission','full','master','episode']), SHORT=new Set(['short','shorts','reel','teaser']);

export function ensureWorkflowSchema(store){
  if(store.workflowV5Ready)return;
  store.sql.exec(`CREATE TABLE IF NOT EXISTS portal_workflows(
    order_id TEXT PRIMARY KEY REFERENCES portal_orders(id) ON DELETE CASCADE,
    requested_filming_at TEXT,supplier_status TEXT NOT NULL DEFAULT 'pending',supplier_email TEXT NOT NULL DEFAULT '',supplier_name TEXT NOT NULL DEFAULT 'REC BOX Studio',supplier_token_hash TEXT,supplier_token_expires_at TEXT,supplier_response_at TEXT,supplier_note TEXT NOT NULL DEFAULT '',preparation_status TEXT NOT NULL DEFAULT 'to_book',preparation_completed_at TEXT,source_delivery_due_at TEXT,source_received_at TEXT,source_qc_status TEXT NOT NULL DEFAULT 'not_started',editing_started_at TEXT,delivery_due_at TEXT,delivered_at TEXT,broadcast_status TEXT NOT NULL DEFAULT 'not_scheduled',broadcast_at TEXT,broadcast_url TEXT NOT NULL DEFAULT '',broadcast_published_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_workflow_events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,event_key TEXT NOT NULL,actor_type TEXT NOT NULL DEFAULT 'system',actor_email TEXT NOT NULL DEFAULT '',payload TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_email_outbox(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,message_key TEXT NOT NULL,recipient_type TEXT NOT NULL,to_email TEXT NOT NULL,payload TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',scheduled_at TEXT NOT NULL,sent_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(order_id,message_key,to_email));
    CREATE INDEX IF NOT EXISTS idx_portal_workflow_events_order ON portal_workflow_events(order_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_workflows_supplier ON portal_workflows(supplier_status,updated_at);
    CREATE INDEX IF NOT EXISTS idx_portal_email_outbox_due ON portal_email_outbox(status,scheduled_at);`);
  backfill(store);store.workflowV5Ready=true;
}

function backfill(store){
  const now=new Date().toISOString();
  const rows=store.sql.exec(`SELECT o.id,o.format,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.created_at AS createdAt,o.updated_at AS updatedAt FROM portal_orders o LEFT JOIN portal_workflows w ON w.order_id=o.id WHERE w.order_id IS NULL`).toArray();
  for(const o of rows){
    const prep=statusRank(o.status)>=statusRank('preparation_complete'),received=statusRank(o.status)>=statusRank('videos_received'),editing=statusRank(o.status)>=statusRank('editing'),delivered=statusRank(o.status)>=statusRank('delivered');
    store.sql.exec(`INSERT INTO portal_workflows(order_id,requested_filming_at,supplier_status,supplier_email,supplier_name,supplier_token_hash,supplier_token_expires_at,supplier_response_at,supplier_note,preparation_status,preparation_completed_at,source_delivery_due_at,source_received_at,source_qc_status,editing_started_at,delivery_due_at,delivered_at,broadcast_status,broadcast_at,broadcast_url,broadcast_published_at,created_at,updated_at) VALUES(?,?,?,?,?,NULL,NULL,?,'',?,?,?,?,?,?,?,?,'not_scheduled',NULL,'',NULL,?,?)`,
      o.id,o.filmingAt,o.filmingAt?'confirmed':isHorsNorme(o.format)?'pending':'not_required',SUPPLIER_EMAIL,SUPPLIER_NAME,o.filmingAt?o.updatedAt||now:null,prep?'completed':o.appointmentAt?'booked':'to_book',prep?o.updatedAt||now:null,statusRank(o.status)>=statusRank('videos_pending')?addBusinessDays(o.filmingAt||o.updatedAt||now,7).toISOString():null,received?o.updatedAt||now:null,received?(editing?'passed':'pending'):'not_started',editing?o.updatedAt||now:null,editing?addBusinessDays(o.updatedAt||now,7).toISOString():null,delivered?o.updatedAt||now:null,o.createdAt||now,o.updatedAt||now);
  }
}

export function getOrder(store,id){return store.sql.exec(`SELECT o.id,o.client_id AS clientId,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.next_action AS nextAction,o.preparation_url AS preparationUrl,o.booking_url AS bookingUrl,o.created_at AS createdAt,o.updated_at AS updatedAt,c.email,c.full_name AS fullName,c.company FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id WHERE o.id=?`,id).toArray()[0]||null;}
export function listOrders(store){return store.sql.exec(`SELECT o.id,o.client_id AS clientId,o.title,o.format,o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.next_action AS nextAction,o.preparation_url AS preparationUrl,o.booking_url AS bookingUrl,o.created_at AS createdAt,o.updated_at AS updatedAt,c.email,c.full_name AS fullName,c.company FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id ORDER BY o.updated_at DESC`).toArray();}
export function getWorkflow(store,id){return store.sql.exec(`SELECT order_id AS orderId,requested_filming_at AS requestedFilmingAt,supplier_status AS supplierStatus,supplier_email AS supplierEmail,supplier_name AS supplierName,supplier_token_expires_at AS supplierTokenExpiresAt,supplier_response_at AS supplierResponseAt,supplier_note AS supplierNote,preparation_status AS preparationStatus,preparation_completed_at AS preparationCompletedAt,source_delivery_due_at AS sourceDeliveryDueAt,source_received_at AS sourceReceivedAt,source_qc_status AS sourceQcStatus,editing_started_at AS editingStartedAt,delivery_due_at AS deliveryDueAt,delivered_at AS deliveredAt,broadcast_status AS broadcastStatus,broadcast_at AS broadcastAt,broadcast_url AS broadcastUrl,broadcast_published_at AS broadcastPublishedAt,created_at AS createdAt,updated_at AS updatedAt FROM portal_workflows WHERE order_id=?`,id).toArray()[0]||null;}
export function latestCalendarAppointment(store,id){
  const rows=store.sql.exec(`SELECT payload,created_at AS createdAt FROM portal_workflow_events WHERE order_id=? AND event_key='preparation_appointment_booked' ORDER BY created_at DESC LIMIT 12`,id).toArray();
  for(const row of rows){const payload=safeParse(row.payload),appointmentAt=iso(payload.appointmentAt);if(appointmentAt)return{appointmentAt,calendarEventId:sanitizeText(payload.calendarEventId||payload.eventId,220),title:sanitizeText(payload.title,240),source:payload.source||'google_calendar',syncedAt:row.createdAt};}
  return null;
}

export function fileInventory(store,id,since){const cutoff=iso(since)||'1970-01-01T00:00:00.000Z',rows=store.sql.exec('SELECT lower(file_type) AS fileType FROM portal_files WHERE order_id=? AND created_at>=?',id,cutoff).toArray();let sourceCount=0,finalCount=0,shortCount=0;for(const r of rows){if(SOURCE.has(r.fileType))sourceCount++;if(FINAL.has(r.fileType))finalCount++;if(SHORT.has(r.fileType))shortCount++;}return{sourceCount,finalCount,shortCount,hasSource:sourceCount>0,hasFinal:finalCount>0,hasShort:shortCount>0};}

export function queueEmail(store,orderId,key,type,to,payload={},scheduledAt=new Date().toISOString()){const email=normalizeEmail(to);if(!orderId||!key||!email)return false;const now=new Date().toISOString();store.sql.exec(`INSERT OR IGNORE INTO portal_email_outbox(id,order_id,message_key,recipient_type,to_email,payload,status,attempts,last_error,scheduled_at,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',0,'',?,NULL,?,?)`,crypto.randomUUID(),orderId,sanitizeText(key,140),sanitizeText(type,40),email,JSON.stringify(payload||{}),iso(scheduledAt)||now,now,now);return true;}
export function recordEvent(store,orderId,key,actorType='system',actorEmail='',payload={}){store.sql.exec('INSERT INTO portal_workflow_events(id,order_id,event_key,actor_type,actor_email,payload,created_at) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),orderId,sanitizeText(key,120),sanitizeText(actorType,40)||'system',normalizeEmail(actorEmail),JSON.stringify(payload||{}),new Date().toISOString());}
export function countPending(store,id=''){const row=id?store.sql.exec("SELECT COUNT(*) AS count FROM portal_email_outbox WHERE order_id=? AND status IN ('pending','failed')",id).toArray()[0]:store.sql.exec("SELECT COUNT(*) AS count FROM portal_email_outbox WHERE status IN ('pending','failed')").toArray()[0];return Number(row?.count||0);}

export async function requireViewer(store,body){const actor=await store.requireSession(body.token);if(!actor||!VIEW.has(actor.role))return{ok:false,response:json({error:'unauthorized'},401)};if(!body.csrfToken||body.csrfToken!==actor.csrfToken)return{ok:false,response:json({error:'csrf_failed'},403)};return{ok:true,actor};}
export async function requireOperator(store,body){const access=await requireViewer(store,body);if(!access.ok)return access;if(!ACTION.has(access.actor.role))return{ok:false,response:json({error:'forbidden'},403)};return access;}
export function canAct(role){return ACTION.has(role);}

export function addBusinessDays(value,days){const d=new Date(value||Date.now());if(Number.isNaN(d.getTime()))return new Date();let n=Math.max(0,Number(days||0));while(n){d.setUTCDate(d.getUTCDate()+1);if(![0,6].includes(d.getUTCDay()))n--;}return d;}
export function businessDaysRemaining(value){const end=new Date(value||'');if(Number.isNaN(end.getTime()))return null;const cursor=new Date();let n=0,dir=end>=cursor?1:-1;while((dir===1&&cursor<end)||(dir===-1&&cursor>end)){cursor.setUTCDate(cursor.getUTCDate()+dir);if(![0,6].includes(cursor.getUTCDay()))n+=dir;if(Math.abs(n)>400)break;}return n;}
export function addHours(value,hours){const d=new Date(value||'');return Number.isNaN(d.getTime())?null:new Date(d.getTime()+hours*HOUR);}
export function iso(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString();}
export function dateKey(value){return new Date(value||Date.now()).toISOString().slice(0,10);}
export function normalizeEmail(value){const email=String(value||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)?email:'';}
export function safeParse(value){try{return JSON.parse(String(value||'{}'));}catch{return{};}}
export function isHorsNorme(value){return /hors\s*norme/iu.test(String(value||''));}
export function formatDate(value){const d=new Date(value||'');return Number.isNaN(d.getTime())?'Date à confirmer':new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Paris'}).format(d);}
