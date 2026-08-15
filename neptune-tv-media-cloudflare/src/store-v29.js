import { StudioStore as LegacyStore } from './store-v28.js';
import { json } from './security.js';
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
import {
  captureOrderSupplierSnapshotV120,
  handleProductionActionV120,
  reconcileSupplierPaymentFromSnapshotV120,
} from './portal-production-v120.js';
import { ensureProductionOfferSyncV120 } from './portal-production-offer-sync-v120.js';

const STUDIO_EMAIL='contact@neptunebusiness.com';
const RESET_WINDOW_MS=15*60*1000;
const RESET_LIMIT=3;
const RESET_RETENTION_MS=24*60*60*1000;

export class StudioStore extends LegacyStore {
  async fetch(request){
    const url=new URL(request.url),method=request.method.toUpperCase();
    const body=async()=>request.clone().json().catch(()=>({}));

    if(method==='POST'&&url.pathname==='/auth/request-reset'){
      const payload=await body();
      const email=String(payload.email||'').trim().toLowerCase();
      if(email===STUDIO_EMAIL){
        this.ensureResetRateLimitSchema();
        const now=new Date(),nowMs=now.getTime();
        const row=this.sql.exec('SELECT count,first_at FROM reset_email_attempts_v113 WHERE email=?',email).toArray()[0];
        const firstAt=row?new Date(row.first_at).getTime():NaN;
        if(row&&Number.isFinite(firstAt)&&nowMs-firstAt<RESET_WINDOW_MS){
          if(Number(row.count)>=RESET_LIMIT)return json({ok:true,throttled:true});
          this.sql.exec('UPDATE reset_email_attempts_v113 SET count=count+1,last_at=? WHERE email=?',now.toISOString(),email);
        }else{
          this.sql.exec('INSERT OR REPLACE INTO reset_email_attempts_v113 (email,count,first_at,last_at) VALUES (?,?,?,?)',email,1,now.toISOString(),now.toISOString());
        }
        this.sql.exec('DELETE FROM reset_email_attempts_v113 WHERE last_at<?',new Date(nowMs-RESET_RETENTION_MS).toISOString());
      }
    }

    if(url.pathname==='/portal/sales-tunnel-v96/catalog'&&method==='GET')return publicSalesCatalogV98(this);
    if(url.pathname==='/portal/sales-tunnel-v96/prospect-start'&&method==='POST')return startTunnelProspectV98(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/prospect-context'&&method==='POST')return tunnelProspectContextV98(this,await body());
    if(url.pathname==='/portal/sales-tunnel-v96/selection'&&method==='POST')return saveTunnelSelectionV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/context')return mediaCatalogContextV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/format-save'){
      const raw=await body(),payload=raw?.payload&&typeof raw.payload==='object'?raw.payload:raw;
      if(!(Number(payload?.totalMinutes)>0))return json({error:'total_duration_required'},400);
      return saveMediaFormatV98(this,raw);
    }
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/supplier-save')return saveMediaSupplierV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/city-save')return saveMediaCityV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/family-save'){
      ensureProductionOfferSyncV120(this);
      const raw=await body(),payload=raw?.payload&&typeof raw.payload==='object'?raw.payload:raw;
      if(String(payload.catalogAction||'').startsWith('production_'))return handleProductionActionV120(this,raw);
      if(!payload.catalogAction&&!payload.supplierRateId&&payload.cityId&&payload.formatId&&payload.supplierId){
        let mapped=null;
        try{
          mapped=this.sql.exec(`SELECT m.rate_id AS rateId FROM portal_media_offers_v96 o
            JOIN portal_offer_supplier_rate_v116 m ON m.offer_id=o.id
            WHERE o.city_id=? AND o.format_id=? AND o.supplier_id=? LIMIT 1`,payload.cityId,payload.formatId,payload.supplierId).toArray()[0]||null;
        }catch(error){
          if(!String(error?.message||'').includes('portal_offer_supplier_rate_v116'))throw error;
        }
        if(mapped?.rateId)payload.supplierRateId=mapped.rateId;
      }
      return saveMediaOfferFamilyV98(this,raw?.payload?{...raw,payload}:payload);
    }
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/configuration-visual-save')return saveMediaConfigurationVisualV98(this,await body());

    if(method==='POST'&&url.pathname==='/portal/admin-upsert'){
      const raw=await body();
      const response=await super.fetch(request);
      if(!response.ok)return response;
      const result=await response.clone().json().catch(()=>({}));
      if(!result.orderId)return response;
      const snapshot=captureOrderSupplierSnapshotV120(this,result.orderId,raw?.payload||{});
      if(!snapshot)return response;
      if(snapshot.ok===false)return json({...result,supplierSnapshotWarning:snapshot.error});
      return json({...result,supplierSnapshot:snapshot});
    }
    if(method==='POST'&&url.pathname==='/portal/admin-update'){
      const raw=await body();
      const response=await super.fetch(request);
      if(response.ok){
        const result=await response.clone().json().catch(()=>({}));
        const orderId=result.orderId||raw?.payload?.orderId||'';
        if(orderId)reconcileSupplierPaymentFromSnapshotV120(this,orderId);
      }
      return response;
    }
    return super.fetch(request);
  }

  ensureResetRateLimitSchema(){
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS reset_email_attempts_v113 (
        email TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        first_at TEXT NOT NULL,
        last_at TEXT NOT NULL
      );
    `);
  }
}
