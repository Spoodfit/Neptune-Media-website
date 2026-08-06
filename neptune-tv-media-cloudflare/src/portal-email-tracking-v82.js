import { ensureWorkflowSchema, normalizeEmail, requireViewer, safeParse } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';

const RANK={queued:0,sent:10,delayed:15,delivered:20,opened:30,clicked:40,suppressed:80,failed:81,bounced:82,complained:83};
const FAILURES=new Set(['failed','bounced','complained','suppressed']);

export function ensureEmailTrackingSchema(store){
  ensureWorkflowSchema(store);
  if(store.emailTrackingV82Ready)return;
  store.sql.exec(`CREATE TABLE IF NOT EXISTS portal_email_tracking(
    id TEXT PRIMARY KEY,email_id TEXT UNIQUE,outbox_id TEXT NOT NULL DEFAULT '',order_id TEXT NOT NULL DEFAULT '',message_key TEXT NOT NULL DEFAULT '',recipient_type TEXT NOT NULL DEFAULT '',to_email TEXT NOT NULL DEFAULT '',subject TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'queued',sent_at TEXT,delivered_at TEXT,opened_at TEXT,clicked_at TEXT,delayed_at TEXT,failed_at TEXT,bounced_at TEXT,complained_at TEXT,suppressed_at TEXT,last_event_at TEXT,open_count INTEGER NOT NULL DEFAULT 0,click_count INTEGER NOT NULL DEFAULT 0,last_click_url TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',payload TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_email_webhook_receipts(svix_id TEXT PRIMARY KEY,event_type TEXT NOT NULL DEFAULT '',email_id TEXT NOT NULL DEFAULT '',received_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_portal_email_tracking_order ON portal_email_tracking(order_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_email_tracking_status ON portal_email_tracking(status,last_event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_portal_email_tracking_provider ON portal_email_tracking(email_id);`);
  backfill(store);
  store.emailTrackingV82Ready=true;
}

export function trackEmailAttempt(store,body={}){
  ensureEmailTrackingSchema(store);
  const now=new Date().toISOString(),emailId=sanitizeText(body.emailId,220),outboxId=sanitizeText(body.outboxId,120),outcome=body.outcome==='sent'?'sent':'failed';
  const id=emailId?`email:${emailId}`:`outbox:${outboxId||crypto.randomUUID()}`,at=iso(body.sentAt)||now;
  const values={orderId:sanitizeText(body.orderId,120),messageKey:sanitizeText(body.messageKey,180),recipientType:sanitizeText(body.recipientType,40),toEmail:normalizeEmail(body.toEmail),subject:sanitizeText(body.subject,320),error:sanitizeText(body.error,700),payload:object(body.payload)};
  store.sql.exec(`INSERT INTO portal_email_tracking(id,email_id,outbox_id,order_id,message_key,recipient_type,to_email,subject,status,sent_at,failed_at,last_event_at,last_error,payload,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET email_id=CASE WHEN excluded.email_id<>'' THEN excluded.email_id ELSE portal_email_tracking.email_id END,outbox_id=CASE WHEN excluded.outbox_id<>'' THEN excluded.outbox_id ELSE portal_email_tracking.outbox_id END,order_id=CASE WHEN excluded.order_id<>'' THEN excluded.order_id ELSE portal_email_tracking.order_id END,message_key=CASE WHEN excluded.message_key<>'' THEN excluded.message_key ELSE portal_email_tracking.message_key END,recipient_type=CASE WHEN excluded.recipient_type<>'' THEN excluded.recipient_type ELSE portal_email_tracking.recipient_type END,to_email=CASE WHEN excluded.to_email<>'' THEN excluded.to_email ELSE portal_email_tracking.to_email END,subject=CASE WHEN excluded.subject<>'' THEN excluded.subject ELSE portal_email_tracking.subject END,status=CASE WHEN excluded.status='failed' THEN 'failed' WHEN portal_email_tracking.status IN('opened','clicked','bounced','complained','suppressed') THEN portal_email_tracking.status ELSE excluded.status END,sent_at=COALESCE(portal_email_tracking.sent_at,excluded.sent_at),failed_at=COALESCE(portal_email_tracking.failed_at,excluded.failed_at),last_event_at=MAX(COALESCE(portal_email_tracking.last_event_at,''),COALESCE(excluded.last_event_at,'')),last_error=CASE WHEN excluded.last_error<>'' THEN excluded.last_error ELSE portal_email_tracking.last_error END,payload=CASE WHEN excluded.payload<>'{}' THEN excluded.payload ELSE portal_email_tracking.payload END,updated_at=excluded.updated_at`,
    id,emailId||null,outboxId,values.orderId,values.messageKey,values.recipientType,values.toEmail,values.subject,outcome,outcome==='sent'?at:null,outcome==='failed'?at:null,at,values.error,JSON.stringify(values.payload),now,now);
  return json({ok:true,id,emailId,status:outcome});
}

