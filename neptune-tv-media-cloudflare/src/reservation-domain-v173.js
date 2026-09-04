import {ensureReservationSlotsV172Schema,holdReservationSlotV172,mutateAdminReservationSlotV172} from './reservation-slot-management-v172.js';
import {ensureMediaCatalogV98Schema} from './portal-media-catalog-v98.js';
import {configurationVisualV98,formatVisualV98} from './media-catalog-visuals-v98.js';
import {json,sha256} from './security.js';
import {
  RESERVATION_MIN_LEAD_DAYS,
  RESERVATION_POLICY_V173_RELEASE,
  RESERVATION_TIMEZONE,
  minimumReservationDateV173,
  nonBookableDatesForMonthV173,
  reservationDatePolicyV173,
} from './reservation-policy-v173.js';

export const RESERVATION_DOMAIN_V173_RELEASE='neptune-reservation-domain-20260904-v173';
const PAID=new Set(['paid','succeeded','complete','completed','no_payment_required']);
const EDIT_ROLES=new Set(['admin','editor']);

export function ensureReservationDomainV173Schema(store){
  ensureReservationSlotsV172Schema(store);
  ensureMediaCatalogV98Schema(store);
  if(store.reservationDomainV173Ready)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_order_snapshots_v173(
      order_id TEXT PRIMARY KEY REFERENCES portal_orders(id) ON DELETE CASCADE,
      snapshot_version INTEGER NOT NULL DEFAULT 1,
      snapshot_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'payment',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_order_lifecycle_v173(
      order_id TEXT PRIMARY KEY REFERENCES portal_orders(id) ON DELETE CASCADE,
      reservation_status TEXT NOT NULL DEFAULT 'confirmed',
      current_date TEXT NOT NULL DEFAULT '',
      current_daypart TEXT NOT NULL DEFAULT '',
      cancelled_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_order_lifecycle_reservation_v173
      ON portal_order_lifecycle_v173(reservation_status,updated_at DESC);
  `);
  store.reservationDomainV173Ready=true;
}

export async function validateReservationSelectionV173(store,raw={}){
  ensureReservationDomainV173Schema(store);
  const checked=await checkSelection(store,raw);
  if(!checked.ok)return json({error:checked.error,policy:checked.policy||policySummary()},checked.status||400);
  return json({ok:true,release:RESERVATION_DOMAIN_V173_RELEASE,policy:checked.policy,offerId:checked.offer.id,supplierId:checked.offer.supplierId});
}

export async function reservationAvailabilityV173(store,raw={}){
  ensureReservationDomainV173Schema(store);
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
  const nonBookableDates=nonBookableDatesForMonthV173(month);
  return json({
    ok:true,
    release:RESERVATION_DOMAIN_V173_RELEASE,
    policyRelease:RESERVATION_POLICY_V173_RELEASE,
    offerId:offer.id,
    month,
    unavailable,
    policy:{...policySummary(),nonBookableDates},
  });
}

export async function holdReservationSlotV173(store,raw={}){
  ensureReservationDomainV173Schema(store);
  const checked=await checkSelection(store,raw);
  if(!checked.ok)return json({error:checked.error,policy:checked.policy||policySummary()},checked.status||400);
  return holdReservationSlotV172(store,raw);
}

export async function mutateAdminReservationSlotV173(store,body={}){
  ensureReservationDomainV173Schema(store);
  const actor=await store.requireSession(String(body.token||''));
  if(!actor||!EDIT_ROLES.has(actor.role))return json({error:'forbidden'},403);
  const action=clean(body.action);
  let slot=null;
  if(action!=='block'){
    slot=store.sql.exec(`SELECT id,order_id AS orderId,slot_date AS slotDate,daypart,status
      FROM portal_reservation_slots_v172 WHERE id=? LIMIT 1`,clean(body.id)).toArray()[0]||null;
    if(!slot)return json({error:'slot_not_found'},404);
  }
  if(action==='move'){
    const policy=reservationDatePolicyV173(body.slotDate);
    if(!policy.ok)return json({error:policyError(policy),policy},400);
    if(!cleanDaypart(body.daypart))return json({error:'invalid_slot'},400);
  }
  if(action==='block'){
    const date=cleanDate(body.slotDate);
    const daypart=cleanDaypart(body.daypart);
    if(!date||!daypart)return json({error:'invalid_slot'},400);
  }
  const response=await mutateAdminReservationSlotV172(store,body);
  if(!response.ok)return response;
  if(slot?.orderId){
    if(action==='cancel'||action==='release'){
      syncOrderLifecycleV173(store,slot.orderId,{status:'cancelled',date:slot.slotDate,daypart:slot.daypart});
      const at=new Date().toISOString();
      store.sql.exec(`UPDATE portal_orders SET next_action='Votre réservation de passage a été annulée. Contactez Neptune Media si vous souhaitez réserver un nouveau créneau.',updated_at=? WHERE id=?`,at,slot.orderId);
    }else if(action==='move'){
      syncOrderLifecycleV173(store,slot.orderId,{status:'confirmed',date:cleanDate(body.slotDate),daypart:cleanDaypart(body.daypart)});
      const at=new Date().toISOString();
      store.sql.exec(`UPDATE portal_orders SET next_action='Votre nouveau créneau de passage est confirmé. Consultez le détail de votre réservation dans votre espace client.',updated_at=? WHERE id=?`,at,slot.orderId);
    }else if(action==='confirm'){
      syncOrderLifecycleV173(store,slot.orderId,{status:'confirmed',date:slot.slotDate,daypart:slot.daypart});
    }
  }
  return response;
}

export function confirmOrderLifecycleV173(store,orderId){
  ensureReservationDomainV173Schema(store);
  const id=clean(orderId);
  if(!id)return null;
  const slot=store.sql.exec(`SELECT slot_date AS slotDate,daypart,status FROM portal_reservation_slots_v172
    WHERE order_id=? ORDER BY updated_at DESC LIMIT 1`,id).toArray()[0]||null;
  const sales=store.sql.exec('SELECT requested_date AS requestedDate,requested_daypart AS requestedDaypart FROM portal_order_sales_v96 WHERE order_id=? LIMIT 1',id).toArray()[0]||{};
  const status=slot?.status==='payment_conflict'?'conflict':slot?.status==='cancelled'?'cancelled':'confirmed';
  return syncOrderLifecycleV173(store,id,{status,date:slot?.slotDate||sales.requestedDate||'',daypart:slot?.daypart||sales.requestedDaypart||''});
}

export function syncOrderLifecycleV173(store,orderId,{status='confirmed',date='',daypart=''}={}){
  ensureReservationDomainV173Schema(store);
  const id=clean(orderId);
  if(!id)return null;
  const at=new Date().toISOString(),reservationStatus=['confirmed','cancelled','conflict','pending'].includes(status)?status:'confirmed';
  const currentDate=cleanDate(date),currentDaypart=cleanDaypart(daypart);
  const cancelledAt=reservationStatus==='cancelled'?at:null;
  store.sql.exec(`INSERT INTO portal_order_lifecycle_v173(order_id,reservation_status,current_date,current_daypart,cancelled_at,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET
      reservation_status=excluded.reservation_status,
      current_date=CASE WHEN excluded.current_date<>'' THEN excluded.current_date ELSE portal_order_lifecycle_v173.current_date END,
      current_daypart=CASE WHEN excluded.current_daypart<>'' THEN excluded.current_daypart ELSE portal_order_lifecycle_v173.current_daypart END,
      cancelled_at=CASE WHEN excluded.reservation_status='cancelled' THEN excluded.cancelled_at ELSE NULL END,
      updated_at=excluded.updated_at`,id,reservationStatus,currentDate,currentDaypart,cancelledAt,at);
  return lifecycleForOrder(store,id);
}

export function capturePaidOrderSnapshotV173(store,orderId,{source='payment'}={}){
  ensureReservationDomainV173Schema(store);
  const id=clean(orderId);
  if(!id)return null;
  const existing=snapshotRow(store,id);
  if(existing)return parseSnapshot(existing.snapshotJson);
  const order=store.sql.exec(`SELECT o.id,o.order_reference AS orderReference,o.product_code AS productCode,o.title,o.format,
      o.payment_status AS paymentStatus,o.amount_total AS amountTotal,o.currency,o.created_at AS createdAt,
      c.id AS clientId,c.email,c.full_name AS fullName,c.company
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id WHERE o.id=? LIMIT 1`,id).toArray()[0]||null;
  if(!order||!PAID.has(String(order.paymentStatus||'').toLowerCase()))return null;
  const sales=store.sql.exec(`SELECT prospect_id AS prospectId,city_id AS cityId,format_id AS formatId,offer_id AS offerId,supplier_id AS supplierId,
      city_name AS cityName,format_name AS formatName,offer_name AS offerName,supplier_name AS supplierName,
      client_price_cents AS clientPriceCents,currency,requested_date AS requestedDate,requested_daypart AS requestedDaypart
    FROM portal_order_sales_v96 WHERE order_id=? LIMIT 1`,id).toArray()[0]||{};
  const format=sales.formatId?store.sql.exec(`SELECT id,slug,name,concept,description,duration_label AS durationLabel
    FROM portal_media_formats_v95 WHERE id=? LIMIT 1`,sales.formatId).toArray()[0]||{}:{};
  const detail=sales.formatId?store.sql.exec(`SELECT shoot_minutes AS shootMinutes,total_minutes AS totalMinutes
    FROM portal_media_format_details_v116 WHERE format_id=? LIMIT 1`,sales.formatId).toArray()[0]||{}:{};
  const configuration=sales.prospectId?store.sql.exec(`SELECT configuration_choice AS configurationChoice
    FROM portal_reservation_configuration_v96 WHERE prospect_id=? LIMIT 1`,sales.prospectId).toArray()[0]||{}:{};
  const physicalLabel=String(configuration.configurationChoice||'');
  const physical=sales.formatId&&physicalLabel?store.sql.exec(`SELECT description,image_url AS imageUrl
    FROM portal_media_configuration_visuals_v98 WHERE format_id=? AND label=? LIMIT 1`,sales.formatId,physicalLabel).toArray()[0]||{}:{};
  const paidAmount=Number(order.amountTotal||0)>0?Number(order.amountTotal):Number(sales.clientPriceCents||0);
  const snapshot={
    version:1,
    capturedAt:new Date().toISOString(),
    source:String(source||'payment').slice(0,60),
    order:{id:order.id,reference:order.orderReference||'',productCode:order.productCode||'',title:order.title||'',paidAmountCents:paidAmount,currency:order.currency||sales.currency||'eur',paymentStatus:order.paymentStatus||''},
    customer:{clientId:order.clientId||'',email:order.email||'',fullName:order.fullName||'',company:order.company||''},
    concept:{id:sales.formatId||'',slug:format.slug||'',name:sales.formatName||format.name||order.format||'',editorialLine:format.concept||'',description:format.description||'',durationLabel:format.durationLabel||'',shootMinutes:Number(detail.shootMinutes||0),totalMinutes:Number(detail.totalMinutes||0)},
    city:{id:sales.cityId||'',name:sales.cityName||''},
    physical:{label:physicalLabel,description:physical.description||'',imageUrl:physical.imageUrl||''},
    offer:{id:sales.offerId||'',name:sales.offerName||'',catalogPriceCents:Number(sales.clientPriceCents||0),currency:sales.currency||order.currency||'eur'},
    supplier:{id:sales.supplierId||'',name:sales.supplierName||''},
    reservation:{initialDate:sales.requestedDate||'',initialDaypart:sales.requestedDaypart||''},
  };
  const at=snapshot.capturedAt;
  store.sql.exec(`INSERT OR IGNORE INTO portal_order_snapshots_v173(order_id,snapshot_version,snapshot_json,source,created_at)
    VALUES(?,1,?,?,?)`,id,JSON.stringify(snapshot),snapshot.source,at);
  if(!lifecycleForOrder(store,id))syncOrderLifecycleV173(store,id,{status:'confirmed',date:sales.requestedDate||'',daypart:sales.requestedDaypart||''});
  return parseSnapshot(snapshotRow(store,id)?.snapshotJson)||snapshot;
}

export function backfillPaidOrderSnapshotsV173(store,{limit=120}={}){
  ensureReservationDomainV173Schema(store);
  const max=Math.max(1,Math.min(500,Number(limit||120)));
  const rows=store.sql.exec(`SELECT o.id FROM portal_orders o
    LEFT JOIN portal_order_snapshots_v173 s ON s.order_id=o.id
    WHERE lower(o.payment_status) IN ('paid','succeeded','complete','completed','no_payment_required') AND s.order_id IS NULL
    ORDER BY o.created_at DESC LIMIT ?`,max).toArray();
  let captured=0;
  for(const row of rows)if(capturePaidOrderSnapshotV173(store,row.id,{source:'legacy-backfill'}))captured+=1;
  return{ok:true,release:RESERVATION_DOMAIN_V173_RELEASE,scanned:rows.length,captured};
}

export async function enrichPortalSessionResponseV173(store,response){
  if(!response?.ok)return response;
  ensureReservationDomainV173Schema(store);
  const data=await response.json().catch(()=>null);
  if(!data||!Array.isArray(data.orders))return response;
  for(const order of data.orders){
    if(PAID.has(String(order.paymentStatus||'').toLowerCase()))capturePaidOrderSnapshotV173(store,order.id,{source:'client-session-backfill'});
    const snapshot=snapshotRow(store,order.id);
    const lifecycle=lifecycleForOrder(store,order.id)||fallbackLifecycle(store,order.id);
    order.reservationSnapshot=snapshot?parseSnapshot(snapshot.snapshotJson):null;
    order.reservation=lifecycle?{
      status:lifecycle.reservationStatus,
      currentDate:lifecycle.currentDate||'',
      currentDaypart:lifecycle.currentDaypart||'',
      cancelledAt:lifecycle.cancelledAt||null,
      updatedAt:lifecycle.updatedAt||'',
    }:null;
  }
  data.reservationDomainRelease=RESERVATION_DOMAIN_V173_RELEASE;
  return json(data,response.status);
}

export async function enhanceReservationCatalogV173(store,response){
  if(!response?.ok)return response;
  ensureReservationDomainV173Schema(store);
  materializeConfigurationDescriptions(store);
  const data=await response.json().catch(()=>null);
  if(!data)return response;
  const formats=new Map(store.sql.exec(`SELECT id,slug,name,concept,description,duration_label AS durationLabel
    FROM portal_media_formats_v95`).toArray().map(row=>[row.id,row]));
  const enrichFormat=(item)=>{
    if(!item?.id)return item;
    const canonical=formats.get(item.id)||{};
    const slug=canonical.slug||item.slug||'';
    item.name=canonical.name||item.name||'';
    item.slug=slug;
    item.editorialLine=canonical.concept||item.editorialLine||item.concept||'';
    item.concept=item.editorialLine;
    item.description=canonical.description||item.description||'';
    item.durationLabel=canonical.durationLabel||item.durationLabel||'';
    const visual=formatVisualV98(store,item.id,slug);
    item.image=visual.image||item.image||'';
    item.imageSource=visual.imageSource||item.imageSource||'';
    for(const offer of item.offers||[]){
      offer.configurations=(offer.configurations||[]).map(config=>{
        const label=typeof config==='string'?config:String(config?.label||'');
        if(!label)return config;
        const visualConfig=configurationVisualV98(store,item.id,slug,label);
        return typeof config==='object'?{...visualConfig,...config,description:config.description||visualConfig.description}:{...visualConfig};
      });
    }
    return item;
  };
  for(const city of data.cities||[])for(const format of city.formats||[])enrichFormat(format);
  for(const concept of data.concepts||[]){
    enrichFormat(concept);
    for(const city of concept.cities||[]){
      city.physicalFormats=(city.physicalFormats||[]).map(config=>{
        const label=typeof config==='string'?config:String(config?.label||'');
        if(!label)return config;
        const visualConfig=configurationVisualV98(store,concept.id,concept.slug||'',label);
        return typeof config==='object'?{...visualConfig,...config,description:config.description||visualConfig.description}:{...visualConfig};
      });
    }
  }
  data.reservationPolicy={...policySummary()};
  data.reservationDomainRelease=RESERVATION_DOMAIN_V173_RELEASE;
  return json(data,response.status);
}

function materializeConfigurationDescriptions(store){
  const rows=store.sql.exec(`SELECT DISTINCT o.format_id AS formatId,f.slug,c.label
    FROM portal_offer_configurations_v96 c
    JOIN portal_media_offers_v96 o ON o.id=c.offer_id
    JOIN portal_media_formats_v95 f ON f.id=o.format_id
    WHERE c.active=1`).toArray();
  const at=new Date().toISOString();
  for(const row of rows){
    const current=store.sql.exec(`SELECT image_url AS imageUrl,description FROM portal_media_configuration_visuals_v98
      WHERE format_id=? AND label=? LIMIT 1`,row.formatId,row.label).toArray()[0]||null;
    if(String(current?.description||'').trim())continue;
    const fallback=configurationVisualV98(store,row.formatId,row.slug,row.label);
    const description=String(fallback.description||'Une configuration adaptée à votre concept.').trim().slice(0,500);
    if(current)store.sql.exec(`UPDATE portal_media_configuration_visuals_v98 SET description=?,updated_at=? WHERE format_id=? AND label=?`,description,at,row.formatId,row.label);
    else store.sql.exec(`INSERT INTO portal_media_configuration_visuals_v98(format_id,label,image_url,description,updated_at) VALUES(?,?,?, ?,?)`,row.formatId,row.label,'',description,at);
  }
}

async function checkSelection(store,raw){
  const prospect=await prospectByToken(store,raw.token||raw.reservationToken,{allowPaid:true});
  if(!prospect)return{ok:false,error:'prospect_token_expired',status:401};
  if(prospect.status==='paid')return{ok:false,error:'reservation_already_paid',status:409};
  if(!['captured','tunnel_started'].includes(prospect.status))return{ok:false,error:'prospect_token_expired',status:401};
  const offer=offerContext(store,clean(raw.offerId));
  if(!offer||!offer.active)return{ok:false,error:'offer_not_available',status:409};
  const cityId=clean(raw.cityId),formatId=clean(raw.formatId);
  if(cityId&&cityId!==offer.cityId)return{ok:false,error:'offer_not_available',status:409};
  if(formatId&&formatId!==offer.formatId)return{ok:false,error:'offer_not_available',status:409};
  const date=cleanDate(raw.requestedDate),daypart=cleanDaypart(raw.requestedDaypart);
  const policy=reservationDatePolicyV173(date);
  if(!policy.ok)return{ok:false,error:policyError(policy),status:400,policy};
  if(!daypart)return{ok:false,error:'requested_slot_required',status:400,policy};
  const occupied=store.sql.exec(`SELECT id,status,prospect_id AS prospectId FROM portal_reservation_slots_v172
    WHERE supplier_id=? AND slot_date=? AND daypart=? AND status IN ('hold','confirmed','blocked') LIMIT 1`,offer.supplierId,date,daypart).toArray()[0]||null;
  if(occupied&&!(occupied.status==='hold'&&occupied.prospectId===prospect.id))return{ok:false,error:'slot_unavailable',status:409,policy};
  return{ok:true,prospect,offer,date,daypart,policy};
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
  const row=store.sql.exec(`SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,o.active,
      c.active AS cityActive,f.active AS formatActive,s.active AS supplierActive
    FROM portal_media_offers_v96 o
    JOIN portal_media_cities_v96 c ON c.id=o.city_id
    JOIN portal_media_formats_v95 f ON f.id=o.format_id
    JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id
    WHERE o.id=? LIMIT 1`,id).toArray()[0]||null;
  if(row)row.active=Boolean(row.active&&row.cityActive&&row.formatActive&&row.supplierActive);
  return row;
}

function snapshotRow(store,orderId){return store.sql.exec(`SELECT snapshot_json AS snapshotJson,source,created_at AS createdAt
  FROM portal_order_snapshots_v173 WHERE order_id=? LIMIT 1`,orderId).toArray()[0]||null;}
function lifecycleForOrder(store,orderId){return store.sql.exec(`SELECT reservation_status AS reservationStatus,current_date AS currentDate,current_daypart AS currentDaypart,cancelled_at AS cancelledAt,updated_at AS updatedAt
  FROM portal_order_lifecycle_v173 WHERE order_id=? LIMIT 1`,orderId).toArray()[0]||null;}
function fallbackLifecycle(store,orderId){const row=store.sql.exec(`SELECT requested_date AS currentDate,requested_daypart AS currentDaypart FROM portal_order_sales_v96 WHERE order_id=? LIMIT 1`,orderId).toArray()[0]||null;if(!row)return null;return{reservationStatus:'confirmed',...row,cancelledAt:null,updatedAt:''};}
function parseSnapshot(value){try{return JSON.parse(String(value||''));}catch{return null;}}
function policySummary(){return{leadDays:RESERVATION_MIN_LEAD_DAYS,minDate:minimumReservationDateV173(),timezone:RESERVATION_TIMEZONE,release:RESERVATION_POLICY_V173_RELEASE};}
function policyError(policy){return policy?.reason==='lead_time'?'reservation_lead_time_15_days':'invalid_requested_date';}
function clean(value){return String(value||'').trim().slice(0,160);}
function cleanDate(value){const text=clean(value);return /^\d{4}-\d{2}-\d{2}$/u.test(text)?text:'';}
function cleanMonth(value){const text=clean(value);return /^\d{4}-\d{2}$/u.test(text)?text:'';}
function cleanDaypart(value){const text=clean(value);return text==='morning'||text==='afternoon'?text:'';}
function monthBounds(month){const [year,number]=month.split('-').map(Number),start=`${year}-${String(number).padStart(2,'0')}-01`;const next=new Date(Date.UTC(year,number,1));return[start,`${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(next.getUTCDate()).padStart(2,'0')}`];}
