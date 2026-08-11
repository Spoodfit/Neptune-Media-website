const RELEASE='neptune-studio-shell-20260811-v103';
const EMBED='studio_embed=v100';
const frame=document.getElementById('studioShellFrame');
const shell=document.getElementById('studioShell');
const authState=document.getElementById('studioShellAuth');
const loading=document.getElementById('studioShellLoading');
const context=document.getElementById('studioShellContext');
const menu=document.getElementById('studioShellMenu');
const backdrop=document.getElementById('studioShellBackdrop');
let auth=null;

document.body.dataset.studioShell=RELEASE;

const ROUTES={
  clients:{group:'clients',label:'Parcours clients',src:`/studio/clients.html?${EMBED}`},
  production:{group:'production',label:'Production vidéo',src:`/studio/video-ai.html?${EMBED}`},
  diffusion:{group:'diffusion',label:'Antenne',src:`/studio/webtv.html?${EMBED}`},
  'diffusion/programme':{group:'diffusion',label:'Programme',src:`/studio/advanced.html?${EMBED}#episodes`},
  'diffusion/publicites':{group:'diffusion',label:'Publicités',src:`/studio/advanced.html?${EMBED}#ads`,adminOnly:true},
  'diffusion/audience':{group:'diffusion',label:'Audience',src:`/studio/advanced.html?${EMBED}#insights`},
  'settings/catalogue':{group:'settings',label:'Catalogue Media',src:`/studio/advanced.html?${EMBED}#programs`,roles:['admin','editor']},
  'settings/finances':{group:'settings',label:'Finances',src:`/studio/advanced.html?${EMBED}#finances`,adminOnly:true},
  'settings/equipe':{group:'settings',label:'Équipe',src:`/studio/advanced.html?${EMBED}#users`,adminOnly:true},
  'settings/journal':{group:'settings',label:'Journal d’audit',src:`/studio/advanced.html?${EMBED}#audit`,adminOnly:true},
  'settings/general':{group:'settings',label:'Réglages généraux',src:`/studio/advanced.html?${EMBED}#settings`},
};
const CONTEXT={
  diffusion:[['diffusion','Antenne'],['diffusion/programme','Programme'],['diffusion/publicites','Publicités'],['diffusion/audience','Audience']],
  settings:[['settings/catalogue','Catalogue Media'],['settings/finances','Finances'],['settings/equipe','Équipe'],['settings/journal','Journal'],['settings/general','Général']],
};
const LEGACY_HASH={
  episodes:'diffusion/programme',ads:'diffusion/publicites',insights:'diffusion/audience',webtv:'diffusion',
  programs:'settings/catalogue',finances:'settings/finances',users:'settings/equipe',audit:'settings/journal',settings:'settings/general',
  dashboard:'clients',ai:'production',
};

boot();

async function boot(){
  bindShell();
  try{
    auth=await getAuth();
    if(!auth?.user||auth.authenticated===false)throw new Error('unauthorized');
    if(auth.csrfToken)sessionStorage.setItem('neptune_csrf',auth.csrfToken);
    document.getElementById('studioShellAccount').textContent=auth.user.fullName||auth.user.email||'Compte Studio';
    document.getElementById('studioShellRole').textContent=roleLabel(auth.user.role);
    authState.hidden=true;shell.hidden=false;
    openRoute(resolveInitialRoute(),{replace:true});
  }catch{
    const next=`/studio/app.html${location.hash||'#clients'}`;
    location.replace(`/studio/?next=${encodeURIComponent(next)}`);
  }
}

function bindShell(){
  document.querySelectorAll('[data-shell-route]').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();openRoute(link.dataset.shellRoute);
  }));
  const restoreRoute=()=>openRoute(normalizeRoute(location.hash.slice(1)),{fromHash:true});
  window.addEventListener('hashchange',restoreRoute);
  window.addEventListener('popstate',restoreRoute);
  frame.addEventListener('load',onFrameLoad);
  document.getElementById('studioShellLogout').addEventListener('click',logout);
  menu.addEventListener('click',()=>setMenu(!document.body.classList.contains('ns100-menu-open')));
  backdrop.addEventListener('click',()=>setMenu(false));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')setMenu(false);});
}

function resolveInitialRoute(){
  const hash=decodeURIComponent(location.hash.slice(1)).trim();
  if(hash)return normalizeRoute(hash);
  if(new URLSearchParams(location.search).get('entry')==='advanced')return'settings/general';
  return'clients';
}

