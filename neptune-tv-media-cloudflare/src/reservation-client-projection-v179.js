export const CLIENT_RESERVATION_TRUTH_V179_RELEASE='neptune-client-reservation-truth-20260905-v179.1';

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
    if(concept.name){order.format=concept.name;order.formatName=concept.name;}
    if(concept.id)order.formatId=concept.id;
    if(concept.slug)order.formatSlug=concept.slug;
    if(concept.editorialLine)order.formatConcept=concept.editorialLine;
    if(concept.description)order.formatDescription=concept.description;
    if(concept.durationLabel)order.formatDurationLabel=concept.durationLabel;
    if(Number(concept.shootMinutes||0)>0)order.shootMinutes=Number(concept.shootMinutes);
    if(Number(concept.totalMinutes||0)>0)order.totalMinutes=Number(concept.totalMinutes);
    if(city.name)order.cityName=city.name;
    if(city.id)order.cityId=city.id;
    if(physical.label){order.physicalFormat=physical.label;order.configurationChoice=physical.label;}
    if(physical.description)order.configurationDescription=physical.description;
    if(physical.imageUrl)order.configurationImageUrl=physical.imageUrl;
    if(offer.id)order.offerId=offer.id;
    if(offer.name)order.offerName=offer.name;
    if(Number.isFinite(Number(offer.catalogPriceCents)))order.catalogPriceCents=Number(offer.catalogPriceCents);
    if(supplier.id)order.supplierId=supplier.id;
    if(supplier.name)order.supplierName=supplier.name;
    if(paid.reference){order.reference=paid.reference;order.orderReference=paid.reference;}
    if(paid.title)order.title=paid.title;
    if(Number.isFinite(Number(paid.paidAmountCents)))order.amountTotal=Number(paid.paidAmountCents);
    if(paid.currency)order.currency=paid.currency;
    order.reservationSnapshotAuthoritative=true;
  }
  if(reservation){
    const status=String(reservation.status||'');
    const date=String(reservation.currentDate||'');
    const daypart=String(reservation.currentDaypart||'');
    const filmingAt=slotDateTime(date,daypart);
    order.reservationStatus=status;
    order.reservationDate=date;
    order.reservationDaypart=daypart;
    order.workflow={...(order.workflow||{}),reservationStatus:status,requestedFilmingAt:filmingAt||date||order.workflow?.requestedFilmingAt||'',requestedDaypart:daypart||order.workflow?.requestedDaypart||'',supplierStatus:supplierStatus(status,order.workflow?.supplierStatus)};
    if(status==='cancelled'){
      order.reservationCancelled=true;
      order.filmingAt='';
      order.requestedFilmingAt='';
      order.nextAction='Votre réservation de passage a été annulée. Contactez Neptune Media si vous souhaitez réserver un nouveau créneau.';
    }else{
      if(filmingAt){order.filmingAt=filmingAt;order.requestedFilmingAt=filmingAt;}
      if(status==='conflict')order.nextAction='Votre paiement est enregistré. Neptune régularise votre créneau et vous recontacte.';
    }
  }
  return order;
}

function slotDateTime(date,daypart){
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(String(date||'')))return'';
  const time=daypart==='afternoon'?'14:00:00':'09:00:00';
  return`${date}T${time}+02:00`;
}
function supplierStatus(status,fallback=''){
  if(status==='confirmed')return'confirmed';
  if(status==='pending')return'pending';
  if(status==='conflict')return'alternate_proposed';
  if(status==='cancelled')return'rejected';
  return fallback||'';
}
