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
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/family-save')return saveMediaOfferFamilyV98(this,await body());
    if(method==='POST'&&url.pathname==='/portal/media-catalog-v98/configuration-visual-save')return saveMediaConfigurationVisualV98(this,await body());
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
