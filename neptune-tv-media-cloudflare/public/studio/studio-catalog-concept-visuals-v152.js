const RELEASE='neptune-studio-catalog-concept-visuals-20260831-v154';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
const CONTEXT_TTL_MS=3000;
let contextCache=null;
let contextLoadedAt=0;
let contextPromise=null;
let timer=0;

document.documentElement.dataset.neptuneCatalogConceptVisuals=RELEASE;
boot();

function boot(){
  const run=()=>{
    schedule(0);
    new MutationObserver(()=>schedule(70)).observe(document.body,{subtree:true,childList:true});
    window.addEventListener('hashchange',()=>{invalidate();schedule(0)});
    window.addEventListener('focus',()=>{invalidate();schedule(0)});
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run,{once:true}):run();
}

function schedule(delay=70){
  clearTimeout(timer);
  timer=setTimeout(()=>applyConceptVisuals().catch(error=>console.warn('catalog_concept_visuals_v154_failed',String(error?.message||error))),delay);
}

function isCatalog(){
  const hash=String(location.hash||'').toLowerCase();
  const section=new URLSearchParams(location.search).get('studio_section');
  const title=String(document.querySelector('#title')?.textContent||'').toLowerCase();
  return hash==='#programs'||section==='catalog'||title.includes('catalogue')||Boolean(document.querySelector('#studioCatalogCommercialCockpitV145'));
}

async function applyConceptVisuals(){
  if(!isCatalog())return;
  const cards=[...document.querySelectorAll('#studioCatalogCommercialCockpitV145 .v145-offer')];
  if(!cards.length)return;
  const context=await getContext().catch(error=>{
    console.warn('catalog_concept_context_v154_failed',String(error?.message||error));
    return null;
  });
  for(const card of cards)applyCardVisual(card,context||{});
}

function applyCardVisual(card,context){
  const art=card.querySelector('.v145-art');
  if(!art)return;
  const existing=art.querySelector(':scope > img:not(.v153-concept-backdrop)');
  if(existing){
    decorateImageFrame(art,existing);
    return;
  }
  const fallback=art.querySelector('.v145-art-fallback');
  if(!fallback)return;
  const name=String(card.querySelector('.v145-offer-title h3')?.textContent||fallback.textContent||'').trim();
  if(!name)return;
  const format=findFormat(context,name);
  const preferred=resolveEntryImage(format,context);
  const backup=defaultConceptVisual(format?.slug||format?.name||name);
  const source=preferred||backup;
  if(!source)return;
  const image=document.createElement('img');
  image.className='v152-concept-image';
  image.alt=`Visuel ${name}`;
  image.loading='lazy';
  image.decoding='async';
  image.dataset.v152ConceptVisual='1';
  image.dataset.v154ImageSource=preferred?'catalog':'fallback';
  let usedBackup=source===backup;
  image.addEventListener('error',()=>{
    if(!usedBackup&&backup&&image.src!==new URL(backup,location.href).href){
      usedBackup=true;
      image.dataset.v154ImageSource='fallback';
      image.src=backup;
      return;
    }
    removeImageFrame(art,image);
    image.remove();
    if(!art.querySelector('.v145-art-fallback'))art.prepend(fallback);
  });
  image.src=source;
  fallback.replaceWith(image);
  decorateImageFrame(art,image);
}

function decorateImageFrame(art,image){
  art.classList.add('v153-art-preserve');
  image.classList.add('v153-concept-foreground');
  let backdrop=art.querySelector(':scope > .v153-concept-backdrop');
  if(!backdrop){
    backdrop=document.createElement('img');
    backdrop.className='v153-concept-backdrop';
    backdrop.alt='';
    backdrop.setAttribute('aria-hidden','true');
    backdrop.decoding='async';
    art.prepend(backdrop);
  }
  const sync=()=>{
    const source=image.currentSrc||image.getAttribute('src')||image.src||'';
    if(source&&backdrop.getAttribute('src')!==source)backdrop.src=source;
  };
  if(image.dataset.v153FrameBound!=='1'){
    image.dataset.v153FrameBound='1';
    image.addEventListener('load',sync);
    image.addEventListener('error',()=>{backdrop.removeAttribute('src')});
  }
  sync();
}

