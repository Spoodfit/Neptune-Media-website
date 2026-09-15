import { ensureMediaCatalogV98Schema } from './portal-media-catalog-v98.js';
import { requireOperator } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';
import { safeVisualUrl } from './media-catalog-visuals-v98.js';

export const SUPPLIER_PHYSICAL_FORMATS_V191_RELEASE='neptune-supplier-physical-formats-20260915-v191';

export function ensureSupplierPhysicalFormatsV191Schema(store){
  ensureMediaCatalogV98Schema(store);
  if(store.supplierPhysicalFormatsV191Ready)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_supplier_physical_formats_v191(
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES portal_media_suppliers_v95(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      label_key TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      public_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(supplier_id,label_key)
    );
    CREATE TABLE IF NOT EXISTS portal_supplier_physical_format_concepts_v191(
      physical_format_id TEXT NOT NULL REFERENCES portal_supplier_physical_formats_v191(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL REFERENCES portal_media_formats_v95(id) ON DELETE CASCADE,
      public_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(physical_format_id,concept_id)
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_physical_formats_v191_supplier
      ON portal_supplier_physical_formats_v191(supplier_id,active,public_order,label);
    CREATE INDEX IF NOT EXISTS idx_supplier_physical_format_concepts_v191_concept
      ON portal_supplier_physical_format_concepts_v191(concept_id,physical_format_id);
  `);
  backfillLegacySupplierFormats(store);
  store.supplierPhysicalFormatsV191Ready=true;
}

export async function handleSupplierPhysicalFormatsV191Store(store,request){
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!=='/api/admin/media-catalog-v191/physical-format/save')return null;
  ensureSupplierPhysicalFormatsV191Schema(store);
  const body=await request.json().catch(()=>({}));
  return payload(body).action==='delete'?deleteSupplierPhysicalFormatV191(store,body):saveSupplierPhysicalFormatV191(store,body);
}

export async function enhanceMediaCatalogContextV191(store,response){
  ensureSupplierPhysicalFormatsV191Schema(store);
  const data=await response.json().catch(()=>null);
  if(!data)return response;
  return rewriteJsonResponse(response,{
    ...data,
    supplierPhysicalFormats:supplierPhysicalFormatsV191(store),
    supplierPhysicalFormatsRelease:SUPPLIER_PHYSICAL_FORMATS_V191_RELEASE,
  });
}

export async function enhancePublicCatalogPhysicalFormatsV191(store,response){
  ensureSupplierPhysicalFormatsV191Schema(store);
  const data=await response.json().catch(()=>null);
  if(!data)return response;
  const offerRefs=new Map(store.sql.exec('SELECT id,supplier_id AS supplierId,format_id AS conceptId FROM portal_media_offers_v96').toArray().map(row=>[String(row.id),row]));
  const supplierFormats=supplierPhysicalFormatsV191(store);
  const bySupplierLabel=new Map(supplierFormats.map(item=>[`${item.supplierId}|${normalizeKey(item.label)}`,item]));
  for(const city of data.cities||[]){
    for(const concept of city.formats||[]){
      for(const offer of concept.offers||[]){
        const ref=offerRefs.get(String(offer.id||''));if(!ref)continue;
        offer.configurations=(offer.configurations||[]).map(configuration=>{
          const label=String(configuration?.label||configuration||'').trim();
          const physical=bySupplierLabel.get(`${ref.supplierId}|${normalizeKey(label)}`);
          if(!physical||physical.active===false||!physical.conceptIds.includes(String(concept.id||ref.conceptId||'')))return configuration;
          return {
            ...(typeof configuration==='object'&&configuration?configuration:{label}),
            label:physical.label,
            physicalFormatId:physical.id,
            image:physical.imageUrl||configuration?.image||'',
            imageBase64:physical.imageUrl?'':configuration?.imageBase64||'',
            description:physical.description||configuration?.description||'',
            visualSource:physical.imageUrl?'supplier_format':'fallback',
          };
        });
      }
    }
  }
  data.supplierPhysicalFormatsRelease=SUPPLIER_PHYSICAL_FORMATS_V191_RELEASE;
  return rewriteJsonResponse(response,data);
}

export function validateOfferPhysicalFormatsV191(store,body={}){
  ensureSupplierPhysicalFormatsV191Schema(store);
  const p=payload(body),supplierId=cleanId(p.supplierId),conceptId=cleanId(p.formatId),labels=normalizeOptions(p.configurationOptions);
  if(!supplierId||!conceptId||!labels.length)return {ok:true};
  const rows=store.sql.exec(`
    SELECT pf.label_key AS labelKey
    FROM portal_supplier_physical_formats_v191 pf
    JOIN portal_supplier_physical_format_concepts_v191 map ON map.physical_format_id=pf.id
    WHERE pf.supplier_id=? AND map.concept_id=? AND pf.active=1
  `,supplierId,conceptId).toArray();
  const allowed=new Set(rows.map(row=>String(row.labelKey||'')));
  const invalid=labels.filter(label=>!allowed.has(normalizeKey(label)));
  if(!invalid.length)return {ok:true};
  return {ok:false,response:json({
    error:'supplier_physical_format_unavailable',invalidFormats:invalid,supplierId,conceptId,
    release:SUPPLIER_PHYSICAL_FORMATS_V191_RELEASE,
  },409)};
}

export function supplierPhysicalFormatsV191(store){
  ensureSupplierPhysicalFormatsV191Schema(store);
  const rows=store.sql.exec(`
    SELECT pf.id,pf.supplier_id AS supplierId,s.name AS supplierName,pf.label,pf.description,
      pf.image_url AS imageUrl,pf.active,pf.public_order AS publicOrder,pf.created_at AS createdAt,pf.updated_at AS updatedAt
    FROM portal_supplier_physical_formats_v191 pf
    JOIN portal_media_suppliers_v95 s ON s.id=pf.supplier_id
    ORDER BY s.name,pf.active DESC,pf.public_order,pf.label
  `).toArray();
  const mappings=store.sql.exec(`
    SELECT map.physical_format_id AS physicalFormatId,f.id AS conceptId,f.name AS conceptName,f.active
    FROM portal_supplier_physical_format_concepts_v191 map
    JOIN portal_media_formats_v95 f ON f.id=map.concept_id
    ORDER BY f.public_order,f.name
  `).toArray();
  const byPhysical=new Map();
  for(const row of mappings){if(!byPhysical.has(row.physicalFormatId))byPhysical.set(row.physicalFormatId,[]);byPhysical.get(row.physicalFormatId).push({id:row.conceptId,name:row.conceptName,active:Boolean(row.active)});}
  return rows.map(row=>{
    const concepts=byPhysical.get(row.id)||[];
    return {...row,active:Boolean(row.active),conceptIds:concepts.map(item=>item.id),concepts};
  });
}

async function saveSupplierPhysicalFormatV191(store,body){
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),supplierId=cleanId(p.supplierId),label=sanitizeText(p.label,80).trim(),conceptIds=normalizeIds(p.conceptIds);
  if(!supplierId||!label)return json({error:'supplier_physical_format_fields_required'},400);
  if(!store.sql.exec('SELECT id FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',supplierId).toArray()[0])return json({error:'supplier_physical_format_supplier_invalid'},404);
  if(!conceptIdsValid(store,conceptIds))return json({error:'supplier_physical_format_concept_invalid'},404);
  const current=store.sql.exec('SELECT id,supplier_id AS supplierId,label,label_key AS labelKey,active FROM portal_supplier_physical_formats_v191 WHERE id=? LIMIT 1',id).toArray()[0]||null;
  const key=normalizeKey(label),duplicate=store.sql.exec('SELECT id FROM portal_supplier_physical_formats_v191 WHERE supplier_id=? AND label_key=? AND id<>? LIMIT 1',supplierId,key,id).toArray()[0];
  if(duplicate)return json({error:'supplier_physical_format_already_exists'},409);

  if(current&&current.supplierId!==supplierId){
    const used=selectedByOffers(store,current.supplierId,current.label,false);
    if(used>0)return json({error:'supplier_physical_format_supplier_in_use',usedByOffers:used},409);
  }
  const active=boolInt(p.active);
  if(!active){
    const used=selectedByOffers(store,current?.supplierId||supplierId,current?.label||label,true);
    if(used>0)return json({error:'supplier_physical_format_used_by_active_offer',usedByActiveOffers:used},409);
  }
  if(current){
    const previousConceptIds=mappedConceptIds(store,id),removed=previousConceptIds.filter(conceptId=>!conceptIds.includes(conceptId));
    for(const conceptId of removed){
      const used=selectedByOffers(store,current.supplierId,current.label,false,conceptId);
      if(used>0)return json({error:'supplier_physical_format_concept_in_use',conceptId,usedByOffers:used},409);
    }
  }

  const description=sanitizeText(p.description,500),imageUrl=safeVisualUrl(p.imageUrl),publicOrder=clamp(p.publicOrder,0,9999)||100,at=new Date().toISOString();
  if(current){
    if(current.label!==label)renameOfferConfigurations(store,current.supplierId,current.label,label,at);
    store.sql.exec('UPDATE portal_supplier_physical_formats_v191 SET supplier_id=?,label=?,label_key=?,description=?,image_url=?,active=?,public_order=?,updated_at=? WHERE id=?',supplierId,label,key,description,imageUrl,active,publicOrder,at,id);
  }else{
    store.sql.exec('INSERT INTO portal_supplier_physical_formats_v191(id,supplier_id,label,label_key,description,image_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,supplierId,label,key,description,imageUrl,active,publicOrder,at,at);
  }
  replaceConceptMappings(store,id,conceptIds,at);
  store.audit?.(access.actor?.id||'studio','supplier_physical_format_saved_v191','supplier_physical_format',id,{supplierId,label,conceptIds,active:Boolean(active)});
  return json({ok:true,release:SUPPLIER_PHYSICAL_FORMATS_V191_RELEASE,savedId:id,supplierPhysicalFormats:supplierPhysicalFormatsV191(store)});
}

async function deleteSupplierPhysicalFormatV191(store,body){
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const id=cleanId(payload(body).id);if(!id)return json({error:'supplier_physical_format_id_required'},400);
  const current=store.sql.exec('SELECT id,supplier_id AS supplierId,label FROM portal_supplier_physical_formats_v191 WHERE id=? LIMIT 1',id).toArray()[0]||null;
  if(!current)return json({error:'supplier_physical_format_not_found'},404);
  const used=selectedByOffers(store,current.supplierId,current.label,false);
  if(used>0)return json({error:'supplier_physical_format_in_use',usedByOffers:used},409);
  store.sql.exec('DELETE FROM portal_supplier_physical_formats_v191 WHERE id=?',id);
  store.audit?.(access.actor?.id||'studio','supplier_physical_format_deleted_v191','supplier_physical_format',id,{supplierId:current.supplierId,label:current.label});
  return json({ok:true,release:SUPPLIER_PHYSICAL_FORMATS_V191_RELEASE,deletedId:id,supplierPhysicalFormats:supplierPhysicalFormatsV191(store)});
}

function backfillLegacySupplierFormats(store){
  const rows=store.sql.exec(`
    SELECT o.supplier_id AS supplierId,o.format_id AS conceptId,c.label,
      COALESCE(v.image_url,'') AS imageUrl,COALESCE(v.description,'') AS description
    FROM portal_media_offers_v96 o
    JOIN portal_offer_configurations_v96 c ON c.offer_id=o.id AND c.active=1
    LEFT JOIN portal_media_configuration_visuals_v98 v ON v.format_id=o.format_id AND v.label=c.label
    WHERE TRIM(c.label)<>''
    ORDER BY o.supplier_id,c.label,o.format_id
  `).toArray();
  const at=new Date().toISOString();
  for(const row of rows){
    const label=sanitizeText(row.label,80).trim();if(!label)continue;
    const key=normalizeKey(label);
    let physical=store.sql.exec('SELECT id,image_url AS imageUrl,description FROM portal_supplier_physical_formats_v191 WHERE supplier_id=? AND label_key=? LIMIT 1',row.supplierId,key).toArray()[0]||null;
    if(!physical){
      physical={id:crypto.randomUUID(),imageUrl:safeVisualUrl(row.imageUrl),description:sanitizeText(row.description,500)};
      store.sql.exec('INSERT INTO portal_supplier_physical_formats_v191(id,supplier_id,label,label_key,description,image_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',physical.id,row.supplierId,label,key,physical.description,physical.imageUrl,1,100,at,at);
    }else if(!physical.imageUrl&&safeVisualUrl(row.imageUrl)){
      store.sql.exec('UPDATE portal_supplier_physical_formats_v191 SET image_url=?,description=CASE WHEN description="" THEN ? ELSE description END,updated_at=? WHERE id=?',safeVisualUrl(row.imageUrl),sanitizeText(row.description,500),at,physical.id);
    }
    store.sql.exec('INSERT OR IGNORE INTO portal_supplier_physical_format_concepts_v191(physical_format_id,concept_id,public_order,created_at,updated_at) VALUES(?,?,100,?,?)',physical.id,row.conceptId,at,at);
  }
}

function replaceConceptMappings(store,physicalFormatId,conceptIds,at){
  store.sql.exec('DELETE FROM portal_supplier_physical_format_concepts_v191 WHERE physical_format_id=?',physicalFormatId);
  conceptIds.forEach((conceptId,index)=>store.sql.exec('INSERT INTO portal_supplier_physical_format_concepts_v191(physical_format_id,concept_id,public_order,created_at,updated_at) VALUES(?,?,?,?,?)',physicalFormatId,conceptId,(index+1)*10,at,at));
}

function mappedConceptIds(store,physicalFormatId){return store.sql.exec('SELECT concept_id AS conceptId FROM portal_supplier_physical_format_concepts_v191 WHERE physical_format_id=?',physicalFormatId).toArray().map(row=>String(row.conceptId));}
function conceptIdsValid(store,conceptIds){if(!conceptIds.length)return true;const placeholders=conceptIds.map(()=>'?').join(',');const row=store.sql.exec(`SELECT COUNT(*) AS n FROM portal_media_formats_v95 WHERE id IN (${placeholders})`,...conceptIds).toArray()[0];return Number(row?.n||0)===conceptIds.length;}

function renameOfferConfigurations(store,supplierId,oldLabel,newLabel,at){
  const offers=store.sql.exec('SELECT id FROM portal_media_offers_v96 WHERE supplier_id=?',supplierId).toArray();
  for(const offer of offers){
    const old=store.sql.exec('SELECT id FROM portal_offer_configurations_v96 WHERE offer_id=? AND label=? LIMIT 1',offer.id,oldLabel).toArray()[0];if(!old)continue;
    const target=store.sql.exec('SELECT id FROM portal_offer_configurations_v96 WHERE offer_id=? AND label=? LIMIT 1',offer.id,newLabel).toArray()[0];
    if(target)store.sql.exec('DELETE FROM portal_offer_configurations_v96 WHERE id=?',old.id);
    else store.sql.exec('UPDATE portal_offer_configurations_v96 SET label=?,updated_at=? WHERE id=?',newLabel,at,old.id);
  }
}

function selectedByOffers(store,supplierId,label,activeOnly=false,conceptId=''){
  let sql=`SELECT COUNT(DISTINCT c.offer_id) AS n FROM portal_offer_configurations_v96 c JOIN portal_media_offers_v96 o ON o.id=c.offer_id WHERE o.supplier_id=? AND c.label=? AND c.active=1`;
  const args=[supplierId,label];
  if(conceptId){sql+=' AND o.format_id=?';args.push(conceptId);}
  if(activeOnly)sql+=' AND o.active=1';
  const row=store.sql.exec(sql,...args).toArray()[0];return Number(row?.n||0);
}

function rewriteJsonResponse(response,data){const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','private, no-store, max-age=0');headers.set('X-Neptune-Supplier-Physical-Formats',SUPPLIER_PHYSICAL_FORMATS_V191_RELEASE);return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});}
function payload(body){return body?.payload&&typeof body.payload==='object'?body.payload:body||{};}
function cleanId(value){return sanitizeText(value,180).trim();}
function boolInt(value){return value===false||value===0||value==='0'||value==='false'?0:1;}
function clamp(value,min,max){const n=Math.round(Number(value)||0);return Math.max(min,Math.min(max,n));}
function normalizeOptions(value){const list=Array.isArray(value)?value:String(value||'').split(/[,;\n]/u);return [...new Set(list.map(x=>sanitizeText(x,80).trim()).filter(Boolean))].slice(0,20);}
function normalizeIds(value){const list=Array.isArray(value)?value:String(value||'').split(/[,;\n]/u);return [...new Set(list.map(cleanId).filter(Boolean))].slice(0,100);}
function normalizeKey(value){return sanitizeText(value,80).normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLowerCase().replace(/\s+/gu,' ');}
