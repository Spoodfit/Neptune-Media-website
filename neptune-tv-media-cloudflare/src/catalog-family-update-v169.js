import {ensureCatalogCommerceV143Schema} from './catalog-commerce-v143.js';
import {requireOperator} from './workflow-db-v5.js';
import {json,sanitizeText} from './security.js';

export const CATALOG_FAMILY_UPDATE_V169_RELEASE='neptune-catalog-family-update-20260903-v169';

const TIER_META={
  launch:{label:'Tarif de lancement',order:10,defaultCapacity:3},
  promo:{label:'Tarif préférentiel',order:20,defaultCapacity:7},
  base:{label:'Tarif de base',order:30,defaultCapacity:0},
};

export async function handleCatalogFamilyUpdateV169Store(store,request){
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!=='/api/admin/media-catalog-v143/family/save')return null;
  ensureCatalogCommerceV143Schema(store);
  const body=await request.clone().json().catch(()=>({}));
  const access=await requireOperator(store,body);
  if(!access.ok)return access.response;
  return saveFamily(store,body,access.actor);
}

async function saveFamily(store,body,actor){
  const p=payload(body);
  const cityId=cleanId(p.cityId),formatId=cleanId(p.formatId),supplierId=cleanId(p.supplierId);
  if(!cityId||!formatId||!supplierId)return json({error:'offer_family_fields_required'},400);

  const refs=store.sql.exec(
    'SELECT c.id FROM portal_media_cities_v96 c,portal_media_formats_v95 f,portal_media_suppliers_v95 s WHERE c.id=? AND f.id=? AND s.id=? LIMIT 1',
    cityId,formatId,supplierId,
  ).toArray()[0];
  if(!refs)return json({error:'offer_reference_invalid'},404);

  const supplier=store.sql.exec('SELECT default_net_cents AS net,vat_rate_bps AS vat FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',supplierId).toArray()[0]||{};
  const net=p.supplierNetCents===''||p.supplierNetCents==null?clamp(supplier.net,0,1e9):clamp(p.supplierNetCents,0,1e9);
  const vat=p.vatRateBps===''||p.vatRateBps==null?clamp(supplier.vat||2000,0,10000):clamp(p.vatRateBps,0,10000);
  const gross=net+Math.round(net*vat/10000);
  const at=new Date().toISOString();
  const activeFamily=boolInt(p.active);
  const tiers=p.tiers&&typeof p.tiers==='object'?p.tiers:{};
  const labels=normalizeOptions(p.configurationOptions);

  // Validate the complete payload before changing an existing family.
  const plan=[];
  for(const key of ['launch','promo','base']){
    const meta=TIER_META[key],input=tiers[key]&&typeof tiers[key]==='object'?tiers[key]:{};
    const visible=input.visible===false||input.visible===0||input.visible==='0'?0:1;
    const inputId=cleanId(input.id);
    const byId=inputId?findOfferById(store,inputId):null;
    if(byId&&tierFromName(byId.name)!==key)return json({error:`Le tarif ${meta.label.toLowerCase()} ne correspond plus à l’offre éditée. Rechargez le catalogue.`},409);
    const atTarget=findTierOffer(store,cityId,formatId,supplierId,key);
    if(byId&&atTarget&&byId.id!==atTarget.id){
      return json({error:`Une offre ${meta.label.toLowerCase()} existe déjà pour cette ville, ce fournisseur et ce concept. Modifiez l’offre existante au lieu de créer un doublon.`},409);
    }
    const current=byId||atTarget;
    const id=current?.id||inputId||crypto.randomUUID();
    const paymentUrl=safeHttpUrl(input.paymentUrl||current?.paymentUrl||'');
    const price=clamp(input.clientPriceCents,0,1e9);
    if(visible&&!paymentUrl)return json({error:`payment_url_required_${key}`},400);
    if(visible&&price<gross)return json({error:'client_price_below_supplier_gross',tier:key,minimumClientPriceCents:gross},409);
    const capacity=input.capacity==null?meta.defaultCapacity:clamp(input.capacity,0,100000);
    plan.push({key,meta,input,current,id,visible,paymentUrl,price,capacity});
  }

  const service=ensureService(store,cityId,supplierId,formatId,at);
  const rate=ensureRate(store,service.id,formatId,net,vat,gross,at);
  const saved={};

  for(const item of plan){
    const {key,meta,current,id,visible,paymentUrl,price,capacity}=item;
    const offerActive=activeFamily&&visible?1:0;
    if(current){
      // Critical v169 fix: when city / supplier / concept changes, update the existing tier ID.
      // v143 previously searched only the new tuple, then attempted INSERT with the old ID,
      // causing a SQLite primary-key collision and an HTTP 500.
      store.sql.exec(
        'UPDATE portal_media_offers_v96 SET city_id=?,format_id=?,supplier_id=?,name=?,client_price_cents=?,currency=?,price_suffix=?,payment_url=?,supplier_net_cents=?,vat_rate_bps=?,supplier_gross_cents=?,preparation_url=?,active=?,public_order=?,updated_at=? WHERE id=?',
        cityId,formatId,supplierId,meta.label,price,'eur','TTC',paymentUrl,net,vat,gross,safeHttpUrl(p.preparationUrl),offerActive,meta.order,at,id,
      );
    }else{
      store.sql.exec(
        'INSERT INTO portal_media_offers_v96(id,city_id,format_id,supplier_id,name,client_price_cents,currency,price_suffix,payment_url,supplier_net_cents,vat_rate_bps,supplier_gross_cents,preparation_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id,cityId,formatId,supplierId,meta.label,price,'eur','TTC',paymentUrl,net,vat,gross,safeHttpUrl(p.preparationUrl),offerActive,meta.order,at,at,
      );
    }
    store.sql.exec(
      'INSERT INTO portal_offer_supplier_rate_v116(offer_id,rate_id,updated_at) VALUES(?,?,?) ON CONFLICT(offer_id) DO UPDATE SET rate_id=excluded.rate_id,updated_at=excluded.updated_at',
      id,rate.id,at,
    );
    store.sql.exec(
      'INSERT INTO portal_offer_policy_v143(offer_id,tier_code,visible,capacity,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(offer_id) DO UPDATE SET tier_code=excluded.tier_code,visible=excluded.visible,capacity=excluded.capacity,updated_at=excluded.updated_at',
      id,key,visible,capacity,at,
    );
    replaceConfigurations(store,id,labels,at);
    saved[key]=id;
  }

  store.audit?.(actor?.id||'studio','media_offer_family_saved_v169','media_offer_family',`${cityId}:${formatId}:${supplierId}`,{
    active:Boolean(activeFamily),supplierGrossCents:gross,tiers:saved,updateMode:'preserve-tier-ids-across-hierarchy-change',
  });
  return json({ok:true,release:CATALOG_FAMILY_UPDATE_V169_RELEASE,savedTierIds:saved,supplierRateId:rate.id,supplierGrossCents:gross});
}