export function applyResendWebhookEvent(store,body={}){
  ensureEmailTrackingSchema(store);
  const event=object(body.event),type=sanitizeText(event.type||body.type,100).toLowerCase(),data=object(event.data||body.data),emailId=sanitizeText(data.email_id||data.emailId||data.id||body.emailId,220),svixId=sanitizeText(body.svixId,220),at=iso(event.created_at||event.createdAt||data.created_at||data.createdAt)||new Date().toISOString();
  if(!type||!emailId)return json({error:'invalid_resend_event'},400);
  if(svixId){
    if(store.sql.exec('SELECT svix_id FROM portal_email_webhook_receipts WHERE svix_id=? LIMIT 1',svixId).toArray()[0])return json({ok:true,duplicate:true,emailId,eventType:type});
    store.sql.exec('INSERT INTO portal_email_webhook_receipts(svix_id,event_type,email_id,received_at) VALUES(?,?,?,?)',svixId,type,emailId,new Date().toISOString());
  }
  const mapped=status(type),id=`email:${emailId}`,current=store.sql.exec('SELECT * FROM portal_email_tracking WHERE email_id=? OR id=? LIMIT 1',emailId,id).toArray()[0]||{},next=choose(current.status||'queued',mapped),fields=eventFields(mapped,at,current),now=new Date().toISOString();
  const toEmail=normalizeEmail(Array.isArray(data.to)?data.to[0]:data.to),subject=sanitizeText(data.subject,320),clickUrl=sanitizeText(data.click?.link||data.click?.url||data.url,1600),error=sanitizeText(data.error||data.reason||data.bounce?.message,700);
  store.sql.exec(`INSERT INTO portal_email_tracking(id,email_id,order_id,to_email,subject,status,sent_at,delivered_at,opened_at,clicked_at,delayed_at,failed_at,bounced_at,complained_at,suppressed_at,last_event_at,open_count,click_count,last_click_url,last_error,payload,created_at,updated_at)
    VALUES(?,?, '',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET to_email=CASE WHEN excluded.to_email<>'' THEN excluded.to_email ELSE portal_email_tracking.to_email END,subject=CASE WHEN excluded.subject<>'' THEN excluded.subject ELSE portal_email_tracking.subject END,status=excluded.status,sent_at=COALESCE(portal_email_tracking.sent_at,excluded.sent_at),delivered_at=COALESCE(portal_email_tracking.delivered_at,excluded.delivered_at),opened_at=COALESCE(portal_email_tracking.opened_at,excluded.opened_at),clicked_at=COALESCE(portal_email_tracking.clicked_at,excluded.clicked_at),delayed_at=COALESCE(portal_email_tracking.delayed_at,excluded.delayed_at),failed_at=COALESCE(portal_email_tracking.failed_at,excluded.failed_at),bounced_at=COALESCE(portal_email_tracking.bounced_at,excluded.bounced_at),complained_at=COALESCE(portal_email_tracking.complained_at,excluded.complained_at),suppressed_at=COALESCE(portal_email_tracking.suppressed_at,excluded.suppressed_at),last_event_at=MAX(COALESCE(portal_email_tracking.last_event_at,''),excluded.last_event_at),open_count=portal_email_tracking.open_count+excluded.open_count,click_count=portal_email_tracking.click_count+excluded.click_count,last_click_url=CASE WHEN excluded.last_click_url<>'' THEN excluded.last_click_url ELSE portal_email_tracking.last_click_url END,last_error=CASE WHEN excluded.last_error<>'' THEN excluded.last_error ELSE portal_email_tracking.last_error END,updated_at=excluded.updated_at`,
    id,emailId,toEmail,subject,next,fields.sentAt,fields.deliveredAt,fields.openedAt,fields.clickedAt,fields.delayedAt,fields.failedAt,fields.bouncedAt,fields.complainedAt,fields.suppressedAt,at,mapped==='opened'?1:0,mapped==='clicked'?1:0,clickUrl,error,JSON.stringify({providerEvent:type}),current.created_at||at,now);
  return json({ok:true,emailId,eventType:type,status:next,eventAt:at});
}

