const RELEASE='neptune-studio-catalog-concept-visuals-20260830-v152';
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
  timer=setTimeout(()=>applyConceptVisuals().catch(error=>console.warn('catalog_concept_visuals_v152_failed',String(error?.message||error))),delay);
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
  const context=await getContext().catch(()=>null);
  for(const card of cards)applyCardVisual(card,context||{});
}

function applyCardVisual(card,context){
  const art=card.querySelector('.v145-art');
  if(!art||art.querySelector('img'))return;
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
  let usedBackup=source===backup;
  image.addEventListener('error',()=>{
    if(!usedBackup&&backup&&image.src!==new URL(backup,location.href).href){
      usedBackup=true;
      image.src=backup;
      return;
    }
    image.remove();
    if(!art.querySelector('.v145-art-fallback'))art.prepend(fallback);
  });
  image.src=source;
  fallback.replaceWith(image);
}

async function getContext(){
  if(contextCache&&Date.now()-contextLoadedAt<CONTEXT_TTL_MS)return contextCache;
  if(contextPromise)return contextPromise;
  contextPromise=fetch(CONTEXT_API,{
    method:'POST',
    credentials:'same-origin',
    cache:'no-store',
    headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},
    body:'{}',
  }).then(async response=>{
    if(!response.ok)throw new Error(`Catalogue HTTP ${response.status}`);
    const data=await response.json();
    contextCache=data;
    contextLoadedAt=Date.now();
    return data;
  }).finally(()=>{contextPromise=null});
  return contextPromise;
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
