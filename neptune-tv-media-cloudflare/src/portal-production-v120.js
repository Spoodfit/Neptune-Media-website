import { ensureMediaCatalogV98Schema, mediaCatalogContextV98 } from './portal-media-catalog-v98.js';
import { ensurePortalSchema } from './portal-schema.js';
import { ensureSalesTunnelOptionsV96Schema } from './portal-sales-tunnel-options-v96.js';
import { configurationVisualV98, saveConfigurationVisualV98, safeVisualUrl } from './media-catalog-visuals-v98.js';
import { requireOperator } from './workflow-db-v5.js';
import { json, sanitizeText, sanitizeUrl } from './security.js';

export const PRODUCTION_V120_RELEASE='neptune-production-cockpit-20260815-v120';
const PAYMENT_METHODS=new Set(['bank_transfer','payment_link','invoice','other']);

export function ensureProductionV120Schema(store){
  ensureMediaCatalogV98Schema(store);
  ensureSalesTunnelOptionsV96Schema(store);
  ensurePortalSchema(store);
  if(store.productionV120SchemaReady)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_supplier_payment_settings_v120(
      supplier_id TEXT PRIMARY KEY REFERENCES portal_media_suppliers_v95(id) ON DELETE CASCADE,
      payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
      payment_url TEXT NOT NULL DEFAULT '',
      payment_terms_days INTEGER NOT NULL DEFAULT 0,
      billing_email TEXT NOT NULL DEFAULT '',
      payment_notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_format_preparation_cards_v120(
      id TEXT PRIMARY KEY,
      format_id TEXT NOT NULL REFERENCES portal_media_formats_v95(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      public_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(format_id,label)
    );
    CREATE TABLE IF NOT EXISTS portal_order_supplier_snapshot_v120(
      order_id TEXT PRIMARY KEY REFERENCES portal_orders(id) ON DELETE CASCADE,
      city_id TEXT NOT NULL DEFAULT '',
      supplier_id TEXT NOT NULL DEFAULT '',
      service_id TEXT NOT NULL DEFAULT '',
      rate_id TEXT NOT NULL DEFAULT '',
      format_id TEXT NOT NULL DEFAULT '',
      supplier_name TEXT NOT NULL DEFAULT '',
      city_name TEXT NOT NULL DEFAULT '',
      format_name TEXT NOT NULL DEFAULT '',
      rate_label TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      net_cents INTEGER NOT NULL DEFAULT 0,
      vat_rate_bps INTEGER NOT NULL DEFAULT 0,
      gross_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'eur',
      payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
      payment_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_preparation_cards_format_v120 ON portal_format_preparation_cards_v120(format_id,active,public_order,label);
    CREATE INDEX IF NOT EXISTS idx_order_supplier_snapshot_supplier_v120 ON portal_order_supplier_snapshot_v120(supplier_id,updated_at DESC);
    CREATE TRIGGER IF NOT EXISTS portal_supplier_payment_snapshot_insert_v120
    AFTER INSERT ON portal_supplier_payments
    WHEN EXISTS(SELECT 1 FROM portal_order_supplier_snapshot_v120 s WHERE s.order_id=NEW.order_id)
    BEGIN
      UPDATE portal_supplier_payments
      SET supplier_name=(SELECT supplier_name FROM portal_order_supplier_snapshot_v120 WHERE order_id=NEW.order_id),
          amount_total=(SELECT gross_cents FROM portal_order_supplier_snapshot_v120 WHERE order_id=NEW.order_id),
          currency=(SELECT currency FROM portal_order_supplier_snapshot_v120 WHERE order_id=NEW.order_id),
          updated_at=NEW.updated_at
      WHERE id=NEW.id;
    END;
  `);
  migratePreparationCards(store);
  syncPreparationCardsToAllOffers(store);
  store.productionV120SchemaReady=true;
}

export async function handleProductionActionV120(store,body={}){
  ensureProductionV120Schema(store);
  const access=await requireOperator(store,body);
  if(!access.ok)return access.response;
  const p=payload(body),action=String(p.catalogAction||'');
  if(action==='production_context')return productionContext(store,body);
  if(action==='production_supplier_settings_save')return saveSupplierSettings(store,p,access.actor);
  if(action==='production_preparation_card_save')return savePreparationCard(store,p,access.actor);
  if(action==='production_preparation_card_archive')return archivePreparationCard(store,p,access.actor);
  if(action==='production_order_supplier_assign')return assignOrderSupplier(store,p,access.actor);
  return json({error:'production_action_not_found'},404);
}

export async function productionContext(store,body={}){
  ensureProductionV120Schema(store);
  const catalogResponse=await mediaCatalogContextV98(store,body);
  const catalog=await catalogResponse.json().catch(()=>({}));
  if(!catalogResponse.ok)return json(catalog,catalogResponse.status);
  const settings=new Map(supplierSettingsRows(store).map(row=>[row.supplierId,row]));
  const suppliers=(catalog.suppliers||[]).map(supplier=>({...supplier,payment:settings.get(supplier.id)||defaultSupplierSettings(supplier.id,supplier.email)}));
  return json({
    ...catalog,
    productionRelease:PRODUCTION_V120_RELEASE,
    suppliers,
    preparationCards:preparationCardRows(store),
    passages:passageRows(store),
  });
}

export function captureOrderSupplierSnapshotV120(store,orderId,rawPayload={}){
  ensureProductionV120Schema(store);
  const p=rawPayload?.payload&&typeof rawPayload.payload==='object'?rawPayload.payload:rawPayload||{};
  const rateId=cleanId(p.supplierRateId),serviceId=cleanId(p.serviceId);
  if(!orderId||!rateId)return null;
  const rate=store.sql.exec(`
    SELECT r.id AS rateId,r.service_id AS serviceId,r.label AS rateLabel,r.duration_minutes AS durationMinutes,
           r.net_cents AS netCents,r.vat_rate_bps AS vatRateBps,r.gross_cents AS grossCents,r.active AS rateActive,
           sv.city_id AS cityId,sv.supplier_id AS supplierId,sv.format_id AS formatId,sv.active AS serviceActive,
           c.name AS cityName,s.name AS supplierName,f.name AS formatName
    FROM portal_supplier_rates_v116 r
    JOIN portal_supplier_services_v116 sv ON sv.id=r.service_id
    JOIN portal_media_cities_v96 c ON c.id=sv.city_id
    JOIN portal_media_suppliers_v95 s ON s.id=sv.supplier_id
    JOIN portal_media_formats_v95 f ON f.id=sv.format_id
    WHERE r.id=? LIMIT 1
  `,rateId).toArray()[0];
  if(!rate)return{ok:false,error:'supplier_rate_not_found'};
  if(serviceId&&rate.serviceId!==serviceId)return{ok:false,error:'supplier_rate_service_mismatch'};
  if(cleanId(p.supplierId)&&rate.supplierId!==cleanId(p.supplierId))return{ok:false,error:'supplier_rate_supplier_mismatch'};
  if(cleanId(p.cityId)&&rate.cityId!==cleanId(p.cityId))return{ok:false,error:'supplier_rate_city_mismatch'};
  if(cleanId(p.formatId)&&rate.formatId!==cleanId(p.formatId))return{ok:false,error:'supplier_rate_format_mismatch'};
  if(!Number(rate.rateActive)||!Number(rate.serviceActive))return{ok:false,error:'supplier_rate_inactive'};
  return saveOrderSnapshot(store,orderId,rate);
}

export function reconcileSupplierPaymentFromSnapshotV120(store,orderId){
  ensureProductionV120Schema(store);
  const snapshot=store.sql.exec('SELECT supplier_name AS supplierName,gross_cents AS grossCents,currency FROM portal_order_supplier_snapshot_v120 WHERE order_id=? LIMIT 1',orderId).toArray()[0];
  if(!snapshot)return false;
  const payment=store.sql.exec('SELECT id,status FROM portal_supplier_payments WHERE order_id=? LIMIT 1',orderId).toArray()[0];
  if(!payment||payment.status==='paid')return false;
  store.sql.exec('UPDATE portal_supplier_payments SET supplier_name=?,amount_total=?,currency=?,updated_at=? WHERE id=?',snapshot.supplierName,Number(snapshot.grossCents||0),snapshot.currency||'eur',new Date().toISOString(),payment.id);
  return true;
}

function saveSupplierSettings(store,p,actor){
  const supplierId=cleanId(p.supplierId);
  if(!store.sql.exec('SELECT id FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',supplierId).toArray()[0])return json({error:'supplier_not_found'},404);
  const requested=String(p.paymentMethod||'bank_transfer').trim(),paymentMethod=PAYMENT_METHODS.has(requested)?requested:'bank_transfer';
  const paymentUrl=sanitizeUrl(p.paymentUrl,1200),terms=clamp(p.paymentTermsDays,0,180),billingEmail=normalizeEmail(p.billingEmail),paymentNotes=sanitizeText(p.paymentNotes,1200),at=new Date().toISOString();
  store.sql.exec(`INSERT INTO portal_supplier_payment_settings_v120(supplier_id,payment_method,payment_url,payment_terms_days,billing_email,payment_notes,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(supplier_id) DO UPDATE SET payment_method=excluded.payment_method,payment_url=excluded.payment_url,payment_terms_days=excluded.payment_terms_days,billing_email=excluded.billing_email,payment_notes=excluded.payment_notes,updated_at=excluded.updated_at`,
  supplierId,paymentMethod,paymentUrl,terms,billingEmail,paymentNotes,at);
  store.audit?.(actor?.id||'studio','supplier_payment_settings_saved_v120','supplier',supplierId,{paymentMethod,paymentTermsDays:terms});
  return json({ok:true,productionRelease:PRODUCTION_V120_RELEASE,supplierId,payment:settingsForSupplier(store,supplierId)});
}

function savePreparationCard(store,p,actor){
  const formatId=cleanId(p.formatId),label=sanitizeText(p.label,100).trim();
  if(!formatId||!label)return json({error:'preparation_card_required'},400);
  const format=store.sql.exec('SELECT id,slug FROM portal_media_formats_v95 WHERE id=? LIMIT 1',formatId).toArray()[0];
  if(!format)return json({error:'format_not_found'},404);
  const id=cleanId(p.id)||crypto.randomUUID(),current=store.sql.exec('SELECT id,label FROM portal_format_preparation_cards_v120 WHERE id=? LIMIT 1',id).toArray()[0];
  const duplicate=store.sql.exec('SELECT id FROM portal_format_preparation_cards_v120 WHERE format_id=? AND label=? AND id<>? LIMIT 1',formatId,label,id).toArray()[0];
  if(duplicate)return json({error:'preparation_card_already_exists'},409);
  const imageUrl=safeVisualUrl(p.imageUrl),description=sanitizeText(p.description,500),active=boolInt(p.active),publicOrder=clamp(p.publicOrder,0,9999),at=new Date().toISOString();
  if(current){
    store.sql.exec('UPDATE portal_format_preparation_cards_v120 SET format_id=?,label=?,image_url=?,description=?,active=?,public_order=?,updated_at=? WHERE id=?',formatId,label,imageUrl,description,active,publicOrder,at,id);
    if(current.label!==label){
      store.sql.exec('UPDATE portal_offer_configurations_v96 SET label=?,updated_at=? WHERE offer_id IN (SELECT id FROM portal_media_offers_v96 WHERE format_id=?) AND label=?',label,at,formatId,current.label);
      store.sql.exec('DELETE FROM portal_media_configuration_visuals_v98 WHERE format_id=? AND label=?',formatId,current.label);
    }
  }else{
    store.sql.exec('INSERT INTO portal_format_preparation_cards_v120(id,format_id,label,image_url,description,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',id,formatId,label,imageUrl,description,active,publicOrder,at,at);
  }
  saveConfigurationVisualV98(store,formatId,label,imageUrl,description);
  syncPreparationCardToOffers(store,{formatId,label,active:Boolean(active),publicOrder});
  store.audit?.(actor?.id||'studio','format_preparation_card_saved_v120','media_format',formatId,{cardId:id,label,active:Boolean(active)});
  return json({ok:true,productionRelease:PRODUCTION_V120_RELEASE,savedId:id,preparationCards:preparationCardRows(store).filter(card=>card.formatId===formatId)});
}

function archivePreparationCard(store,p,actor){
  const id=cleanId(p.id),row=store.sql.exec('SELECT id,format_id AS formatId,label FROM portal_format_preparation_cards_v120 WHERE id=? LIMIT 1',id).toArray()[0];
  if(!row)return json({error:'preparation_card_not_found'},404);
  const at=new Date().toISOString();
  store.sql.exec('UPDATE portal_format_preparation_cards_v120 SET active=0,updated_at=? WHERE id=?',at,id);
  store.sql.exec('UPDATE portal_offer_configurations_v96 SET active=0,updated_at=? WHERE offer_id IN (SELECT id FROM portal_media_offers_v96 WHERE format_id=?) AND label=?',at,row.formatId,row.label);
  store.audit?.(actor?.id||'studio','format_preparation_card_archived_v120','media_format',row.formatId,{cardId:id,label:row.label});
  return json({ok:true,productionRelease:PRODUCTION_V120_RELEASE});
}

function assignOrderSupplier(store,p,actor){
  const orderId=cleanId(p.orderId);
  if(!store.sql.exec('SELECT id FROM portal_orders WHERE id=? LIMIT 1',orderId).toArray()[0])return json({error:'order_not_found'},404);
  const snapshot=captureOrderSupplierSnapshotV120(store,orderId,p);
  if(!snapshot)return json({error:'supplier_rate_required'},400);
  if(snapshot.ok===false)return json({error:snapshot.error},409);
  store.audit?.(actor?.id||'studio','order_supplier_assigned_v120','portal_order',orderId,{supplierId:snapshot.supplierId,serviceId:snapshot.serviceId,rateId:snapshot.rateId,grossCents:snapshot.grossCents});
  return json({ok:true,productionRelease:PRODUCTION_V120_RELEASE,snapshot,payment:paymentForOrder(store,orderId)});
}

function saveOrderSnapshot(store,orderId,rate){
  const settings=settingsForSupplier(store,rate.supplierId),at=new Date().toISOString(),created=store.sql.exec('SELECT created_at AS createdAt FROM portal_order_supplier_snapshot_v120 WHERE order_id=? LIMIT 1',orderId).toArray()[0]?.createdAt||at;
  store.sql.exec(`INSERT INTO portal_order_supplier_snapshot_v120(order_id,city_id,supplier_id,service_id,rate_id,format_id,supplier_name,city_name,format_name,rate_label,duration_minutes,net_cents,vat_rate_bps,gross_cents,currency,payment_method,payment_url,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(order_id) DO UPDATE SET city_id=excluded.city_id,supplier_id=excluded.supplier_id,service_id=excluded.service_id,rate_id=excluded.rate_id,format_id=excluded.format_id,supplier_name=excluded.supplier_name,city_name=excluded.city_name,format_name=excluded.format_name,rate_label=excluded.rate_label,duration_minutes=excluded.duration_minutes,net_cents=excluded.net_cents,vat_rate_bps=excluded.vat_rate_bps,gross_cents=excluded.gross_cents,currency=excluded.currency,payment_method=excluded.payment_method,payment_url=excluded.payment_url,updated_at=excluded.updated_at`,
  orderId,rate.cityId,rate.supplierId,rate.serviceId,rate.rateId,rate.formatId,rate.supplierName,rate.cityName,rate.formatName,rate.rateLabel,Number(rate.durationMinutes||0),Number(rate.netCents||0),Number(rate.vatRateBps||0),Number(rate.grossCents||0),'eur',settings.paymentMethod,settings.paymentUrl,created,at);
  reconcileSupplierPaymentFromSnapshotV120(store,orderId);
  return snapshotForOrder(store,orderId);
}

function passageRows(store){
  return store.sql.exec(`
    SELECT o.id,o.title,o.format,o.status,o.appointment_at AS appointmentAt,o.filming_at AS filmingAt,o.amount_total AS amountTotal,o.currency,o.created_at AS createdAt,o.updated_at AS updatedAt,
           c.id AS clientId,c.email,c.full_name AS fullName,c.company,
           s.city_id AS cityId,s.supplier_id AS supplierId,s.service_id AS serviceId,s.rate_id AS rateId,s.format_id AS formatId,
           s.supplier_name AS supplierName,s.city_name AS cityName,s.format_name AS formatName,s.rate_label AS rateLabel,s.duration_minutes AS durationMinutes,
           s.net_cents AS supplierNetCents,s.vat_rate_bps AS supplierVatRateBps,s.gross_cents AS supplierGrossCents,s.payment_method AS supplierPaymentMethod,s.payment_url AS supplierPaymentUrl,
           p.id AS supplierPaymentId,p.status AS supplierPaymentStatus,p.amount_total AS supplierPaymentAmount,p.due_at AS supplierPaymentDueAt,p.paid_at AS supplierPaymentPaidAt
    FROM portal_orders o JOIN portal_clients c ON c.id=o.client_id
    LEFT JOIN portal_order_supplier_snapshot_v120 s ON s.order_id=o.id
    LEFT JOIN portal_supplier_payments p ON p.order_id=o.id
    ORDER BY COALESCE(o.filming_at,o.created_at) DESC
  `).toArray();
}

function preparationCardRows(store){
  return store.sql.exec(`SELECT pc.id,pc.format_id AS formatId,pc.label,pc.image_url AS imageUrl,pc.description,pc.active,pc.public_order AS publicOrder,f.slug AS formatSlug
    FROM portal_format_preparation_cards_v120 pc JOIN portal_media_formats_v95 f ON f.id=pc.format_id ORDER BY pc.format_id,pc.active DESC,pc.public_order,pc.label`).toArray().map(row=>{
      const visual=configurationVisualV98(store,row.formatId,row.formatSlug,row.label);
      return{...row,active:Boolean(row.active),image:row.imageUrl||visual.image,imageBase64:row.imageUrl?'':visual.imageBase64||'',imageSource:row.imageUrl?'custom':visual.imageSource};
    });
}

function supplierSettingsRows(store){return store.sql.exec('SELECT supplier_id AS supplierId,payment_method AS paymentMethod,payment_url AS paymentUrl,payment_terms_days AS paymentTermsDays,billing_email AS billingEmail,payment_notes AS paymentNotes FROM portal_supplier_payment_settings_v120').toArray();}
function settingsForSupplier(store,supplierId){const row=supplierSettingsRows(store).find(item=>item.supplierId===supplierId);if(row)return row;const supplier=store.sql.exec('SELECT email FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',supplierId).toArray()[0]||{};return defaultSupplierSettings(supplierId,supplier.email);}
function defaultSupplierSettings(supplierId,email=''){return{supplierId,paymentMethod:'bank_transfer',paymentUrl:'',paymentTermsDays:0,billingEmail:normalizeEmail(email),paymentNotes:''};}
function snapshotForOrder(store,orderId){return store.sql.exec('SELECT order_id AS orderId,city_id AS cityId,supplier_id AS supplierId,service_id AS serviceId,rate_id AS rateId,format_id AS formatId,supplier_name AS supplierName,city_name AS cityName,format_name AS formatName,rate_label AS rateLabel,duration_minutes AS durationMinutes,net_cents AS netCents,vat_rate_bps AS vatRateBps,gross_cents AS grossCents,currency,payment_method AS paymentMethod,payment_url AS paymentUrl,created_at AS createdAt,updated_at AS updatedAt FROM portal_order_supplier_snapshot_v120 WHERE order_id=? LIMIT 1',orderId).toArray()[0]||null;}
function paymentForOrder(store,orderId){return store.sql.exec('SELECT id,order_id AS orderId,supplier_name AS supplierName,amount_total AS amountTotal,currency,status,due_at AS dueAt,paid_at AS paidAt FROM portal_supplier_payments WHERE order_id=? LIMIT 1',orderId).toArray()[0]||null;}

function migratePreparationCards(store){
  const at=new Date().toISOString(),seen=new Set();
  const rows=store.sql.exec(`SELECT o.format_id AS formatId,c.label,MIN(c.public_order) AS publicOrder
    FROM portal_offer_configurations_v96 c JOIN portal_media_offers_v96 o ON o.id=c.offer_id GROUP BY o.format_id,c.label`).toArray();
  for(const row of rows){
    const key=`${row.formatId}|${row.label}`;seen.add(key);
    if(store.sql.exec('SELECT id FROM portal_format_preparation_cards_v120 WHERE format_id=? AND label=? LIMIT 1',row.formatId,row.label).toArray()[0])continue;
    const visual=store.sql.exec('SELECT image_url AS imageUrl,description FROM portal_media_configuration_visuals_v98 WHERE format_id=? AND label=? LIMIT 1',row.formatId,row.label).toArray()[0]||{};
    store.sql.exec('INSERT INTO portal_format_preparation_cards_v120(id,format_id,label,image_url,description,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)',crypto.randomUUID(),row.formatId,row.label,String(visual.imageUrl||''),String(visual.description||''),Number(row.publicOrder||100),at,at);
  }
  for(const visual of store.sql.exec('SELECT format_id AS formatId,label,image_url AS imageUrl,description FROM portal_media_configuration_visuals_v98').toArray()){
    const key=`${visual.formatId}|${visual.label}`;if(seen.has(key)||store.sql.exec('SELECT id FROM portal_format_preparation_cards_v120 WHERE format_id=? AND label=? LIMIT 1',visual.formatId,visual.label).toArray()[0])continue;
    store.sql.exec('INSERT INTO portal_format_preparation_cards_v120(id,format_id,label,image_url,description,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,1,100,?,?)',crypto.randomUUID(),visual.formatId,visual.label,String(visual.imageUrl||''),String(visual.description||''),at,at);
  }
}

function syncPreparationCardsToAllOffers(store){for(const card of store.sql.exec('SELECT format_id AS formatId,label,active,public_order AS publicOrder FROM portal_format_preparation_cards_v120').toArray())syncPreparationCardToOffers(store,{...card,active:Boolean(card.active)});}
function syncPreparationCardToOffers(store,card){
  const at=new Date().toISOString(),offers=store.sql.exec('SELECT id FROM portal_media_offers_v96 WHERE format_id=?',card.formatId).toArray();
  for(const offer of offers){
    store.sql.exec(`INSERT INTO portal_offer_configurations_v96(id,offer_id,label,public_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(offer_id,label) DO UPDATE SET public_order=excluded.public_order,active=excluded.active,updated_at=excluded.updated_at`,crypto.randomUUID(),offer.id,card.label,Number(card.publicOrder||100),card.active?1:0,at,at);
  }
}

function payload(body){return body?.payload&&typeof body.payload==='object'?body.payload:body||{};}
function cleanId(value){return sanitizeText(value,140).trim();}
function clamp(value,min,max){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,Math.round(number))):min;}
function boolInt(value){return value===false||value===0||value==='0'?0:1;}
function normalizeEmail(value){const email=String(value||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)?email:'';}