export async function listEmailHistory(store,body={}){
  ensureEmailTrackingSchema(store);
  const access=await requireViewer(store,body);if(!access.ok)return access.response;
  const orderId=sanitizeText(body.orderId,120),limit=Math.max(1,Math.min(250,Number(body.limit||100)));
  const sql=`SELECT t.*,o.title AS passage_title,o.format,c.full_name,c.company FROM portal_email_tracking t LEFT JOIN portal_orders o ON o.id=t.order_id LEFT JOIN portal_clients c ON c.id=o.client_id ${orderId?'WHERE t.order_id=?':''} ORDER BY COALESCE(t.last_event_at,t.sent_at,t.created_at) DESC LIMIT ?`;
  const rows=(orderId?store.sql.exec(sql,orderId,limit):store.sql.exec(sql,limit)).toArray().map(decorate);
  return json({ok:true,orderId,items:rows,summary:summarize(rows),tracking:{provider:'resend',providerSyncAvailable:Boolean(store.env?.RESEND_API_KEY),webhookConfigured:Boolean(store.env?.RESEND_WEBHOOK_SECRET),openSignal:'indicative-not-proof-of-human-reading'}});
}

export function syncProviderSnapshots(store,body={}){
  ensureEmailTrackingSchema(store);
  const snapshots=Array.isArray(body.snapshots)?body.snapshots.slice(0,40):[],now=new Date().toISOString();let updated=0;
  for(const snap of snapshots){
    const emailId=sanitizeText(snap.emailId||snap.id,220),mapped=status(`email.${sanitizeText(snap.lastEvent||snap.last_event,80).toLowerCase()}`);if(!emailId||mapped==='queued')continue;
    const row=store.sql.exec('SELECT * FROM portal_email_tracking WHERE email_id=? LIMIT 1',emailId).toArray()[0];if(!row)continue;
    const fields=eventFields(mapped,now,row),next=choose(row.status||'queued',mapped),subject=sanitizeText(snap.subject,320),toEmail=normalizeEmail(Array.isArray(snap.to)?snap.to[0]:snap.to);
    store.sql.exec(`UPDATE portal_email_tracking SET status=?,sent_at=COALESCE(sent_at,?),delivered_at=COALESCE(delivered_at,?),opened_at=COALESCE(opened_at,?),clicked_at=COALESCE(clicked_at,?),delayed_at=COALESCE(delayed_at,?),failed_at=COALESCE(failed_at,?),bounced_at=COALESCE(bounced_at,?),complained_at=COALESCE(complained_at,?),suppressed_at=COALESCE(suppressed_at,?),last_event_at=?,subject=CASE WHEN ?<>'' THEN ? ELSE subject END,to_email=CASE WHEN ?<>'' THEN ? ELSE to_email END,updated_at=? WHERE email_id=?`,next,fields.sentAt,fields.deliveredAt,fields.openedAt,fields.clickedAt,fields.delayedAt,fields.failedAt,fields.bouncedAt,fields.complainedAt,fields.suppressedAt,now,subject,subject,toEmail,toEmail,now,emailId);
    updated++;
  }
  return json({ok:true,updated});
}

