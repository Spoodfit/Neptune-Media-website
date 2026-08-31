import { json, sha256 } from './security.js';
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

export const SALES_CATALOG_RELEASE='neptune-sales-catalog-20260831-concept-first-v163';

export async function publicSalesCatalogV98(store){
  ensureMediaCatalogVisualsV98Schema(store);
  const response=await publicSalesCatalogGuardedV109(store),data=await response.json().catch(()=>({}));
  if(!response.ok)return json(data,response.status);
  enhanceCatalog(store,data);
  data.concepts=buildConcepts(data.cities||[]);
  data.journey={order:['company','concept','city','physical_format','date','payment'],release:'concept-city-format-v163'};
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
  if(response.ok&&data.prospectId){
    const company=companyContext(store,data.prospectId);
    if(company)data.contact={...(data.contact||{}),...company};
    if(isPendingEmail(data.contact?.email))data.contact.email='';
  }
  return json({...data,catalogRelease:SALES_CATALOG_RELEASE},response.status);
}

export async function saveTunnelSelectionV98(store,raw={}){
  ensureMediaCatalogVisualsV98Schema(store);
  const response=await saveTunnelSelectionGuardedV109(store,raw),data=await response.json().catch(()=>({}));
  if(response.ok&&data.selection)enhanceSelection(store,data.selection);
  if(response.ok&&data.paymentUrl&&await companyOnlyToken(store,raw?.token))data.paymentUrl=unlockPendingEmail(data.paymentUrl);
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

function buildConcepts(cities){
  const map=new Map();
  for(const city of cities){
    for(const format of city.formats||[]){
      let concept=map.get(format.id);
      if(!concept){
        concept={id:format.id,slug:format.slug,name:format.name,image:format.image||'',editorialLine:format.concept||'',description:format.description||'',durationLabel:format.durationLabel||'',cities:[]};
        map.set(format.id,concept);
      }
      const offer=(format.offers||[])[0]||null;
      concept.cities.push({id:city.id,slug:city.slug,name:city.name,country:city.country||'France',offerId:offer?.id||'',physicalFormats:(offer?.configurations||[]).map(x=>typeof x==='string'?{label:x}:x).filter(x=>x?.label)});
    }
  }
  return [...map.values()];
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

function companyContext(store,prospectId){
  try{
    const row=store.sql.exec(`SELECT p.company,c.company_query AS companyIdentity,c.website_hint AS websiteHint,c.enrichment_status AS enrichmentStatus
      FROM portal_prospects p LEFT JOIN portal_prospect_company_v163 c ON c.prospect_id=p.id WHERE p.id=? LIMIT 1`,prospectId).toArray()[0];
    if(!row)return null;
    return {company:row.company||'',companyIdentity:row.companyIdentity||row.company||'',websiteHint:row.websiteHint||'',enrichmentStatus:row.enrichmentStatus||'pending'};
  }catch{return null;}
}

async function companyOnlyToken(store,token){
  const raw=String(token||'');if(raw.length<32)return false;
  try{
    const hash=await sha256(raw);
    const row=store.sql.exec(`SELECT p.email,c.prospect_id AS companyProspect FROM portal_prospects p LEFT JOIN portal_prospect_company_v163 c ON c.prospect_id=p.id WHERE p.token_hash=? LIMIT 1`,hash).toArray()[0];
    return Boolean(row?.companyProspect&&isPendingEmail(row?.email));
  }catch{return false;}
}
function isPendingEmail(value){return String(value||'').toLowerCase().endsWith('@pending.neptune.invalid');}
function unlockPendingEmail(value){try{const url=new URL(value);url.searchParams.delete('locked_prefilled_email');return url.toString();}catch{return value;}}
