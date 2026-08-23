const RELEASE='neptune-client-zero-flash-20260823-v136';
const root=document.documentElement;
const auth=document.getElementById('auth');
const dashboard=document.getElementById('dashboard');
const header=document.getElementById('publicHeader');
let done=false;
let timer=0;

root.dataset.neptuneClientZeroFlash=RELEASE;

function settled(){return Boolean(auth&&!auth.hidden)||Boolean(dashboard&&!dashboard.hidden);}
function reveal(reason='session-settled'){
  if(done)return;
  done=true;clearTimeout(timer);
  root.removeAttribute('data-neptune-client-boot');
  root.dataset.neptuneClientReady='v136';
  root.dataset.neptuneClientRevealReason=reason;
}
function inspect(){if(settled())reveal();}

const observer=new MutationObserver(inspect);
if(auth)observer.observe(auth,{attributes:true,attributeFilter:['hidden']});
if(dashboard)observer.observe(dashboard,{attributes:true,attributeFilter:['hidden']});
inspect();
timer=window.setTimeout(()=>{
  if(done)return;
  if(auth)auth.hidden=false;
  if(header)header.hidden=false;
  if(dashboard)dashboard.hidden=true;
  reveal('bounded-fallback');
},5000);