function backfill(store){
  if(store.emailTrackingV82Backfilled)return;
  const events=store.sql.exec("SELECT order_id AS orderId,payload,created_at AS createdAt FROM portal_workflow_events WHERE event_key='email_sent' ORDER BY created_at DESC LIMIT 600").toArray();
  for(const event of events){
    const p=safeParse(event.payload),emailId=sanitizeText(p.emailId,220);if(!emailId)continue;
    const out=store.sql.exec('SELECT id,message_key AS messageKey,recipient_type AS recipientType,to_email AS toEmail,payload FROM portal_email_outbox WHERE order_id=? AND message_key=? AND to_email=? ORDER BY sent_at DESC LIMIT 1',event.orderId,sanitizeText(p.messageKey,180),normalizeEmail(p.toEmail)).toArray()[0]||{};
    store.sql.exec('INSERT OR IGNORE INTO portal_email_tracking(id,email_id,outbox_id,order_id,message_key,recipient_type,to_email,subject,status,sent_at,last_event_at,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',`email:${emailId}`,emailId,out.id||'',event.orderId||'',p.messageKey||out.messageKey||'',out.recipientType||'',normalizeEmail(p.toEmail||out.toEmail),subjectFor(p.messageKey||out.messageKey),'sent',event.createdAt,event.createdAt,out.payload||'{}',event.createdAt,event.createdAt);
  }
  const failed=store.sql.exec("SELECT id,order_id AS orderId,message_key AS messageKey,recipient_type AS recipientType,to_email AS toEmail,payload,last_error AS lastError,updated_at AS updatedAt,created_at AS createdAt FROM portal_email_outbox WHERE status='failed' ORDER BY updated_at DESC LIMIT 300").toArray();
  for(const row of failed)store.sql.exec('INSERT OR IGNORE INTO portal_email_tracking(id,outbox_id,order_id,message_key,recipient_type,to_email,subject,status,failed_at,last_event_at,last_error,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',`outbox:${row.id}`,row.id,row.orderId||'',row.messageKey||'',row.recipientType||'',normalizeEmail(row.toEmail),subjectFor(row.messageKey),'failed',row.updatedAt,row.updatedAt,row.lastError||'',row.payload||'{}',row.createdAt||row.updatedAt,row.updatedAt);
  store.emailTrackingV82Backfilled=true;
}

function decorate(r){return{id:r.id,emailId:r.email_id||'',outboxId:r.outbox_id||'',orderId:r.order_id||'',messageKey:r.message_key||'',recipientType:r.recipient_type||'',toEmail:r.to_email||'',subject:r.subject||subjectFor(r.message_key),status:r.status||'queued',sentAt:r.sent_at||null,deliveredAt:r.delivered_at||null,openedAt:r.opened_at||null,clickedAt:r.clicked_at||null,delayedAt:r.delayed_at||null,failedAt:r.failed_at||null,bouncedAt:r.bounced_at||null,complainedAt:r.complained_at||null,suppressedAt:r.suppressed_at||null,lastEventAt:r.last_event_at||null,openCount:Number(r.open_count||0),clickCount:Number(r.click_count||0),lastClickUrl:r.last_click_url||'',lastError:r.last_error||'',payload:safeParse(r.payload),passageTitle:r.passage_title||'',format:r.format||'',clientName:r.full_name||r.company||'',createdAt:r.created_at};}
function summarize(items){return{total:items.length,sent:items.filter(i=>i.sentAt).length,delivered:items.filter(i=>i.deliveredAt||['delivered','opened','clicked'].includes(i.status)).length,opened:items.filter(i=>i.openedAt||['opened','clicked'].includes(i.status)).length,clicked:items.filter(i=>i.clickedAt||i.status==='clicked').length,failed:items.filter(i=>FAILURES.has(i.status)).length,pending:items.filter(i=>['queued','delayed'].includes(i.status)).length};}
function eventFields(s,at,c={}){return{sentAt:s==='sent'?at:c.sent_at||null,deliveredAt:s==='delivered'?at:c.delivered_at||null,openedAt:s==='opened'?at:c.opened_at||null,clickedAt:s==='clicked'?at:c.clicked_at||null,delayedAt:s==='delayed'?at:c.delayed_at||null,failedAt:s==='failed'?at:c.failed_at||null,bouncedAt:s==='bounced'?at:c.bounced_at||null,complainedAt:s==='complained'?at:c.complained_at||null,suppressedAt:s==='suppressed'?at:c.suppressed_at||null};}
function choose(current,incoming){if(FAILURES.has(incoming))return incoming;if(FAILURES.has(current))return current;return(RANK[incoming]||0)>=(RANK[current]||0)?incoming:current;}
function status(type){return({sent:'sent',delivered:'delivered',opened:'opened',clicked:'clicked',delivery_delayed:'delayed',delayed:'delayed',failed:'failed',bounced:'bounced',complained:'complained',suppressed:'suppressed'})[String(type||'').toLowerCase().replace(/^email\./u,'')]||'queued';}
function subjectFor(key){const v=String(key||'').replace(/_[0-9]{4}-[0-9]{2}-[0-9]{2}.*$/u,'').replace(/_/gu,' ').trim();return v?v.charAt(0).toUpperCase()+v.slice(1):'Notification Neptune Media';}
function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
function iso(v){const d=new Date(v||'');return Number.isNaN(d.getTime())?null:d.toISOString();}
