const RELEASE='neptune-client-passage-deeplink-20260814-v118';
if(location.pathname.includes('/espace-client/videos'))start();

function start(){
  document.documentElement.dataset.clientPassageDeeplink=RELEASE;
  const passage=new URLSearchParams(location.search).get('passage');
  if(!passage)return;
  let attempts=0;
  const open=()=>{
    attempts+=1;
    const button=[...document.querySelectorAll('[data-passage-id]')].find(item=>String(item.dataset.passageId||'')===passage);
    if(button){
      if(button.getAttribute('aria-pressed')!=='true')button.click();
      button.scrollIntoView({block:'nearest',inline:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      return;
    }
    if(attempts<50)setTimeout(open,100);
  };
  open();
}
