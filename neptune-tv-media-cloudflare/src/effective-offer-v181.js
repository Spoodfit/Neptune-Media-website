import { ensureCatalogCommerceV143Schema } from './catalog-commerce-v143.js';
import { sha256 } from './security.js';

export const EFFECTIVE_OFFER_V181_RELEASE='neptune-effective-offer-20260905-v181';

const TIER_META={
  launch:{label:'Tarif de lancement',order:10,zeroMeansSoldOut:true},
  promo:{label:'Tarif préférentiel',order:20,zeroMeansSoldOut:true},
  base:{label:'Tarif de base',order:30,zeroMeansSoldOut:false},
};

export async function validateEffectiveOfferV181(store,raw={}){
  ensureCatalogCommerceV143Schema(store);
  const offerId=cleanId(raw.offerId);
  if(!offerId)return{ok:true,release:EFFECTIVE_OFFER_V181_RELEASE};
  const requested=offerRow(store,offerId);
  if(!requested||!requested.active)return{ok:false,status:409,error:'offer_not_available',release:EFFECTIVE_OFFER_V181_RELEASE};
  const prospect=await prospectForToken(store,raw.token||raw.reservationToken);
  const effective=effectiveOfferForFormatV181(store,requested.cityId,requested.formatId,{excludeProspectId:prospect?.id||''});
  if(!effective)return{ok:false,status:409,error:'offer_capacity_exhausted',release:EFFECTIVE_OFFER_V181_RELEASE};
  if(effective.id!==requested.id){
    return{
      ok:false,
      status:409,
      error:'offer_tier_changed',
      effectiveOfferId:effective.id,
      effectiveTierCode:effective.tierCode,
      effectivePriceCents:effective.clientPriceCents,
      remainingPlaces:effective.remainingPlaces,
      release:EFFECTIVE_OFFER_V181_RELEASE,
    };
  }
  return{ok:true,effective,prospect,release:EFFECTIVE_OFFER_V181_RELEASE};
}

export function effectiveOfferForFormatV181(store,cityId,formatId,{excludeProspectId=''}={}){
  ensureCatalogCommerceV143Schema(store);
  const inventory=inventoryRows(store,{excludeProspectId});
  const family=inventory.filter(row=>row.cityId===String(cityId||'')&&row.formatId===String(formatId||''));
  const available=family.filter(row=>row.available).sort(compareEffective);
  const effective=available[0]||null;
  if(!effective)return null;
  return{...effective,pricing:pricingFor(effective,family)};
}

export function reserveEffectiveOfferHoldV181(store,raw={}){
  ensureCatalogCommerceV143Schema(store);
  const prospectId=cleanId(raw.prospectId),offerId=cleanId(raw.offerId);
  if(!prospectId||!offerId)return{ok:false,status:400,error:'offer_hold_fields_required'};
  const requested=offerRow(store,offerId);
  if(!requested||!requested.active)return{ok:false,status:409,error:'offer_not_available'};
  const effective=effectiveOfferForFormatV181(store,requested.cityId,requested.formatId,{excludeProspectId:prospectId});
  if(!effective)return{ok:false,status:409,error:'offer_capacity_exhausted'};
  if(effective.id!==offerId)return{
    ok:false,status:409,error:'offer_tier_changed',effectiveOfferId:effective.id,effectiveTierCode:effective.tierCode,
    effectivePriceCents:effective.clientPriceCents,remainingPlaces:effective.remainingPlaces,
  };
  if(effective.capacity<=0)return{ok:true,effective,expiresAt:null,unlimited:true,release:EFFECTIVE_OFFER_V181_RELEASE};
  const now=new Date(),at=now.toISOString(),expiresAt=new Date(now.getTime()+30*60*1000).toISOString();
  store.sql.exec(`INSERT INTO portal_offer_holds_v143(prospect_id,offer_id,expires_at,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(prospect_id) DO UPDATE SET offer_id=excluded.offer_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at`,prospectId,offerId,expiresAt,at);
  return{ok:true,effective,expiresAt,unlimited:false,release:EFFECTIVE_OFFER_V181_RELEASE};
}