function removeImageFrame(art,image){
  image.classList.remove('v153-concept-foreground');
  art.querySelector(':scope > .v153-concept-backdrop')?.remove();
  art.classList.remove('v153-art-preserve');
}

async function getContext(){
  if(contextCache&&Date.now()-contextLoadedAt<CONTEXT_TTL_MS)return contextCache;
  if(contextPromise)return contextPromise;
  contextPromise=(async()=>{
    const token=await getCsrfToken();
    const headers={
      'Content-Type':'application/json',
      'Accept':'application/json',
      'Cache-Control':'no-cache, no-store',
    };
    if(token)headers['X-CSRF-Token']=token;
    let response=await fetch(CONTEXT_API,{
      method:'POST',
      credentials:'same-origin',
      cache:'no-store',
      headers,
      body:'{}',
    });
    if(response.status===403){
      sessionStorage.removeItem('neptune_csrf');
      const refreshed=await getCsrfToken(true);
      if(refreshed){
        headers['X-CSRF-Token']=refreshed;
        response=await fetch(CONTEXT_API,{
          method:'POST',
          credentials:'same-origin',
          cache:'no-store',
          headers,
          body:'{}',
        });
      }
    }
    if(!response.ok)throw new Error(`Catalogue HTTP ${response.status}`);
    const data=await response.json();
    contextCache=data;
    contextLoadedAt=Date.now();
    return data;
  })().finally(()=>{contextPromise=null});
  return contextPromise;
}

async function getCsrfToken(force=false){
  if(!force){
    const cached=sessionStorage.getItem('neptune_csrf')||'';
    if(cached)return cached;
  }
  try{
    const response=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});
    const auth=await response.json().catch(()=>({}));
    const token=String(auth.csrfToken||'').trim();
    if(token)sessionStorage.setItem('neptune_csrf',token);
    return token;
  }catch{
    return'';
  }
}

function invalidate(){
  contextCache=null;
  contextLoadedAt=0;
}

function findFormat(context,name){
  const target=normal(name);
  return (context.formats||[]).find(format=>normal(format.name||format.label||format.slug)===target)||null;
}

function resolveEntryImage(entry,context){
  if(!entry)return'';
  const direct=firstUrl([
    entry.image,entry.imageUrl,entry.thumbnailUrl,entry.visual,entry.visualUrl,
    entry.assetUrl,entry.posterUrl,entry.coverUrl,entry.mediaUrl,entry.publicUrl,entry.originalUrl,
  ]);
  if(direct)return direct;
  for(const id of [entry.mediaAssetId,entry.assetId,entry.mediaId,entry.linkedMediaAssetId].filter(Boolean)){
    const asset=findAsset(context,id);
    const url=firstUrl([asset?.publicUrl,asset?.imageUrl,asset?.thumbnailUrl,asset?.url,asset?.assetUrl,asset?.originalUrl]);
    if(url)return url;
  }
  return'';
}

function findAsset(context,id){
  for(const list of [context.mediaAssets,context.assets,context.visualAssets]){
    const hit=(list||[]).find(item=>String(item.id||item.assetId||item.mediaAssetId)===String(id));
    if(hit)return hit;
  }
  return null;
}

function defaultConceptVisual(value){
  const slug=normal(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(slug.includes('libre'))return'/assets/posters/concept-libre-wide.webp';
  if(slug.includes('neptune-talk')||slug.includes('talk'))return'/assets/catalog-v98/neptune-talk.svg';
  if(slug.includes('echo'))return'/assets/catalog-v98/echo.svg';
  if(slug.includes('confession'))return'/assets/catalog-v98/confession.svg';
  return'/assets/catalog-v98/hors-norme.svg';
}

function firstUrl(values){
  for(const value of values){
    const url=String(value||'').trim();
    if(url&&(url.startsWith('/')||/^https?:\/\//i.test(url)||url.startsWith('blob:')||url.startsWith('data:image/')))return url;
  }
  return'';
}

function normal(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