function normalizeRoute(raw){
  const value=String(raw||'').replace(/^#+/,'').replace(/^\/+|\/+$/g,'');
  if(ROUTES[value])return allowed(value)?value:fallbackFor(ROUTES[value].group);
  if(LEGACY_HASH[value]){const mapped=LEGACY_HASH[value];return allowed(mapped)?mapped:fallbackFor(ROUTES[mapped].group);}
  if(value==='settings')return allowed('settings/catalogue')?'settings/catalogue':'settings/general';
  return'clients';
}

function allowed(route){
  const def=ROUTES[route],role=String(auth?.user?.role||'');
  if(!def)return false;
  if(def.adminOnly&&role!=='admin')return false;
  if(def.roles&&!def.roles.includes(role))return false;
  return true;
}
function fallbackFor(group){
  if(group==='settings')return'settings/general';
  if(group==='diffusion')return'diffusion';
  return group==='production'?'production':'clients';
}

function openRoute(route,options={}){
  const next=normalizeRoute(route),def=ROUTES[next];
  if(!def)return;
  const expected=`#${next}`;
  if(!options.fromHash&&location.hash!==expected){
    if(options.replace)history.replaceState(null,'',expected);else history.pushState(null,'',expected);
  }else if(options.replace&&location.hash!==expected)history.replaceState(null,'',expected);
  frame.dataset.expectedRoute=next;
  setPrimary(def.group);
  renderContext(def.group,next);
  document.getElementById('studioShellMobileTitle').textContent=def.label;
  document.title=`${def.label} · Neptune Media Studio`;
  setMenu(false);
  loadWorkspace(def.src);
}

function setPrimary(group){
  document.querySelectorAll('.ns100-primary [data-shell-route]').forEach(link=>{
    const active=link.dataset.shellRoute.split('/')[0]===group;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
}

function renderContext(group,active){
  const items=(CONTEXT[group]||[]).filter(([route])=>allowed(route));
  context.innerHTML='';context.removeAttribute('data-label');
  if(!items.length)return;
  context.dataset.label=group==='settings'?'Réglages':'Diffusion';
  for(const[route,label]of items){
    const link=document.createElement('a');link.href=`#${route}`;link.textContent=label;link.classList.toggle('active',route===active);
    if(route===active)link.setAttribute('aria-current','page');
    link.addEventListener('click',event=>{event.preventDefault();openRoute(route);});context.append(link);
  }
}

function loadWorkspace(src){
  const target=new URL(src,location.origin);
  try{
    const current=new URL(frame.contentWindow?.location?.href||'about:blank');
    if(current.origin===location.origin&&sameWorkspace(current,target)){
      if(target.hash&&current.hash!==target.hash){loading.hidden=false;frame.contentWindow.location.hash=target.hash;}
      else loading.hidden=true;
      return;
    }
  }catch{}
  loading.hidden=false;frame.src=src;
}

function sameWorkspace(current,target){
  return current.pathname===target.pathname&&current.search===target.search&&(!target.hash||current.hash===target.hash);
}

function onFrameLoad(){
  try{
    const childUrl=new URL(frame.contentWindow.location.href);
    if(childUrl.origin===location.origin&&childUrl.pathname==='/studio/app.html'){
      openRoute(normalizeRoute(childUrl.hash.slice(1)||'clients'));return;
    }
    const expectedRoute=normalizeRoute(frame.dataset.expectedRoute||location.hash.slice(1));
    const expectedDef=ROUTES[expectedRoute];
    if(expectedDef){
      const expectedUrl=new URL(expectedDef.src,location.origin);
      if(childUrl.origin===location.origin&&!sameWorkspace(childUrl,expectedUrl)){
        loading.hidden=false;frame.src=expectedDef.src;return;
      }
    }
    const doc=frame.contentDocument;if(!doc){loading.hidden=true;return;}
    doc.documentElement.dataset.neptuneStudioEmbedded='v103';
    doc.documentElement.dataset.studioEmbedded=RELEASE;
    isolateLegacyChrome(doc);
    doc.addEventListener('click',interceptChildNavigation,true);
    loading.hidden=true;
  }catch(error){loading.hidden=true;console.warn('[Neptune Studio] workspace isolation unavailable',error);}
}

function isolateLegacyChrome(doc){
  const chrome='.studio-sidebar,.video-ai-sidebar,#app>.sidebar,.neptune-studio-sidebar,.studio-context-nav-v65,.neptune-studio-menu-toggle,#neptuneStudioMenuToggle,.studio-menu-backdrop-v65,.neptune-studio-menu-backdrop-v65';
  for(const node of doc.querySelectorAll(chrome)){
    node.hidden=true;
    node.setAttribute('aria-hidden','true');
    node.style.setProperty('display','none','important');
  }
  for(const node of doc.querySelectorAll('.studio-shell,.video-ai-shell,#app.shell,.neptune-studio-shell')){
    node.style.setProperty('grid-template-columns','minmax(0,1fr)','important');
    node.style.setProperty('width','100%','important');
  }
  for(const node of doc.querySelectorAll('.clients-workspace,.video-ai-main,.workspace,#app>.main,.neptune-studio-main')){
    node.style.setProperty('width','100%','important');
    node.style.setProperty('max-width','none','important');
    node.style.setProperty('margin','0','important');
    node.style.setProperty('padding-left','0','important');
  }
}

function interceptChildNavigation(event){
  const anchor=event.target.closest?.('a[href]');if(!anchor)return;
  let url;try{url=new URL(anchor.href,location.origin);}catch{return;}
  if(url.origin!==location.origin)return;
  const route=routeFromLegacyUrl(url);if(!route)return;
  event.preventDefault();event.stopPropagation();openRoute(route);
}

function routeFromLegacyUrl(url){
  const path=url.pathname.replace(/\/$/,'');
  if(path==='/studio'||path==='/studio/index.html'||path==='/studio/clients'||path==='/studio/clients.html')return'clients';
  if(path==='/studio/video-ai'||path==='/studio/video-ai.html')return'production';
  if(path==='/studio/webtv'||path==='/studio/webtv.html')return'diffusion';
  if(path==='/studio/advanced'||path==='/studio/advanced.html')return normalizeRoute(url.hash.slice(1)||'settings');
  if(path==='/studio/app.html')return normalizeRoute(url.hash.slice(1));
  return'';
}

async function getAuth(){
  const response=await fetch('/api/auth/status',{headers:{Accept:'application/json'},credentials:'same-origin',cache:'no-store'});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'unauthorized');return data;
}
async function logout(){
  const button=document.getElementById('studioShellLogout');button.disabled=true;
  try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});}catch{}
  sessionStorage.removeItem('neptune_csrf');location.replace('/studio/');
}
function roleLabel(role){return({admin:'Administrateur',editor:'Éditeur',analyst:'Analyste'})[role]||'Compte Studio';}
function setMenu(open){document.body.classList.toggle('ns100-menu-open',open);menu.setAttribute('aria-expanded',String(open));backdrop.hidden=!open;}
