import { ensureMediaCatalogV98Schema } from './portal-media-catalog-v98.js';
import { requireOperator } from './workflow-db-v5.js';
import { json, sanitizeText, sha256 } from './security.js';

export const CATALOG_COMMERCE_V143_RELEASE='neptune-catalog-commerce-20260825-v143';
const TIER_META={
  launch:{label:'Tarif de lancement',order:10,defaultCapacity:3},
  promo:{label:'Tarif préférentiel',order:20,defaultCapacity:7},
  base:{label:'Tarif de base',order:30,defaultCapacity:0},
};
const KNOWN_CITY_GEO={
  toulouse:[43.6047,1.4442],paris:[48.8566,2.3522],lyon:[45.764,4.8357],marseille:[43.2965,5.3698],bordeaux:[44.8378,-0.5792],
  lille:[50.6292,3.0573],nantes:[47.2184,-1.5536],montpellier:[43.6108,3.8767],strasbourg:[48.5734,7.7521],rennes:[48.1173,-1.6778],
  nice:[43.7102,7.262],grenoble:[45.1885,5.7245],rouen:[49.4431,1.0993],dijon:[47.322,5.0415],angers:[47.4784,-0.5632],
  reims:[49.2583,4.0317],clermont_ferrand:[45.7772,3.087],aix_en_provence:[43.5297,5.4474],avignon:[43.9493,4.8055],caen:[49.1829,-0.3707],
};

