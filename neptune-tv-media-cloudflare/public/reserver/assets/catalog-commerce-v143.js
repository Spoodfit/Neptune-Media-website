const RELEASE='neptune-reservation-catalog-commerce-20260825-v143';
const nativeFetch=window.fetch.bind(window);
let geoPromise=null;

document.documentElement.dataset.catalogCommerceV143=RELEASE;
window.fetch=async function(input,init){
  const url=typeof input==='string'?input:input?.url||'';
  const response=await nativeFetch(input,init);
  if(!response.ok||!String(url).includes('/api/reservation/catalog-v96'))return response;
  try{
    const data=await response.clone().json();if(!Array.isArray(data.cities))return response;
    const position=await locateUser();sortCities(data.cities,position);decorateOffers(data.cities);
    const headers=new Headers(response.headers);for(const h of ['Content-Length','Content-Encoding','ETag'])headers.delete(h);headers.set('X-Neptune-Catalog-Commerce-Client',RELEASE);
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }catch{return response;}
};

function locateUser(){if(geoPromise)return geoPromise;geoPromise=new Promise(resolve=>{if(!navigator.geolocation)return resolve(null);let settled=false;const finish=v=>{if(settled)return;settled=true;resolve(v)};navigator.geolocation.getCurrentPosition(p=>finish({lat:p.coords.latitude,lng:p.coords.longitude}),()=>finish(null),{enableHighAccuracy:false,timeout:1400,maximumAge:30*60*1000});setTimeout(()=>finish(null),1550);});return geoPromise;}
function sortCities(cities,pos){for(const city of cities){const lat=Number(city.latitude),lng=Number(city.longitude);city.distanceKm=pos&&Number.isFinite(lat)&&Number.isFinite(lng)?distance(pos.lat,pos.lng,lat,lng):null;}cities.sort((a,b)=>{if(pos){const da=Number.isFinite(a.distanceKm)?a.distanceKm:Infinity,db=Number.isFinite(b.distanceKm)?b.distanceKm:Infinity;if(da!==db)return da-db;}return String(a.name||'').localeCompare(String(b.name||''),'fr',{sensitivity:'base'});});}
function decorateOffers(cities){for(const city of cities)for(const format of city.formats||[])for(const offer of format.offers||[]){if(Number.isFinite(Number(offer.remainingPlaces))&&offer.remainingPlaces!==null)offer.availabilityLabel=Number(offer.remainingPlaces)===1?'Dernière place à ce tarif':`${offer.remainingPlaces} places à ce tarif`;}}
function distance(lat1,lon1,lat2,lon2){const r=6371,toRad=v=>v*Math.PI/180,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1),a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return Math.round(r*(2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)))*10)/10;}
