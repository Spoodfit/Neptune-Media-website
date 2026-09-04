import { json, sanitizeText } from './security.js';
import { requireOperator } from './workflow-db-v5.js';
import { reservationDatePolicyV173 } from './reservation-policy-v173.js';
import {
  ensureSalesTunnelV96Schema as ensureBase,
  publicSalesCatalogV96 as baseCatalog,
  saveTunnelSelectionV96 as baseSelection,
  tunnelProspectContextV96 as baseContext,
  salesConfigurationV96 as baseConfiguration,
  saveOfferV96 as baseSaveOffer,
  orderSalesContextV96 as baseOrderSales,
} from './portal-sales-tunnel-v96.js';

export const SALES_TUNNEL_OPTIONS_RELEASE='neptune-sales-tunnel-options-20260811-v96';

export function ensureSalesTunnelOptionsV96Schema(store){
  ensureBase(store);
  if(store.salesTunnelOptionsV96Ready)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_offer_configurations_v96(
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL REFERENCES portal_media_offers_v96(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      public_order INTEGER NOT NULL DEFAULT 100,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(offer_id,label)
    );
    CREATE TABLE IF NOT EXISTS portal_reservation_configuration_v96(
      prospect_id TEXT PRIMARY KEY REFERENCES portal_prospects(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL,
      configuration_choice TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_offer_configurations_public_v96 ON portal_offer_configurations_v96(offer_id,active,public_order);
  `);
  seedDefaultConfigurations(store);
  store.salesTunnelOptionsV96Ready=true;
}

export async function publicSalesCatalogWithOptionsV96(store){
  ensureSalesTunnelOptionsV96Schema(store);
  const response=baseCatalog(store),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  const configs=configurationsByOffer(store);
  for(const city of data.cities||[])for(const format of city.formats||[])for(const offer of format.offers||[])offer.configurations=configs.get(offer.id)||[];
  return json({...data,optionsRelease:SALES_TUNNEL_OPTIONS_RELEASE});
}

export async function tunnelProspectContextWithOptionsV96(store,raw={}){
  ensureSalesTunnelOptionsV96Schema(store);
  const response=await baseContext(store,raw),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  const row=data.prospectId?store.sql.exec('SELECT configuration_choice AS configurationChoice FROM portal_reservation_configuration_v96 WHERE prospect_id=? LIMIT 1',data.prospectId).toArray()[0]:null;
  if(data.selection&&row?.configurationChoice)data.selection.configurationChoice=row.configurationChoice;
  return json({...data,optionsRelease:SALES_TUNNEL_OPTIONS_RELEASE});
}

export async function saveTunnelSelectionWithOptionsV96(store,raw={}){
  ensureSalesTunnelOptionsV96Schema(store);
  if(raw.requestedDate){
    const policy=reservationDatePolicyV173(raw.requestedDate);
    if(!policy.ok)return json({error:policy.reason==='lead_time'?'reservation_lead_time_15_days':'invalid_requested_date',policy},400);
  }
  const offerId=sanitizeText(raw.offerId,120),choice=sanitizeText(raw.configurationChoice,120);
  const options=store.sql.exec('SELECT label FROM portal_offer_configurations_v96 WHERE offer_id=? AND active=1 ORDER BY public_order,label',offerId).toArray().map(x=>x.label);
  if(options.length&&!choice)return json({error:'configuration_required'},400);
  if(choice&&!options.includes(choice))return json({error:'configuration_not_available'},409);
  const response=await baseSelection(store,raw),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  if(data.ok&&data.prospectId)saveReservationChoice(store,data.prospectId,offerId,choice);
  else if(data.ok){
    const prospect=await resolveProspectIdByToken(store,String(raw.token||''));
    if(prospect)saveReservationChoice(store,prospect,offerId,choice);
  }
  if(data.selection)data.selection.configurationChoice=choice;
  return json({...data,optionsRelease:SALES_TUNNEL_OPTIONS_RELEASE});
}

export async function salesConfigurationWithOptionsV96(store,body={}){
  ensureSalesTunnelOptionsV96Schema(store);
  const response=await baseConfiguration(store,body),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  const configs=configurationsByOffer(store);
  data.offers=(data.offers||[]).map(o=>({...o,configurationOptions:configs.get(o.id)||[]}));
  return json({...data,optionsRelease:SALES_TUNNEL_OPTIONS_RELEASE});
}

export async function saveOfferWithOptionsV96(store,body={}){
  ensureSalesTunnelOptionsV96Schema(store);
  const access=await requireOperator(store,body);if(!access.ok)return access.response;
  const p=body?.payload&&typeof body.payload==='object'?body.payload:body||{};
  const response=await baseSaveOffer(store,body),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  const offer=findSavedOffer(data.offers||[],p);
  if(offer){
    const labels=normalizeOptions(p.configurationOptions);
    replaceOfferConfigurations(store,offer.id,labels);
  }
  return salesConfigurationWithOptionsV96(store,body);
}

export async function orderSalesContextWithOptionsV96(store,body={}){
  ensureSalesTunnelOptionsV96Schema(store);
  const response=await baseOrderSales(store,body),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  const prospectId=data.sales?.prospect_id||data.sales?.prospectId||'';
  if(prospectId){const row=store.sql.exec('SELECT configuration_choice AS configurationChoice FROM portal_reservation_configuration_v96 WHERE prospect_id=? LIMIT 1',prospectId).toArray()[0];if(row?.configurationChoice)data.sales.configurationChoice=row.configurationChoice;}
  return json({...data,optionsRelease:SALES_TUNNEL_OPTIONS_RELEASE});
}

function configurationsByOffer(store){
  const map=new Map();
  for(const r of store.sql.exec('SELECT offer_id AS offerId,label FROM portal_offer_configurations_v96 WHERE active=1 ORDER BY offer_id,public_order,label').toArray()){if(!map.has(r.offerId))map.set(r.offerId,[]);map.get(r.offerId).push(r.label);}
  return map;
}
function replaceOfferConfigurations(store,offerId,labels){const at=new Date().toISOString();store.sql.exec('DELETE FROM portal_offer_configurations_v96 WHERE offer_id=?',offerId);labels.forEach((label,index)=>store.sql.exec('INSERT INTO portal_offer_configurations_v96(id,offer_id,label,public_order,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)',crypto.randomUUID(),offerId,label,(index+1)*10,at,at));}
function normalizeOptions(value){const list=Array.isArray(value)?value:String(value||'').split(/[,;\n]/u);return [...new Set(list.map(x=>sanitizeText(x,80)).filter(Boolean))].slice(0,20);}
function findSavedOffer(offers,p){if(p.id)return offers.find(o=>o.id===p.id)||null;const name=sanitizeText(p.name||'Offre standard',120)||'Offre standard';return offers.find(o=>o.cityId===p.cityId&&o.formatId===p.formatId&&o.supplierId===p.supplierId&&o.name===name)||null;}
function saveReservationChoice(store,prospectId,offerId,choice){const at=new Date().toISOString();store.sql.exec('INSERT INTO portal_reservation_configuration_v96(prospect_id,offer_id,configuration_choice,updated_at) VALUES(?,?,?,?) ON CONFLICT(prospect_id) DO UPDATE SET offer_id=excluded.offer_id,configuration_choice=excluded.configuration_choice,updated_at=excluded.updated_at',prospectId,offerId,choice,at);}
async function resolveProspectIdByToken(store,token){if(token.length<32)return '';const {sha256}=await import('./security.js');const hash=await sha256(token);return String(store.sql.exec('SELECT id FROM portal_prospects WHERE token_hash=? LIMIT 1',hash).toArray()[0]?.id||'');}
function seedDefaultConfigurations(store){const defaults={
  'offer-hn-toulouse-recbox-launch':['Chaise','Canapé'],'offer-hn-toulouse-recbox-promo':['Chaise','Canapé'],'offer-hn-toulouse-recbox-standard':['Chaise','Canapé'],
  'offer-libre-toulouse-recbox-launch':['Plateau','Bar','Chaise','Canapé','Sur-mesure'],'offer-libre-toulouse-recbox-promo':['Plateau','Bar','Chaise','Canapé','Sur-mesure'],'offer-libre-toulouse-recbox-standard':['Plateau','Bar','Chaise','Canapé','Sur-mesure']};
  for(const [offerId,labels] of Object.entries(defaults)){if(!store.sql.exec('SELECT id FROM portal_media_offers_v96 WHERE id=? LIMIT 1',offerId).toArray()[0])continue;if(Number(store.sql.exec('SELECT COUNT(*) AS n FROM portal_offer_configurations_v96 WHERE offer_id=?',offerId).toArray()[0]?.n||0))continue;replaceOfferConfigurations(store,offerId,labels);}
}
