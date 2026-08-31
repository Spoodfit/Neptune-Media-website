(() => {
  const ID='studioCallbacksV165';
  if(document.getElementById(ID))return;
  const root=document.createElement('section');root.id=ID;root.className='studio-callbacks-v165';
  root.innerHTML='<div class="studio-callbacks-v165-panel"><div class="studio-callbacks-v165-head"><strong>Prospects à rappeler</strong><span class="studio-callbacks-v165-count">0</span></div><div class="studio-callbacks-v165-list"><div class="studio-callbacks-v165-empty">Chargement…</div></div></div>';
  document.body.appendChild(root);
  const list=root.querySelector('.studio-callbacks-v165-list'),count=root.querySelector('.studio-callbacks-v165-count');
  load();setInterval(load,60000);

  async function load(){
    try{
      const response=await fetch('/api/admin/callbacks-v165',{headers:{Accept:'application/json'},cache:'no-store'});
      if(response.status===401||response.status===403){root.hidden=true;return;}
      const data=await response.json();if(!response.ok)throw new Error(data.error||'load_failed');
      root.hidden=false;render(data.callbacks||[]);
    }catch(error){console.warn('[studio-callbacks-v165]',error);}
  }
  function render(items){
    count.textContent=String(items.length);
    if(!items.length){list.innerHTML='<div class="studio-callbacks-v165-empty">Aucun rappel en attente.</div>';return;}
    list.innerHTML=items.map(item=>{
      const urgency=urgencyFor(item.dueAt),remaining=remainingLabel(item.dueAt);
      return `<article class="studio-callback-v165 ${urgency}"><div class="studio-callback-v165-top"><span class="studio-callback-v165-name">${esc(item.firstName)} ${esc(item.lastName)}</span><span class="studio-callback-v165-time">${esc(remaining)}</span></div><div class="studio-callback-v165-contact"><span>${esc(item.phone)}</span><span>${esc(item.email)}</span></div><div class="studio-callback-v165-meta">Demande reçue ${relative(item.requestedAt)} · parcours client</div><button type="button" data-resolve="${esc(item.id)}">Marquer comme rappelé</button></article>`;
    }).join('');
    list.querySelectorAll('[data-resolve]').forEach(button=>button.addEventListener('click',()=>resolve(button.dataset.resolve,button)));
  }
  async function resolve(id,button){button.disabled=true;try{const response=await fetch('/api/admin/callbacks-v165/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(!response.ok)throw new Error('resolve_failed');await load();}catch{button.disabled=false;}}
  function urgencyFor(due){const ms=new Date(due).getTime()-Date.now();if(ms<=0)return'red';if(ms<=8*3600000)return'orange';return'green';}
  function remainingLabel(due){const ms=new Date(due).getTime()-Date.now();if(ms<=0){const h=Math.ceil(Math.abs(ms)/3600000);return `Retard ${h} h`;}const h=Math.ceil(ms/3600000);return `${h} h restantes`;}
  function relative(value){const ms=Date.now()-new Date(value).getTime(),m=Math.max(1,Math.floor(ms/60000));if(m<60)return`il y a ${m} min`;const h=Math.floor(m/60);if(h<24)return`il y a ${h} h`;return`il y a ${Math.floor(h/24)} j`;}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
})();