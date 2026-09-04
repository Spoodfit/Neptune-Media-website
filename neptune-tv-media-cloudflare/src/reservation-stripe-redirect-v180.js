export const RESERVATION_STRIPE_REDIRECT_V180_RELEASE='neptune-reservation-stripe-redirect-20260905-v180';
export const RESERVATION_STRIPE_RETURN_URL='https://media.neptunebusiness.com/reserver?payment=success&session_id={CHECKOUT_SESSION_ID}';
const STATE_KEY='reservation_stripe_redirect_v180';
const LEGACY_STATE_KEY='stripe_redirect_version';
const LEGACY_STATE_VALUE='v97-confirmation-20260811';

export async function ensureCanonicalStripeRedirectV180(store){
  const state=store.sql.exec('SELECT value FROM portal_sales_runtime_v97 WHERE key=? LIMIT 1',STATE_KEY).toArray()[0];
  if(state?.value===RESERVATION_STRIPE_REDIRECT_V180_RELEASE)return{ok:true,synced:true,cached:true,returnUrl:RESERVATION_STRIPE_RETURN_URL};
  const secret=String(store.env?.STRIPE_SECRET_KEY||'').trim();
  if(!secret)return{ok:false,synced:false,error:'stripe_not_configured',returnUrl:RESERVATION_STRIPE_RETURN_URL};
  const wanted=[...new Set(store.sql.exec("SELECT payment_url AS url FROM portal_media_offers_v96 WHERE payment_url<>''").toArray().map(row=>baseUrl(row.url)).filter(Boolean))];
  if(!wanted.length)return{ok:true,synced:true,links:0,returnUrl:RESERVATION_STRIPE_RETURN_URL};
  try{
    const response=await fetch('https://api.stripe.com/v1/payment_links?limit=100',{headers:{Authorization:`Bearer ${secret}`,Accept:'application/json','User-Agent':'Neptune-Media-Worker/8.0.0'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return{ok:false,synced:false,error:'stripe_links_unavailable',returnUrl:RESERVATION_STRIPE_RETURN_URL};
    const links=Array.isArray(data.data)?data.data:[],matched=[];
    for(const wantedUrl of wanted){
      const link=links.find(item=>baseUrl(item?.url)===wantedUrl);
      if(!link)continue;
      matched.push(wantedUrl);
      if(link.after_completion?.type==='redirect'&&link.after_completion?.redirect?.url===RESERVATION_STRIPE_RETURN_URL)continue;
      const form=new URLSearchParams();
      form.set('after_completion[type]','redirect');
      form.set('after_completion[redirect][url]',RESERVATION_STRIPE_RETURN_URL);
      const updated=await fetch(`https://api.stripe.com/v1/payment_links/${encodeURIComponent(link.id)}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Neptune-Media-Worker/8.0.0'},body:form.toString()});
      if(!updated.ok)return{ok:false,synced:false,error:'stripe_redirect_update_failed',matched:matched.length,wanted:wanted.length,returnUrl:RESERVATION_STRIPE_RETURN_URL};
    }
    if(matched.length!==wanted.length)return{ok:false,synced:false,error:'stripe_links_not_all_matched',matched:matched.length,wanted:wanted.length,returnUrl:RESERVATION_STRIPE_RETURN_URL};
    const at=new Date().toISOString();
    store.sql.exec(`INSERT INTO portal_sales_runtime_v97(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,STATE_KEY,RESERVATION_STRIPE_REDIRECT_V180_RELEASE,at);
    // The legacy v97 synchronizer is frozen at its historical version. Mark it fulfilled so it cannot overwrite the canonical media.neptunebusiness.com target on a later catalog read.
    store.sql.exec(`INSERT INTO portal_sales_runtime_v97(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,LEGACY_STATE_KEY,LEGACY_STATE_VALUE,at);
    return{ok:true,synced:true,links:matched.length,returnUrl:RESERVATION_STRIPE_RETURN_URL};
  }catch(error){
    return{ok:false,synced:false,error:String(error?.message||'stripe_redirect_sync_failed').slice(0,180),returnUrl:RESERVATION_STRIPE_RETURN_URL};
  }
}

function baseUrl(value){
  try{const url=new URL(String(value||''));return`${url.origin}${url.pathname}`.replace(/\/$/u,'');}
  catch{return'';}
}
