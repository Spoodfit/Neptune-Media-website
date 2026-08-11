import { ensureMediaCatalogVisualsV98Schema, formatVisualV98, configurationVisualV98, saveFormatVisualV98, saveConfigurationVisualV98 } from './media-catalog-visuals-v98.js';
import { requireOperator } from './workflow-db-v5.js';
import { json, sanitizeText } from './security.js';

export const MEDIA_CATALOG_RELEASE='neptune-media-catalog-20260811-v98';
const TIER_LABELS={launch:'Prix coûtant · lancement',promo:'Tarif préférentiel',base:'Tarif normal'};

export function ensureMediaCatalogV98Schema(store){
  ensureMediaCatalogVisualsV98Schema(store);
}

export async function mediaCatalogContextV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);
  if(!access.ok)return access.response;
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store)});
}

export async function saveMediaFormatV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),name=sanitizeText(p.name,140);
  if(!name)return json({error:'format_name_required'},400);
  let slug=slugify(p.slug||name)||`format-${id.slice(0,8)}`;
  const collision=store.sql.exec('SELECT id FROM portal_media_formats_v95 WHERE slug=? AND id<>? LIMIT 1',slug,id).toArray()[0];
  if(collision)slug=`${slug}-${id.slice(0,6)}`;
  const concept=sanitizeText(p.concept,180),description=sanitizeText(p.description,1200),durationLabel=sanitizeText(p.durationLabel,120);
  const priceCents=clamp(p.priceCents,0,1e9),bookingUrl=safeHttpUrl(p.bookingUrl),active=boolInt(p.active),publicOrder=clamp(p.publicOrder,0,9999),at=new Date().toISOString();
  const exists=store.sql.exec('SELECT id FROM portal_media_formats_v95 WHERE id=? LIMIT 1',id).toArray()[0];
  if(exists)store.sql.exec(`UPDATE portal_media_formats_v95 SET slug=?,name=?,concept=?,description=?,duration_label=?,price_cents=?,booking_url=?,active=?,public_order=?,updated_at=? WHERE id=?`,
    slug,name,concept,description,durationLabel,priceCents,bookingUrl,active,publicOrder,at,id);
  else store.sql.exec(`INSERT INTO portal_media_formats_v95(id,slug,name,concept,description,duration_label,price_cents,booking_url,active,public_order,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,id,slug,name,concept,description,durationLabel,priceCents,bookingUrl,active,publicOrder,at,at);
  saveFormatVisualV98(store,id,p.imageUrl);
  store.audit?.(access.actor?.id||'studio','media_format_saved_v98','media_format',id,{name,slug,active:Boolean(active)});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store),savedId:id});
}

export async function saveMediaSupplierV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),name=sanitizeText(p.name,140);
  if(!name)return json({error:'supplier_name_required'},400);
  const email=normalizeEmail(p.email),legalName=sanitizeText(p.legalName||name,180),net=clamp(p.defaultNetCents,0,1e9),vat=clamp(p.vatRateBps,0,10000),gross=net+Math.round(net*vat/10000),notes=sanitizeText(p.notes,1200),active=boolInt(p.active),at=new Date().toISOString();
  const exists=store.sql.exec('SELECT id FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',id).toArray()[0];
  if(exists)store.sql.exec(`UPDATE portal_media_suppliers_v95 SET name=?,email=?,legal_name=?,default_net_cents=?,vat_rate_bps=?,default_gross_cents=?,notes=?,active=?,updated_at=? WHERE id=?`,
    name,email,legalName,net,vat,gross,notes,active,at,id);
  else store.sql.exec(`INSERT INTO portal_media_suppliers_v95(id,name,email,legal_name,default_net_cents,vat_rate_bps,default_gross_cents,notes,active,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,id,name,email,legalName,net,vat,gross,notes,active,at,at);
  store.audit?.(access.actor?.id||'studio','media_supplier_saved_v98','supplier',id,{name,active:Boolean(active),net});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store),savedId:id});
}

