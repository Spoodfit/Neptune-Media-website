import { json, sanitizeText, sha256 } from './security.js';
import { startTunnelProspectV96 } from './portal-sales-tunnel-v96.js';
import { ensureSalesTunnelOptionsV96Schema, tunnelProspectContextWithOptionsV96 } from './portal-sales-tunnel-options-v96.js';

export const SALES_TUNNEL_ENHANCEMENT_RELEASE='neptune-sales-tunnel-20260811-v97';
const BASE_RELEASE='neptune-sales-tunnel-20260811-v96';
const OPEN=new Set(['captured','tunnel_started','paid']);
const STRIPE_REDIRECT_VERSION='v97-confirmation-20260811';
const STRIPE_REDIRECT_URL='https://tv.neptunebusiness.com/reserver?payment=success&session_id={CHECKOUT_SESSION_ID}';

export function ensureSalesTunnelV97Schema(store){
  ensureSalesTunnelOptionsV96Schema(store);
  if(store.salesTunnelV97Ready)return;
  store.sql.exec(`CREATE TABLE IF NOT EXISTS portal_sales_runtime_v97(
    key TEXT PRIMARY KEY,value TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL
  );`);
  store.salesTunnelV97Ready=true;
}

export async function startTunnelProspectV97(store,raw={}){
  ensureSalesTunnelV97Schema(store);
  const response=await startTunnelProspectV96(store,raw),data=await response.json().catch(()=>({}));
  if(response.ok&&data.prospectId)store.sql.exec("UPDATE portal_prospects SET source='neptune_media_tunnel_v97',updated_at=? WHERE id=?",new Date().toISOString(),data.prospectId);
  return json({...data,release:BASE_RELEASE,enhancementRelease:SALES_TUNNEL_ENHANCEMENT_RELEASE},response.status);
}

