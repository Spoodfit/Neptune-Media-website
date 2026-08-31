const RELEASE='neptune-studio-catalog-concept-visuals-20260831-v155';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
let timer=0;
let contextPromise=null;
let contextCache=null;

document.documentElement.dataset.neptuneCatalogConceptVisuals=RELEASE;
boot();

function boot(){
  const run=()=>{
    schedule(0);
    new MutationObserver(()=>schedule(25)).observe(document.body,{subtree:true,childList:true});
    window.addEventListener('hashchange',()=>{contextCache=null;schedule(0)});
    window.addEventListener('focus',()=>{contextCache=null;schedule(0)});
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
}

function schedule(delay=25){
  clearTimeout(timer);
  timer=setTimeout(renderConceptVisuals,delay);
}

function renderConceptVisuals(){
  if(!isCatalog())return;
  const cards=[...document.querySelectorAll('#studioCatalogCommercialCockpitV145 .v145-offer')];
  if(!cards.length)return;

  // Important: render a real image synchronously. The card must never depend on
  // the admin API being available before replacing the purple text fallback.
  for(const card of cards)ensureImmediateVisual(card);

  // Then upgrade the canonical image to the custom image stored for the concept.
  loadContext().then(context=>{
    for(const card of cards)upgradeVisual(card,context||{});
  }).catch(error=>console.warn('catalog_concept_custom_visual_v155_failed',String(error?.message||error)));
}

function ensureImmediateVisual(card){
  const art=card.querySelector('.v145-art');
  if(!art)return;
  const current=art.querySelector(':scope > img:not(.v153-concept-backdrop)');
  if(current){decorate(art,current);return;}
  const fallback=art.querySelector('.v145-art-fallback');
  if(!fallback)return;
  const name=conceptName(card,fallback);
  if(!name)return;
  const image=createImage(name,canonicalVisual(name),'canonical');
  fallback.replaceWith(image);
  decorate(art,image);
}

function upgradeVisual(card,context){
  const art=card.querySelector('.v145-art');
  const image=art?.querySelector(':scope > img:not(.v153-concept-backdrop)');
  if(!art||!image)return;
  const name=conceptName(card,null);
  const format=findFormat(context,name);
  const custom=resolveFormatImage(format);
  if(!custom)return;
  const current=image.getAttribute('src')||'';
  if(sameUrl(current,custom))return;
  image.dataset.v155ImageSource='catalog';
  image.src=custom;
  decorate(art,image);
}

function createImage(name,source,kind){
  const image=document.createElement('img');
  image.className='v155-concept-image';
  image.alt=`Visuel ${name}`;
  image.loading='eager';
  image.decoding='async';
  image.dataset.v155ImageSource=kind;
  const backup=canonicalVisual(name);
  image.addEventListener('error',()=>{
    if(image.dataset.v155ImageSource!=='canonical'){
      image.dataset.v155ImageSource='canonical';
      image.src=backup;
    }
  });
  image.src=source;
  return image;
}

function decorate(art,image){
  art.classList.add('v153-art-preserve');
  image.classList.add('v153-concept-foreground');
  let backdrop=art.querySelector(':scope > .v153-concept-backdrop');
  if(!backdrop){
    backdrop=document.createElement('img');
    backdrop.className='v153-concept-backdrop';
    backdrop.alt='';
    backdrop.setAttribute('aria-hidden','true');
    art.prepend(backdrop);
  }
  const sync=()=>{
    const source=image.currentSrc||image.getAttribute('src')||'';
    if(source)backdrop.src=source;
  };
  if(image.dataset.v155Bound!=='1'){
    image.dataset.v155Bound='1';
    image.addEventListener('load',sync);
  }
  sync();
}

async function loadContext(){
  if(contextCache)return contextCache;
  if(contextPromise)return contextPromise;
  contextPromise=(async()=>{
    let token=sessionStorage.getItem('neptune_csrf')||'';
    if(!token)token=await refreshCsrf();
    const request=async csrf=>fetch(CONTEXT_API,{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache, no-store',...(csrf?{'X-CSRF-Token':csrf}:{})},
      body:'{}',
    });
    let response=await request(token);
    if(response.status===403){token=await refreshCsrf();response=await request(token);}
    if(!response.ok)throw new Error(`Catalogue HTTP ${response.status}`);
    contextCache=await response.json();
    return contextCache;
  })().finally(()=>{contextPromise=null});
  return contextPromise;
}

async function refreshCsrf(){
  try{
    const response=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});
    const auth=await response.json().catch(()=>({}));
    const token=String(auth.csrfToken||'').trim();
    if(token)sessionStorage.setItem('neptune_csrf',token);
    return token;
  }catch{return'';}
}

function findFormat(context,name){
  const target=normal(name);
  return (context.formats||[]).find(item=>{
    const values=[item.name,item.label,item.slug,item.title];
    return values.some(value=>normal(value)===target);
  })||null;
}

function resolveFormatImage(format){
  if(!format)return'';
  return firstUrl([format.image,format.imageUrl,format.visualUrl,format.coverUrl,format.posterUrl,format.thumbnailUrl,format.assetUrl,format.publicUrl]);
}

function canonicalVisual(value){
  const slug=normal(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(slug.includes('libre'))return'/assets/posters/concept-libre-wide.webp';
  if(slug.includes('neptune-talk')||slug.includes('talk'))return'/assets/catalog-v98/neptune-talk.svg';
  if(slug.includes('echo'))return'/assets/catalog-v98/echo.svg';
  if(slug.includes('confession'))return'/assets/catalog-v98/confession.svg';
  return'/assets/catalog-v98/hors-norme.svg';
}

function conceptName(card,fallback){
  return String(card.querySelector('.v145-offer-title h3')?.textContent||fallback?.textContent||'').trim();
}
function isCatalog(){
  return String(location.hash||'').toLowerCase()==='#programs'||String(document.querySelector('#title')?.textContent||'').toLowerCase().includes('catalogue')||Boolean(document.querySelector('#studioCatalogCommercialCockpitV145'));
}
function firstUrl(values){for(const value of values){const url=String(value||'').trim();if(url&&(url.startsWith('/')||/^https?:\/\//i.test(url)||url.startsWith('data:image/')))return url;}return'';}
function sameUrl(a,b){try{return new URL(a,location.href).href===new URL(b,location.href).href}catch{return a===b}}
function normal(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
