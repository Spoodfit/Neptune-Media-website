export const STRIPE_CONFIRMATION_V146_RELEASE='neptune-stripe-confirmation-20260827-v146';
export const STRIPE_CONFIRMATION_URL='https://media.neptunebusiness.com/reserver/confirmation/?payment=success&session_id={CHECKOUT_SESSION_ID}';
const STATE_KEY='stripe_redirect_sync_v146';
const SUCCESS_RECHECK_MS=6*60*60*1000;
const FAILURE_RECHECK_MS=10*60*1000;

export async function ensureStripeConfirmationRedirectV146(store){
  ensureStateTable(store);
  const wanted=[...new Set(store.sql.exec("SELECT payment_url AS url FROM portal_media_offers_v96 WHERE payment_url<>'' AND active=1").toArray().map(row=>baseUrl(row.url)).filter(Boolean))].sort();
  if(!wanted.length)return{ok:true,synced:true,links:0,release:STRIPE_CONFIRMATION_V146_RELEASE};
  const fingerprint=wanted.join('|'),now=Date.now(),previous=readState(store);
  if(previous?.fingerprint===fingerprint){
    const age=now-Number(previous.checkedAt||0),limit=previous.success?SUCCESS_RECHECK_MS:FAILURE_RECHECK_MS;
    if(age>=0&&age<limit)return{ok:Boolean(previous.success),synced:Boolean(previous.success),cached:true,links:Number(previous.links||0),release:STRIPE_CONFIRMATION_V146_RELEASE};
  }
  const secret=String(store.env?.STRIPE_SECRET_KEY||'').trim();
  if(!secret){writeState(store,{fingerprint,checkedAt:now,success:false,links:0,error:'stripe_not_configured'});return{ok:false,synced:false,error:'stripe_not_configured',release:STRIPE_CONFIRMATION_V146_RELEASE};}
  try{
    const listed=await fetch('https://api.stripe.com/v1/payment_links?active=true&limit=100',{headers:{Authorization:`Bearer ${secret}`,Accept:'application/json','User-Agent':'Neptune-Media-Worker/8.0.0'}}),data=await listed.json().catch(()=>({}));
    if(!listed.ok)throw new Error(data.error?.message||`stripe_http_${listed.status}`);
    const links=Array.isArray(data.data)?data.data:[],matched=[];
    for(const wantedUrl of wanted){
      const link=links.find(item=>baseUrl(item?.url)===wantedUrl);if(!link)continue;
      matched.push(wantedUrl);
      if(link.after_completion?.type==='redirect'&&link.after_completion?.redirect?.url===STRIPE_CONFIRMATION_URL)continue;
      const form=new URLSearchParams();form.set('after_completion[type]','redirect');form.set('after_completion[redirect][url]',STRIPE_CONFIRMATION_URL);
      const updated=await fetch(`https://api.stripe.com/v1/payment_links/${encodeURIComponent(link.id)}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Neptune-Media-Worker/8.0.0'},body:form.toString()});
      if(!updated.ok){const error=await updated.json().catch(()=>({}));throw new Error(error.error?.message||`stripe_redirect_http_${updated.status}`);}
    }
    const success=matched.length===wanted.length;
    writeState(store,{fingerprint,checkedAt:now,success,links:matched.length,error:success?'':'stripe_links_not_all_matched'});
    return success?{ok:true,synced:true,links:matched.length,release:STRIPE_CONFIRMATION_V146_RELEASE,url:STRIPE_CONFIRMATION_URL}:{ok:false,synced:false,error:'stripe_links_not_all_matched',matched:matched.length,wanted:wanted.length,release:STRIPE_CONFIRMATION_V146_RELEASE};
  }catch(error){
    const message=String(error?.message||'stripe_redirect_sync_failed').slice(0,240);writeState(store,{fingerprint,checkedAt:now,success:false,links:0,error:message});
    console.error('stripe_confirmation_redirect_v146_failed',{error:message});
    return{ok:false,synced:false,error:message,release:STRIPE_CONFIRMATION_V146_RELEASE};
  }
}

function ensureStateTable(store){store.sql.exec('CREATE TABLE IF NOT EXISTS portal_sales_runtime_v97(key TEXT PRIMARY KEY,value TEXT NOT NULL DEFAULT \'\',updated_at TEXT NOT NULL)');}
function readState(store){const row=store.sql.exec('SELECT value FROM portal_sales_runtime_v97 WHERE key=? LIMIT 1',STATE_KEY).toArray()[0];if(!row?.value)return null;try{return JSON.parse(row.value);}catch{return null;}}
function writeState(store,state){const at=new Date().toISOString();store.sql.exec('INSERT INTO portal_sales_runtime_v97(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',STATE_KEY,JSON.stringify(state),at);}
function baseUrl(value){try{const url=new URL(String(value||''));return `${url.origin}${url.pathname}`.replace(/\/$/u,'');}catch{return'';}}