export async function saveMediaCityV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),name=sanitizeText(p.name,120);
  if(!name)return json({error:'city_name_required'},400);
  let slug=slugify(p.slug||name)||`ville-${id.slice(0,6)}`;
  if(store.sql.exec('SELECT id FROM portal_media_cities_v96 WHERE slug=? AND id<>? LIMIT 1',slug,id).toArray()[0])slug=`${slug}-${id.slice(0,5)}`;
  const country=sanitizeText(p.country||'France',100)||'France',active=boolInt(p.active),order=clamp(p.publicOrder,0,9999),at=new Date().toISOString();
  if(store.sql.exec('SELECT id FROM portal_media_cities_v96 WHERE id=? LIMIT 1',id).toArray()[0])store.sql.exec('UPDATE portal_media_cities_v96 SET slug=?,name=?,country=?,active=?,public_order=?,updated_at=? WHERE id=?',slug,name,country,active,order,at,id);
  else store.sql.exec('INSERT INTO portal_media_cities_v96(id,slug,name,country,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,slug,name,country,active,order,at,at);
  store.audit?.(access.actor?.id||'studio','media_city_saved_v98','media_city',id,{name,active:Boolean(active)});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store),savedId:id});
}

export async function saveMediaOfferFamilyV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),cityId=cleanId(p.cityId),formatId=cleanId(p.formatId),supplierId=cleanId(p.supplierId);
  if(!cityId||!formatId||!supplierId)return json({error:'offer_family_fields_required'},400);
  const refs=store.sql.exec(`SELECT c.id AS cityId,f.id AS formatId,s.id AS supplierId,s.default_net_cents AS defaultNet,s.vat_rate_bps AS defaultVat
    FROM portal_media_cities_v96 c,portal_media_formats_v95 f,portal_media_suppliers_v95 s WHERE c.id=? AND f.id=? AND s.id=? LIMIT 1`,cityId,formatId,supplierId).toArray()[0];
  if(!refs)return json({error:'offer_reference_invalid'},404);
  const active=boolInt(p.active),suffix=sanitizeText(p.priceSuffix||'HT',20)||'HT',currency=sanitizeText(p.currency||'eur',10).toLowerCase()||'eur';
  const net=p.supplierNetCents===''||p.supplierNetCents==null?Number(refs.defaultNet||0):clamp(p.supplierNetCents,0,1e9);
  const vat=p.vatRateBps===''||p.vatRateBps==null?Number(refs.defaultVat||2000):clamp(p.vatRateBps,0,10000);
  const gross=net+Math.round(net*vat/10000),prep=safeHttpUrl(p.preparationUrl),publicOrder=clamp(p.publicOrder,0,9999),at=new Date().toISOString();
  const tiers=p.tiers&&typeof p.tiers==='object'?p.tiers:{},saved={};
  for(const key of ['launch','promo','base']){
    const input=tiers[key]&&typeof tiers[key]==='object'?tiers[key]:{};
    let id=cleanId(input.id);
    let current=id?offerRow(store,id):null;
    if(!current)current=familyRows(store,cityId,formatId,supplierId).find(x=>tierKey(x)===key)||null;
    if(current)id=current.id;else id=crypto.randomUUID();
    const price=clamp(input.clientPriceCents,0,1e9),paymentUrl=safeHttpUrl(input.paymentUrl||current?.paymentUrl||'');
    if(!paymentUrl)return json({error:`payment_url_required_${key}`},400);
    const name=TIER_LABELS[key];
    if(current)store.sql.exec(`UPDATE portal_media_offers_v96 SET city_id=?,format_id=?,supplier_id=?,name=?,client_price_cents=?,currency=?,price_suffix=?,payment_url=?,supplier_net_cents=?,vat_rate_bps=?,supplier_gross_cents=?,preparation_url=?,active=?,public_order=?,updated_at=? WHERE id=?`,
      cityId,formatId,supplierId,name,price,currency,suffix,paymentUrl,net,vat,gross,prep,active,publicOrder,at,id);
    else store.sql.exec(`INSERT INTO portal_media_offers_v96(id,city_id,format_id,supplier_id,name,client_price_cents,currency,price_suffix,payment_url,supplier_net_cents,vat_rate_bps,supplier_gross_cents,preparation_url,active,public_order,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,cityId,formatId,supplierId,name,price,currency,suffix,paymentUrl,net,vat,gross,prep,active,publicOrder,at,at);
    saved[key]=id;
  }
  const labels=normalizeOptions(p.configurationOptions);
  for(const id of Object.values(saved))replaceConfigurations(store,id,labels,at);
  store.audit?.(access.actor?.id||'studio','media_offer_family_saved_v98','media_offer_family',`${cityId}:${formatId}:${supplierId}`,{active:Boolean(active),tiers:saved,configurations:labels});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store),savedTierIds:saved});
}

export async function saveMediaConfigurationVisualV98(store,body={}){
  ensureMediaCatalogV98Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),formatId=cleanId(p.formatId),label=sanitizeText(p.label,80);
  if(!formatId||!label)return json({error:'configuration_visual_fields_required'},400);
  if(!store.sql.exec('SELECT id FROM portal_media_formats_v95 WHERE id=? LIMIT 1',formatId).toArray()[0])return json({error:'format_not_found'},404);
  saveConfigurationVisualV98(store,formatId,label,p.imageUrl,p.description);
  store.audit?.(access.actor?.id||'studio','media_configuration_visual_saved_v98','media_format',formatId,{label});
  return json({ok:true,release:MEDIA_CATALOG_RELEASE,...contextData(store)});
}

function contextData(store){
  ensureMediaCatalogV98Schema(store);
  const formats=store.sql.exec(`SELECT id,slug,name,concept,description,duration_label AS durationLabel,price_cents AS priceCents,booking_url AS bookingUrl,active,public_order AS publicOrder
    FROM portal_media_formats_v95 ORDER BY active DESC,public_order,name`).toArray().map(x=>({...x,active:Boolean(x.active),...formatVisualV98(store,x.id,x.slug)}));
  const suppliers=store.sql.exec(`SELECT id,name,email,legal_name AS legalName,default_net_cents AS defaultNetCents,vat_rate_bps AS vatRateBps,default_gross_cents AS defaultGrossCents,notes,active
    FROM portal_media_suppliers_v95 ORDER BY active DESC,name`).toArray().map(x=>({...x,active:Boolean(x.active)}));
  const cities=store.sql.exec('SELECT id,slug,name,country,active,public_order AS publicOrder FROM portal_media_cities_v96 ORDER BY active DESC,public_order,name').toArray().map(x=>({...x,active:Boolean(x.active)}));
  const offers=store.sql.exec(`SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,o.name,o.client_price_cents AS clientPriceCents,o.currency,o.price_suffix AS priceSuffix,o.payment_url AS paymentUrl,o.supplier_net_cents AS supplierNetCents,o.vat_rate_bps AS vatRateBps,o.supplier_gross_cents AS supplierGrossCents,o.preparation_url AS preparationUrl,o.active,o.public_order AS publicOrder,
    c.name AS cityName,f.name AS formatName,f.slug AS formatSlug,s.name AS supplierName
    FROM portal_media_offers_v96 o JOIN portal_media_cities_v96 c ON c.id=o.city_id JOIN portal_media_formats_v95 f ON f.id=o.format_id JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id
    ORDER BY c.public_order,f.public_order,s.name,o.public_order,o.name`).toArray().map(x=>({...x,active:Boolean(x.active)}));
  const configs=store.sql.exec('SELECT offer_id AS offerId,label,public_order AS publicOrder,active FROM portal_offer_configurations_v96 ORDER BY offer_id,public_order,label').toArray().map(x=>({...x,active:Boolean(x.active)}));
  return {formats,suppliers,cities,families:buildFamilies(store,offers,configs,formats)};
}

function buildFamilies(store,offers,configs,formats){
  const configMap=new Map();
  for(const row of configs){if(!row.active)continue;if(!configMap.has(row.offerId))configMap.set(row.offerId,[]);configMap.get(row.offerId).push(row.label);}
  const formatMap=new Map(formats.map(x=>[x.id,x]));
  const groups=new Map();
  for(const offer of offers){
    const key=`${offer.cityId}|${offer.formatId}|${offer.supplierId}`;
    if(!groups.has(key))groups.set(key,{key,cityId:offer.cityId,cityName:offer.cityName,formatId:offer.formatId,formatName:offer.formatName,formatSlug:offer.formatSlug,supplierId:offer.supplierId,supplierName:offer.supplierName,active:false,publicOrder:offer.publicOrder??100,priceSuffix:offer.priceSuffix||'HT',currency:offer.currency||'eur',supplierNetCents:offer.supplierNetCents||0,vatRateBps:offer.vatRateBps||2000,preparationUrl:offer.preparationUrl||'',tiers:{launch:null,promo:null,base:null},configurationOptions:[]});
    const family=groups.get(key),tier=tierKey(offer);if(tier)family.tiers[tier]=offer;family.active=family.active||offer.active;
    for(const label of configMap.get(offer.id)||[])if(!family.configurationOptions.includes(label))family.configurationOptions.push(label);
  }
  const families=[...groups.values()];
  for(const family of families){
    family.configurationOptions.sort((a,b)=>a.localeCompare(b,'fr'));
    family.configurationVisuals=family.configurationOptions.map(label=>configurationVisualV98(store,family.formatId,family.formatSlug,label));
    family.format=formatMap.get(family.formatId)||null;
  }
  return families.sort((a,b)=>a.cityName.localeCompare(b.cityName,'fr')||a.formatName.localeCompare(b.formatName,'fr')||a.supplierName.localeCompare(b.supplierName,'fr'));
}

function familyRows(store,cityId,formatId,supplierId){return store.sql.exec(`SELECT id,name,payment_url AS paymentUrl,active FROM portal_media_offers_v96 WHERE city_id=? AND format_id=? AND supplier_id=?`,cityId,formatId,supplierId).toArray().map(x=>({...x,active:Boolean(x.active)}));}
function offerRow(store,id){return store.sql.exec('SELECT id,name,payment_url AS paymentUrl,active FROM portal_media_offers_v96 WHERE id=? LIMIT 1',id).toArray()[0]||null;}
function replaceConfigurations(store,offerId,labels,at){store.sql.exec('DELETE FROM portal_offer_configurations_v96 WHERE offer_id=?',offerId);labels.forEach((label,index)=>store.sql.exec('INSERT INTO portal_offer_configurations_v96(id,offer_id,label,public_order,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)',crypto.randomUUID(),offerId,label,(index+1)*10,at,at));}
function normalizeOptions(value){const list=Array.isArray(value)?value:String(value||'').split(/[,;\n]/u);return [...new Set(list.map(x=>sanitizeText(x,80)).filter(Boolean))].slice(0,20);}
function tierKey(o){const value=`${o?.id||''} ${o?.name||''}`.normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();if(/launch|lancement|coutant/u.test(value))return 'launch';if(/promo|preferentiel/u.test(value))return 'promo';if(/standard|base|normal/u.test(value))return 'base';return '';}
function boolInt(value){return value===false||value===0||value==='0'?0:1;}
function clamp(value,min,max){const n=Math.round(Number(value));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;}
function payload(body){return body?.payload&&typeof body.payload==='object'?body.payload:body||{};}
function cleanId(value){return String(value||'').trim().slice(0,160);}
function normalizeEmail(value){const v=String(value||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v)?v:'';}
function slugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().trim().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,100);}
function safeHttpUrl(value){const raw=String(value||'').trim();if(!raw)return '';try{const u=new URL(raw);return ['https:','http:'].includes(u.protocol)?u.toString().slice(0,1200):'';}catch{return '';}}
