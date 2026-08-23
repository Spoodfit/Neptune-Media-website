const RELEASE='neptune-studio-navigation-guard-20260823-v139';
const root=document.documentElement;
let queued=false;

// Référence produit validée : même menu Studio sur tous les écrans.
// Production vidéo reste accessible par son URL mais n'est pas une section du menu principal.
const ROUTES=[
  ['clients','/studio/clients','◎','Parcours clients'],
  ['diffusion','/studio/webtv.html','▶','Diffusion'],
  ['catalog','/studio/advanced.html#programs','▦','Catalogue Média'],
  ['finance','/studio/advanced.html#finances','€','Finance'],
  ['settings-main','/studio/advanced.html#settings','⚙','Réglage'],
];

start();

function start(){
  root.dataset.neptuneStudioNavigationGuard=RELEASE;
  ensure();
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});
  window.addEventListener('pageshow',ensure);
  window.addEventListener('hashchange',ensure);
}

function schedule(){
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{queued=false;ensure();});
}

function ensure(){
  const sidebar=document.querySelector('.neptune-studio-sidebar,.studio-sidebar,.video-ai-sidebar,#app .sidebar');
  if(!sidebar)return;
  const nav=sidebar.querySelector('.neptune-studio-nav,.studio-nav,nav');
  if(!nav)return;
  nav.classList.add('neptune-studio-nav');
  nav.setAttribute('aria-label','Navigation principale du Studio');
  const active=activeRoute();
  const current=[...nav.querySelectorAll('[data-studio-route]')].map(link=>[
    link.dataset.studioRoute,
    link.getAttribute('href')||'',
    link.querySelector('strong')?.textContent?.trim()||'',
  ]);
  const expected=ROUTES.map(([route,href,,label])=>[route,href,label]);
  if(JSON.stringify(current)!==JSON.stringify(expected)){
    nav.innerHTML=ROUTES.map(([route,href,icon,label])=>`<a class="neptune-studio-nav-link" data-studio-route="${route}" href="${href}"><span class="neptune-studio-nav-icon" aria-hidden="true">${icon}</span><strong>${label}</strong></a>`).join('');
  }
  for(const link of nav.querySelectorAll('[data-studio-route]')){
    const selected=Boolean(active)&&link.dataset.studioRoute===active;
    link.classList.toggle('active',selected);
    if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  normalizeAccount(sidebar);
  root.dataset.neptuneStudioNavigationReady='v138';
}

function normalizeAccount(sidebar){
  const account=sidebar.querySelector('.neptune-studio-account,.studio-account');
  if(!account)return;
  const name=account.querySelector('b');
  const role=account.querySelector('small');
  if(name&&name.textContent.trim()==='Compte Studio')name.textContent='Neptune Media';
  if(role&&['Se déconnecter','Réglages et accès'].includes(role.textContent.trim()))role.textContent='admin';
}

function activeRoute(){
  const path=location.pathname.replace(/\/+$/u,'')||'/';
  if(path==='/studio/clients'||path==='/studio/clients.html')return'clients';
  if(path==='/studio/webtv'||path==='/studio/webtv.html')return'diffusion';
  if(path==='/studio/advanced'||path==='/studio/advanced.html'){
    const tab=decodeURIComponent(location.hash.slice(1)).trim();
    if(tab==='programs')return'catalog';
    if(tab==='finances')return'finance';
    if(['settings','users','audit'].includes(tab))return'settings-main';
    return'diffusion';
  }
  // L'outil Production vidéo n'est volontairement rattaché à aucune section principale.
  return'';
}
