import { requireClient } from './portal-auth.js';
import { ensureSalesTunnelV96Schema } from './portal-sales-tunnel-v96.js';
import { saveTunnelSelectionV98 } from './portal-sales-tunnel-v98.js';
import { json, randomToken, sha256 } from './security.js';
import {
  EFFECTIVE_OFFER_V181_RELEASE,
  effectiveOfferForFormatV181,
  reserveEffectiveOfferHoldV181,
} from './effective-offer-v181.js';

export const CLIENT_DIRECT_BOOKING_RELEASE='neptune-client-direct-booking-20260905-v118.5-v181';
const TOKEN_TTL_SECONDS=7*24*60*60;
const SOURCE='neptune_media_tunnel_v1185_client';

export async function prepareClientDirectBookingV1185(store,raw={}){
  ensureSalesTunnelV96Schema(store);
  const client=await requireClient(store,String(raw.token||''));
  if(!client)return json({error:'unauthorized'},401);

  const payload=raw?.payload&&typeof raw.payload==='object'?raw.payload:{};
  if(!payload.cityId||!payload.formatId||!payload.offerId||!payload.requestedDate||!payload.requestedDaypart){
    return json({error:'reservation_fields_required'},400);
  }

  const preview=effectiveOfferForFormatV181(store,payload.cityId,payload.formatId);
  if(!preview)return tierError('offer_capacity_exhausted');
  if(String(preview.id)!==String(payload.offerId))return tierError('offer_tier_changed',preview);

  const reservationToken=randomToken(32);
  const tokenHash=await sha256(reservationToken);
  const now=new Date();
  const at=now.toISOString();
  const expiresAt=new Date(now.getTime()+TOKEN_TTL_SECONDS*1000).toISOString();
  const names=clientNames(client);

  let prospect=store.sql.exec(`SELECT id FROM portal_prospects
    WHERE client_id=? AND source=? AND status IN ('captured','tunnel_started') AND expires_at>?
    ORDER BY updated_at DESC LIMIT 1`,client.id,SOURCE,at).toArray()[0]||null;

  if(prospect){
    store.sql.exec(`UPDATE portal_prospects SET first_name=?,last_name=?,company=?,email=?,token_hash=?,status='captured',intent='book_passage',expires_at=?,updated_at=? WHERE id=?`,
      names.firstName,names.lastName,client.company||'',client.email,tokenHash,expiresAt,at,prospect.id);
  }else{
    prospect={id:crypto.randomUUID()};
    store.sql.exec(`INSERT INTO portal_prospects(id,client_id,first_name,last_name,company,email,token_hash,status,source,intent,consent_at,expires_at,created_at,updated_at,tunnel_started_at,paid_at,order_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)`,
      prospect.id,client.id,names.firstName,names.lastName,client.company||'',client.email,tokenHash,'captured',SOURCE,'book_passage',at,expiresAt,at,at);
    store.sql.exec(`INSERT INTO portal_reservation_intents_v96(prospect_id,status,created_at,updated_at)
      VALUES(?,'contact_captured',?,?)`,prospect.id,at,at);
  }

  const hold=reserveEffectiveOfferHoldV181(store,{prospectId:prospect.id,offerId:payload.offerId});
  if(!hold.ok)return tierError(hold.error,hold);

  const selectionResponse=await saveTunnelSelectionV98(store,{...payload,token:reservationToken});
  const result=await selectionResponse.json().catch(()=>({}));
  if(!selectionResponse.ok)return json({...result,directClientBooking:true,release:CLIENT_DIRECT_BOOKING_RELEASE,effectiveOfferRelease:EFFECTIVE_OFFER_V181_RELEASE},selectionResponse.status);

  store.sql.exec(`UPDATE portal_prospects SET status='tunnel_started',tunnel_started_at=COALESCE(tunnel_started_at,?),updated_at=? WHERE id=?`,at,at,prospect.id);
  return json({...result,directClientBooking:true,release:CLIENT_DIRECT_BOOKING_RELEASE,effectiveOfferRelease:EFFECTIVE_OFFER_V181_RELEASE},selectionResponse.status);
}

function tierError(error,effective={}){
  return json({
    error,
    effectiveOfferId:effective.effectiveOfferId||effective.id||'',
    effectiveTierCode:effective.effectiveTierCode||effective.tierCode||'',
    effectivePriceCents:Number(effective.effectivePriceCents||effective.clientPriceCents||0),
    remainingPlaces:effective.remainingPlaces??null,
    directClientBooking:true,
    release:CLIENT_DIRECT_BOOKING_RELEASE,
    effectiveOfferRelease:EFFECTIVE_OFFER_V181_RELEASE,
  },409);
}

function clientNames(client){
  const fullName=String(client?.fullName||'').replace(/\s+/gu,' ').trim();
  const parts=fullName.split(' ').filter(Boolean);
  if(parts.length>=2)return {firstName:parts.shift(),lastName:parts.join(' ')};
  if(parts.length===1)return {firstName:parts[0],lastName:'Client'};
  const local=String(client?.email||'client').split('@')[0].split(/[._-]+/u).filter(Boolean);
  const first=local[0]||'Client';
  const last=local.slice(1).join(' ')||'Neptune';
  return {firstName:title(first),lastName:title(last)};
}
function title(value){return String(value||'').replace(/^./u,char=>char.toUpperCase());}