function ensureService(store,cityId,supplierId,formatId,at){
  let row=store.sql.exec('SELECT id FROM portal_supplier_services_v116 WHERE city_id=? AND supplier_id=? AND format_id=? LIMIT 1',cityId,supplierId,formatId).toArray()[0];
  if(row){store.sql.exec('UPDATE portal_supplier_services_v116 SET active=1,updated_at=? WHERE id=?',at,row.id);return row;}
  row={id:crypto.randomUUID()};
  store.sql.exec('INSERT INTO portal_supplier_services_v116(id,city_id,supplier_id,format_id,preparation_url,notes,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)',row.id,cityId,supplierId,formatId,'','',at,at);
  return row;
}

function ensureRate(store,serviceId,formatId,net,vat,gross,at){
  let row=store.sql.exec("SELECT id FROM portal_supplier_rates_v116 WHERE service_id=? AND active=1 ORDER BY public_order,duration_minutes LIMIT 1",serviceId).toArray()[0];
  const detail=store.sql.exec('SELECT total_minutes AS totalMinutes,shoot_minutes AS shootMinutes FROM portal_media_format_details_v116 WHERE format_id=? LIMIT 1',formatId).toArray()[0]||{};
  const minutes=Math.max(1,Number(detail.totalMinutes||detail.shootMinutes||60));
  if(row){
    store.sql.exec('UPDATE portal_supplier_rates_v116 SET unit_code=?,duration_minutes=?,label=?,net_cents=?,vat_rate_bps=?,gross_cents=?,active=1,public_order=10,updated_at=? WHERE id=?','custom',minutes,`Prestation · ${minutes} min`,net,vat,gross,at,row.id);
    return row;
  }
  row={id:crypto.randomUUID()};
  store.sql.exec('INSERT INTO portal_supplier_rates_v116(id,service_id,unit_code,duration_minutes,label,net_cents,vat_rate_bps,gross_cents,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,10,?,?)',row.id,serviceId,'custom',minutes,`Prestation · ${minutes} min`,net,vat,gross,at,at);
  return row;
}

function findOfferById(store,id){return store.sql.exec('SELECT id,name,payment_url AS paymentUrl,city_id AS cityId,format_id AS formatId,supplier_id AS supplierId FROM portal_media_offers_v96 WHERE id=? LIMIT 1',id).toArray()[0]||null;}
function findTierOffer(store,cityId,formatId,supplierId,key){const rows=store.sql.exec('SELECT id,name,payment_url AS paymentUrl FROM portal_media_offers_v96 WHERE city_id=? AND format_id=? AND supplier_id=?',cityId,formatId,supplierId).toArray();return rows.find(row=>tierFromName(row.name)===key)||null;}
function replaceConfigurations(store,offerId,labels,at){store.sql.exec('DELETE FROM portal_offer_configurations_v96 WHERE offer_id=?',offerId);labels.forEach((label,index)=>store.sql.exec('INSERT INTO portal_offer_configurations_v96(id,offer_id,label,public_order,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)',crypto.randomUUID(),offerId,label,(index+1)*10,at,at));}
function normalizeOptions(value){const list=Array.isArray(value)?value:String(value||'').split(/[,;\n]/u);return[...new Set(list.map(item=>sanitizeText(item,80).trim()).filter(Boolean))].slice(0,20);}
function tierFromName(value){const text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();if(/launch|lancement|coutant/u.test(text))return'launch';if(/promo|preferentiel/u.test(text))return'promo';if(/base|normal|standard/u.test(text))return'base';return'';}
function safeHttpUrl(value){const raw=String(value||'').trim();if(!raw)return'';try{const url=new URL(raw);return['http:','https:'].includes(url.protocol)?url.toString():'';}catch{return'';}}
function cleanId(value){const text=String(value||'').trim();return/^[a-zA-Z0-9._:-]{1,160}$/u.test(text)?text:'';}
function clamp(value,min,max){const number=Number(value);return Math.max(min,Math.min(max,Number.isFinite(number)?Math.round(number):min));}
function boolInt(value){return value===false||value===0||value==='0'?0:1;}
function payload(body){return body?.payload&&typeof body.payload==='object'?body.payload:body||{};}