export async function enhanceEffectiveOfferCatalogV181(store,response){
  if(!response?.ok)return response;
  ensureCatalogCommerceV143Schema(store);
  const data=await response.json().catch(()=>null);
  if(!data)return response;
  const inventory=inventoryRows(store);
  const byFamily=new Map();
  for(const row of inventory){
    const key=familyKey(row.cityId,row.formatId);
    if(!byFamily.has(key))byFamily.set(key,[]);
    byFamily.get(key).push(row);
  }
  const availableCitiesByFormat=new Map();
  const configsByFamily=new Map();
  for(const city of data.cities||[]){
    const nextFormats=[];
    for(const format of city.formats||[]){
      const family=byFamily.get(familyKey(city.id,format.id))||[];
      const effective=family.filter(row=>row.available).sort(compareEffective)[0]||null;
      if(!effective)continue;
      const source=(format.offers||[]).find(offer=>String(offer.id)===effective.id);
      if(!source)continue;
      const decorated={
        ...source,
        tierCode:effective.tierCode,
        tierLabel:effective.tierLabel,
        capacity:effective.capacity,
        remainingPlaces:effective.remainingPlaces,
        pricing:pricingFor(effective,family),
        effectiveOffer:true,
        effectiveOfferRelease:EFFECTIVE_OFFER_V181_RELEASE,
      };
      format.offers=[decorated];
      format.effectiveOfferId=effective.id;
      format.effectiveOfferRelease=EFFECTIVE_OFFER_V181_RELEASE;
      nextFormats.push(format);
      if(!availableCitiesByFormat.has(format.id))availableCitiesByFormat.set(format.id,new Set());
      availableCitiesByFormat.get(format.id).add(city.id);
      configsByFamily.set(familyKey(city.id,format.id),Array.isArray(decorated.configurations)?decorated.configurations:[]);
    }
    city.formats=nextFormats;
  }
  data.cities=(data.cities||[]).filter(city=>(city.formats||[]).length>0);

  if(Array.isArray(data.concepts)&&data.concepts.some(concept=>availableCitiesByFormat.has(concept.id))){
    data.concepts=data.concepts.map(concept=>{
      const cityIds=availableCitiesByFormat.get(concept.id)||new Set();
      concept.cities=(concept.cities||[]).filter(city=>cityIds.has(city.id)).map(city=>{
        const configs=configsByFamily.get(familyKey(city.id,concept.id));
        if(configs)city.physicalFormats=configs;
        return city;
      });
      return concept;
    }).filter(concept=>(concept.cities||[]).length>0);
  }

  data.effectiveOfferRelease=EFFECTIVE_OFFER_V181_RELEASE;
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Effective-Offer',EFFECTIVE_OFFER_V181_RELEASE);
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

function inventoryRows(store,{excludeProspectId=''}={}){
  cleanupExpiredHolds(store);
  const now=new Date().toISOString();
  const paid=new Map(store.sql.exec(`SELECT i.offer_id AS offerId,COUNT(DISTINCT p.id) AS n
    FROM portal_reservation_intents_v96 i
    JOIN portal_prospects p ON p.id=i.prospect_id
    WHERE p.status='paid'
    GROUP BY i.offer_id`).toArray().map(row=>[String(row.offerId),Number(row.n||0)]));
  const holds=store.sql.exec(`SELECT h.offer_id AS offerId,h.prospect_id AS prospectId
    FROM portal_offer_holds_v143 h
    LEFT JOIN portal_prospects p ON p.id=h.prospect_id
    WHERE h.expires_at>? AND COALESCE(p.status,'')<>'paid'`,now).toArray();
  const held=new Map();
  for(const row of holds){
    if(excludeProspectId&&String(row.prospectId)===String(excludeProspectId))continue;
    const key=String(row.offerId);held.set(key,(held.get(key)||0)+1);
  }
  return store.sql.exec(`SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,o.name,
      o.client_price_cents AS clientPriceCents,o.currency,o.active,o.public_order AS publicOrder,
      c.active AS cityActive,f.active AS formatActive,s.active AS supplierActive,
      p.tier_code AS tierCode,p.visible,p.capacity
    FROM portal_media_offers_v96 o
    JOIN portal_media_cities_v96 c ON c.id=o.city_id
    JOIN portal_media_formats_v95 f ON f.id=o.format_id
    JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id
    LEFT JOIN portal_offer_policy_v143 p ON p.offer_id=o.id`).toArray().map(row=>{
      const tierCode=String(row.tierCode||tierFromName(row.name));
      const visible=row.visible==null?true:Number(row.visible)!==0;
      const active=Boolean(Number(row.active)&&Number(row.cityActive)&&Number(row.formatActive)&&Number(row.supplierActive));
      const capacity=Math.max(0,Number(row.capacity||0));
      const used=(paid.get(String(row.id))||0)+(held.get(String(row.id))||0);
      const finite=capacity>0;
      const zeroSoldOut=!finite&&Boolean(TIER_META[tierCode]?.zeroMeansSoldOut);
      const remainingPlaces=finite?Math.max(0,capacity-used):(zeroSoldOut?0:null);
      const available=active&&visible&&!zeroSoldOut&&(!finite||used<capacity);
      return{
        id:String(row.id),cityId:String(row.cityId),formatId:String(row.formatId),supplierId:String(row.supplierId),name:String(row.name||''),
        clientPriceCents:Number(row.clientPriceCents||0),currency:String(row.currency||'eur'),publicOrder:Number(row.publicOrder||999),
        tierCode,tierLabel:TIER_META[tierCode]?.label||String(row.name||''),visible,active,capacity,usedPlaces:used,remainingPlaces,available,
      };
    });
}

function pricingFor(effective,family){
  const visibleActive=family.filter(row=>row.active&&row.visible);
  const sameSupplierBase=visibleActive.filter(row=>row.supplierId===effective.supplierId&&row.tierCode==='base').sort((a,b)=>Number(b.clientPriceCents)-Number(a.clientPriceCents))[0];
  const anyBase=visibleActive.filter(row=>row.tierCode==='base').sort((a,b)=>Number(b.clientPriceCents)-Number(a.clientPriceCents))[0];
  const sameSupplierMax=visibleActive.filter(row=>row.supplierId===effective.supplierId).sort((a,b)=>Number(b.clientPriceCents)-Number(a.clientPriceCents))[0];
  const anyMax=[...visibleActive].sort((a,b)=>Number(b.clientPriceCents)-Number(a.clientPriceCents))[0];
  const reference=sameSupplierBase||anyBase||sameSupplierMax||anyMax||effective;
  const basePriceCents=Math.max(Number(effective.clientPriceCents||0),Number(reference.clientPriceCents||0));
  return{
    tierKey:effective.tierCode||'base',
    tierLabel:effective.tierLabel||effective.name||'Tarif disponible',
    currentPriceCents:Number(effective.clientPriceCents||0),
    basePriceCents,
    savingsCents:Math.max(0,basePriceCents-Number(effective.clientPriceCents||0)),
    capacity:effective.capacity,
    remaining:effective.remainingPlaces,
    release:EFFECTIVE_OFFER_V181_RELEASE,
  };
}

function offerRow(store,id){
  const row=store.sql.exec(`SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,o.active,
      c.active AS cityActive,f.active AS formatActive,s.active AS supplierActive
    FROM portal_media_offers_v96 o
    JOIN portal_media_cities_v96 c ON c.id=o.city_id
    JOIN portal_media_formats_v95 f ON f.id=o.format_id
    JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id
    WHERE o.id=? LIMIT 1`,id).toArray()[0]||null;
  if(row)row.active=Boolean(Number(row.active)&&Number(row.cityActive)&&Number(row.formatActive)&&Number(row.supplierActive));
  return row;
}

async function prospectForToken(store,token){
  const raw=String(token||'').trim();if(raw.length<32)return null;
  try{
    const hash=await sha256(raw),now=new Date().toISOString();
    const row=store.sql.exec(`SELECT id,status,expires_at AS expiresAt FROM portal_prospects WHERE token_hash=? LIMIT 1`,hash).toArray()[0]||null;
    return row&&String(row.expiresAt||'')>now?row:null;
  }catch{return null;}
}

function cleanupExpiredHolds(store){store.sql.exec('DELETE FROM portal_offer_holds_v143 WHERE expires_at<=?',new Date().toISOString());}
function familyKey(cityId,formatId){return`${String(cityId||'')}|${String(formatId||'')}`;}
function compareEffective(a,b){return Number(a.clientPriceCents||0)-Number(b.clientPriceCents||0)||tierOrder(a.tierCode)-tierOrder(b.tierCode)||Number(a.publicOrder||999)-Number(b.publicOrder||999)||String(a.id).localeCompare(String(b.id));}
function tierOrder(code){return TIER_META[code]?.order||999;}
function tierFromName(value){const text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();if(/launch|lancement|coutant/u.test(text))return'launch';if(/promo|preferentiel/u.test(text))return'promo';if(/base|normal|standard/u.test(text))return'base';return'';}
function cleanId(value){const text=String(value||'').trim();return/^[a-zA-Z0-9._:-]{1,160}$/u.test(text)?text:'';}
