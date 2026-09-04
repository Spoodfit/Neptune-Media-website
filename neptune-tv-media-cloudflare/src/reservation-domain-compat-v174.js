import {json} from './security.js';

export const RESERVATION_DOMAIN_COMPAT_V174_RELEASE='neptune-reservation-domain-compat-20260904-v174';
const FINAL=new Set(['delivered','completed']);
const PAID=new Set(['paid','succeeded','complete','completed','no_payment_required']);

export function restoreCommercialProjectionFromSnapshotV174(store,orderId){
  const id=clean(orderId);
  if(!id)return null;
  const row=store.sql.exec('SELECT snapshot_json AS snapshotJson FROM portal_order_snapshots_v173 WHERE order_id=? LIMIT 1',id).toArray()[0]||null;
  const snapshot=parse(row?.snapshotJson);
  if(!snapshot)return null;
  const at=new Date().toISOString();
  const sales=store.sql.exec('SELECT order_id AS orderId FROM portal_order_sales_v96 WHERE order_id=? LIMIT 1',id).toArray()[0]||null;
  if(sales){
    store.sql.exec(`UPDATE portal_order_sales_v96 SET
      city_id=?,format_id=?,offer_id=?,supplier_id=?,city_name=?,format_name=?,offer_name=?,supplier_name=?,client_price_cents=?,currency=?,updated_at=?
      WHERE order_id=?`,
      clean(snapshot.city?.id),clean(snapshot.concept?.id),clean(snapshot.offer?.id),clean(snapshot.supplier?.id),
      text(snapshot.city?.name,160),text(snapshot.concept?.name,160),text(snapshot.offer?.name,160),text(snapshot.supplier?.name,160),
      Math.max(0,Number(snapshot.order?.paidAmountCents||snapshot.offer?.catalogPriceCents||0)),text(snapshot.order?.currency||snapshot.offer?.currency||'eur',12).toLowerCase(),at,id);
  }
  return snapshot;
}

export function restorePaidCommercialProjectionsV174(store,{limit=160}={}){
  const max=Math.max(1,Math.min(500,Number(limit||160)));
  const rows=store.sql.exec(`SELECT order_id AS orderId FROM portal_order_snapshots_v173 ORDER BY created_at DESC LIMIT ?`,max).toArray();
  let restored=0;
  for(const row of rows)if(restoreCommercialProjectionFromSnapshotV174(store,row.orderId))restored+=1;
  return{ok:true,release:RESERVATION_DOMAIN_COMPAT_V174_RELEASE,scanned:rows.length,restored};
}

export async function canonicalizeClientSessionV174(store,response){
  if(!response?.ok)return response;
  const data=await response.json().catch(()=>null);
  if(!data||!Array.isArray(data.orders))return response;
  for(const order of data.orders)canonicalizeOrder(order);
  data.orders.sort(activeOrderSort);
  data.activeReservationOrderId=data.orders.find(isActiveReservation)?.id||'';
  data.reservationDomainCompatRelease=RESERVATION_DOMAIN_COMPAT_V174_RELEASE;
  return json(data,response.status);
}

function canonicalizeOrder(order){
  const snapshot=order?.reservationSnapshot||null;
  const reservation=order?.reservation||null;
  if(snapshot){
    const original={format:order.format||'',amountTotal:Number(order.amountTotal||0),currency:order.currency||'',title:order.title||''};
    order.catalogProjection=original;
    order.format=snapshot.concept?.name||order.format||'';
    order.title=snapshot.order?.title||snapshot.concept?.name||order.title||'';
    order.amountTotal=Math.max(0,Number(snapshot.order?.paidAmountCents||order.amountTotal||0));
    order.currency=snapshot.order?.currency||order.currency||'eur';
    order.reservationConcept={
      id:snapshot.concept?.id||'',
      slug:snapshot.concept?.slug||'',
      name:snapshot.concept?.name||'',
      editorialLine:snapshot.concept?.editorialLine||'',
      description:snapshot.concept?.description||'',
      durationLabel:snapshot.concept?.durationLabel||'',
      shootMinutes:Number(snapshot.concept?.shootMinutes||0),
      totalMinutes:Number(snapshot.concept?.totalMinutes||0),
    };
    order.reservationCity={id:snapshot.city?.id||'',name:snapshot.city?.name||''};
    order.reservationPhysical={...snapshot.physical};
    order.reservationOffer={...snapshot.offer};
    order.reservationSupplier={...snapshot.supplier};
    order.configurationChoice=snapshot.physical?.label||order.configurationChoice||'';
  }
  if(reservation?.currentDate){
    const at=slotDateTime(reservation.currentDate,reservation.currentDaypart);
    order.filmingAt=at;
    order.confirmedFilmingAt=at;
  }
  if(reservation){
    order.reservationCancelled=reservation.status==='cancelled';
    order.reservationConflict=reservation.status==='conflict';
    order.reservationStatus=reservation.status||'';
    order.reservationDaypart=reservation.currentDaypart||'';
    order.reservationDate=reservation.currentDate||'';
  }
  if(PAID.has(String(order.paymentStatus||order.payment_status||'').toLowerCase()))order.paymentImmutable=true;
  return order;
}

function activeOrderSort(a,b){
  const aActive=isActiveReservation(a),bActive=isActiveReservation(b);
  if(aActive!==bActive)return aActive?-1:1;
  const aCancelled=a?.reservation?.status==='cancelled',bCancelled=b?.reservation?.status==='cancelled';
  if(aCancelled!==bCancelled)return aCancelled?1:-1;
  return orderTime(b)-orderTime(a);
}
function isActiveReservation(order){
  if(!order?.id)return false;
  if(order.reservation?.status==='cancelled')return false;
  return !FINAL.has(String(order.status||'').toLowerCase());
}
function orderTime(order){const value=Date.parse(order?.updatedAt||order?.updated_at||order?.createdAt||order?.created_at||'');return Number.isFinite(value)?value:0;}
function slotDateTime(date,daypart){const time=daypart==='afternoon'?'14:00:00':'09:00:00';return /^\d{4}-\d{2}-\d{2}$/u.test(String(date||''))?`${date}T${time}`:'';}
function parse(value){try{return JSON.parse(String(value||''));}catch{return null;}}
function clean(value){return String(value||'').trim().slice(0,160);}
function text(value,max){return String(value||'').trim().slice(0,max);}
