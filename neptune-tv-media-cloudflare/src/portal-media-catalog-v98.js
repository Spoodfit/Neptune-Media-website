import { ensureMediaCatalogVisualsV98Schema, formatVisualV98, configurationVisualV98, saveFormatVisualV98, saveConfigurationVisualV98 } from './media-catalog-visuals-v98.js';
import { requireOperator } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';

export const MEDIA_CATALOG_RELEASE='neptune-media-catalog-20260813-v116';
export const MEDIA_CATALOG_MODEL_RELEASE='neptune-media-catalog-model-20260813-v116';
const TIER_LABELS={launch:'Prix coûtant · lancement',promo:'Tarif préférentiel',base:'Tarif normal'};
const RATE_UNITS=new Map([['half_hour','Demi-heure'],['hour','Heure'],['block','Bloc horaire'],['half_day','Demi-journée'],['day','Journée'],['custom','Durée personnalisée'],['legacy','Tarif historique']]);
const DURATION_OPTIONS=[30,45,60,90,120,150,180,210,240,300,360,420,480,540,600];

export function ensureMediaCatalogV98Schema(store){
  ensureMediaCatalogVisualsV98Schema(store);
  if(store.mediaCatalogV116SchemaReady)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_media_concepts_v116(
      id TEXT PRIMARY KEY,label TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,public_order INTEGER NOT NULL DEFAULT 100,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_media_format_details_v116(
      format_id TEXT PRIMARY KEY REFERENCES portal_media_formats_v95(id) ON DELETE CASCADE,
      concept_id TEXT REFERENCES portal_media_concepts_v116(id) ON DELETE SET NULL,
      shoot_minutes INTEGER NOT NULL DEFAULT 0,total_minutes INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_supplier_services_v116(
      id TEXT PRIMARY KEY,city_id TEXT NOT NULL REFERENCES portal_media_cities_v96(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES portal_media_suppliers_v95(id) ON DELETE CASCADE,
      format_id TEXT NOT NULL REFERENCES portal_media_formats_v95(id) ON DELETE CASCADE,
      preparation_url TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      UNIQUE(city_id,supplier_id,format_id)
    );
    CREATE TABLE IF NOT EXISTS portal_supplier_rates_v116(
      id TEXT PRIMARY KEY,service_id TEXT NOT NULL REFERENCES portal_supplier_services_v116(id) ON DELETE CASCADE,
      unit_code TEXT NOT NULL DEFAULT 'custom',duration_minutes INTEGER NOT NULL DEFAULT 0,label TEXT NOT NULL DEFAULT '',
      net_cents INTEGER NOT NULL DEFAULT 0,vat_rate_bps INTEGER NOT NULL DEFAULT 2000,gross_cents INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,public_order INTEGER NOT NULL DEFAULT 100,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_offer_supplier_rate_v116(
      offer_id TEXT PRIMARY KEY REFERENCES portal_media_offers_v96(id) ON DELETE CASCADE,
      rate_id TEXT NOT NULL REFERENCES portal_supplier_rates_v116(id) ON DELETE RESTRICT,updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_services_city_v116 ON portal_supplier_services_v116(city_id,active,supplier_id,format_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_services_supplier_v116 ON portal_supplier_services_v116(supplier_id,active,city_id,format_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_rates_service_v116 ON portal_supplier_rates_v116(service_id,active,public_order,duration_minutes);
  `);
  migrateLegacyCatalog(store);
  store.mediaCatalogV116SchemaReady=true;
}

export async function mediaCatalogContextV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,modelRelease:MEDIA_CATALOG_MODEL_RELEASE,...contextData(store)});
}

export async function saveMediaConceptV116(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),label=sanitizeText(p.label,180).trim();if(!label)return json({error:'concept_label_required'},400);
  const existing=conceptByLabel(store,label),id=existing?.id||crypto.randomUUID(),at=new Date().toISOString();
  if(existing)store.sql.exec('UPDATE portal_media_concepts_v116 SET active=1,updated_at=? WHERE id=?',at,id);
  else store.sql.exec('INSERT INTO portal_media_concepts_v116(id,label,active,public_order,created_at,updated_at) VALUES(?,?,1,100,?,?)',id,label,at,at);
  store.audit?.(access.actor?.id||'studio','media_concept_saved_v116','media_concept',id,{label});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,modelRelease:MEDIA_CATALOG_MODEL_RELEASE,...contextData(store),savedId:id});
}

export async function saveMediaFormatV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),name=sanitizeText(p.name,140).trim();if(!name)return json({error:'format_name_required'},400);
  const current=store.sql.exec('SELECT slug,price_cents AS priceCents,booking_url AS bookingUrl FROM portal_media_formats_v95 WHERE id=? LIMIT 1',id).toArray()[0];
  const detail=store.sql.exec('SELECT concept_id AS conceptId,shoot_minutes AS shootMinutes,total_minutes AS totalMinutes FROM portal_media_format_details_v116 WHERE format_id=? LIMIT 1',id).toArray()[0]||{};
  let concept=cleanId(p.conceptId)?conceptById(store,cleanId(p.conceptId)):null;
  if(!concept&&sanitizeText(p.concept,180).trim())concept=ensureConcept(store,sanitizeText(p.concept,180).trim(),new Date().toISOString());
  if(!concept&&detail.conceptId)concept=conceptById(store,detail.conceptId);
  if(!concept)return json({error:'concept_required'},400);
  const shoot=positiveMinutes(p.shootMinutes)||parseDuration(p.durationLabel)||Number(detail.shootMinutes||0),total=positiveMinutes(p.totalMinutes)||Number(detail.totalMinutes||0);
  if(!shoot)return json({error:'shoot_duration_required'},400);if(!total)return json({error:'total_duration_required'},400);if(total<shoot)return json({error:'total_duration_shorter_than_shoot'},400);
  const slug=current?.slug||uniqueFormatSlug(store,name,id),description=sanitizeText(p.description,1200),active=boolInt(p.active),publicOrder=clamp(p.publicOrder,0,9999),at=new Date().toISOString();
  if(current)store.sql.exec('UPDATE portal_media_formats_v95 SET name=?,concept=?,description=?,duration_label=?,active=?,public_order=?,updated_at=? WHERE id=?',name,concept.label,description,durationLabel(shoot),active,publicOrder,at,id);
  else store.sql.exec('INSERT INTO portal_media_formats_v95(id,slug,name,concept,description,duration_label,price_cents,booking_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,slug,name,concept.label,description,durationLabel(shoot),0,'',active,publicOrder,at,at);
  store.sql.exec(`INSERT INTO portal_media_format_details_v116(format_id,concept_id,shoot_minutes,total_minutes,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(format_id) DO UPDATE SET concept_id=excluded.concept_id,shoot_minutes=excluded.shoot_minutes,total_minutes=excluded.total_minutes,updated_at=excluded.updated_at`,id,concept.id,shoot,total,at);
  saveFormatVisualV98(store,id,p.imageUrl);
  store.audit?.(access.actor?.id||'studio','media_format_saved_v116','media_format',id,{name,slug,active:Boolean(active),conceptId:concept.id,shootMinutes:shoot,totalMinutes:total});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,modelRelease:MEDIA_CATALOG_MODEL_RELEASE,...contextData(store),savedId:id});
}

export async function saveMediaSupplierV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),name=sanitizeText(p.name,140);if(!name)return json({error:'supplier_name_required'},400);
  const current=store.sql.exec('SELECT default_net_cents AS defaultNetCents,vat_rate_bps AS vatRateBps FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',id).toArray()[0];
  const email=normalizeEmail(p.email),legalName=sanitizeText(p.legalName||name,180),net=p.defaultNetCents==null?Number(current?.defaultNetCents||0):clamp(p.defaultNetCents,0,1e9),vat=p.vatRateBps==null?Number(current?.vatRateBps||2000):clamp(p.vatRateBps,0,10000),gross=net+Math.round(net*vat/10000),notes=sanitizeText(p.notes,1200),active=boolInt(p.active),at=new Date().toISOString();
  if(current)store.sql.exec('UPDATE portal_media_suppliers_v95 SET name=?,email=?,legal_name=?,default_net_cents=?,vat_rate_bps=?,default_gross_cents=?,notes=?,active=?,updated_at=? WHERE id=?',name,email,legalName,net,vat,gross,notes,active,at,id);
  else store.sql.exec('INSERT INTO portal_media_suppliers_v95(id,name,email,legal_name,default_net_cents,vat_rate_bps,default_gross_cents,notes,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,name,email,legalName,net,vat,gross,notes,active,at,at);
  store.audit?.(access.actor?.id||'studio','media_supplier_saved_v116','supplier',id,{name,active:Boolean(active)});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,modelRelease:MEDIA_CATALOG_MODEL_RELEASE,...contextData(store),savedId:id});
}

export async function saveMediaCityV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),name=sanitizeText(p.name,120).trim();if(!name)return json({error:'city_name_required'},400);
  const current=store.sql.exec('SELECT slug FROM portal_media_cities_v96 WHERE id=? LIMIT 1',id).toArray()[0],slug=current?.slug||uniqueCitySlug(store,name,id),country=sanitizeText(p.country||'France',100)||'France',active=boolInt(p.active),order=clamp(p.publicOrder,0,9999),at=new Date().toISOString();
  if(current)store.sql.exec('UPDATE portal_media_cities_v96 SET name=?,country=?,active=?,public_order=?,updated_at=? WHERE id=?',name,country,active,order,at,id);
  else store.sql.exec('INSERT INTO portal_media_cities_v96(id,slug,name,country,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,slug,name,country,active,order,at,at);
  store.audit?.(access.actor?.id||'studio','media_city_saved_v116','media_city',id,{name,slug,active:Boolean(active)});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,modelRelease:MEDIA_CATALOG_MODEL_RELEASE,...contextData(store),savedId:id});
}

export async function saveSupplierServiceV116(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),cityId=cleanId(p.cityId),supplierId=cleanId(p.supplierId),formatId=cleanId(p.formatId);if(!cityId||!supplierId||!formatId)return json({error:'service_fields_required'},400);
  if(!tripleExists(store,cityId,supplierId,formatId))return json({error:'service_reference_invalid'},404);
  if(store.sql.exec('SELECT id FROM portal_supplier_services_v116 WHERE city_id=? AND supplier_id=? AND format_id=? AND id<>? LIMIT 1',cityId,supplierId,formatId,id).toArray()[0])return json({error:'service_already_exists'},409);
  const prep=safeHttpUrl(p.preparationUrl),notes=sanitizeText(p.notes,1200),active=boolInt(p.active),at=new Date().toISOString();
  if(store.sql.exec('SELECT id FROM portal_supplier_services_v116 WHERE id=? LIMIT 1',id).toArray()[0])store.sql.exec('UPDATE portal_supplier_services_v116 SET city_id=?,supplier_id=?,format_id=?,preparation_url=?,notes=?,active=?,updated_at=? WHERE id=?',cityId,supplierId,formatId,prep,notes,active,at,id);
  else store.sql.exec('INSERT INTO portal_supplier_services_v116(id,city_id,supplier_id,format_id,preparation_url,notes,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',id,cityId,supplierId,formatId,prep,notes,active,at,at);
  store.audit?.(access.actor?.id||'studio','supplier_service_saved_v116','supplier_service',id,{cityId,supplierId,formatId,active:Boolean(active)});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,modelRelease:MEDIA_CATALOG_MODEL_RELEASE,...contextData(store),savedId:id});
}
export async function archiveSupplierServiceV116(store,body={}){
  ensureMediaCatalogV98Schema(store);const access=await requireOperator(store,body);if(!access.ok)return access.response;const id=cleanId(payload(body).id),service=serviceById(store,id);if(!service)return json({error:'service_not_found'},404);
  const live=store.sql.exec('SELECT COUNT(*) AS n FROM portal_media_offers_v96 WHERE city_id=? AND supplier_id=? AND format_id=? AND active=1',service.cityId,service.supplierId,service.formatId).toArray()[0];if(Number(live?.n||0)>0)return json({error:'service_used_by_active_offer'},409);
  store.sql.exec('UPDATE portal_supplier_services_v116 SET active=0,updated_at=? WHERE id=?',new Date().toISOString(),id);return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store)});
}
export async function saveSupplierRateV116(store,body={}){
  ensureMediaCatalogV98Schema(store);const access=await requireOperator(store,body);if(!access.ok)return access.response;const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),serviceId=cleanId(p.serviceId),service=serviceById(store,serviceId);if(!service)return json({error:'service_not_found'},404);
  let unit=String(p.unitCode||'custom').trim();if(!RATE_UNITS.has(unit)||unit==='legacy')unit='custom';const minutes=positiveMinutes(p.durationMinutes);if(!minutes)return json({error:'rate_duration_required'},400);
  const net=clamp(p.netCents,0,1e9),vat=clamp(p.vatRateBps,0,10000),gross=net+Math.round(net*vat/10000),order=clamp(p.publicOrder,0,9999),active=boolInt(p.active),label=rateLabel(unit,minutes),at=new Date().toISOString();
  if(store.sql.exec('SELECT id FROM portal_supplier_rates_v116 WHERE id=? LIMIT 1',id).toArray()[0])store.sql.exec('UPDATE portal_supplier_rates_v116 SET service_id=?,unit_code=?,duration_minutes=?,label=?,net_cents=?,vat_rate_bps=?,gross_cents=?,active=?,public_order=?,updated_at=? WHERE id=?',serviceId,unit,minutes,label,net,vat,gross,active,order,at,id);
  else store.sql.exec('INSERT INTO portal_supplier_rates_v116(id,service_id,unit_code,duration_minutes,label,net_cents,vat_rate_bps,gross_cents,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,serviceId,unit,minutes,label,net,vat,gross,active,order,at,at);
  syncMappedOffersFromRate(store,id,net,vat,gross,at);store.audit?.(access.actor?.id||'studio','supplier_rate_saved_v116','supplier_rate',id,{serviceId,minutes,net,vat,active:Boolean(active)});return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store),savedId:id});
}
export async function archiveSupplierRateV116(store,body={}){
  ensureMediaCatalogV98Schema(store);const access=await requireOperator(store,body);if(!access.ok)return access.response;const id=cleanId(payload(body).id),rate=rateById(store,id);if(!rate)return json({error:'rate_not_found'},404);const used=store.sql.exec('SELECT COUNT(*) AS n FROM portal_offer_supplier_rate_v116 WHERE rate_id=?',id).toArray()[0];if(Number(used?.n||0)>0)return json({error:'rate_used_by_offer'},409);store.sql.exec('UPDATE portal_supplier_rates_v116 SET active=0,updated_at=? WHERE id=?',new Date().toISOString(),id);return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store)});
}

export async function saveMediaOfferFamilyV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const action=String(payload(body).catalogAction||'');
  if(action==='concept_save')return saveMediaConceptV116(store,body);
  if(action==='service_save')return saveSupplierServiceV116(store,body);
  if(action==='service_archive')return archiveSupplierServiceV116(store,body);
  if(action==='rate_save')return saveSupplierRateV116(store,body);
  if(action==='rate_archive')return archiveSupplierRateV116(store,body);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),cityId=cleanId(p.cityId),formatId=cleanId(p.formatId),supplierId=cleanId(p.supplierId),rateId=cleanId(p.supplierRateId);if(!cityId||!formatId||!supplierId||!rateId)return json({error:'offer_family_rate_required'},400);
  const service=serviceForTriple(store,cityId,supplierId,formatId);if(!service||!service.active)return json({error:'active_supplier_service_required'},409);const rate=rateById(store,rateId);if(!rate||!rate.active||rate.serviceId!==service.id)return json({error:'supplier_rate_invalid'},409);
  const active=boolInt(p.active),suffix=sanitizeText(p.priceSuffix||'HT',20)||'HT',currency=sanitizeText(p.currency||'eur',10).toLowerCase()||'eur',prep=safeHttpUrl(p.preparationUrl||service.preparationUrl),publicOrder=clamp(p.publicOrder,0,9999),at=new Date().toISOString(),tiers=p.tiers&&typeof p.tiers==='object'?p.tiers:{},saved={};
  for(const key of ['launch','promo','base']){
    const input=tiers[key]&&typeof tiers[key]==='object'?tiers[key]:{};let id=cleanId(input.id),current=id?offerRow(store,id):null;if(!current)current=familyRows(store,cityId,formatId,supplierId).find(x=>tierKey(x)===key)||null;if(current)id=current.id;else id=crypto.randomUUID();
    const price=clamp(input.clientPriceCents,0,1e9),paymentUrl=safeHttpUrl(input.paymentUrl||current?.paymentUrl||'');if(!paymentUrl)return json({error:`payment_url_required_${key}`},400);const name=TIER_LABELS[key];
    if(current)store.sql.exec('UPDATE portal_media_offers_v96 SET city_id=?,format_id=?,supplier_id=?,name=?,client_price_cents=?,currency=?,price_suffix=?,payment_url=?,supplier_net_cents=?,vat_rate_bps=?,supplier_gross_cents=?,preparation_url=?,active=?,public_order=?,updated_at=? WHERE id=?',cityId,formatId,supplierId,name,price,currency,suffix,paymentUrl,rate.netCents,rate.vatRateBps,rate.grossCents,prep,active,publicOrder,at,id);
    else store.sql.exec('INSERT INTO portal_media_offers_v96(id,city_id,format_id,supplier_id,name,client_price_cents,currency,price_suffix,payment_url,supplier_net_cents,vat_rate_bps,supplier_gross_cents,preparation_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,cityId,formatId,supplierId,name,price,currency,suffix,paymentUrl,rate.netCents,rate.vatRateBps,rate.grossCents,prep,active,publicOrder,at,at);
    store.sql.exec(`INSERT INTO portal_offer_supplier_rate_v116(offer_id,rate_id,updated_at) VALUES(?,?,?) ON CONFLICT(offer_id) DO UPDATE SET rate_id=excluded.rate_id,updated_at=excluded.updated_at`,id,rate.id,at);saved[key]=id;
  }
  const labels=normalizeOptions(p.configurationOptions);for(const id of Object.values(saved))replaceConfigurations(store,id,labels,at);
  store.audit?.(access.actor?.id||'studio','media_offer_family_saved_v116','media_offer_family',`${cityId}:${formatId}:${supplierId}`,{active:Boolean(active),tiers:saved,supplierRateId:rate.id,configurations:labels});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,modelRelease:MEDIA_CATALOG_MODEL_RELEASE,...contextData(store),savedTierIds:saved});
}

export async function saveMediaConfigurationVisualV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),formatId=cleanId(p.formatId),label=sanitizeText(p.label,80);
  if(!formatId||!label)return json({error:'configuration_visual_fields_required'},400);
  if(!store.sql.exec('SELECT id FROM portal_media_formats_v95 WHERE id=? LIMIT 1',formatId).toArray()[0])return json({error:'format_not_found'},404);
  saveConfigurationVisualV98(store,formatId,label,p.imageUrl,p.description);
  store.audit?.(access.actor?.id||'studio','media_configuration_visual_saved_v98','media_configuration_visual',`${formatId}:${label}`,{imageUrl:safeHttpUrl(p.imageUrl),description:sanitizeText(p.description,900)});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store)});
}

export function formatScheduleV116(store,formatId){ensureMediaCatalogV98Schema(store);const row=store.sql.exec('SELECT shoot_minutes AS shootMinutes,total_minutes AS totalMinutes FROM portal_media_format_details_v116 WHERE format_id=? LIMIT 1',formatId).toArray()[0]||{};return{shootMinutes:Number(row.shootMinutes||0),totalMinutes:Number(row.totalMinutes||0),shootDurationLabel:durationLabel(row.shootMinutes),totalDurationLabel:durationLabel(row.totalMinutes)};}

function contextData(store){
  ensureMediaCatalogV98Schema(store);
  const details=new Map(store.sql.exec('SELECT format_id AS formatId,concept_id AS conceptId,shoot_minutes AS shootMinutes,total_minutes AS totalMinutes FROM portal_media_format_details_v116').toArray().map(x=>[x.formatId,x]));
  const formats=store.sql.exec('SELECT id,slug,name,concept,description,duration_label AS durationLabel,price_cents AS priceCents,booking_url AS bookingUrl,active,public_order AS publicOrder FROM portal_media_formats_v95 ORDER BY active DESC,public_order,name').toArray().map(x=>{const d=details.get(x.id)||{};return{...x,active:Boolean(x.active),conceptId:d.conceptId||'',shootMinutes:Number(d.shootMinutes||0),totalMinutes:Number(d.totalMinutes||0),shootDurationLabel:durationLabel(d.shootMinutes),totalDurationLabel:durationLabel(d.totalMinutes),...formatVisualV98(store,x.id,x.slug)};});
  const services=serviceRows(store),rates=rateRows(store),rateMap=new Map(rates.map(x=>[x.id,x])),offerRate=new Map(store.sql.exec('SELECT offer_id AS offerId,rate_id AS rateId FROM portal_offer_supplier_rate_v116').toArray().map(x=>[x.offerId,x.rateId]));
  const suppliersRaw=store.sql.exec('SELECT id,name,email,legal_name AS legalName,default_net_cents AS defaultNetCents,vat_rate_bps AS vatRateBps,default_gross_cents AS defaultGrossCents,notes,active FROM portal_media_suppliers_v95 ORDER BY active DESC,name').toArray();
  const suppliers=suppliersRaw.map(x=>({...x,active:Boolean(x.active),serviceCount:services.filter(s=>s.supplierId===x.id).length,rateCount:rates.filter(r=>services.some(s=>s.id===r.serviceId&&s.supplierId===x.id)).length}));
  const citiesRaw=store.sql.exec('SELECT id,slug,name,country,active,public_order AS publicOrder FROM portal_media_cities_v96 ORDER BY active DESC,public_order,name').toArray();
  const cities=citiesRaw.map(x=>({...x,active:Boolean(x.active),supplierCount:new Set(services.filter(s=>s.cityId===x.id).map(s=>s.supplierId)).size,serviceCount:services.filter(s=>s.cityId===x.id).length}));
  const offers=store.sql.exec(`SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,o.name,o.client_price_cents AS clientPriceCents,o.currency,o.price_suffix AS priceSuffix,o.payment_url AS paymentUrl,o.supplier_net_cents AS supplierNetCents,o.vat_rate_bps AS vatRateBps,o.supplier_gross_cents AS supplierGrossCents,o.preparation_url AS preparationUrl,o.active,o.public_order AS publicOrder,c.name AS cityName,f.name AS formatName,f.slug AS formatSlug,s.name AS supplierName FROM portal_media_offers_v96 o JOIN portal_media_cities_v96 c ON c.id=o.city_id JOIN portal_media_formats_v95 f ON f.id=o.format_id JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id ORDER BY c.public_order,f.public_order,s.name,o.public_order,o.name`).toArray().map(x=>({...x,active:Boolean(x.active)}));
  const configs=store.sql.exec('SELECT offer_id AS offerId,label,public_order AS publicOrder,active FROM portal_offer_configurations_v96 ORDER BY offer_id,public_order,label').toArray().map(x=>({...x,active:Boolean(x.active)}));
  const families=buildFamilies(store,offers,configs,formats).map(family=>{const offerIds=Object.values(family.tiers).map(x=>x?.id).filter(Boolean),rateId=offerIds.map(id=>offerRate.get(id)).find(Boolean)||'';return{...family,supplierRateId:rateId,supplierRate:rateMap.get(rateId)||null,service:services.find(s=>s.cityId===family.cityId&&s.supplierId===family.supplierId&&s.formatId===family.formatId)||null};});
  const concepts=store.sql.exec('SELECT id,label,active,public_order AS publicOrder FROM portal_media_concepts_v116 ORDER BY active DESC,public_order,label').toArray().map(x=>({...x,active:Boolean(x.active)}));
  return{formats,suppliers,cities,families,concepts,services,supplierRates:rates,durationOptions:DURATION_OPTIONS.map(minutes=>({minutes,label:durationLabel(minutes)})),rateUnits:[...RATE_UNITS].filter(([key])=>key!=='legacy').map(([code,label])=>({code,label}))};
}
function buildFamilies(store,offers,configs,formats){const configMap=new Map();for(const row of configs){if(!row.active)continue;if(!configMap.has(row.offerId))configMap.set(row.offerId,[]);configMap.get(row.offerId).push(row.label);}const formatMap=new Map(formats.map(x=>[x.id,x])),groups=new Map();for(const offer of offers){const key=`${offer.cityId}|${offer.formatId}|${offer.supplierId}`;if(!groups.has(key))groups.set(key,{key,cityId:offer.cityId,cityName:offer.cityName,formatId:offer.formatId,formatName:offer.formatName,formatSlug:offer.formatSlug,supplierId:offer.supplierId,supplierName:offer.supplierName,active:false,publicOrder:offer.publicOrder??100,priceSuffix:offer.priceSuffix||'HT',currency:offer.currency||'eur',supplierNetCents:offer.supplierNetCents||0,vatRateBps:offer.vatRateBps||2000,preparationUrl:offer.preparationUrl||'',tiers:{launch:null,promo:null,base:null},configurationOptions:[]});const family=groups.get(key),tier=tierKey(offer);if(tier)family.tiers[tier]=offer;family.active=family.active||offer.active;for(const label of configMap.get(offer.id)||[])if(!family.configurationOptions.includes(label))family.configurationOptions.push(label);}const families=[...groups.values()];for(const family of families){family.configurationVisuals=family.configurationOptions.map(label=>configurationVisualV98(store,family.formatId,family.formatSlug,label));family.format=formatMap.get(family.formatId)||null;}return families.sort((a,b)=>a.cityName.localeCompare(b.cityName,'fr')||a.formatName.localeCompare(b.formatName,'fr')||a.supplierName.localeCompare(b.supplierName,'fr'));}

function migrateLegacyCatalog(store){
  const at=new Date().toISOString();
  for(const format of store.sql.exec('SELECT id,concept,duration_label AS durationLabel FROM portal_media_formats_v95').toArray()){
    const concept=ensureConcept(store,sanitizeText(format.concept,180).trim()||'Concept à préciser',at),minutes=parseDuration(format.durationLabel);
    if(!store.sql.exec('SELECT format_id FROM portal_media_format_details_v116 WHERE format_id=? LIMIT 1',format.id).toArray()[0])store.sql.exec('INSERT INTO portal_media_format_details_v116(format_id,concept_id,shoot_minutes,total_minutes,updated_at) VALUES(?,?,?,?,?)',format.id,concept.id,minutes,0,at);
  }
  const families=store.sql.exec('SELECT city_id AS cityId,supplier_id AS supplierId,format_id AS formatId,MAX(preparation_url) AS preparationUrl FROM portal_media_offers_v96 GROUP BY city_id,supplier_id,format_id').toArray();
  for(const family of families){
    let service=serviceForTriple(store,family.cityId,family.supplierId,family.formatId);
    if(!service){
      const id=crypto.randomUUID();
      store.sql.exec("INSERT INTO portal_supplier_services_v116(id,city_id,supplier_id,format_id,preparation_url,notes,active,created_at,updated_at) VALUES(?,?,?,?,?,'Migration automatique v116',1,?,?)",id,family.cityId,family.supplierId,family.formatId,family.preparationUrl||'',at,at);
      service=serviceById(store,id);
    }
    const offers=store.sql.exec('SELECT id,supplier_net_cents AS netCents,vat_rate_bps AS vatRateBps FROM portal_media_offers_v96 WHERE city_id=? AND supplier_id=? AND format_id=?',family.cityId,family.supplierId,family.formatId).toArray();
    for(const offer of offers){
      const net=Number(offer.netCents||0),vat=Number(offer.vatRateBps||2000);
      let rate=rateRows(store).find(item=>item.serviceId===service.id&&item.unitCode==='legacy'&&Number(item.netCents)===net&&Number(item.vatRateBps)===vat);
      if(!rate){
        const id=crypto.randomUUID(),gross=net+Math.round(net*vat/10000);
        store.sql.exec("INSERT INTO portal_supplier_rates_v116(id,service_id,unit_code,duration_minutes,label,net_cents,vat_rate_bps,gross_cents,active,public_order,created_at,updated_at) VALUES(?,?,'legacy',0,?,?,?,?,1,999,?,?)",id,service.id,'Tarif historique · durée à préciser',net,vat,gross,at,at);
        rate=rateById(store,id);
      }
      store.sql.exec(`INSERT INTO portal_offer_supplier_rate_v116(offer_id,rate_id,updated_at) VALUES(?,?,?)
        ON CONFLICT(offer_id) DO UPDATE SET rate_id=excluded.rate_id,updated_at=excluded.updated_at`,offer.id,rate.id,at);
    }
  }
}
function serviceRows(store){return store.sql.exec('SELECT x.id,x.city_id AS cityId,x.supplier_id AS supplierId,x.format_id AS formatId,x.preparation_url AS preparationUrl,x.notes,x.active,c.name AS cityName,s.name AS supplierName,f.name AS formatName FROM portal_supplier_services_v116 x JOIN portal_media_cities_v96 c ON c.id=x.city_id JOIN portal_media_suppliers_v95 s ON s.id=x.supplier_id JOIN portal_media_formats_v95 f ON f.id=x.format_id ORDER BY c.public_order,c.name,s.name,f.public_order,f.name').toArray().map(x=>({...x,active:Boolean(x.active)}));}
function rateRows(store){return store.sql.exec('SELECT id,service_id AS serviceId,unit_code AS unitCode,duration_minutes AS durationMinutes,label,net_cents AS netCents,vat_rate_bps AS vatRateBps,gross_cents AS grossCents,active,public_order AS publicOrder FROM portal_supplier_rates_v116 ORDER BY service_id,active DESC,public_order,duration_minutes,label').toArray().map(x=>({...x,active:Boolean(x.active)}));}
function serviceById(store,id){return serviceRows(store).find(x=>x.id===id)||null;}function serviceForTriple(store,cityId,supplierId,formatId){return serviceRows(store).find(x=>x.cityId===cityId&&x.supplierId===supplierId&&x.formatId===formatId)||null;}function rateById(store,id){return rateRows(store).find(x=>x.id===id)||null;}
function syncMappedOffersFromRate(store,rateId,net,vat,gross,at){for(const row of store.sql.exec('SELECT offer_id AS offerId FROM portal_offer_supplier_rate_v116 WHERE rate_id=?',rateId).toArray())store.sql.exec('UPDATE portal_media_offers_v96 SET supplier_net_cents=?,vat_rate_bps=?,supplier_gross_cents=?,updated_at=? WHERE id=?',net,vat,gross,at,row.offerId);}
function familyRows(store,cityId,formatId,supplierId){return store.sql.exec('SELECT id,name,payment_url AS paymentUrl,active FROM portal_media_offers_v96 WHERE city_id=? AND format_id=? AND supplier_id=?',cityId,formatId,supplierId).toArray().map(x=>({...x,active:Boolean(x.active)}));}function offerRow(store,id){return store.sql.exec('SELECT id,name,payment_url AS paymentUrl,active FROM portal_media_offers_v96 WHERE id=? LIMIT 1',id).toArray()[0]||null;}function replaceConfigurations(store,offerId,labels,at){store.sql.exec('DELETE FROM portal_offer_configurations_v96 WHERE offer_id=?',offerId);labels.forEach((label,index)=>store.sql.exec('INSERT INTO portal_offer_configurations_v96(id,offer_id,label,public_order,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)',crypto.randomUUID(),offerId,label,(index+1)*10,at,at));}
function normalizeOptions(value){const list=Array.isArray(value)?value:String(value||'').split(/[,;\n]/u);return[...new Set(list.map(x=>sanitizeText(x,80)).filter(Boolean))].slice(0,20);}function tierKey(o){const value=`${o?.id||''} ${o?.name||''}`.normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();if(/launch|lancement|coutant/u.test(value))return'launch';if(/promo|preferentiel/u.test(value))return'promo';if(/standard|base|normal/u.test(value))return'base';return'';}
function conceptById(store,id){return store.sql.exec('SELECT id,label,active FROM portal_media_concepts_v116 WHERE id=? LIMIT 1',id).toArray()[0]||null;}function conceptByLabel(store,label){return store.sql.exec('SELECT id,label,active FROM portal_media_concepts_v116 WHERE lower(label)=lower(?) LIMIT 1',label).toArray()[0]||null;}function ensureConcept(store,label,at){const current=conceptByLabel(store,label);if(current)return current;const id=crypto.randomUUID();store.sql.exec('INSERT INTO portal_media_concepts_v116(id,label,active,public_order,created_at,updated_at) VALUES(?,?,1,100,?,?)',id,label,at,at);return{id,label,active:1};}
function tripleExists(store,cityId,supplierId,formatId){return Boolean(store.sql.exec('SELECT c.id FROM portal_media_cities_v96 c,portal_media_suppliers_v95 s,portal_media_formats_v95 f WHERE c.id=? AND s.id=? AND f.id=? LIMIT 1',cityId,supplierId,formatId).toArray()[0]);}
function uniqueFormatSlug(store,name,id){let slug=slugify(name)||`format-${id.slice(0,8)}`;if(store.sql.exec('SELECT id FROM portal_media_formats_v95 WHERE slug=? AND id<>? LIMIT 1',slug,id).toArray()[0])slug=`${slug}-${id.slice(0,6)}`;return slug;}function uniqueCitySlug(store,name,id){let slug=slugify(name)||`ville-${id.slice(0,6)}`;if(store.sql.exec('SELECT id FROM portal_media_cities_v96 WHERE slug=? AND id<>? LIMIT 1',slug,id).toArray()[0])slug=`${slug}-${id.slice(0,5)}`;return slug;}
function rateLabel(unit,minutes){const base=RATE_UNITS.get(unit)||'Durée personnalisée';if(unit==='half_hour'&&minutes===30)return'Demi-heure · 30 min';if(unit==='hour'&&minutes===60)return'Heure · 1 h';if(unit==='half_day')return`Demi-journée · ${durationLabel(minutes)}`;if(unit==='day')return`Journée · ${durationLabel(minutes)}`;return`${base} · ${durationLabel(minutes)}`;}function durationLabel(value){const minutes=Number(value||0);if(!minutes)return'';const hours=Math.floor(minutes/60),rest=minutes%60;if(!hours)return`${minutes} min`;if(!rest)return`${hours} h`;return`${hours} h ${String(rest).padStart(2,'0')}`;}function parseDuration(value){const text=String(value||'').toLowerCase().replace(',','.');const h=text.match(/(\d+(?:\.\d+)?)\s*h/u),m=text.match(/(\d+)\s*min/u);if(h)return Math.round(Number(h[1])*60)+(m?Number(m[1]):0);if(m)return Number(m[1]);const raw=Number.parseInt(text,10);return Number.isFinite(raw)?raw:0;}
function payload(body){return body?.payload&&typeof body.payload==='object'?body.payload:body||{};}function cleanId(value){const v=String(value||'').trim();return/^[a-zA-Z0-9._:-]{1,160}$/u.test(v)?v:'';}function clamp(value,min,max){const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?Math.round(n):min));}function boolInt(value){return value===false||value===0||value==='0'?0:1;}function positiveMinutes(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.round(n):0;}function slugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,100);}function normalizeEmail(value){const v=String(value||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v)?v:'';}function safeHttpUrl(value){const raw=String(value||'').trim();if(!raw)return'';try{const url=new URL(raw);return['http:','https:'].includes(url.protocol)?url.toString():'';}catch{return'';}}
