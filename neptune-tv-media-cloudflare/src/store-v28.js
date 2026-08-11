import { StudioStore as LegacyStore } from './store-v27.js';
import { saveCityV96, startTunnelProspectV96 } from './portal-sales-tunnel-v96.js';
import {
  orderSalesContextWithOptionsV96,
  publicSalesCatalogWithOptionsV96,
  salesConfigurationWithOptionsV96,
  saveOfferWithOptionsV96,
  saveTunnelSelectionWithOptionsV96,
  tunnelProspectContextWithOptionsV96,
} from './portal-sales-tunnel-options-v96.js';

export class StudioStore extends LegacyStore {
  async fetch(request){
    const url=new URL(request.url),method=request.method.toUpperCase();
    const body=async()=>request.clone().json().catch(()=>({}));
    if(url.pathname==='/portal/sales-tunnel-v96/catalog'&&method==='GET')return publicSalesCatalogWithOptionsV96(this);
    if(url.pathname==='/portal/sales-tunnel-v96/prospect-start'&&method==='POST')return startTunnelProspectV96(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/prospect-context'&&method==='POST')return tunnelProspectContextWithOptionsV96(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/selection'&&method==='POST')return saveTunnelSelectionWithOptionsV96(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/configuration'&&method==='POST')return salesConfigurationWithOptionsV96(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/city-save'&&method==='POST')return saveCityV96(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/offer-save'&&method==='POST')return saveOfferWithOptionsV96(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/order-sales'&&method==='POST')return orderSalesContextWithOptionsV96(this,await body());
    return super.fetch(request);
  }
}
