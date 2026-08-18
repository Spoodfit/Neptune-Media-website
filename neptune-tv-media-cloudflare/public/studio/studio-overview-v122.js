const RELEASE='neptune-studio-overview-20260818-v122';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let settingsDetailTab='';

boot();

function boot(){
  document.documentElement.dataset.studioOverviewV122=RELEASE;
  installNavigation();
  applyMode();
  window.addEventListener('hashchange',()=>{settingsDetailTab='';installNavigation();applyMode();});
  const observer=new MutationObserver(()=>scheduleRefresh());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  let timer=0;
  function scheduleRefresh(){
    clearTimeout(timer);
    timer=setTimeout(()=>{installNavigation();applyMode();},40);
  }
}

function installNavigation(){
  const nav=$('.neptune-studio-nav')||$('.studio-nav');
  if(!nav||nav.dataset.v122Ready==='1'){
    updateActiveNavigation(nav);
    return;
  }
  nav.dataset.v122Ready='1';
  nav.setAttribute('aria-label','Navigation principale du Studio');
  nav.innerHTML=[
    navLink('/studio/clients','◎','Parcours clients','clients'),
    navLink('/studio/webtv.html','▶','Diffusion','diffusion'),
    navLink('/studio/advanced.html#programs','▦','Catalogue Média','catalogue'),
    navLink('/studio/advanced.html#finances','€','Finance','finance'),
    navLink('/studio/advanced.html#settings','⚙','Réglage','settings'),
  ].join('');
  updateActiveNavigation(nav);
}

function navLink(href,icon,label,key){
  return `<a class="neptune-studio-nav-link studio-nav-link v122-nav-link" href="${href}" data-studio-route="${key}" data-v122-route="${key}"><span class="neptune-studio-nav-icon" aria-hidden="true">${icon}</span><strong>${label}</strong></a>`;
}

function activeRoute(){
  const path=location.pathname;
  if(path.includes('/studio/clients'))return'clients';
  if(path.includes('/studio/webtv'))return'diffusion';
  if(path.includes('/studio/advanced')){
    const hash=(location.hash||'#programs').slice(1);
    if(hash==='programs')return'catalogue';
    if(hash==='finances')return'finance';
    if(['episodes','ads','insights','webtv'].includes(hash))return'diffusion';
    return'settings';
  }
  return'';
}

function updateActiveNavigation(nav=$('.neptune-studio-nav')||$('.studio-nav')){
  if(!nav)return;
  const active=activeRoute();
  $$('[data-v122-route]',nav).forEach(link=>{
    const selected=link.dataset.v122Route===active;
    link.classList.toggle('active',selected);
    if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
}

function applyMode(){
  const body=document.body;if(!body)return;
  body.classList.remove('v122-studio-catalog','v122-studio-finance','v122-studio-settings','v122-studio-settings-detail');
  if(!location.pathname.includes('/studio/advanced'))return;
  const hash=(location.hash||'#programs').slice(1);
  if(hash==='programs')body.classList.add('v122-studio-catalog');
  else if(hash==='finances')body.classList.add('v122-studio-finance');
  else if(['users','audit','settings'].includes(hash)){
    body.classList.add('v122-studio-settings');
    const detail=hash!=='settings'||Boolean(settingsDetailTab);
    if(detail)body.classList.add('v122-studio-settings-detail');
    installSettingsOverview(hash,detail);
  }
  normalizeHeading(hash);
}

function normalizeHeading(hash){
  const h1=$('.topbar h1,.neptune-studio-main h1');
  if(!h1)return;
  const desired=hash==='programs'?'Catalogue Média':hash==='finances'?'Finance':['users','audit','settings'].includes(hash)?'Réglage':'';
  if(desired&&h1.textContent!==desired)h1.textContent=desired;
}

async function installSettingsOverview(hash,detail=false){
  const content=$('#content');
  if(!content)return;
  let overview=$('#studioSettingsOverviewV122');
  if(!overview){
    overview=document.createElement('section');
    overview.id='studioSettingsOverviewV122';
    overview.className='v122-settings-overview';
    content.prepend(overview);
    overview.innerHTML='<div class="v122-overview-loading">Chargement des réglages…</div>';
    try{
      const response=await fetch('/api/admin/state',{credentials:'same-origin',headers:{'Cache-Control':'no-cache, no-store'}});
      const state=response.ok?await response.json():{};
      overview.innerHTML=settingsMarkup(state);
      bindSettingsActions(overview);
    }catch{
      overview.innerHTML=settingsMarkup({});
      bindSettingsActions(overview);
    }
  }
  overview.hidden=hash!=='settings'||detail;
  installSettingsBack(hash,content,detail);
}

function settingsMarkup(state){
  const users=Array.isArray(state.users)?state.users:[];
  const audit=Array.isArray(state.audit)?state.audit:[];
  const activeUsers=users.filter(user=>user.active!==false).length;
  const lastAudit=audit[0]?.occurredAt?new Date(audit[0].occurredAt).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'Aucune activité';
  return `<div class="v122-overview-head"><div><p class="v122-kicker">RÉGLAGE</p><h2>Tout l’essentiel sur un écran</h2><p>Équipe, journal et paramètres généraux restent accessibles sans multiplier les onglets.</p></div></div>
    <div class="v122-overview-grid">
      <button type="button" class="v122-overview-card" data-v122-open="users"><span class="v122-card-icon">👥</span><div><small>ÉQUIPE</small><strong>${activeUsers||'—'} accès actif${activeUsers>1?'s':''}</strong><p>Comptes, rôles et permissions Studio.</p></div><b>Gérer →</b></button>
      <button type="button" class="v122-overview-card" data-v122-open="audit"><span class="v122-card-icon">↻</span><div><small>JOURNAL</small><strong>${audit.length||'—'} événements récents</strong><p>Dernière activité : ${escapeHtml(lastAudit)}</p></div><b>Voir →</b></button>
      <button type="button" class="v122-overview-card" data-v122-open="settings"><span class="v122-card-icon">⚙</span><div><small>GÉNÉRAL</small><strong>Paramètres du Studio</strong><p>Sécurité, fonctionnement et accès aux réglages techniques.</p></div><b>Ouvrir →</b></button>
    </div>`;
}

function bindSettingsActions(root){
  $$('[data-v122-open]',root).forEach(button=>button.addEventListener('click',()=>openLegacySettings(button.dataset.v122Open)));
}

function openLegacySettings(tab){
  const button=$(`#studioLegacyTabControlsV105 [data-tab="${tab}"]`)||$(`[data-tab="${tab}"]`);
  if(tab==='settings'){
    settingsDetailTab='settings';
    button?.click();
    applyMode();
    return;
  }
  if(location.hash!==`#${tab}`)location.hash=`#${tab}`;
  button?.click();
}

function installSettingsBack(hash,content,detail=false){
  let back=$('#studioSettingsBackV122');
  if(hash==='settings'&&!detail){
    if(back)back.remove();
    return;
  }
  if(!back){
    back=document.createElement('button');
    back.id='studioSettingsBackV122';
    back.type='button';
    back.className='v122-settings-back';
    back.textContent='← Vue Réglage';
    back.addEventListener('click',()=>{
      settingsDetailTab='';
      if(location.hash!=='#settings')location.hash='#settings';else applyMode();
    });
    content.prepend(back);
  }
}

function escapeHtml(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
