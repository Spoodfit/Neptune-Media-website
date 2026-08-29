const RELEASE='neptune-studio-catalog-manager-bootstrap-20260829-v147.1';
let observer=null;
let interval=0;
let stopTimer=0;

document.documentElement.dataset.neptuneCatalogManagerBootstrap=RELEASE;

function catalogueActive(){
  const hash=String(location.hash||'').toLowerCase();
  const title=String(document.querySelector('#title')?.textContent||'').toLowerCase();
  return hash==='#programs'||title.includes('catalogue')||Boolean(document.querySelector('#studioCatalogCommercialCockpitV145'));
}

function ensureControls(){
  if(!catalogueActive())return false;
  const root=document.getElementById('studioCatalogCommercialCockpitV145');
  const toolbar=root?.querySelector('.v145-toolbar');
  if(!toolbar)return false;

  const add=toolbar.querySelector('[data-v145-add]');
  if(add){
    if(String(add.textContent||'').trim()!=='+ Ajouter')add.textContent='+ Ajouter';
    add.title='Ajouter une ville, un fournisseur, un concept, un format ou une offre';
  }

  if(!toolbar.querySelector('[data-v147-manage]')){
    const button=document.createElement('button');
    button.type='button';
    button.className='v145-btn v147-manage';
    button.dataset.v147Manage='1';
    button.textContent='Gérer';
    button.title='Gérer villes, fournisseurs, concepts, formats et offres';
    if(add)add.before(button);else toolbar.append(button);
  }

  return true;
}

function start(){
  ensureControls();
  observer?.disconnect();
  observer=new MutationObserver(()=>queueMicrotask(ensureControls));
  observer.observe(document.body,{subtree:true,childList:true});
  clearInterval(interval);
  interval=setInterval(()=>{if(ensureControls())clearInterval(interval);},160);
  clearTimeout(stopTimer);
  stopTimer=setTimeout(()=>clearInterval(interval),12000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
window.addEventListener('hashchange',()=>setTimeout(start,0));
