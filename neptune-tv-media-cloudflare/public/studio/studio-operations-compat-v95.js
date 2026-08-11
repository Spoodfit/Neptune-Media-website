const RELEASE='neptune-studio-operations-compat-20260811-v95';
let scheduled=false;
start();
function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}
function boot(){document.body.dataset.studioOperationsCompatRelease=RELEASE;enhance();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});}
function enhance(){bridgeManagerButton();bridgeManagerSearch();}
function bridgeManagerButton(){
  if(document.getElementById('openClientManager'))return;
  const current=document.getElementById('manageClientAccounts');
  if(!current)return;
  const alias=document.createElement('button');
  alias.id='openClientManager';alias.type='button';alias.hidden=true;alias.tabIndex=-1;alias.setAttribute('aria-hidden','true');alias.dataset.v95ManagerBridge='';
  alias.addEventListener('click',()=>current.click());
  current.insertAdjacentElement('afterend',alias);
}
function bridgeManagerSearch(){
  const currentDialog=document.getElementById('studioClientAccountsDialog');
  const currentInput=currentDialog?.querySelector('.studio-client-accounts-tools input[type="search"]');
  if(!currentDialog||!currentInput)return;
  currentDialog.dataset.clientManager='v95';
  let bridge=document.getElementById('clientManagerDialog');
  if(!bridge){
    bridge=document.createElement('div');bridge.id='clientManagerDialog';bridge.hidden=true;bridge.setAttribute('aria-hidden','true');bridge.dataset.v95ManagerSearchBridge='';
    bridge.innerHTML='<input type="search" tabindex="-1" aria-hidden="true">';
    document.body.append(bridge);
    bridge.querySelector('input').addEventListener('input',event=>{currentInput.value=event.target.value||'';currentInput.dispatchEvent(new Event('input',{bubbles:true}));});
  }
}
