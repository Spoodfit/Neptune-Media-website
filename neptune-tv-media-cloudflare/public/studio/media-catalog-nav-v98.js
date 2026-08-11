const RELEASE='neptune-media-catalog-nav-20260811-v98';
document.body.dataset.mediaCatalogNav=RELEASE;
let syncing=false;

function currentTab(){return decodeURIComponent(location.hash.slice(1)).trim()||'episodes';}
function legacy(tab){return document.querySelector(`#studioLegacyTabControlsV65 [data-tab="${CSS.escape(tab)}"], [data-tab="${CSS.escape(tab)}"]`);}
function setPrimarySettings(){
  const nav=document.querySelector('.neptune-studio-nav');if(!nav)return;
  for(const item of nav.querySelectorAll('[data-studio-route]')){
    const active=item.dataset.studioRoute==='settings';
    item.classList.toggle('active',active);
    if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  }
}
function catalogButton(active=false){
  const b=document.createElement('button');b.type='button';b.dataset.contextTab='programs';b.dataset.catalogV98='1';b.textContent='Catalogue Media';b.classList.toggle('active',active);
  b.addEventListener('click',()=>openTab('programs'));
  return b;
}
function openTab(tab){
  const button=legacy(tab);if(!button||button.hidden)return;
  if(location.hash!==`#${tab}`)history.replaceState(null,'',`#${tab}`);
  button.click();
  queueMicrotask(sync);
}
function settingsContext(context,active){
  const tabs=[['finances','Finances'],['users','Équipe'],['programs','Catalogue Media'],['audit','Journal'],['settings','Réglages']];
  context.innerHTML='';
  for(const [id,label] of tabs){
    const original=legacy(id);if(!original||original.hidden)continue;
    const b=document.createElement('button');b.type='button';b.dataset.contextTab=id;if(id==='programs')b.dataset.catalogV98='1';b.textContent=label;b.classList.toggle('active',id===active);b.addEventListener('click',()=>openTab(id));context.append(b);
  }
}
function sync(){
  if(syncing)return;syncing=true;
  try{
    document.querySelectorAll('[data-tab="programs"] strong,[data-go="programs"] strong').forEach(node=>{node.textContent='Catalogue Media';});
    const context=document.querySelector('.studio-context-nav-v65');if(!context)return;
    const tab=currentTab();
    if(tab==='programs'){
      setPrimarySettings();
      if(context.dataset.catalogSettingsV98!=='1'||!context.querySelector('[data-context-tab="programs"]')){
        settingsContext(context,'programs');context.dataset.catalogSettingsV98='1';
      }
      return;
    }
    context.removeAttribute('data-catalog-settings-v98');
    const isSettings=Boolean(context.querySelector('[data-context-tab="finances"],[data-context-tab="users"],[data-context-tab="settings"]'));
    if(isSettings&&!context.querySelector('[data-context-tab="programs"]')){
      const users=context.querySelector('[data-context-tab="users"]');
      const button=catalogButton(false);users?.after(button)||context.append(button);
    }
    context.querySelectorAll('[data-context-tab="programs"]').forEach(node=>{node.textContent='Catalogue Media';});
  }finally{syncing=false;}
}

sync();
new MutationObserver(sync).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
window.addEventListener('hashchange',sync);
