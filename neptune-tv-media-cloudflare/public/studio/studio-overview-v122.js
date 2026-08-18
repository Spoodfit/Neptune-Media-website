const RELEASE='neptune-studio-overview-20260818-v122';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

boot();

function boot(){
  document.documentElement.dataset.studioOverviewV122=RELEASE;
  installNavigation();
  applyMode();
  window.addEventListener('hashchange',()=>{installNavigation();applyMode();});
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
    navLink('/studio/webtv.html','▶','Diffusion','webtv'),
    navLink('/studio/advanced.html#programs','▦','Catalogue Média','programs'),
    navLink('/studio/advanced.html#finances','€','Finance','finances'),
    navLink('/studio/advanced.html#settings','⚙','Réglage','settings'),
  ].join('');
  updateActiveNavigation(nav);
}

function navLink(href,icon,label,key){
  return `<a class="studio-nav-link v122-nav-link" href="${href}" data-v122-route="${key}"><span>${icon}</span><strong>${label}</strong></a>`;
}

function activeRoute(){
  const path=location.pathname;
  if(path.includes('/studio/clients'))return'clients';
  if(path.includes('/studio/webtv'))return'webtv';
  if(path.includes('/studio/advanced')){
    const hash=(location.hash||'#programs').slice(1);
    if(hash==='programs')return'programs';
    if(hash==='finances')return'finances';
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
  else{
    body.classList.add('v122-studio-settings');
    if(hash!=='settings')body.classList.add('v122-studio-settings-detail');
    installSettingsOverview(hash);
  }
  normalizeHeading(hash);
}

function normalizeHeading(hash){
  const h1=$('.topbar h1,.neptune-studio-main h1');
  if(!h1)return;
  if(hash==='programs')h1.textContent='Catalogue Média';
  else if(hash==='finances')h1.textContent='Finance';
  else h1.textContent='Réglage';
}

async function installSettingsOverview(hash){
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
  overview.hidden=hash!=='settings';
  installSettingsBack(hash,content);
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
  if(button){button.click();return;}
  location.hash=`#${tab}`;
}

function installSettingsBack(hash,content){
  let back=$('#studioSettingsBackV122');
  if(hash==='settings'){
    if(back)back.remove();
    return;
  }
  if(!back){
    back=document.createElement('button');
    back.id='studioSettingsBackV122';
    back.type='button';
    back.className='v122-settings-back';
    back.textContent='← Vue Réglage';
    back.addEventListener('click',()=>{location.hash='#settings';});
    content.prepend(back);
  }
}

function escapeHtml(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