export async function publicSalesCatalogV97(store){
  ensureSalesTunnelV97Schema(store);
  const redirectSync=await ensureStripeRedirectsV97(store);
  const tier=currentTier(store),rows=allOfferRows(store),configs=configurationsByOffer(store),cities=[];
  const groups=new Map();
  for(const row of rows){
    const key=`${row.cityId}|${row.formatId}|${row.supplierId}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  const selectedGroups=[];
  for(const variants of groups.values()){
    if(!variants.some(x=>x.active))continue;
    const effective=resolveTierOffer(variants,tier.key);
    if(effective)selectedGroups.push({variants,effective});
  }
  selectedGroups.sort((a,b)=>a.effective.cityOrder-b.effective.cityOrder||a.effective.formatOrder-b.effective.formatOrder||a.effective.publicOrder-b.effective.publicOrder);
  const seenFormat=new Set();
  for(const group of selectedGroups){
    const r=group.effective,formatKey=`${r.cityId}|${r.formatId}`;
    if(seenFormat.has(formatKey))continue;
    seenFormat.add(formatKey);
    let city=cities.find(x=>x.id===r.cityId);
    if(!city){city={id:r.cityId,slug:r.citySlug,name:r.cityName,country:r.country,formats:[]};cities.push(city);}
    const pricing=pricingForVariants(group.variants,tier,r);
    city.formats.push({
      id:r.formatId,slug:r.formatSlug,name:r.formatName,concept:r.concept,description:r.description,durationLabel:r.durationLabel,
      image:formatImage(r.formatSlug),
      offers:[{id:r.id,name:tier.label,clientPriceCents:Number(r.clientPriceCents||0),currency:r.currency||'eur',priceSuffix:r.priceSuffix||'',pricing,configurations:(configs.get(r.id)||[]).map(label=>configurationOption(r.formatSlug,label))}]
    });
  }
  return json({ok:true,release:BASE_RELEASE,enhancementRelease:SALES_TUNNEL_ENHANCEMENT_RELEASE,pricing:tier,cities,redirectSync});
}

export async function tunnelProspectContextV97(store,raw={}){
  ensureSalesTunnelV97Schema(store);
  const response=await tunnelProspectContextWithOptionsV96(store,raw),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  if(data.selection?.offer?.id){
    const offer=offerById(store,data.selection.offer.id),configs=configurationsByOffer(store).get(data.selection.offer.id)||[];
    if(offer){
      const variants=familyOffers(store,offer.cityId,offer.formatId,offer.supplierId),tier=tierFromOffer(offer),pricing=pricingForVariants(variants,tier,offer);
      data.selection.offer={...data.selection.offer,name:tier.label,pricing,configurations:configs.map(label=>configurationOption(offer.formatSlug,label))};
      data.selection.format={...data.selection.format,image:formatImage(offer.formatSlug)};
    }
  }
  return json({...data,release:BASE_RELEASE,enhancementRelease:SALES_TUNNEL_ENHANCEMENT_RELEASE});
}

export async function saveTunnelSelectionV97(store,raw={}){
  ensureSalesTunnelV97Schema(store);
  const prospect=await prospectByToken(store,String(raw.token||''));
  if(!prospect)return json({error:'prospect_token_expired'},401);
  const requestedDate=String(raw.requestedDate||''),requestedDaypart=['morning','afternoon','flexible'].includes(String(raw.requestedDaypart||''))?String(raw.requestedDaypart):'';
  if(!isBusinessDay(requestedDate))return json({error:'invalid_requested_date'},400);
  if(!requestedDaypart)return json({error:'requested_slot_required'},400);
  const seed=offerById(store,sanitizeText(raw.offerId,120));
  const cityId=sanitizeText(raw.cityId,120),formatId=sanitizeText(raw.formatId,120);
  if(!seed||seed.cityId!==cityId||seed.formatId!==formatId)return json({error:'offer_not_available'},409);
  const tier=currentTier(store),variants=familyOffers(store,cityId,formatId,seed.supplierId),offer=resolveTierOffer(variants,tier.key);
  if(!offer)return json({error:'offer_not_available'},409);
  const choice=sanitizeText(raw.configurationChoice,120),options=configurationsByOffer(store).get(offer.id)||[];
  if(options.length&&!choice)return json({error:'configuration_required'},400);
  if(choice&&!options.includes(choice))return json({error:'configuration_not_available'},409);
  const at=new Date().toISOString(),status='date_selected';
  store.sql.exec(`INSERT INTO portal_reservation_intents_v96(prospect_id,city_id,format_id,offer_id,requested_date,requested_daypart,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(prospect_id) DO UPDATE SET city_id=excluded.city_id,format_id=excluded.format_id,offer_id=excluded.offer_id,requested_date=excluded.requested_date,requested_daypart=excluded.requested_daypart,status=excluded.status,updated_at=excluded.updated_at`,prospect.id,cityId,formatId,offer.id,requestedDate,requestedDaypart,status,at,at);
  store.sql.exec('INSERT INTO portal_reservation_configuration_v96(prospect_id,offer_id,configuration_choice,updated_at) VALUES(?,?,?,?) ON CONFLICT(prospect_id) DO UPDATE SET offer_id=excluded.offer_id,configuration_choice=excluded.configuration_choice,updated_at=excluded.updated_at',prospect.id,offer.id,choice,at);
  const opportunityId=upsertOpportunity(store,prospect,offer,at),paymentUrl=decoratePaymentUrl(offer.paymentUrl,prospect,offer,opportunityId,tier.key,choice),pricing=pricingForVariants(variants,tier,offer);
  return json({ok:true,release:BASE_RELEASE,enhancementRelease:SALES_TUNNEL_ENHANCEMENT_RELEASE,prospectId:prospect.id,status,paymentUrl,selection:{city:{id:cityId,name:offer.cityName,slug:offer.citySlug},format:{id:formatId,name:offer.formatName,slug:offer.formatSlug,image:formatImage(offer.formatSlug)},offer:{id:offer.id,name:tier.label,clientPriceCents:Number(offer.clientPriceCents||0),currency:offer.currency,priceSuffix:offer.priceSuffix||'',pricing,configurations:options.map(label=>configurationOption(offer.formatSlug,label))},configurationChoice:choice,requestedDate,requestedDaypart}});
}

function allOfferRows(store){return store.sql.exec(`SELECT o.id,o.city_id AS cityId,o.format_id AS formatId,o.supplier_id AS supplierId,o.name,o.client_price_cents AS clientPriceCents,o.currency,o.price_suffix AS priceSuffix,o.payment_url AS paymentUrl,o.active,o.public_order AS publicOrder,c.name AS cityName,c.slug AS citySlug,c.country,c.public_order AS cityOrder,f.name AS formatName,f.slug AS formatSlug,f.concept,f.description,f.duration_label AS durationLabel,f.public_order AS formatOrder,s.name AS supplierName FROM portal_media_offers_v96 o JOIN portal_media_cities_v96 c ON c.id=o.city_id JOIN portal_media_formats_v95 f ON f.id=o.format_id JOIN portal_media_suppliers_v95 s ON s.id=o.supplier_id WHERE c.active=1 AND f.active=1 AND s.active=1 AND o.payment_url<>'' ORDER BY c.public_order,f.public_order,o.public_order,o.name`).toArray().map(x=>({...x,active:Boolean(x.active)}));}
function familyOffers(store,cityId,formatId,supplierId){return allOfferRows(store).filter(x=>x.cityId===cityId&&x.formatId===formatId&&x.supplierId===supplierId);}
function offerById(store,id){return allOfferRows(store).find(x=>x.id===id)||null;}
function configurationsByOffer(store){const map=new Map();for(const r of store.sql.exec('SELECT offer_id AS offerId,label FROM portal_offer_configurations_v96 WHERE active=1 ORDER BY offer_id,public_order,label').toArray()){if(!map.has(r.offerId))map.set(r.offerId,[]);map.get(r.offerId).push(r.label);}return map;}
function paidTunnelCount(store){return Number(store.sql.exec("SELECT COUNT(*) AS n FROM portal_prospects WHERE status='paid' AND order_id IS NOT NULL AND source LIKE 'neptune_media_tunnel_v%'").toArray()[0]?.n||0);}
function currentTier(store){return tierForCount(paidTunnelCount(store));}
function tierForCount(paid){if(paid<3)return {key:'launch',label:'Prix coûtant · lancement',paidCount:paid,remaining:Math.max(0,3-paid),nextLabel:'Tarif préférentiel',nextAt:3};if(paid<10)return {key:'promo',label:'Tarif préférentiel',paidCount:paid,remaining:Math.max(0,10-paid),nextLabel:'Tarif normal',nextAt:10};return {key:'base',label:'Tarif normal',paidCount:paid,remaining:0,nextLabel:'Tarif normal',nextAt:10};}
function tierFromOffer(offer){const key=tierKey(offer);const paid=key==='launch'?0:key==='promo'?3:10;return {...tierForCount(paid),key,label:key==='launch'?'Prix coûtant · lancement':key==='promo'?'Tarif préférentiel':'Tarif normal'};}
function tierKey(o){const value=`${o?.id||''} ${o?.name||''}`.normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();if(/launch|lancement|coutant/u.test(value))return 'launch';if(/promo|preferentiel/u.test(value))return 'promo';if(/standard|base|normal/u.test(value))return 'base';return o?.active?'base':'';}
function resolveTierOffer(variants,key){return variants.find(x=>tierKey(x)===key)||variants.find(x=>x.active)||variants[0]||null;}
function pricingForVariants(variants,tier,effective){const by={};for(const v of variants){const k=tierKey(v);if(k)by[k]=Number(v.clientPriceCents||0);}return {tierKey:tier.key,tierLabel:tier.label,paidCount:tier.paidCount,remaining:tier.remaining,nextLabel:tier.nextLabel,currentPriceCents:Number(effective.clientPriceCents||0),launchPriceCents:by.launch||0,promoPriceCents:by.promo||0,basePriceCents:by.base||Number(effective.clientPriceCents||0)};}
function formatImage(slug){return String(slug||'').includes('hors')?'/assets/posters/hors-norme-wide.webp':'/assets/posters/concept-libre-wide.webp';}
function configurationOption(formatSlug,label){const n=String(label||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase(),hn=String(formatSlug||'').includes('hors');let image='',imageBase64='';if(hn){imageBase64=n.includes('canap')?'/assets/formats/exact-hn2.b64':'/assets/formats/exact-hn1.b64';}else if(n.includes('plateau'))imageBase64='/assets/formats/exact-cl1.b64';else if(n.includes('bar'))imageBase64='/assets/formats/exact-cl2.b64';else if(n.includes('chaise'))imageBase64='/assets/formats/exact-cl3.b64';else if(n.includes('canap'))image='/assets/posters/concept-libre-wide.webp';else image='/assets/posters/studio-wide.webp';return {label,image,imageBase64};}
async function prospectByToken(store,token){if(token.length<32)return null;const hash=await sha256(token),now=new Date().toISOString(),p=store.sql.exec(`SELECT p.id,p.client_id AS clientId,p.first_name AS firstName,p.last_name AS lastName,p.email,p.status,p.expires_at AS expiresAt,p.order_id AS orderId,c.full_name AS fullName,cp.phone FROM portal_prospects p JOIN portal_clients c ON c.id=p.client_id LEFT JOIN portal_client_profiles_v96 cp ON cp.client_id=c.id WHERE p.token_hash=? LIMIT 1`,hash).toArray()[0];return p&&p.expiresAt>now&&OPEN.has(p.status)?p:null;}
function upsertOpportunity(store,p,o,at){let x=store.sql.exec("SELECT id FROM portal_crm_opportunities_v86 WHERE prospect_id=? AND status NOT IN ('cancelled','converted') ORDER BY updated_at DESC LIMIT 1",p.id).toArray()[0]||{id:crypto.randomUUID()};const title=`Passage Neptune Media · ${o.cityName}`,exists=store.sql.exec('SELECT id FROM portal_crm_opportunities_v86 WHERE id=? LIMIT 1',x.id).toArray()[0];if(exists)store.sql.exec("UPDATE portal_crm_opportunities_v86 SET client_id=?,prospect_id=?,source_type='tunnel_v97',title=?,format=?,amount_total=?,currency=?,payment_mode='payment_pending',status='payment_pending',updated_at=? WHERE id=?",p.clientId,p.id,title,o.formatName,Number(o.clientPriceCents||0),o.currency||'eur',at,x.id);else store.sql.exec("INSERT INTO portal_crm_opportunities_v86(id,client_id,prospect_id,source_type,title,format,amount_total,currency,payment_mode,status,created_at,updated_at) VALUES(?,?,?,'tunnel_v97',?,?,?,?,'payment_pending','payment_pending',?,?)",x.id,p.clientId,p.id,title,o.formatName,Number(o.clientPriceCents||0),o.currency||'eur',at,at);return x.id;}
function decoratePaymentUrl(url,p,o,opportunityId,tier,choice){try{const u=new URL(url);u.searchParams.set('client_reference_id',`NPOPP_${opportunityId}`);u.searchParams.set('locked_prefilled_email',p.email);u.searchParams.set('utm_source','neptune_media_tunnel');u.searchParams.set('utm_medium','reservation_v97');u.searchParams.set('utm_campaign',String(o.id||'offer'));u.searchParams.set('tarif',tier);if(choice)u.searchParams.set('mobilier',choice);return u.toString();}catch{return url;}}
function isBusinessDay(value){if(!/^\d{4}-\d{2}-\d{2}$/u.test(value))return false;const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d),min=new Date();min.setHours(0,0,0,0);min.setDate(min.getDate()+1);if(date<min||date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d||date.getDay()===0||date.getDay()===6)return false;return !frenchHolidays(y).has(value);}
function frenchHolidays(year){const e=easterDate(year),set=new Set(['01-01','05-01','05-08','07-14','08-15','11-01','11-11','12-25'].map(md=>`${year}-${md}`));for(const n of [1,39,50]){const d=new Date(e);d.setDate(d.getDate()+n);set.add(iso(d));}return set;}
function easterDate(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31)-1,day=(h+l-7*m+114)%31+1;return new Date(year,month,day);}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
async function ensureStripeRedirectsV97(store){
  const row=store.sql.exec("SELECT value FROM portal_sales_runtime_v97 WHERE key='stripe_redirect_version' LIMIT 1").toArray()[0];
  if(row?.value===STRIPE_REDIRECT_VERSION)return {ok:true,synced:true};
  const secret=String(store.env?.STRIPE_SECRET_KEY||'').trim();if(!secret)return {ok:false,synced:false,error:'stripe_not_configured'};
  try{
    const listed=await fetch('https://api.stripe.com/v1/payment_links?limit=100',{headers:{Authorization:`Bearer ${secret}`,Accept:'application/json','User-Agent':'Neptune-Media-Worker/7.0.0'}}),data=await listed.json().catch(()=>({}));
    if(!listed.ok)return {ok:false,synced:false,error:'stripe_links_unavailable'};
    const wanted=[...new Set(store.sql.exec("SELECT payment_url AS url FROM portal_media_offers_v96 WHERE payment_url<>''").toArray().map(x=>baseUrl(x.url)).filter(Boolean))],links=data.data||[],matched=[];
    for(const url of wanted){const link=links.find(x=>baseUrl(x.url)===url);if(!link)continue;matched.push(url);if(link.after_completion?.type==='redirect'&&link.after_completion?.redirect?.url===STRIPE_REDIRECT_URL)continue;const form=new URLSearchParams();form.set('after_completion[type]','redirect');form.set('after_completion[redirect][url]',STRIPE_REDIRECT_URL);const updated=await fetch(`https://api.stripe.com/v1/payment_links/${encodeURIComponent(link.id)}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Neptune-Media-Worker/7.0.0'},body:form.toString()});if(!updated.ok)return {ok:false,synced:false,error:'stripe_redirect_update_failed'};}
    if(wanted.length&&matched.length===wanted.length){const at=new Date().toISOString();store.sql.exec("INSERT INTO portal_sales_runtime_v97(key,value,updated_at) VALUES('stripe_redirect_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",STRIPE_REDIRECT_VERSION,at);return {ok:true,synced:true,links:matched.length};}
    return {ok:false,synced:false,error:'stripe_links_not_all_matched',matched:matched.length,wanted:wanted.length};
  }catch(error){return {ok:false,synced:false,error:String(error?.message||'stripe_redirect_sync_failed')};}
}
function baseUrl(value){try{const u=new URL(String(value||''));return `${u.origin}${u.pathname}`.replace(/\/$/u,'');}catch{return '';}}
