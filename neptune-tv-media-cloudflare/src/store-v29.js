import { StudioStore as LegacyStore } from './store-v28.js';
import {
  mediaCatalogContextV98,
  saveMediaFormatV98,
  saveMediaSupplierV98,
  saveMediaCityV98,
  saveMediaOfferFamilyV98,
  saveMediaConfigurationVisualV98,
} from './portal-media-catalog-v98.js';
import {
  publicSalesCatalogV98,
  saveTunnelSelectionV98,
  startTunnelProspectV98,
  tunnelProspectContextV98,
} from './portal-sales-tunnel-v98.js';

export class StudioStore extends LegacyStore {
  async fetch(request){
    const url=new URL(request.url),method=request.method.toUpperCase();
    const body=async()=>request.clone().json().catch(()=>({}));
    if(url.pathname==='/portal/sales-tunnel-v96/catalog'&&method==='GET')return publicSalesCatalogV98(this);
    if(url.pathname==='/portal/sales-tunnel-v96/prospect-start'&&method==='POST')return startTunnelProspectV98(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/prospect-context'&&method==='POST')return tunnelProspectContextV98(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/selection'&&method==='POST')return saveTunnelSelectionV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/context')return mediaCatalogContextV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/format-save')return saveMediaFormatV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/supplier-save')return saveMediaSupplierV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/city-save')return saveMediaCityV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/family-save')return saveMediaOfferFamilyV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/configuration-visual-save')return saveMediaConfigurationVisualV98(this,await body());
    return super.fetch(request);
  }
}
