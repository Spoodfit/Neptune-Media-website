import { json } from './security.js';
import {
  startTunnelProspectV97,
  tunnelProspectContextV97,
} from './portal-sales-tunnel-v97.js';
import {
  publicSalesCatalogGuardedV109,
  saveTunnelSelectionGuardedV109,
  SALES_TUNNEL_GUARD_RELEASE,
} from './portal-sales-tunnel-v109-guard.js';
import {
  MEDIA_CATALOG_VISUALS_RELEASE,
  ensureMediaCatalogVisualsV98Schema,
  formatVisualV98,
  configurationVisualV98,
} from './media-catalog-visuals-v98.js';
import {
  ensureStripeConfirmationRedirectV146,
  STRIPE_CONFIRMATION_V146_RELEASE,
  STRIPE_CONFIRMATION_URL,
} from './stripe-redirect-v146.js';

export const SALES_CATALOG_RELEASE='neptune-sales-catalog-20260811-v98';

export async function publicSalesCatalogV98(store){
  ensureMediaCatalogVisualsV98Schema(store);
  const response=await publicSalesCatalogGuardedV109(store),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  enhanceCatalog(store,data);
  const stripeConfirmation=await ensureStripeConfirmationRedirectV146(store);
  return json({...data,catalogRelease:SALES_CATALOG_RELEASE,visualsRelease:MEDIA_CATALOG_VISUALS_RELEASE,dataGuardRelease:SALES_TUNNEL_GUARD_RELEASE,stripeConfirmation:{release:STRIPE_CONFIRMATION_V146_RELEASE,url:STRIPE_CONFIRMATION_URL,synced:Boolean(stripeConfirmation?.synced)}});
}

export async function startTunnelProspectV98(store,raw={}){
  ensureMediaCatalogVisualsV98Schema(store);
  const response=await startTunnelProspectV97(store,raw),data=await response.json().catch(()=>({}));
  return json({...data,catalogRelease:SALES_CATALOG_RELEASE},response.status);
}

export async function tunnelProspectContextV98(store,raw={}){
  ensureMediaCatalogVisualsV98Schema(store);
  const response=await tunnelProspectContextV97(store,raw),data=await response.json().catch(()=>({}));
  if(response.ok&&data.selection)enhanceSelection(store,data.selection);
  return json({...data,catalogRelease:SALES_CATALOG_RELEASE},response.status);
}

export async function saveTunnelSelectionV98(store,raw={}){
  ensureMediaCatalogVisualsV98Schema(store);
  const response=await saveTunnelSelectionGuardedV109(store,raw),data=await response.json().catch(()=>({}));
  if(response.ok&&data.selection)enhanceSelection(store,data.selection);
  return json({...data,catalogRelease:SALES_CATALOG_RELEASE,dataGuardRelease:SALES_TUNNEL_GUARD_RELEASE},response.status);
}

function enhanceCatalog(store,data){
  for(const city of data.cities||[]){
    for(const format of city.formats||[]){
      format.image=formatVisualV98(store,format.id,format.slug).image;
      for(const offer of format.offers||[]){
        offer.configurations=(offer.configurations||[]).map(option=>{
          const label=typeof option==='string'?option:option?.label;
          return label?configurationVisualV98(store,format.id,format.slug,label):option;
        });
      }
    }
  }
}

function enhanceSelection(store,selection){
  const format=selection.format||{};
  if(format.id)format.image=formatVisualV98(store,format.id,format.slug).image;
  const offer=selection.offer||{};
  if(format.id&&Array.isArray(offer.configurations)){
    offer.configurations=offer.configurations.map(option=>{
      const label=typeof option==='string'?option:option?.label;
      return label?configurationVisualV98(store,format.id,format.slug,label):option;
    });
  }
}
