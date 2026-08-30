const RELEASE='neptune-studio-catalog-commandbar-20260830-v151';
const BAR_ID='v151CatalogCommandBar';
let timer=0;

document.documentElement.dataset.neptuneCatalogCommandbar=RELEASE;
boot();

function boot(){
  const run=()=>{
    schedule(0);
    new MutationObserver(()=>schedule(40)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
    window.addEventListener('hashchange',()=>schedule(0));
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
}

function schedule(delay=40){clearTimeout(timer);timer=setTimeout(mount,delay)}

function isCatalog(){
  const hash=String(location.hash||'').toLowerCase();
  const section=new URLSearchParams(location.search).get('studio_section');
  const title=String(document.querySelector('#title')?.textContent||'').toLowerCase();
  return hash==='#programs'||section==='catalog'||title.includes('catalogue')||Boolean(document.querySelector('#studioCatalogHierarchyV133,#studioCatalogCommercialCockpitV145'));
}

function mount(){
  const content=document.querySelector('#content');
  if(!content)return;
  if(!isCatalog()){
    document.getElementById(BAR_ID)?.remove();
    document.body.classList.remove('v151-catalog-commandbar-active');
    return;
  }
  let bar=document.getElementById(BAR_ID);
  if(!bar){
    bar=document.createElement('section');
    bar.id=BAR_ID;
    bar.className='v151-commandbar';
    bar.innerHTML=`<div class="v151-commandbar-copy"><span>GESTION DU CATALOGUE</span><strong>Villes · fournisseurs · concepts · formats · offres</strong><small>Tout se gère ici. Chaque modification est ensuite contrôlée dans le tunnel de vente.</small></div><div class="v151-commandbar-actions"><a class="v151-secondary" href="/reserver/" target="_blank" rel="noopener">Voir le tunnel ↗</a><button type="button" class="v151-primary" data-v151-manage>Gérer le catalogue</button></div><div class="v151-commandbar-feedback" data-v151-feedback hidden></div>`;
    content.prepend(bar);
    bar.addEventListener('click',event=>{
      const button=event.target.closest('[data-v151-manage]');
      if(button)openManager(button,bar).catch(error=>showError(bar,error));
    });
  }else if(content.firstElementChild!==bar){
    content.prepend(bar);
  }
  document.body.classList.add('v151-catalog-commandbar-active');
}

async function openManager(button,bar){
  button.disabled=true;
  button.textContent='Ouverture…';
  clearFeedback(bar);
  try{
    let trigger=await waitForTrigger(1800);
    if(!trigger){
      document.querySelector('#refresh')?.click();
      trigger=await waitForTrigger(1800);
    }
    if(!trigger)throw new Error('Le gestionnaire du catalogue ne s’est pas initialisé. Rechargez cette page une fois.');
    trigger.click();
    await waitForDialog(2200);
  }finally{
    button.disabled=false;
    button.textContent='Gérer le catalogue';
  }
}

async function waitForTrigger(timeout){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const trigger=document.querySelector('[data-v147-manage]')||document.querySelector('[data-v145-add]');
    if(trigger)return trigger;
    await wait(60);
  }
  return null;
}

async function waitForDialog(timeout){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const dialog=document.querySelector('#v147CatalogManager');
    if(dialog?.open||(!dialog?.hidden&&dialog?.getBoundingClientRect?.().width>0))return dialog;
    await wait(60);
  }
  throw new Error('Le gestionnaire existe mais ne s’est pas affiché.');
}

function showError(bar,error){
  const feedback=bar.querySelector('[data-v151-feedback]');
  if(!feedback)return;
  feedback.hidden=false;
  feedback.textContent=error?.message||'Gestionnaire indisponible.';
}

function clearFeedback(bar){
  const feedback=bar.querySelector('[data-v151-feedback]');
  if(!feedback)return;
  feedback.hidden=true;
  feedback.textContent='';
}

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
