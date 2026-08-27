import { json, sanitizeText } from './security.js';
import { publicSalesCatalogV97, saveTunnelSelectionV97 } from './portal-sales-tunnel-v97.js';
import { formatVisualV98 } from './media-catalog-visuals-v98.js';

export const SALES_TUNNEL_GUARD_RELEASE='neptune-sales-tunnel-data-guard-20260814-v118';

export async function publicSalesCatalogGuardedV109(store){
  const response=await publicSalesCatalogV97(store),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  for(const city of data.cities||[]){
    city.formats=(city.formats||[]).filter(format=>{
      format.offers=(format.offers||[]).filter(offer=>offerIsActive(store,offer?.id));
      if(format.id){
        const visual=formatVisualV98(store,String(format.id),String(format.slug||''));
        format.image=visual.image;
        format.imagePublicUrl=visual.image;
        format.visualSource=visual.imageSource;
      }
      return format.offers.length>0;
    });
  }
  data.cities=(data.cities||[]).filter(city=>(city.formats||[]).length>0);
  return json({...data,dataGuardRelease:SALES_TUNNEL_GUARD_RELEASE});
}

export async function saveTunnelSelectionGuardedV109(store,raw={}){
  const offerId=sanitizeText(raw.offerId,120),cityId=sanitizeText(raw.cityId,120),formatId=sanitizeText(raw.formatId,120);
  if(!offerId||!cityId||!formatId)return json({error:'offer_not_available'},409);
  const offer=store.sql.exec(`SELECT id,city_id AS cityId,format_id AS formatId,active,payment_url AS paymentUrl
    FROM portal_media_offers_v96 WHERE id=? LIMIT 1`,offerId).toArray()[0];
  if(!offer||!offer.active||!offer.paymentUrl||offer.cityId!==cityId||offer.formatId!==formatId)return json({error:'offer_not_available'},409);

  // v143 owns tier visibility/capacity and places a hold on raw.offerId before
  // this legacy data guard runs. Never remap the offer here: the held offer,
  // quoted price and payment target must remain the same commercial object.
  const response=await saveTunnelSelectionV97(store,raw),data=await response.json().catch(()=>({}));
  return json({...data,dataGuardRelease:SALES_TUNNEL_GUARD_RELEASE},response.status);
}

function offerIsActive(store,id){
  if(!id)return false;
  return Boolean(store.sql.exec('SELECT active FROM portal_media_offers_v96 WHERE id=? LIMIT 1',String(id)).toArray()[0]?.active);
}