export function ensureCatalogCommerceV143Schema(store){
  ensureMediaCatalogV98Schema(store);
  if(store.catalogCommerceV143Ready)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_media_city_geo_v143(
      city_id TEXT PRIMARY KEY REFERENCES portal_media_cities_v96(id) ON DELETE CASCADE,
      latitude REAL,longitude REAL,source TEXT NOT NULL DEFAULT 'manual',updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_offer_policy_v143(
      offer_id TEXT PRIMARY KEY REFERENCES portal_media_offers_v96(id) ON DELETE CASCADE,
      tier_code TEXT NOT NULL,visible INTEGER NOT NULL DEFAULT 1,capacity INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_offer_holds_v143(
      prospect_id TEXT PRIMARY KEY REFERENCES portal_prospects(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES portal_media_offers_v96(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_offer_holds_v143 ON portal_offer_holds_v143(offer_id,expires_at);
  `);
  seedKnownCityGeo(store);
  seedOfferPolicies(store);
  store.catalogCommerceV143Ready=true;
}

export async function handleCatalogCommerceV143Store(store,request){
  const url=new URL(request.url);
  if(!url.pathname.includes('media-catalog-v143')&&!url.pathname.endsWith('/selection-v96'))return null;
  ensureCatalogCommerceV143Schema(store);
  if(request.method==='POST'&&url.pathname==='/api/admin/media-catalog-v143/city/save')return saveCityV143(store,await safeBody(request));
  if(request.method==='POST'&&url.pathname==='/api/admin/media-catalog-v143/family/save')return saveFamilyV143(store,await safeBody(request));
  if(request.method==='POST'&&url.pathname==='/api/admin/media-catalog-v143/policies')return policiesV143(store,await safeBody(request));
  if(request.method==='POST'&&url.pathname.endsWith('/selection-v96')){
    const body=await safeBody(request.clone());
    const availability=await reserveOfferHold(store,body);
    if(!availability.ok)return json({error:'offer_capacity_exhausted'},409);
  }
  return null;
}

export async function enhanceCatalogCommerceV143Store(store,request,response){
  const url=new URL(request.url);
  if(!response?.ok||url.pathname!=='/api/reservation/catalog-v96')return response;
  ensureCatalogCommerceV143Schema(store);
  const data=await response.json().catch(()=>null);if(!data)return response;
  const geo=new Map(store.sql.exec('SELECT city_id AS cityId,latitude,longitude FROM portal_media_city_geo_v143').toArray().map(x=>[x.cityId,x]));
  const policy=new Map(store.sql.exec('SELECT offer_id AS offerId,tier_code AS tierCode,visible,capacity FROM portal_offer_policy_v143').toArray().map(x=>[x.offerId,x]));
  for(const city of data.cities||[]){
    const g=geo.get(city.id);if(g){city.latitude=Number(g.latitude);city.longitude=Number(g.longitude);}
    for(const format of city.formats||[]){
      format.offers=(format.offers||[]).filter(offer=>{
        const p=policy.get(offer.id);if(p&&Number(p.visible)===0)return false;
        const capacity=Number(p?.capacity||0);if(capacity<=0){offer.tierCode=p?.tierCode||tierFromName(offer.name);offer.remainingPlaces=null;return true;}
        const used=usedPlaces(store,offer.id);offer.tierCode=p?.tierCode||tierFromName(offer.name);offer.capacity=capacity;offer.remainingPlaces=Math.max(0,capacity-used);return used<capacity;
      }).sort((a,b)=>tierOrder(a.tierCode)-tierOrder(b.tierCode)||Number(a.clientPriceCents||0)-Number(b.clientPriceCents||0));
    }
    city.formats=(city.formats||[]).filter(format=>(format.offers||[]).length);
  }
  data.cities=(data.cities||[]).filter(city=>(city.formats||[]).length);
  data.catalogCommerceRelease=CATALOG_COMMERCE_V143_RELEASE;
  return json(data,response.status);
}

async function saveCityV143(store,body){
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),id=cleanId(p.id)||crypto.randomUUID(),name=sanitizeText(p.name,120).trim();if(!name)return json({error:'city_name_required'},400);
  const country=sanitizeText(p.country||'France',100)||'France',slug=uniqueCitySlug(store,name,id),active=boolInt(p.active),at=new Date().toISOString();
  const exists=store.sql.exec('SELECT id FROM portal_media_cities_v96 WHERE id=? LIMIT 1',id).toArray()[0];
  if(exists)store.sql.exec('UPDATE portal_media_cities_v96 SET slug=?,name=?,country=?,active=?,public_order=100,updated_at=? WHERE id=?',slug,name,country,active,at,id);
  else store.sql.exec('INSERT INTO portal_media_cities_v96(id,slug,name,country,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,100,?,?)',id,slug,name,country,active,at,at);
  const lat=finiteCoord(p.latitude,-90,90),lng=finiteCoord(p.longitude,-180,180);
  if(lat!==null&&lng!==null)store.sql.exec(`INSERT INTO portal_media_city_geo_v143(city_id,latitude,longitude,source,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(city_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,source=excluded.source,updated_at=excluded.updated_at`,id,lat,lng,sanitizeText(p.geoSource||'geo.api.gouv.fr',80),at);
  store.audit?.(access.actor?.id||'studio','media_city_saved_v143','media_city',id,{name,country,active:Boolean(active),geocoded:lat!==null&&lng!==null});
  return json({ok:true,release:CATALOG_COMMERCE_V143_RELEASE,savedId:id});
}

async function saveFamilyV143(store,body){
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=payload(body),cityId=cleanId(p.cityId),formatId=cleanId(p.formatId),supplierId=cleanId(p.supplierId);if(!cityId||!formatId||!supplierId)return json({error:'offer_family_fields_required'},400);
  const refs=store.sql.exec('SELECT c.id FROM portal_media_cities_v96 c,portal_media_formats_v95 f,portal_media_suppliers_v95 s WHERE c.id=? AND f.id=? AND s.id=? LIMIT 1',cityId,formatId,supplierId).toArray()[0];if(!refs)return json({error:'offer_reference_invalid'},404);
  const supplier=store.sql.exec('SELECT default_net_cents AS net,vat_rate_bps AS vat FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',supplierId).toArray()[0]||{};
  const net=p.supplierNetCents===''||p.supplierNetCents==null?clamp(supplier.net,0,1e9):clamp(p.supplierNetCents,0,1e9),vat=p.vatRateBps===''||p.vatRateBps==null?clamp(supplier.vat||2000,0,10000):clamp(p.vatRateBps,0,10000),gross=net+Math.round(net*vat/10000),at=new Date().toISOString();
  const service=ensureService(store,cityId,supplierId,formatId,at),rate=ensureRate(store,service.id,formatId,net,vat,gross,at);
  const activeFamily=boolInt(p.active),tiers=p.tiers&&typeof p.tiers==='object'?p.tiers:{},labels=normalizeOptions(p.configurationOptions),saved={};
  for(const key of ['launch','promo','base']){
    const meta=TIER_META[key],input=tiers[key]&&typeof tiers[key]==='object'?tiers[key]:{},visible=input.visible===false||input.visible===0||input.visible==='0'?0:1;
    const current=findTierOffer(store,cityId,formatId,supplierId,key),id=cleanId(input.id)||current?.id||crypto.randomUUID(),paymentUrl=safeHttpUrl(input.paymentUrl||current?.paymentUrl||''),price=clamp(input.clientPriceCents,0,1e9);
    if(visible&&!paymentUrl)return json({error:`payment_url_required_${key}`},400);
    if(visible&&price<gross)return json({error:'client_price_below_supplier_gross',tier:key,minimumClientPriceCents:gross},409);
    const capacity=input.capacity==null?meta.defaultCapacity:clamp(input.capacity,0,100000),offerActive=activeFamily&&visible?1:0;
    if(current)store.sql.exec('UPDATE portal_media_offers_v96 SET city_id=?,format_id=?,supplier_id=?,name=?,client_price_cents=?,currency=?,price_suffix=?,payment_url=?,supplier_net_cents=?,vat_rate_bps=?,supplier_gross_cents=?,preparation_url=?,active=?,public_order=?,updated_at=? WHERE id=?',cityId,formatId,supplierId,meta.label,price,'eur','TTC',paymentUrl,net,vat,gross,safeHttpUrl(p.preparationUrl),offerActive,meta.order,at,id);
    else store.sql.exec('INSERT INTO portal_media_offers_v96(id,city_id,format_id,supplier_id,name,client_price_cents,currency,price_suffix,payment_url,supplier_net_cents,vat_rate_bps,supplier_gross_cents,preparation_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,cityId,formatId,supplierId,meta.label,price,'eur','TTC',paymentUrl,net,vat,gross,safeHttpUrl(p.preparationUrl),offerActive,meta.order,at,at);
    store.sql.exec(`INSERT INTO portal_offer_supplier_rate_v116(offer_id,rate_id,updated_at) VALUES(?,?,?) ON CONFLICT(offer_id) DO UPDATE SET rate_id=excluded.rate_id,updated_at=excluded.updated_at`,id,rate.id,at);
    store.sql.exec(`INSERT INTO portal_offer_policy_v143(offer_id,tier_code,visible,capacity,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(offer_id) DO UPDATE SET tier_code=excluded.tier_code,visible=excluded.visible,capacity=excluded.capacity,updated_at=excluded.updated_at`,id,key,visible,capacity,at);
    replaceConfigurations(store,id,labels,at);saved[key]=id;
  }
  store.audit?.(access.actor?.id||'studio','media_offer_family_saved_v143','media_offer_family',`${cityId}:${formatId}:${supplierId}`,{active:Boolean(activeFamily),supplierGrossCents:gross,tiers:saved});
  return json({ok:true,release:CATALOG_COMMERCE_V143_RELEASE,savedTierIds:saved,supplierRateId:rate.id,supplierGrossCents:gross});
}

async function policiesV143(store,body){
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const cityGeo=store.sql.exec('SELECT city_id AS cityId,latitude,longitude,source FROM portal_media_city_geo_v143').toArray();
  const offerPolicies=store.sql.exec('SELECT offer_id AS offerId,tier_code AS tierCode,visible,capacity FROM portal_offer_policy_v143').toArray().map(x=>({...x,visible:Boolean(x.visible),usedPlaces:usedPlaces(store,x.offerId)}));
  return json({ok:true,release:CATALOG_COMMERCE_V143_RELEASE,cityGeo,offerPolicies});
}

async function reserveOfferHold(store,body){
  const offerId=cleanId(body?.offerId),token=String(body?.token||'');if(!offerId||token.length<32)return{ok:true};
  const hash=await sha256(token),prospect=store.sql.exec('SELECT id,status FROM portal_prospects WHERE token_hash=? LIMIT 1',hash).toArray()[0];if(!prospect)return{ok:true};
  const p=store.sql.exec('SELECT visible,capacity FROM portal_offer_policy_v143 WHERE offer_id=? LIMIT 1',offerId).toArray()[0];if(p&&Number(p.visible)===0)return{ok:false};const capacity=Number(p?.capacity||0);if(capacity<=0)return{ok:true};
  cleanupHolds(store);
  const used=usedPlaces(store,offerId,prospect.id);if(used>=capacity)return{ok:false};
  const now=new Date(),at=now.toISOString(),expires=new Date(now.getTime()+30*60*1000).toISOString();store.sql.exec(`INSERT INTO portal_offer_holds_v143(prospect_id,offer_id,expires_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(prospect_id) DO UPDATE SET offer_id=excluded.offer_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at`,prospect.id,offerId,expires,at);return{ok:true};
}

function ensureService(store,cityId,supplierId,formatId,at){let row=store.sql.exec('SELECT id FROM portal_supplier_services_v116 WHERE city_id=? AND supplier_id=? AND format_id=? LIMIT 1',cityId,supplierId,formatId).toArray()[0];if(row){store.sql.exec('UPDATE portal_supplier_services_v116 SET active=1,updated_at=? WHERE id=?',at,row.id);return row;}row={id:crypto.randomUUID()};store.sql.exec('INSERT INTO portal_supplier_services_v116(id,city_id,supplier_id,format_id,preparation_url,notes,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)',row.id,cityId,supplierId,formatId,'','',at,at);return row;}
function ensureRate(store,serviceId,formatId,net,vat,gross,at){let row=store.sql.exec("SELECT id FROM portal_supplier_rates_v116 WHERE service_id=? AND active=1 ORDER BY public_order,duration_minutes LIMIT 1",serviceId).toArray()[0];const detail=store.sql.exec('SELECT total_minutes AS totalMinutes,shoot_minutes AS shootMinutes FROM portal_media_format_details_v116 WHERE format_id=? LIMIT 1',formatId).toArray()[0]||{},minutes=Math.max(1,Number(detail.totalMinutes||detail.shootMinutes||60));if(row){store.sql.exec('UPDATE portal_supplier_rates_v116 SET unit_code=?,duration_minutes=?,label=?,net_cents=?,vat_rate_bps=?,gross_cents=?,active=1,public_order=10,updated_at=? WHERE id=?','custom',minutes,`Prestation · ${minutes} min`,net,vat,gross,at,row.id);return row;}row={id:crypto.randomUUID()};store.sql.exec('INSERT INTO portal_supplier_rates_v116(id,service_id,unit_code,duration_minutes,label,net_cents,vat_rate_bps,gross_cents,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,10,?,?)',row.id,serviceId,'custom',minutes,`Prestation · ${minutes} min`,net,vat,gross,at,at);return row;}
function findTierOffer(store,cityId,formatId,supplierId,key){const rows=store.sql.exec('SELECT id,name,payment_url AS paymentUrl FROM portal_media_offers_v96 WHERE city_id=? AND format_id=? AND supplier_id=?',cityId,formatId,supplierId).toArray();return rows.find(x=>tierFromName(x.name)===key)||null;}
function replaceConfigurations(store,offerId,labels,at){store.sql.exec('DELETE FROM portal_offer_configurations_v96 WHERE offer_id=?',offerId);labels.forEach((label,index)=>store.sql.exec('INSERT INTO portal_offer_configurations_v96(id,offer_id,label,public_order,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)',crypto.randomUUID(),offerId,label,(index+1)*10,at,at));}
function usedPlaces(store,offerId,excludeProspect=''){cleanupHolds(store);const paid=Number(store.sql.exec("SELECT COUNT(DISTINCT p.id) AS n FROM portal_prospects p JOIN portal_reservation_intents_v96 i ON i.prospect_id=p.id WHERE p.status='paid' AND i.offer_id=?",offerId).toArray()[0]?.n||0);const held=Number(store.sql.exec("SELECT COUNT(*) AS n FROM portal_offer_holds_v143 h LEFT JOIN portal_prospects p ON p.id=h.prospect_id WHERE h.offer_id=? AND h.expires_at>? AND COALESCE(p.status,'')<>'paid' AND h.prospect_id<>?",offerId,new Date().toISOString(),excludeProspect||'').toArray()[0]?.n||0);return paid+held;}
function cleanupHolds(store){store.sql.exec('DELETE FROM portal_offer_holds_v143 WHERE expires_at<=?',new Date().toISOString());}
function seedOfferPolicies(store){const at=new Date().toISOString();for(const row of store.sql.exec('SELECT id,name,active FROM portal_media_offers_v96').toArray()){if(store.sql.exec('SELECT offer_id FROM portal_offer_policy_v143 WHERE offer_id=? LIMIT 1',row.id).toArray()[0])continue;const tier=tierFromName(row.name);if(!tier)continue;store.sql.exec('INSERT INTO portal_offer_policy_v143(offer_id,tier_code,visible,capacity,updated_at) VALUES(?,?,?,?,?)',row.id,tier,Number(row.active)!==0?1:0,TIER_META[tier].defaultCapacity,at);}}
function seedKnownCityGeo(store){const at=new Date().toISOString();for(const city of store.sql.exec('SELECT id,name FROM portal_media_cities_v96').toArray()){if(store.sql.exec('SELECT city_id FROM portal_media_city_geo_v143 WHERE city_id=? LIMIT 1',city.id).toArray()[0])continue;const key=normalizeCityKey(city.name),coords=KNOWN_CITY_GEO[key];if(coords)store.sql.exec('INSERT INTO portal_media_city_geo_v143(city_id,latitude,longitude,source,updated_at) VALUES(?,?,?,?,?)',city.id,coords[0],coords[1],'seed',at);}}
function uniqueCitySlug(store,name,id){let base=slugify(name)||`ville-${id.slice(0,6)}`,slug=base,n=2;while(store.sql.exec('SELECT id FROM portal_media_cities_v96 WHERE slug=? AND id<>? LIMIT 1',slug,id).toArray()[0])slug=`${base}-${n++}`;return slug;}
function normalizeOptions(value){const list=Array.isArray(value)?value:String(value||'').split(/[,;\n]/u);return[...new Set(list.map(x=>sanitizeText(x,80).trim()).filter(Boolean))].slice(0,20);}
function tierFromName(v){const s=String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();if(/launch|lancement|coutant/u.test(s))return'launch';if(/promo|preferentiel/u.test(s))return'promo';if(/base|normal|standard/u.test(s))return'base';return'';}
function tierOrder(v){return TIER_META[v]?.order||999;}
function normalizeCityKey(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[^a-z0-9]+/gu,'_').replace(/^_|_$/gu,'');}
function slugify(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,100);}
function safeHttpUrl(v){const raw=String(v||'').trim();if(!raw)return'';try{const u=new URL(raw);return['http:','https:'].includes(u.protocol)?u.toString():'';}catch{return'';}}
function cleanId(v){const s=String(v||'').trim();return/^[a-zA-Z0-9._:-]{1,160}$/u.test(s)?s:'';}
function clamp(v,min,max){const n=Number(v);return Math.max(min,Math.min(max,Number.isFinite(n)?Math.round(n):min));}
function boolInt(v){return v===false||v===0||v==='0'?0:1;}
function finiteCoord(v,min,max){if(v===''||v==null)return null;const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function payload(body){return body?.payload&&typeof body.payload==='object'?body.payload:body||{};}
async function safeBody(request){try{return await request.json();}catch{return{};}}
