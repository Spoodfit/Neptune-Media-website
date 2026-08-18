const RELEASE='neptune-studio-catalog-ux-20260819-v122.1';
const TABS={
  formats:{label:'Formats',summary:'formats'},
  configurations:{label:'Configurations',summary:'configurations'},
  offers:{label:'Tarifs & offres',summary:'offers'},
  suppliers:{label:'Fournisseurs',summary:'suppliers'},
  cities:{label:'Villes',summary:'cities'},
};
let snapshotTimer=0;
let snapshotLoading=false;

boot();

function boot(){
  document.body.dataset.studioCatalogUx=RELEASE;
  ensureCascadeOrder();
  enhance();
  new MutationObserver(()=>scheduleEnhance()).observe(document.body,{subtree:true,childList:true});
  window.addEventListener('hashchange',scheduleEnhance);
  document.addEventListener('click',handleClick,true);
  document.addEventListener('submit',event=>{
    if(event.target.closest('.c98-page'))scheduleSnapshot(1100,true);
  },true);
}

function ensureCascadeOrder(){
  const link=[...document.querySelectorAll('link[rel="stylesheet"]')].find(node=>node.href.includes('/studio/studio-catalog-ux-v122-1.css'));
  if(!link||link.dataset.catalogCascadeV1221==='last')return;
  link.dataset.catalogCascadeV1221='last';
  document.head.append(link);
}

let enhanceTimer=0;
function scheduleEnhance(){
  clearTimeout(enhanceTimer);
  enhanceTimer=setTimeout(()=>{
    ensureCascadeOrder();
    enhance();
  },35);
}

function active(){
  return location.pathname.includes('/studio/advanced')&&(location.hash||'#programs')==='#programs';
}

function enhance(){
  if(!active())return;
  const page=document.querySelector('.c98-page');
  if(!page)return;
  page.dataset.catalogUxV1221='ready';

  const hero=page.querySelector('.c98-hero');
  if(hero){
    const eyebrow=hero.querySelector('.c98-eyebrow');
    const description=hero.querySelector('div:first-child > p:last-child');
    const sync=hero.querySelector('.c98-sync');
    const tunnel=hero.querySelector('.c98-hero-actions a[href^="/reserver"]');
    if(eyebrow)eyebrow.textContent='CATALOGUE CLIENT';
    if(description)description.textContent='Gérez ici exactement ce que le client peut réserver : formats, configurations, tarifs, fournisseurs et villes. Les changements sont répercutés dans le tunnel.';
    if(sync)sync.childNodes[sync.childNodes.length-1].textContent=' Tunnel synchronisé';
    if(tunnel){
      tunnel.textContent='Voir le tunnel client ↗';
      tunnel.setAttribute('aria-label','Voir le tunnel de réservation côté client');
    }
  }

  const tabs=page.querySelector('.c98-tabs');
  if(tabs){
    Object.entries(TABS).forEach(([key,config])=>{
      const button=tabs.querySelector(`[data-c98-tab="${key}"]`);
      if(button)button.textContent=config.label;
    });
    installGlance(page,tabs);
    updateGlanceSelection(page);
  }

  page.querySelectorAll('[data-preview]').forEach(button=>{
    button.textContent='Voir dans le tunnel ↗';
    button.title='Ouvrir cette offre dans le tunnel client';
  });
}

function installGlance(page,tabs){
  let glance=page.querySelector('#studioCatalogGlanceV1221');
  if(!glance){
    glance=document.createElement('section');
    glance.id='studioCatalogGlanceV1221';
    glance.className='v122-catalog-glance';
    glance.setAttribute('aria-label','Vue d’ensemble et raccourcis du catalogue');
    glance.innerHTML=Object.entries(TABS).map(([key,config])=>`<button type="button" data-v122-catalog-tab="${key}"><small>${config.label}</small><strong data-v122-catalog-value="${config.summary}">—</strong><b aria-hidden="true">→</b></button>`).join('');
    tabs.before(glance);
    scheduleSnapshot(0,true);
  }
}

function updateGlanceSelection(page=document){
  const activeTab=page.querySelector('[data-c98-tab].is-active')?.dataset.c98Tab||'formats';
  page.querySelectorAll('[data-v122-catalog-tab]').forEach(button=>{
    const selected=button.dataset.v122CatalogTab===activeTab;
    button.classList.toggle('is-active',selected);
    if(selected)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
  });
}

function handleClick(event){
  if(!active())return;
  const shortcut=event.target.closest('[data-v122-catalog-tab]');
  if(shortcut){
    const target=document.querySelector(`[data-c98-tab="${shortcut.dataset.v122CatalogTab}"]`);
    target?.click();
    target?.focus({preventScroll:true});
    return;
  }

  const preview=event.target.closest('[data-preview]');
  if(preview?.dataset.preview){
    const params=new URLSearchParams({catalog_preview:'studio',catalog_view:'format',catalog_family:preview.dataset.preview});
    window.open(`/reserver?${params}`,'_blank','noopener');
  }
}

function scheduleSnapshot(delay=0,force=false){
  clearTimeout(snapshotTimer);
  snapshotTimer=setTimeout(()=>loadSnapshot(force),delay);
}

async function loadSnapshot(force=false){
  const glance=document.querySelector('#studioCatalogGlanceV1221');
  if(!active()||!glance||snapshotLoading)return;
  const last=Number(glance.dataset.updatedAt||0);
  if(!force&&Date.now()-last<15000)return;
  snapshotLoading=true;
  try{
    const response=await fetch('/api/admin/media-catalog-v98/context',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},
      body:'{}',
    });
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const context=await response.json();
    const formats=array(context.formats);
    const families=array(context.families);
    const suppliers=array(context.suppliers);
    const cities=array(context.cities);
    const configurations=families.reduce((sum,family)=>sum+array(family.configurationVisuals).length,0);
    const values={
      formats:countLabel(formats.filter(item=>item.active!==false).length,'actif','actifs'),
      configurations:countLabel(configurations,'choix','choix'),
      offers:countLabel(families.filter(item=>item.active!==false).length,'publiée','publiées'),
      suppliers:countLabel(suppliers.filter(item=>item.active!==false).length,'actif','actifs'),
      cities:countLabel(cities.filter(item=>item.active!==false).length,'active','actives'),
    };
    Object.entries(values).forEach(([key,value])=>{
      const node=glance.querySelector(`[data-v122-catalog-value="${key}"]`);
      if(node)node.textContent=value;
    });
    glance.dataset.updatedAt=String(Date.now());
  }catch{
    glance.querySelectorAll('[data-v122-catalog-value]').forEach(node=>{
      if(node.textContent==='—')node.textContent='Disponible';
    });
  }finally{
    snapshotLoading=false;
  }
}

function countLabel(value,singular,plural){
  return `${value} ${value===1?singular:plural}`;
}
function array(value){return Array.isArray(value)?value:[];}