(() => {
  const ID='studioMemberVisitsV171';
  if(document.getElementById(ID))return;

  const root=document.createElement('details');
  root.id=ID;
  root.className='studio-member-visits-v171';
  root.innerHTML=`<summary><span><strong>Entrées réservation</strong><small>Nouveaux et retours</small></span><b data-count>…</b></summary><div class="studio-member-visits-v171-body"><div class="studio-member-visits-v171-list"><div class="studio-member-visits-v171-empty">Chargement…</div></div></div>`;
  document.body.appendChild(root);

  const list=root.querySelector('.studio-member-visits-v171-list');
  const count=root.querySelector('[data-count]');
  load();
  setInterval(load,60000);

  async function load(){
    try{
      const response=await fetch('/api/admin/reservation-member-visits-v171',{headers:{Accept:'application/json'},cache:'no-store'});
      if(response.status===401||response.status===403){root.hidden=true;return;}
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'load_failed');
      root.hidden=false;
      render(data.entries||[]);
    }catch(error){
      console.warn('[studio-member-visits-v171]',error);
    }
  }

  function render(items){
    count.textContent=String(items.length);
    if(!items.length){
      list.innerHTML='<div class="studio-member-visits-v171-empty">Aucune entrée enregistrée pour le moment.</div>';
      return;
    }
    list.innerHTML=items.slice(0,30).map(item=>{
      const identity=item.fullName||item.company||item.email;
      const secondary=identity===item.email?(item.company||''):item.email;
      const visits=Number(item.visitCount||0);
      return `<article class="studio-member-visit-v171">
        <div class="studio-member-visit-v171-top"><div><strong>${esc(identity)}</strong>${secondary?`<small>${esc(secondary)}</small>`:''}</div><span class="is-${esc(item.state||'new')}">${esc(item.label||'Nouveau')}</span></div>
        <div class="studio-member-visit-v171-meta"><b>${visits} entrée${visits>1?'s':''}</b><span>Dernière ${relative(item.lastSeenAt)}</span></div>
      </article>`;
    }).join('');
  }

  function relative(value){
    const time=new Date(value||'').getTime();
    if(!Number.isFinite(time))return '—';
    const ms=Math.max(0,Date.now()-time),minutes=Math.max(1,Math.floor(ms/60000));
    if(minutes<60)return`il y a ${minutes} min`;
    const hours=Math.floor(minutes/60);if(hours<24)return`il y a ${hours} h`;
    const days=Math.floor(hours/24);return`il y a ${days} j`;
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
})();
