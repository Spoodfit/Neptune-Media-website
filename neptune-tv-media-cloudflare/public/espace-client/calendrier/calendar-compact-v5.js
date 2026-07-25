const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const PAGE_SIZE=8;
let assetMap=new Map();
let activeProject=0;
let pages=new Map();
let observer=null;
let root=null;
let frame=0;

start();

function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}

async function boot(){
  root=$('#projectLibrary');
  if(!root)return;
  try{
    const response=await fetch('/api/client/content-calendar',{headers:{Accept:'application/json'},credentials:'same-origin'});
    const data=await response.json().catch(()=>({}));
    (data.assets||data.items||[]).forEach((asset)=>assetMap.set(String(asset.fileId||asset.id),asset));
  }catch{}
  observer=new MutationObserver(schedule);
  observe();
  schedule();
}

function observe(){if(observer&&root)observer.observe(root,{childList:true,subtree:true});}
function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;enhance();});}

function enhance(){
  observer?.disconnect();
  try{
    const groups=$$('.project-group',root).filter((group)=>!group.closest('.compact-library-stage'));
    if(!groups.length)return;
    activeProject=Math.min(activeProject,Math.max(0,groups.length-1));
    root.replaceChildren();
    const nav=document.createElement('nav');
    nav.className='compact-project-tabs';
    nav.setAttribute('aria-label','Choisir un passage');
    const stage=document.createElement('div');
    stage.className='compact-library-stage';
    groups.forEach((group,index)=>{
      decorateGroup(group,index);
      group.hidden=index!==activeProject;
      stage.append(group);
      const title=$('.project-group-head h3',group)?.textContent?.trim()||`Passage ${index+1}`;
      const meta=$('.project-group-head p',group)?.textContent?.trim()||'';
      const button=document.createElement('button');
      button.type='button';
      button.className=index===activeProject?'active':'';
      button.dataset.compactProject=String(index);
      button.setAttribute('aria-pressed',String(index===activeProject));
      button.innerHTML=`<span>Passage ${String(index+1).padStart(2,'0')}</span><strong>${esc(title)}</strong><small>${esc(meta)}</small>`;
      nav.append(button);
    });
    root.append(nav,stage);
    $$('[data-compact-project]',nav).forEach((button)=>button.addEventListener('click',()=>{
      activeProject=Number(button.dataset.compactProject||0);
      $$('.project-group',stage).forEach((group,index)=>group.hidden=index!==activeProject);
      $$('[data-compact-project]',nav).forEach((entry,index)=>{entry.classList.toggle('active',index===activeProject);entry.setAttribute('aria-pressed',String(index===activeProject));});
    }));
  }finally{observe();}
}

function decorateGroup(group,index){
  const cards=$$('.library-short-card',group);
  cards.forEach((card)=>addVisual(card));
  let page=pages.get(index)||1;
  const totalPages=Math.max(1,Math.ceil(cards.length/PAGE_SIZE));
  page=Math.min(page,totalPages);
  pages.set(index,page);
  applyPage(group,index,cards,page,totalPages);
}

function applyPage(group,index,cards,page,totalPages){
  cards.forEach((card,cardIndex)=>card.hidden=cardIndex<(page-1)*PAGE_SIZE||cardIndex>=page*PAGE_SIZE);
  $('.compact-short-pager',group)?.remove();
  if(totalPages<=1)return;
  const pager=document.createElement('nav');
  pager.className='compact-short-pager';
  pager.innerHTML=`<button type="button" data-short-prev ${page===1?'disabled':''}>←</button><span>Page ${page} / ${totalPages}</span><button type="button" data-short-next ${page===totalPages?'disabled':''}>→</button>`;
  group.append(pager);
  $('[data-short-prev]',pager)?.addEventListener('click',()=>{const next=Math.max(1,(pages.get(index)||1)-1);pages.set(index,next);applyPage(group,index,cards,next,totalPages);});
  $('[data-short-next]',pager)?.addEventListener('click',()=>{const next=Math.min(totalPages,(pages.get(index)||1)+1);pages.set(index,next);applyPage(group,index,cards,next,totalPages);});
}

function addVisual(card){
  if($('.compact-short-visual',card))return;
  const id=String(card.dataset.openAsset||'');
  const asset=assetMap.get(id);
  const url=safeUrl(asset?.downloadUrl||asset?.externalUrl);
  const visual=document.createElement('div');
  visual.className='compact-short-visual';
  visual.setAttribute('aria-hidden','true');
  visual.innerHTML=`${url!=='#'?`<video muted playsinline preload="metadata" src="${esc(url)}"></video>`:''}<span>▶</span>`;
  card.prepend(visual);
}

function safeUrl(value){const text=String(value||'');return /^(https?:\/\/|\/)/iu.test(text)?text:'#';}
function esc(value){return String(value??'').replace(/[&<>"']/gu,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
