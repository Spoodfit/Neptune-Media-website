import { ensureMediaCatalogV98Schema } from './portal-media-catalog-v98.js';
import { requireOperator } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';
import { safeVisualUrl } from './media-catalog-visuals-v98.js';

export const SUPPLIER_PHYSICAL_FORMATS_V190_RELEASE='neptune-supplier-physical-formats-20260915-v190.1';

export function ensureSupplierPhysicalFormatsV190Schema(store){
  ensureMediaCatalogV98Schema(store);
  if(store.supplierPhysicalFormatsV190Ready)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_supplier_physical_formats_v190(
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES portal_media_suppliers_v95(id) ON DELETE CASCADE,
      format_id TEXT NOT NULL REFERENCES portal_media_formats_v95(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      label_key TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      public_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(supplier_id,format_id,label_key)
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_physical_formats_v190_relation
      ON portal_supplier_physical_formats_v190(supplier_id,format_id,active,public_order,label);
  `);
  backfillLegacySupplierFormats(store);
  store.supplierPhysicalFormatsV190Ready=true;
}

export async function handleSupplierPhysicalFormatsV190Store(store,request){
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!=='/api/admin/media-catalog-v190/physical-format/save')return null;
  ensureSupplierPhysicalFormatsV190Schema(store);
  const body=await request.json().catch(()=>({}));
  return payload(body).action==='delete'?deleteSupplierPhysicalFormatV190(store,body):saveSupplierPhysicalFormatV190(store,body);
}

export async function enhanceMediaCatalogContextV190(store,response){
  ensureSupplierPhysicalFormatsV190Schema(store);
  const data=await response.json().catch(()=>null);
  if(!data)return response;
  return json({
    ...data,
    supplierPhysicalFormats:supplierPhysicalFormatsV190(store),
    supplierPhysicalFormatsRelease:SUPPLIER_PHYSICAL_FORMATS_V190_RELEASE,
  },response.status);
}

export function validateOfferPhysicalFormatsV190(store,body={}){
  ensureSupplierPhysicalFormatsV190Schema(store);
  const p=payload(body),supplierId=cleanId(p.supplierId),formatId=cleanId(p.formatId),labels=normalizeOptions(p.configurationOptions);
  if(!supplierId||!formatId||!labels.length)return {ok:true};
  const rows=store.sql.exec(
    'SELECT label_key AS labelKey FROM portal_supplier_physical_formats_v190 WHERE supplier_id=? AND format_id=? AND active=1',
    supplierId,formatId,
  ).toArray();
  const allowed=new Set(rows.map(row=>String(row.labelKey||'')));
  const invalid=labels.filter(label=>!allowed.has(normalizeKey(label)));
  if(!invalid.length)return {ok:true};
  return {
    ok:false,
    response:json({
      error:'supplier_physical_format_unavailable',
      invalidFormats:invalid,
      supplierId,
      formatId,
      release:SUPPLIER_PHYSICAL_FORMATS_V190_RELEASE,
    },409),
  };
}

export function supplierPhysicalFormatsV190(store){
  ensureSupplierPhysicalFormatsV190Schema(store);
  return store.sql.exec(`
    SELECT pf.id,pf.supplier_id AS supplierId,s.name AS supplierName,
      pf.format_id AS formatId,f.name AS conceptName,pf.label,pf.description,
      pf.image_url AS imageUrl,pf.active,pf.public_order AS publicOrder,
      pf.created_at AS createdAt,pf.updated_at AS updatedAt
    FROM portal_supplier_physical_formats_v190 pf
    JOIN portal_media_suppliers_v95 s ON s.id=pf.supplier_id
    JOIN portal_media_formats_v95 f ON f.id=pf.format_id
    ORDER BY pf.active DESC,s.name,f.name,pf.public_order,pf.label
  `).toArray().map(row=>({...row,active:Boolean(row.active)}));
}

async function saveSupplierPhysicalFormatV190(store,body){
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),supplierId=cleanId(p.supplierId),formatId=cleanId(p.formatId),label=sanitizeText(p.label,80).trim();
  if(!supplierId||!formatId||!label)return json({error:'supplier_physical_format_fields_required'},400);
  const refs=store.sql.exec('SELECT s.id AS supplierId,f.id AS formatId FROM portal_media_suppliers_v95 s,portal_media_formats_v95 f WHERE s.id=? AND f.id=? LIMIT 1',supplierId,formatId).toArray()[0];
  if(!refs)return json({error:'supplier_physical_format_reference_invalid'},404);
  const current=store.sql.exec('SELECT id,supplier_id AS supplierId,format_id AS formatId,label,label_key AS labelKey,active FROM portal_supplier_physical_formats_v190 WHERE id=? LIMIT 1',id).toArray()[0]||null;
  const key=normalizeKey(label);
  const duplicate=store.sql.exec('SELECT id FROM portal_supplier_physical_formats_v190 WHERE supplier_id=? AND format_id=? AND label_key=? AND id<>? LIMIT 1',supplierId,formatId,key,id).toArray()[0];
  if(duplicate)return json({error:'supplier_physical_format_already_exists'},409);

  if(current&&(current.supplierId!==supplierId||current.formatId!==formatId)){
    const used=selectedByOffers(store,current.supplierId,current.formatId,current.label,true);
    if(used>0)return json({error:'supplier_physical_format_relation_in_use',usedByActiveOffers:used},409);
  }
  const active=boolInt(p.active);
  if(!active){
    const used=selectedByOffers(store,current?.supplierId||supplierId,current?.formatId||formatId,current?.label||label,true);
    if(used>0)return json({error:'supplier_physical_format_used_by_active_offer',usedByActiveOffers:used},409);
  }

  const description=sanitizeText(p.description,500),imageUrl=safeVisualUrl(p.imageUrl),publicOrder=clamp(p.publicOrder,0,9999)||100,at=new Date().toISOString();
  if(current){
    if(current.supplierId===supplierId&&current.formatId===formatId&&current.label!==label)renameOfferConfigurations(store,supplierId,formatId,current.label,label,at);
    store.sql.exec('UPDATE portal_supplier_physical_formats_v190 SET supplier_id=?,format_id=?,label=?,label_key=?,description=?,image_url=?,active=?,public_order=?,updated_at=? WHERE id=?',supplierId,formatId,label,key,description,imageUrl,active,publicOrder,at,id);
  }else{
    store.sql.exec('INSERT INTO portal_supplier_physical_formats_v190(id,supplier_id,format_id,label,label_key,description,image_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,supplierId,formatId,label,key,description,imageUrl,active,publicOrder,at,at);
  }
  store.audit?.(access.actor?.id||'studio','supplier_physical_format_saved_v190','supplier_physical_format',id,{supplierId,formatId,label,active:Boolean(active)});
  return json({ok:true,release:SUPPLIER_PHYSICAL_FORMATS_V190_RELEASE,savedId:id,supplierPhysicalFormats:supplierPhysicalFormatsV190(store)});
}

async function deleteSupplierPhysicalFormatV190(store,body){
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id);if(!id)return json({error:'supplier_physical_format_id_required'},400);
  const current=store.sql.exec('SELECT id,supplier_id AS supplierId,format_id AS formatId,label FROM portal_supplier_physical_formats_v190 WHERE id=? LIMIT 1',id).toArray()[0]||null;
  if(!current)return json({error:'supplier_physical_format_not_found'},404);
  const used=selectedByOffers(store,current.supplierId,current.formatId,current.label,false);
  if(used>0)return json({error:'supplier_physical_format_in_use',usedByOffers:used},409);
  store.sql.exec('DELETE FROM portal_supplier_physical_formats_v190 WHERE id=?',id);
  store.audit?.(access.actor?.id||'studio','supplier_physical_format_deleted_v190','supplier_physical_format',id,{supplierId:current.supplierId,formatId:current.formatId,label:current.label});
  return json({ok:true,release:SUPPLIER_PHYSICAL_FORMATS_V190_RELEASE,deletedId:id,supplierPhysicalFormats:supplierPhysicalFormatsV190(store)});
}

function backfillLegacySupplierFormats(store){
  const rows=store.sql.exec(`
    SELECT DISTINCT o.supplier_id AS supplierId,o.format_id AS formatId,c.label,
      COALESCE(v.image_url,'') AS imageUrl,COALESCE(v.description,'') AS description
    FROM portal_media_offers_v96 o
    JOIN portal_offer_configurations_v96 c ON c.offer_id=o.id AND c.active=1
    LEFT JOIN portal_media_configuration_visuals_v98 v ON v.format_id=o.format_id AND v.label=c.label
    WHERE TRIM(c.label)<>''
  `).toArray();
  const at=new Date().toISOString();
  for(const row of rows){
    const label=sanitizeText(row.label,80).trim();if(!label)continue;
    const key=normalizeKey(label);
    const existing=store.sql.exec('SELECT id FROM portal_supplier_physical_formats_v190 WHERE supplier_id=? AND format_id=? AND label_key=? LIMIT 1',row.supplierId,row.formatId,key).toArray()[0];
    if(existing)continue;
    store.sql.exec('INSERT INTO portal_supplier_physical_formats_v190(id,supplier_id,format_id,label,label_key,description,image_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),row.supplierId,row.formatId,label,key,sanitizeText(row.description,500),safeVisualUrl(row.imageUrl),1,100,at,at);
  }
}

function renameOfferConfigurations(store,supplierId,formatId,oldLabel,newLabel,at){
  const offers=store.sql.exec('SELECT id FROM portal_media_offers_v96 WHERE supplier_id=? AND format_id=?',supplierId,formatId).toArray();
  for(const offer of offers){
    const old=store.sql.exec('SELECT id FROM portal_offer_configurations_v96 WHERE offer_id=? AND label=? LIMIT 1',offer.id,oldLabel).toArray()[0];if(!old)continue;
    const target=store.sql.exec('SELECT id FROM portal_offer_configurations_v96 WHERE offer_id=? AND label=? LIMIT 1',offer.id,newLabel).toArray()[0];
    if(target)store.sql.exec('DELETE FROM portal_offer_configurations_v96 WHERE id=?',old.id);
    else store.sql.exec('UPDATE portal_offer_configurations_v96 SET label=?,updated_at=? WHERE id=?',newLabel,at,old.id);
  }
}

function selectedByOffers(store,supplierId,formatId,label,activeOnly=false){
  const row=store.sql.exec(`
    SELECT COUNT(DISTINCT c.offer_id) AS n
    FROM portal_offer_configurations_v96 c
    JOIN portal_media_offers_v96 o ON o.id=c.offer_id
    WHERE o.supplier_id=? AND o.format_id=? AND c.label=? AND c.active=1 ${activeOnly?'AND o.active=1':''}
  `,supplierId,formatId,label).toArray()[0];
  return Number(row?.n||0);
}

function payload(body){return body?.payload&&typeof body.payload==='object'?body.payload:body||{};}
function cleanId(value){return sanitizeText(value,180).trim();}
function boolInt(value){return value===false||value===0||value==='0'||value==='false'?0:1;}
function clamp(value,min,max){const n=Math.round(Number(value)||0);return Math.max(min,Math.min(max,n));}
function normalizeOptions(value){const list=Array.isArray(value)?value:String(value||'').split(/[,;\n]/u);return [...new Set(list.map(x=>sanitizeText(x,80).trim()).filter(Boolean))].slice(0,20);}
function normalizeKey(value){return sanitizeText(value,80).normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLowerCase().replace(/\s+/gu,' ');}
