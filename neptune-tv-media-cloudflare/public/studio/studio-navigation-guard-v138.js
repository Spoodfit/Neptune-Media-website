const RELEASE='neptune-studio-navigation-guard-20260823-v138.1';
const root=document.documentElement;
let queued=false;

const ROUTES=[
  ['clients','/studio/clients','◎','Parcours clients'],
  ['production','/studio/video-ai.html','✦','Production vidéo'],
  ['diffusion','/studio/webtv.html','▶','Diffusion'],
  ['settings','/studio/advanced.html#programs','⚙','Réglages'],
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
  let nav=sidebar.querySelector('.neptune-studio-nav,.studio-nav,nav');
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
    const selected=link.dataset.studioRoute===active;
    link.classList.toggle('active',selected);
    if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  root.dataset.neptuneStudioNavigationReady='v138';
}

function activeRoute(){
  const path=location.pathname.replace(/\/+$/u,'')||'/';
  if(path==='/studio/clients'||path==='/studio/clients.html')return'clients';
  if(path==='/studio/video-ai'||path==='/studio/video-ai.html')return'production';
  if(path==='/studio/webtv'||path==='/studio/webtv.html')return'diffusion';
  if(path==='/studio/advanced'||path==='/studio/advanced.html')return'settings';
  return'';
}
