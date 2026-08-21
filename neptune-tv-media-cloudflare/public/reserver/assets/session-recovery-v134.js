(() => {
  const RELEASE='neptune-sales-tunnel-session-recovery-20260821-v134';
  const STORAGE='neptune_media_reservation_v96';
  const RECOVERABLE=new Set([
    'prospect_token_expired',
    'prospect_token_invalid',
    'prospect_token_missing',
    'prospect_not_found'
  ]);
  const nativeFetch=window.fetch.bind(window);

  function requestUrl(input){
    try{
      const value=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'');
      return new URL(value,location.href);
    }catch{return null;}
  }

  function isProspectContext(input){
    return requestUrl(input)?.pathname==='/api/reservation/prospect/context';
  }

  function cleanStaleSession(){
    try{localStorage.removeItem(STORAGE);}catch{}
    const url=new URL(location.href);
    let changed=false;
    for(const key of ['reservation_token','session_id','payment']){
      if(url.searchParams.has(key)){url.searchParams.delete(key);changed=true;}
    }
    if(changed)history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);
    document.body.dataset.salesTunnelSessionRecovery=RELEASE;
  }

  window.fetch=async function neptuneSessionAwareFetch(input,init){
    const response=await nativeFetch(input,init);
    if(!isProspectContext(input)||response.ok)return response;
    let payload={};
    try{payload=await response.clone().json();}catch{}
    const code=String(payload?.error||'');
    if(!RECOVERABLE.has(code))return response;
    cleanStaleSession();
    return new Response(JSON.stringify({ok:false,error:code,recovered:true}),{
      status:200,
      headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Neptune-Session-Recovered':code}
    });
  };

  window.__neptuneTunnelSessionRecoveryV134={release:RELEASE,cleanStaleSession};
})();
