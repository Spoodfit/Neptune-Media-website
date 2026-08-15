import { StudioStore as LegacyStore } from './store-v29.js';
import { prepareClientDirectBookingV1185 } from './portal-client-direct-booking-v118-5.js';

export class StudioStore extends LegacyStore {
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/portal/client-direct-booking-v1185/prepare-payment'){
      const body=await request.json().catch(()=>({}));
      return prepareClientDirectBookingV1185(this,body);
    }
    return super.fetch(request);
  }
}
