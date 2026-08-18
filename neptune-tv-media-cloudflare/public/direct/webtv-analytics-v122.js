const RELEASE='neptune-webtv-analytics-20260818-v122';
const SESSION_KEY='neptune:webtv:viewer:v122';
let publicCatalog={episodes:[],ads:[]};
let current=null;
let currentEpisode=null;
let currentAd=null;
let currentKey='';
let lastWatchAt=0;
let video=null;

boot().catch(error=>console.warn('webtv_analytics_v122_boot_failed',error));

async function boot(){
  document.documentElement.dataset.webTvAnalyticsV122=RELEASE;
  video=document.querySelector('video');
  publicCatalog=await fetch('/api/public/catalog',{cache:'no-store'}).then(r=>r.ok?r.json():({})).catch(()=>({}));
  bindClicks();
  bindVideo();
  await refreshState();
  setInterval(refreshState,10000);
  setInterval(trackWatch,15000);
}

async function refreshState(){
  const state=await fetch('/api/public/webtv/state',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
  if(!state)return;
  const next=state.current||null;
  const key=next?`${next.id||''}|${next.title||''}|${next.startedAt||''}`:'';
  if(key===currentKey)return;
  current=next;currentKey=key;lastWatchAt=Date.now();
  currentEpisode=matchEpisode(next,publicCatalog.episodes||[]);
  currentAd=matchAd(next,publicCatalog.ads||[]);
  if(currentEpisode)trackVideo('view',0);
  if(currentAd)trackAd('impression');
}

function bindVideo(){
  if(!video)return;
  video.addEventListener('play',()=>{if(currentEpisode)trackVideo('play',position());if(currentAd)trackAd('play');});
  video.addEventListener('ended',()=>{if(currentEpisode)trackVideo('complete',position());if(currentAd)trackAd('complete');});
}

function bindClicks(){
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link)return;
    const href=link.getAttribute('href')||'';
    if(currentEpisode&&/\/reserver(?:\/|\?|$)/u.test(href))trackVideo('booking_click',position());
    if(currentAd&&currentAd.clickUrl){
      try{const target=new URL(href,location.href),adUrl=new URL(currentAd.clickUrl,location.href);if(target.href===adUrl.href)trackAd('click');}catch{}
    }
  },{capture:true});
}

function trackWatch(){
  if(!currentEpisode||document.hidden)return;
  if(video&&video.paused)return;
  const now=Date.now();
  const delta=Math.min(20,Math.max(5,Math.round((now-(lastWatchAt||now-15000))/1000)));
  lastWatchAt=now;
  trackVideo('watch',position(),delta);
}

function matchEpisode(item,episodes){
  if(!item)return null;
  const id=String(item.id||'');
  const exact=episodes.find(ep=>String(ep.id||'')===id);if(exact)return exact;
  const title=normalize(item.title);if(!title)return null;
  const matches=episodes.filter(ep=>normalize(ep.title)===title);return matches.length===1?matches[0]:null;
}
function matchAd(item,ads){
  if(!item||String(item.type||'')!=='ad')return null;
  const id=String(item.id||'');const exact=ads.find(ad=>String(ad.id||'')===id);if(exact)return exact;
  const title=normalize(item.title);const matches=ads.filter(ad=>normalize(ad.name||ad.title)===title);return matches.length===1?matches[0]:null;
}
function normalize(value){return String(value||'').trim().toLocaleLowerCase('fr-FR');}
function position(){return Math.max(0,Math.round(Number(video?.currentTime||0)));}
function sessionId(){let value=sessionStorage.getItem(SESSION_KEY);if(!value){value=`webtv:${crypto.randomUUID()}`;sessionStorage.setItem(SESSION_KEY,value);}else if(!value.startsWith('webtv:')){value=`webtv:${value}`;sessionStorage.setItem(SESSION_KEY,value);}return value;}
function device(){return{surface:'webtv',width:innerWidth,height:innerHeight,touch:navigator.maxTouchPoints>0,embedded:window.self!==window.top,userAgent:navigator.userAgent.slice(0,220)};}
function trackVideo(event,positionSeconds=0,delta=0){
  if(!currentEpisode?.id)return;
  send('/api/track',{event,episodeId:String(currentEpisode.id),sessionId:sessionId(),position:positionSeconds,delta,referrer:document.referrer||'',device:device()});
}
function trackAd(event){if(!currentAd?.id)return;send('/api/ad-track',{event,adId:String(currentAd.id),episodeId:currentEpisode?.id?String(currentEpisode.id):'',sessionId:sessionId()});}
function send(path,payload){fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true,credentials:'same-origin'}).catch(()=>{});}
