export const CLIENT_RESERVATION_TRUTH_V179_RELEASE='neptune-client-reservation-truth-20260904-v179';

export async function projectClientReservationTruthV179(response){
  if(!response?.ok)return response;
  const data=await response.json().catch(()=>null);
  if(!data||!Array.isArray(data.orders))return response;
  for(const order of data.orders)projectOrder(order);
  data.clientReservationTruthRelease=CLIENT_RESERVATION_TRUTH_V179_RELEASE;
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Neptune-Client-Reservation-Truth',CLIENT_RESERVATION_TRUTH_V179_RELEASE);
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

function projectOrder(order){
  const snapshot=order?.reservationSnapshot||null;
  const reservation=order?.reservation||null;
  if(snapshot){
    const concept=snapshot.concept||{},city=snapshot.city||{},physical=snapshot.physical||{},offer=snapshot.offer||{},supplier=snapshot.supplier||{},paid=snapshot.order||{};
    if(concept.name)order.format=concept.name;
    if(concept.name)order.formatName=concept.name;
    if(concept.id)order.formatId=concept.id;
    if(concept.slug)order.formatSlug=concept.slug;
    if(concept.editorialLine)order.formatConcept=concept.editorialLine;
    if(concept.description)order.formatDescription=concept.description;
    if(concept.durationLabel)order.formatDurationLabel=concept.durationLabel;
    if(city.name)order.cityName=city.name;
    if(city.id)order.cityId=city.id;
    if(physical.label){order.physicalFormat=physical.label;order.configurationChoice=physical.label;}
    if(physical.description)order.configurationDescription=physical.description;
    if(physical.imageUrl)order.configurationImageUrl=physical.imageUrl;
    if(offer.id)order.offerId=offer.id;
    if(offer.name)order.offerName=offer.name;
    if(supplier.id)order.supplierId=supplier.id;
    if(supplier.name)order.supplierName=supplier.name;
    if(paid.reference){order.reference=paid.reference;order.orderReference=paid.reference;}
    if(paid.title)order.title=paid.title;
    if(Number.isFinite(Number(paid.paidAmountCents)))order.amountTotal=Number(paid.paidAmountCents);
    if(paid.currency)order.currency=paid.currency;
    order.reservationSnapshotAuthoritative=true;
  }
  if(reservation){
    order.reservationStatus=reservation.status||'';
    order.reservationDate=reservation.currentDate||'';
    order.reservationDaypart=reservation.currentDaypart||'';
    order.workflow={...(order.workflow||{}),reservationStatus:reservation.status||'',requestedFilmingAt:reservation.currentDate||order.workflow?.requestedFilmingAt||'',requestedDaypart:reservation.currentDaypart||order.workflow?.requestedDaypart||''};
    if(reservation.currentDate)order.requestedFilmingAt=reservation.currentDate;
  }
  return order;
}
