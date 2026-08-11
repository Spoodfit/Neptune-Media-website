import { ensureStudioOperationsV95Schema } from './portal-studio-operations-v95.js';
import { ensurePortalSchema } from './portal-schema.js';
import { ensureCrmV86Schema } from './portal-crm-v86.js';
import { requireOperator } from './workflow-db-v5.js';
import { json, randomToken, sanitizeText, sha256 } from './security.js';
import { normalizeEmail } from './portal-utils.js';

export const SALES_TUNNEL_RELEASE='neptune-sales-tunnel-20260811-v96';
const TOKEN_TTL_SECONDS=7*24*60*60;
const OPEN=new Set(['captured','tunnel_started','paid']);

export function ensureSalesTunnelV96Schema(store){
  ensureStudioOperationsV95Schema(store);ensurePortalSchema(store);ensureCrmV86Schema(store);
  if(store.salesTunnelV96Ready)return;
  store.sql.exec(`
    CREATE TABLE IF NOT EXISTS portal_media_cities_v96(
      id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,country TEXT NOT NULL DEFAULT 'France',active INTEGER NOT NULL DEFAULT 1,
      public_order INTEGER NOT NULL DEFAULT 100,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_media_offers_v96(
      id TEXT PRIMARY KEY,city_id TEXT NOT NULL REFERENCES portal_media_cities_v96(id) ON DELETE CASCADE,
      format_id TEXT NOT NULL REFERENCES portal_media_formats_v95(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES portal_media_suppliers_v95(id) ON DELETE RESTRICT,
      name TEXT NOT NULL DEFAULT 'Offre standard',client_price_cents INTEGER NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'eur',
      price_suffix TEXT NOT NULL DEFAULT '',payment_url TEXT NOT NULL DEFAULT '',supplier_net_cents INTEGER NOT NULL DEFAULT 0,
      vat_rate_bps INTEGER NOT NULL DEFAULT 2000,supplier_gross_cents INTEGER NOT NULL DEFAULT 0,preparation_url TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,public_order INTEGER NOT NULL DEFAULT 100,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      UNIQUE(city_id,format_id,supplier_id,name));
    CREATE TABLE IF NOT EXISTS portal_reservation_intents_v96(
      prospect_id TEXT PRIMARY KEY REFERENCES portal_prospects(id) ON DELETE CASCADE,city_id TEXT,format_id TEXT,offer_id TEXT,
      requested_date TEXT NOT NULL DEFAULT '',requested_daypart TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'contact_captured',
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_client_profiles_v96(
      client_id TEXT PRIMARY KEY REFERENCES portal_clients(id) ON DELETE CASCADE,phone TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_order_sales_v96(
      order_id TEXT PRIMARY KEY REFERENCES portal_orders(id) ON DELETE CASCADE,prospect_id TEXT,city_id TEXT,format_id TEXT,offer_id TEXT,supplier_id TEXT,
      city_name TEXT NOT NULL DEFAULT '',format_name TEXT NOT NULL DEFAULT '',offer_name TEXT NOT NULL DEFAULT '',supplier_name TEXT NOT NULL DEFAULT '',
      client_price_cents INTEGER NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'eur',requested_date TEXT NOT NULL DEFAULT '',
      requested_daypart TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_media_offers_public_v96 ON portal_media_offers_v96(active,city_id,public_order);
    CREATE INDEX IF NOT EXISTS idx_intents_offer_v96 ON portal_reservation_intents_v96(offer_id,updated_at);
  `);
  seedDefaults(store);store.salesTunnelV96Ready=true;
}

