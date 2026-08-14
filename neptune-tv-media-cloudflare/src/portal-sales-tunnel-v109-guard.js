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
  const seedId=sanitizeText(raw.offerId,120),cityId=sanitizeText(raw.cityId,120),formatId=sanitizeText(raw.formatId,120);
  if(!seedId||!cityId||!formatId)return json({error:'offer_not_available'},409);
  const seed=store.sql.exec(`SELECT id,city_id AS cityId,format_id AS formatId,supplier_id AS supplierId,active
    FROM portal_media_offers_v96 WHERE id=? LIMIT 1`,seedId).toArray()[0];
  if(!seed||!seed.active||seed.cityId!==cityId||seed.formatId!==formatId)return json({error:'offer_not_available'},409);
  const current=currentTierKey(store);
  const effective=store.sql.exec(`SELECT id,name,active FROM portal_media_offers_v96
    WHERE city_id=? AND format_id=? AND supplier_id=? AND payment_url<>'' ORDER BY public_order,name`,cityId,formatId,seed.supplierId).toArray()
    .find(row=>Boolean(row.active)&&tierKey(row)===current);
  if(!effective)return json({error:'offer_not_available',reason:'current_tier_inactive'},409);
  const next={...raw,offerId:effective.id};
  const response=await saveTunnelSelectionV97(store,next),data=await response.json().catch(()=>({}));
  return json({...data,dataGuardRelease:SALES_TUNNEL_GUARD_RELEASE},response.status);
}

function offerIsActive(store,id){
  if(!id)return false;
  return Boolean(store.sql.exec('SELECT active FROM portal_media_offers_v96 WHERE id=? LIMIT 1',String(id)).toArray()[0]?.active);
}
function currentTierKey(store){
  const paid=Number(store.sql.exec("SELECT COUNT(*) AS n FROM portal_prospects WHERE status='paid' AND order_id IS NOT NULL AND source LIKE 'neptune_media_tunnel_v%'").toArray()[0]?.n||0);
  return paid<3?'launch':paid<10?'promo':'base';
}
function tierKey(row){
  const value=`${row?.id||''} ${row?.name||''}`.normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();
  if(/launch|lancement|coutant/u.test(value))return 'launch';
  if(/promo|preferentiel/u.test(value))return 'promo';
  if(/standard|base|normal/u.test(value))return 'base';
  return '';
}
