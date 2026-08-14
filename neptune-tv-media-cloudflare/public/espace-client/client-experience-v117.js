const RELEASE='neptune-client-experience-20260814-v117';
const RETRY_TEXT=/impossible|indisponible|erreur|réessay/iu;

document.documentElement.dataset.clientExperience='v117';
document.documentElement.dataset.clientExperienceRelease=RELEASE;
installSharedStyles();
start();

function installSharedStyles(){
  if(document.querySelector('link[href*="/espace-client/client-experience-v117.css"]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/espace-client/client-experience-v117.css?v=2';
  link.dataset.clientExperienceCss='v117';
  document.head.append(link);
}

function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}
function boot(){
  if(isHome())import('/espace-client/client-command-center-v117.js?v=1').catch(error=>console.error('client_command_center_import_failed',error));
  installPrimaryNavigation();
  installLoadingStates();
  enhanceFeedbackStates();
  const observer=new MutationObserver(()=>enhanceFeedbackStates());
  observer.observe(document.body,{childList:true,subtree:true});
  if(isHome())openRequestedPanel();
}

function installPrimaryNavigation(){
  const homeHeader=document.querySelector('.media-header');
  const compactHeader=document.querySelector('.library-header,.calendar-header');
  const host=homeHeader?.querySelector('.header-tools')||compactHeader?.querySelector('.header-actions');
  if(!host||host.querySelector('[data-client-primary-nav-v117]'))return;
  const active=activeSection();
  host.classList.add('client-nav-host-v117');
  host.innerHTML=`<nav class="client-primary-nav-v117" data-client-primary-nav-v117 aria-label="Navigation de l’espace client">
    ${navLink('home','Accueil','/espace-client/',active)}
    ${navLink('content','Contenus','/espace-client/videos/',active)}
    ${navLink('publications','Publications','/espace-client/calendrier/',active)}
    ${navLink('account','Compte','/espace-client/?panel=account',active)}
    <button type="button" class="client-nav-logout-v117" data-client-logout-v117 aria-label="Se déconnecter" title="Se déconnecter">${logoutIcon()}</button>
  </nav>`;
  host.querySelector('[data-client-logout-v117]')?.addEventListener('click',logout);
}

function navLink(key,label,href,active){return `<a href="${href}" class="${key===active?'is-active':''}" ${key===active?'aria-current="page"':''}>${label}</a>`;}
function activeSection(){const path=location.pathname;if(path.includes('/videos'))return'content';if(path.includes('/calendrier'))return'publications';if(isHome()&&new URLSearchParams(location.search).get('panel')==='account')return'account';return'home';}
function isHome(){return ['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname);}

async function logout(){
  const button=document.querySelector('[data-client-logout-v117]');
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
  try{await fetch('/api/client/logout',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});}catch{}
  location.assign('/espace-client/');
}

function openRequestedPanel(){
  if(new URLSearchParams(location.search).get('panel')!=='account')return;
  let attempts=0;
  const open=()=>{
    attempts+=1;
    const dashboard=document.querySelector('#dashboard');
    const trigger=document.querySelector('[data-open-panel="billing"]');
    if(dashboard&&!dashboard.hidden&&trigger){
      trigger.click();
      const url=new URL(location.href);url.searchParams.delete('panel');history.replaceState({},'',url.pathname+url.search+url.hash);
      return;
    }
    if(attempts<30)setTimeout(open,120);
  };
  open();
}

function installLoadingStates(){
  if(location.pathname.includes('/videos')){
    const grid=document.querySelector('#contentGrid');
    const label=document.querySelector('#resultLabel');
    if(grid&&!grid.children.length){grid.setAttribute('aria-busy','true');grid.innerHTML=librarySkeleton();}
    if(label&&!label.textContent.trim())label.textContent='Chargement de vos contenus…';
  }
  if(location.pathname.includes('/calendrier')){
    const calendar=document.querySelector('#calendarGrid');
    const library=document.querySelector('#projectLibrary');
    if(calendar&&!calendar.children.length){calendar.setAttribute('aria-busy','true');calendar.innerHTML=calendarSkeleton();}
    if(library&&!library.children.length){library.setAttribute('aria-busy','true');library.innerHTML=librarySkeleton(3);}
  }
}

function enhanceFeedbackStates(){
  document.querySelectorAll('#contentGrid,#calendarGrid,#projectLibrary').forEach(container=>{
    if(container.querySelector(':scope > :not(.client-skeleton-v117)'))container.removeAttribute('aria-busy');
  });
  document.querySelectorAll('.empty-state,.empty-card,.media-strip-empty').forEach(state=>{
    if(state.dataset.feedbackV117==='1')return;
    state.dataset.feedbackV117='1';
    state.classList.add('client-feedback-v117');
    if(RETRY_TEXT.test(state.textContent||'')&&!state.querySelector('[data-client-retry-v117]')){
      const button=document.createElement('button');button.type='button';button.dataset.clientRetryV117='';button.textContent='Réessayer';button.addEventListener('click',()=>location.reload());state.append(button);
    }
  });
}

function librarySkeleton(count=4){return `<div class="client-skeleton-v117 client-skeleton-library-v117" aria-hidden="true">${Array.from({length:count},()=>'<article><i></i><span></span><b></b></article>').join('')}</div>`;}
function calendarSkeleton(){return `<div class="client-skeleton-v117 client-skeleton-calendar-v117" aria-hidden="true">${Array.from({length:35},()=>'<i></i>').join('')}</div>`;}
function logoutIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m14 16 4-4-4-4M18 12H9"/></svg>';}