export async function startTunnelProspectV96(store,raw={}){
  ensureSalesTunnelV96Schema(store);
  const firstName=sanitizeText(raw.firstName||raw.first_name,80),lastName=sanitizeText(raw.lastName||raw.last_name,100),email=normalizeEmail(raw.email),phone=normalizePhone(raw.phone);
  if(!firstName||!lastName||!email||!phone)return json({error:'invalid_contact'},400);
  const now=new Date(),at=now.toISOString(),fullName=`${firstName} ${lastName}`.trim();
  let client=store.sql.exec('SELECT id,company FROM portal_clients WHERE email=? LIMIT 1',email).toArray()[0];
  if(!client){client={id:crypto.randomUUID(),company:''};store.sql.exec('INSERT INTO portal_clients(id,email,full_name,company,active,created_at,updated_at,last_access_at) VALUES(?,?,?,?,1,?,?,NULL)',client.id,email,fullName,'',at,at);}
  else store.sql.exec('UPDATE portal_clients SET full_name=?,active=1,updated_at=? WHERE id=?',fullName,at,client.id);
  store.sql.exec('INSERT INTO portal_client_profiles_v96(client_id,phone,updated_at) VALUES(?,?,?) ON CONFLICT(client_id) DO UPDATE SET phone=excluded.phone,updated_at=excluded.updated_at',client.id,phone,at);
  store.sql.exec("UPDATE portal_prospects SET status='replaced',updated_at=? WHERE client_id=? AND status IN ('captured','tunnel_started')",at,client.id);
  const token=randomToken(32),tokenHash=await sha256(token),prospectId=crypto.randomUUID(),expiresAt=new Date(now.getTime()+TOKEN_TTL_SECONDS*1000).toISOString();
  store.sql.exec(`INSERT INTO portal_prospects(id,client_id,first_name,last_name,company,email,token_hash,status,source,intent,consent_at,expires_at,created_at,updated_at,tunnel_started_at,paid_at,order_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,prospectId,client.id,firstName,lastName,client.company||'',email,tokenHash,'captured','neptune_media_tunnel_v96','book_passage',at,expiresAt,at,at);
  store.sql.exec("INSERT INTO portal_reservation_intents_v96(prospect_id,status,created_at,updated_at) VALUES(?,'contact_captured',?,?)",prospectId,at,at);
  return json({ok:true,release:SALES_TUNNEL_RELEASE,token,prospectId,expiresIn:TOKEN_TTL_SECONDS,contact:{firstName,lastName,fullName,email,phone}});
}

export async function tunnelProspectContextV96(store,raw={}){
  ensureSalesTunnelV96Schema(store);const prospect=await prospectByToken(store,String(raw.token||raw.reservationToken||''));
  if(!prospect)return json({error:'prospect_token_expired'},401);
  const at=new Date().toISOString();
  if(prospect.status!=='paid')store.sql.exec("UPDATE portal_prospects SET status='tunnel_started',tunnel_started_at=COALESCE(tunnel_started_at,?),updated_at=? WHERE id=?",at,at,prospect.id);
  if(prospect.status==='paid'&&prospect.orderId)materializeOrder(store,prospect.id,prospect.orderId);
  const intent=getIntent(store,prospect.id);
  return json({ok:true,release:SALES_TUNNEL_RELEASE,prospectId:prospect.id,status:prospect.status,orderId:prospect.orderId||'',expiresAt:prospect.expiresAt,
    contact:{firstName:prospect.firstName,lastName:prospect.lastName,fullName:prospect.fullName,email:prospect.email,phone:prospect.phone||''},selection:intent?publicIntent(store,intent,prospect):null});
}

export function publicSalesCatalogV96(store){
  ensureSalesTunnelV96Schema(store);
  const rows=store.sql.exec(`SELECT o.id AS offerId,o.name AS offerName,o.client_price_cents AS clientPriceCents,o.currency,o.price_suffix AS priceSuffix,
    c.id AS cityId,c.slug AS citySlug,c.name AS cityName,c.country,f.id AS formatId,f.slug AS formatSlug,f.name AS formatName,f.concept,f.description,f.duration_label AS durationLabel
    FROM portal_media_offers_v96 o JOIN portal_media_cities_v96 c ON c.id=o.city_id JOIN portal_media_formats_v95 f ON f.id=o.format_id
    JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id WHERE o.active=1 AND c.active=1 AND f.active=1 AND s.active=1 AND o.payment_url<>''
    ORDER BY c.public_order,c.name,f.public_order,f.name,o.public_order,o.name`).toArray();
  const cities=[];
  for(const r of rows){let city=cities.find(x=>x.id===r.cityId);if(!city){city={id:r.cityId,slug:r.citySlug,name:r.cityName,country:r.country,formats:[]};cities.push(city);}
    let format=city.formats.find(x=>x.id===r.formatId);if(!format){format={id:r.formatId,slug:r.formatSlug,name:r.formatName,concept:r.concept,description:r.description,durationLabel:r.durationLabel,offers:[]};city.formats.push(format);}
    format.offers.push({id:r.offerId,name:r.offerName,clientPriceCents:Number(r.clientPriceCents||0),currency:r.currency||'eur',priceSuffix:r.priceSuffix||''});}
  return json({ok:true,release:SALES_TUNNEL_RELEASE,cities});
}

export async function saveTunnelSelectionV96(store,raw={}){
  ensureSalesTunnelV96Schema(store);const prospect=await prospectByToken(store,String(raw.token||''));if(!prospect)return json({error:'prospect_token_expired'},401);
  const offerId=clean(raw.offerId),cityId=clean(raw.cityId),formatId=clean(raw.formatId),offer=offerById(store,offerId);
  if(!offer||offer.cityId!==cityId||offer.formatId!==formatId||!offer.active)return json({error:'offer_not_available'},409);
  const requestedDate=validDate(raw.requestedDate)?String(raw.requestedDate):'',requestedDaypart=['morning','afternoon','flexible'].includes(String(raw.requestedDaypart||''))?String(raw.requestedDaypart):'',status=requestedDate?'date_selected':'format_selected',at=new Date().toISOString();
  store.sql.exec(`INSERT INTO portal_reservation_intents_v96(prospect_id,city_id,format_id,offer_id,requested_date,requested_daypart,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(prospect_id) DO UPDATE SET city_id=excluded.city_id,format_id=excluded.format_id,offer_id=excluded.offer_id,requested_date=excluded.requested_date,requested_daypart=excluded.requested_daypart,status=excluded.status,updated_at=excluded.updated_at`,prospect.id,cityId,formatId,offerId,requestedDate,requestedDaypart,status,at,at);
  const opportunityId=upsertOpportunity(store,prospect,offer,at),paymentUrl=decoratePaymentUrl(offer.paymentUrl,prospect,offer,opportunityId);
  return json({ok:true,release:SALES_TUNNEL_RELEASE,status,paymentUrl,selection:{city:{id:cityId,name:offer.cityName,slug:offer.citySlug},format:{id:formatId,name:offer.formatName,slug:offer.formatSlug},offer:{id:offer.id,name:offer.name,clientPriceCents:Number(offer.clientPriceCents||0),currency:offer.currency,priceSuffix:offer.priceSuffix},requestedDate,requestedDaypart}});
}

export async function salesConfigurationV96(store,body={}){ensureSalesTunnelV96Schema(store);const a=await requireOperator(store,body);if(!a.ok)return a.response;return json({ok:true,release:SALES_TUNNEL_RELEASE,...configuration(store)});}
export async function saveCityV96(store,body={}){
  ensureSalesTunnelV96Schema(store);const a=await requireOperator(store,body);if(!a.ok)return a.response;const p=payload(body),id=clean(p.id)||crypto.randomUUID(),name=sanitizeText(p.name,120),country=sanitizeText(p.country||'France',100)||'France';if(!name)return json({error:'city_name_required'},400);
  let slug=slugify(p.slug||name)||`ville-${id.slice(0,6)}`;const active=p.active===false||p.active===0?0:1,order=clamp(p.publicOrder,0,9999),at=new Date().toISOString();if(store.sql.exec('SELECT id FROM portal_media_cities_v96 WHERE slug=? AND id<>? LIMIT 1',slug,id).toArray()[0])slug=`${slug}-${id.slice(0,5)}`;
  if(store.sql.exec('SELECT id FROM portal_media_cities_v96 WHERE id=? LIMIT 1',id).toArray()[0])store.sql.exec('UPDATE portal_media_cities_v96 SET slug=?,name=?,country=?,active=?,public_order=?,updated_at=? WHERE id=?',slug,name,country,active,order,at,id);
  else store.sql.exec('INSERT INTO portal_media_cities_v96(id,slug,name,country,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,slug,name,country,active,order,at,at);return salesConfigurationV96(store,body);
}
export async function saveOfferV96(store,body={}){
  ensureSalesTunnelV96Schema(store);const a=await requireOperator(store,body);if(!a.ok)return a.response;const p=payload(body),id=clean(p.id)||crypto.randomUUID(),cityId=clean(p.cityId),formatId=clean(p.formatId),supplierId=clean(p.supplierId),name=sanitizeText(p.name||'Offre standard',120)||'Offre standard',paymentUrl=safeUrl(p.paymentUrl);if(!cityId||!formatId||!supplierId||!paymentUrl)return json({error:'offer_fields_required'},400);
  const refs=store.sql.exec('SELECT c.id FROM portal_media_cities_v96 c,portal_media_formats_v95 f,portal_media_suppliers_v95 s WHERE c.id=? AND f.id=? AND s.id=? LIMIT 1',cityId,formatId,supplierId).toArray()[0];if(!refs)return json({error:'offer_reference_invalid'},404);
  const supplier=store.sql.exec('SELECT default_net_cents AS net,vat_rate_bps AS vat FROM portal_media_suppliers_v95 WHERE id=? LIMIT 1',supplierId).toArray()[0]||{};
  const price=clamp(p.clientPriceCents,0,1e9),net=p.supplierNetCents===''||p.supplierNetCents==null?Number(supplier.net||0):clamp(p.supplierNetCents,0,1e9),vat=p.vatRateBps===''||p.vatRateBps==null?Number(supplier.vat||2000):clamp(p.vatRateBps,0,10000),gross=net+Math.round(net*vat/10000),suffix=sanitizeText(p.priceSuffix||'',20),currency=sanitizeText(p.currency||'eur',10).toLowerCase()||'eur',prep=safeUrl(p.preparationUrl),active=p.active===false||p.active===0?0:1,order=clamp(p.publicOrder,0,9999),at=new Date().toISOString();
  if(store.sql.exec('SELECT id FROM portal_media_offers_v96 WHERE id=? LIMIT 1',id).toArray()[0])store.sql.exec('UPDATE portal_media_offers_v96 SET city_id=?,format_id=?,supplier_id=?,name=?,client_price_cents=?,currency=?,price_suffix=?,payment_url=?,supplier_net_cents=?,vat_rate_bps=?,supplier_gross_cents=?,preparation_url=?,active=?,public_order=?,updated_at=? WHERE id=?',cityId,formatId,supplierId,name,price,currency,suffix,paymentUrl,net,vat,gross,prep,active,order,at,id);
  else store.sql.exec('INSERT INTO portal_media_offers_v96(id,city_id,format_id,supplier_id,name,client_price_cents,currency,price_suffix,payment_url,supplier_net_cents,vat_rate_bps,supplier_gross_cents,preparation_url,active,public_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,cityId,formatId,supplierId,name,price,currency,suffix,paymentUrl,net,vat,gross,prep,active,order,at,at);return salesConfigurationV96(store,body);
}
export async function orderSalesContextV96(store,body={}){ensureSalesTunnelV96Schema(store);const a=await requireOperator(store,body);if(!a.ok)return a.response;const orderId=clean(payload(body).orderId);let sales=store.sql.exec('SELECT * FROM portal_order_sales_v96 WHERE order_id=? LIMIT 1',orderId).toArray()[0]||null;if(!sales){const p=store.sql.exec('SELECT id FROM portal_prospects WHERE order_id=? ORDER BY updated_at DESC LIMIT 1',orderId).toArray()[0];if(p){materializeOrder(store,p.id,orderId);sales=store.sql.exec('SELECT * FROM portal_order_sales_v96 WHERE order_id=? LIMIT 1',orderId).toArray()[0]||null;}}return json({ok:true,release:SALES_TUNNEL_RELEASE,sales});}

function configuration(store){return {cities:store.sql.exec('SELECT id,slug,name,country,active,public_order AS publicOrder FROM portal_media_cities_v96 ORDER BY active DESC,public_order,name').toArray().map(activeBool),formats:store.sql.exec('SELECT id,slug,name,concept,active,public_order AS publicOrder FROM portal_media_formats_v95 ORDER BY active DESC,public_order,name').toArray().map(activeBool),suppliers:store.sql.exec('SELECT id,name,email,active,default_net_cents AS defaultNetCents,vat_rate_bps AS vatRateBps,default_gross_cents AS defaultGrossCents FROM portal_media_suppliers_v95 ORDER BY active DESC,name').toArray().map(activeBool),offers:store.sql.exec(`SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,o.name,o.client_price_cents AS clientPriceCents,o.currency,o.price_suffix AS priceSuffix,o.payment_url AS paymentUrl,o.supplier_net_cents AS supplierNetCents,o.vat_rate_bps AS vatRateBps,o.supplier_gross_cents AS supplierGrossCents,o.preparation_url AS preparationUrl,o.active,o.public_order AS publicOrder,c.name AS cityName,f.name AS formatName,s.name AS supplierName FROM portal_media_offers_v96 o JOIN portal_media_cities_v96 c ON c.id=o.city_id JOIN portal_media_formats_v95 f ON f.id=o.format_id JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id ORDER BY o.active DESC,c.public_order,f.public_order,o.public_order,o.name`).toArray().map(activeBool)};}
async function prospectByToken(store,token){if(String(token).length<32)return null;const hash=await sha256(String(token)),now=new Date().toISOString(),p=store.sql.exec(`SELECT p.id,p.client_id AS clientId,p.first_name AS firstName,p.last_name AS lastName,p.email,p.status,p.expires_at AS expiresAt,p.order_id AS orderId,c.full_name AS fullName,cp.phone FROM portal_prospects p JOIN portal_clients c ON c.id=p.client_id LEFT JOIN portal_client_profiles_v96 cp ON cp.client_id=c.id WHERE p.token_hash=? LIMIT 1`,hash).toArray()[0];return p&&p.expiresAt>now&&OPEN.has(p.status)?p:null;}
function getIntent(store,id){return store.sql.exec('SELECT prospect_id AS prospectId,city_id AS cityId,format_id AS formatId,offer_id AS offerId,requested_date AS requestedDate,requested_daypart AS requestedDaypart,status FROM portal_reservation_intents_v96 WHERE prospect_id=? LIMIT 1',id).toArray()[0]||null;}
function offerById(store,id){const o=store.sql.exec(`SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,o.payment_url AS paymentUrl,o.name,o.client_price_cents AS clientPriceCents,o.currency,o.price_suffix AS priceSuffix,o.preparation_url AS preparationUrl,o.active,c.name AS cityName,c.slug AS citySlug,f.name AS formatName,f.slug AS formatSlug,s.name AS supplierName FROM portal_media_offers_v96 o JOIN portal_media_cities_v96 c ON c.id=o.city_id JOIN portal_media_formats_v95 f ON f.id=o.format_id JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id WHERE o.id=? AND c.active=1 AND f.active=1 AND s.active=1 LIMIT 1`,id).toArray()[0]||null;if(o)o.active=Boolean(o.active);return o;}
function publicIntent(store,intent,prospect){if(!intent?.offerId)return {status:intent?.status||'contact_captured'};const o=offerById(store,intent.offerId);if(!o)return {status:intent.status};return {status:intent.status,city:{id:o.cityId,name:o.cityName,slug:o.citySlug},format:{id:o.formatId,name:o.formatName,slug:o.formatSlug},offer:{id:o.id,name:o.name,clientPriceCents:Number(o.clientPriceCents||0),currency:o.currency,priceSuffix:o.priceSuffix},requestedDate:intent.requestedDate,requestedDaypart:intent.requestedDaypart,paymentUrl:prospect.status==='paid'?'':decoratePaymentUrl(o.paymentUrl,prospect,o,activeOpportunityId(store,prospect.id))};}
function upsertOpportunity(store,p,o,at){let x=store.sql.exec("SELECT id FROM portal_crm_opportunities_v86 WHERE prospect_id=? AND status NOT IN ('cancelled','converted') ORDER BY updated_at DESC LIMIT 1",p.id).toArray()[0]||{id:crypto.randomUUID()};const title=`Passage Neptune Media · ${o.cityName}`,exists=store.sql.exec('SELECT id FROM portal_crm_opportunities_v86 WHERE id=? LIMIT 1',x.id).toArray()[0];if(exists)store.sql.exec("UPDATE portal_crm_opportunities_v86 SET client_id=?,prospect_id=?,source_type='tunnel_v96',title=?,format=?,amount_total=?,currency=?,payment_mode='payment_pending',status='payment_pending',updated_at=? WHERE id=?",p.clientId,p.id,title,o.formatName,Number(o.clientPriceCents||0),o.currency||'eur',at,x.id);else store.sql.exec("INSERT INTO portal_crm_opportunities_v86(id,client_id,prospect_id,source_type,title,format,amount_total,currency,payment_mode,status,created_at,updated_at) VALUES(?,?,?,'tunnel_v96',?,?,?,?,'payment_pending','payment_pending',?,?)",x.id,p.clientId,p.id,title,o.formatName,Number(o.clientPriceCents||0),o.currency||'eur',at,at);return x.id;}
function activeOpportunityId(store,id){return String(store.sql.exec("SELECT id FROM portal_crm_opportunities_v86 WHERE prospect_id=? AND status NOT IN ('cancelled','converted') ORDER BY updated_at DESC LIMIT 1",id).toArray()[0]?.id||'');}
function decoratePaymentUrl(url,p,o,opportunityId=''){try{const u=new URL(url);u.searchParams.set('client_reference_id',opportunityId?`NPOPP_${opportunityId}`:`NP_${p.id}`);u.searchParams.set('locked_prefilled_email',p.email);u.searchParams.set('utm_source','neptune_media_tunnel');u.searchParams.set('utm_medium','reservation_v96');u.searchParams.set('utm_campaign',String(o.id||o.offerId||'offer'));return u.toString();}catch{return url;}}
function materializeOrder(store,prospectId,orderId){const i=getIntent(store,prospectId);if(!i?.offerId)return;const o=store.sql.exec(`SELECT x.*,c.name AS cityName,f.name AS formatName,s.name AS supplierName FROM portal_media_offers_v96 x JOIN portal_media_cities_v96 c ON c.id=x.city_id JOIN portal_media_formats_v95 f ON f.id=x.format_id JOIN portal_media_suppliers_v95 s ON s.id=x.supplier_id WHERE x.id=? LIMIT 1`,i.offerId).toArray()[0];if(!o)return;const at=new Date().toISOString();store.sql.exec(`INSERT INTO portal_order_sales_v96(order_id,prospect_id,city_id,format_id,offer_id,supplier_id,city_name,format_name,offer_name,supplier_name,client_price_cents,currency,requested_date,requested_daypart,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET prospect_id=excluded.prospect_id,city_id=excluded.city_id,format_id=excluded.format_id,offer_id=excluded.offer_id,supplier_id=excluded.supplier_id,city_name=excluded.city_name,format_name=excluded.format_name,offer_name=excluded.offer_name,supplier_name=excluded.supplier_name,client_price_cents=excluded.client_price_cents,currency=excluded.currency,requested_date=excluded.requested_date,requested_daypart=excluded.requested_daypart,updated_at=excluded.updated_at`,orderId,prospectId,o.city_id,o.format_id,o.id,o.supplier_id,o.cityName,o.formatName,o.name,o.supplierName,o.client_price_cents,o.currency,i.requestedDate,i.requestedDaypart,at,at);if(!store.sql.exec('SELECT id FROM portal_supplier_finance_v95 WHERE order_id=? AND supplier_id=? LIMIT 1',orderId,o.supplier_id).toArray()[0])store.sql.exec("INSERT INTO portal_supplier_finance_v95(id,order_id,supplier_id,status,net_cents,vat_cents,gross_cents,created_at,updated_at) VALUES(?,?,?,'assigned',?,?,?,?,?)",crypto.randomUUID(),orderId,o.supplier_id,Number(o.supplier_net_cents||0),Math.max(0,Number(o.supplier_gross_cents||0)-Number(o.supplier_net_cents||0)),Number(o.supplier_gross_cents||0),at,at);}
function seedDefaults(store){const at=new Date().toISOString();if(!store.sql.exec("SELECT id FROM portal_media_cities_v96 WHERE id='toulouse' LIMIT 1").toArray()[0])store.sql.exec("INSERT INTO portal_media_cities_v96(id,slug,name,country,active,public_order,created_at,updated_at) VALUES('toulouse','toulouse','Toulouse','France',1,10,?,?)",at,at);if(Number(store.sql.exec('SELECT COUNT(*) AS n FROM portal_media_offers_v96').toArray()[0]?.n||0))return;const s=store.sql.exec("SELECT id,default_net_cents AS net,vat_rate_bps AS vat,default_gross_cents AS gross FROM portal_media_suppliers_v95 WHERE id='recbox' LIMIT 1").toArray()[0],hn=store.sql.exec("SELECT id FROM portal_media_formats_v95 WHERE slug='hors-norme' LIMIT 1").toArray()[0],libre=store.sql.exec("SELECT id FROM portal_media_formats_v95 WHERE slug IN ('libre','concept-libre') ORDER BY CASE WHEN slug='libre' THEN 0 ELSE 1 END LIMIT 1").toArray()[0];if(!s)return;const add=(id,f,name,price,url,active,order)=>store.sql.exec("INSERT OR IGNORE INTO portal_media_offers_v96(id,city_id,format_id,supplier_id,name,client_price_cents,currency,price_suffix,payment_url,supplier_net_cents,vat_rate_bps,supplier_gross_cents,active,public_order,created_at,updated_at) VALUES(?,'toulouse',?,?,?,?,'eur','',?,?,?,?,?,?,?,?)",id,f,s.id,name,price,url,s.net,s.vat,s.gross,active,order,at,at);if(hn){add('offer-hn-toulouse-recbox-launch',hn.id,'Tarif de lancement',89000,'https://buy.stripe.com/cNi8wPelvgXw9FIdSK73G06',1,10);add('offer-hn-toulouse-recbox-promo',hn.id,'Tarif préférentiel',149000,'https://buy.stripe.com/8x214n2CN22C5ps9Cu73G0a',0,20);add('offer-hn-toulouse-recbox-standard',hn.id,'Tarif de base',199000,'https://buy.stripe.com/14AcN5gtD7mW19c8yq73G07',0,30);}if(libre){add('offer-libre-toulouse-recbox-launch',libre.id,'Tarif de lancement',79000,'https://book.stripe.com/fZu9AT1yJ5eO2dg4ia73G05',1,10);add('offer-libre-toulouse-recbox-promo',libre.id,'Tarif préférentiel',99000,'https://book.stripe.com/dRm14nfpz8r04lo7um73G09',0,20);add('offer-libre-toulouse-recbox-standard',libre.id,'Tarif de base',109000,'https://buy.stripe.com/28EcN5a5fcHg5psdSK73G08',0,30);}}
function payload(b){return b?.payload&&typeof b.payload==='object'?b.payload:b||{};}function clean(v){return sanitizeText(v,120);}function clamp(v,min,max){const n=Math.round(Number(v||0));return Math.min(max,Math.max(min,Number.isFinite(n)?n:0));}function slugify(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-|-$/gu,'').slice(0,80);}function safeUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():'';}catch{return '';}}function normalizePhone(v){const raw=String(v||'').trim(),plus=raw.startsWith('+'),digits=raw.replace(/\D/gu,'');return digits.length>=8&&digits.length<=15?`${plus?'+':''}${digits}`:'';}function validDate(v){return /^\d{4}-\d{2}-\d{2}$/u.test(String(v||''));}function activeBool(r){return {...r,active:Boolean(r.active)};}
