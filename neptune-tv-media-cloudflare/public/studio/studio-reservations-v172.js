(() => {
  const ID='studioReservationsV172';
  if(document.getElementById(ID))return;

  const root=document.createElement('div');
  root.id=ID;
  root.className='studio-reservations-v172';
  root.innerHTML=`
    <button class="studio-reservations-v172-trigger" type="button" data-open aria-label="Ouvrir le planning des réservations">
      <span class="studio-reservations-v172-icon">▦</span><span><strong>Planning</strong><small>Réservations</small></span><b data-count>…</b>
    </button>
    <div class="studio-reservations-v172-layer" data-layer hidden>
      <button class="studio-reservations-v172-backdrop" type="button" data-close aria-label="Fermer"></button>
      <aside class="studio-reservations-v172-drawer" role="dialog" aria-modal="true" aria-label="Planning et réservations">
        <header><div><span class="eyebrow">STUDIO · PLANNING</span><h2>Réservations & disponibilités</h2><p>Tout créneau confirmé, temporairement retenu ou bloqué ici disparaît automatiquement du tunnel public.</p></div><button class="studio-reservations-v172-close" type="button" data-close>×</button></header>
        <section class="studio-reservations-v172-block" data-edit-zone hidden>
          <div class="studio-reservations-v172-section-title"><strong>Bloquer un créneau</strong><small>Indisponibilité studio, fournisseur ou fermeture exceptionnelle</small></div>
          <form data-block-form>
            <select name="supplierId" required aria-label="Studio fournisseur"></select>
            <input name="slotDate" type="date" required aria-label="Date">
            <select name="daypart" required aria-label="Période"><option value="morning">Matin · 9h–12h</option><option value="afternoon">Après-midi · 14h–17h</option></select>
            <input name="note" type="text" maxlength="240" placeholder="Motif facultatif">
            <button type="submit">Bloquer</button>
          </form>
        </section>
        <section class="studio-reservations-v172-toolbar">
          <label><span>Afficher</span><select data-filter><option value="active">À gérer</option><option value="confirmed">Confirmées</option><option value="hold">En attente paiement</option><option value="blocked">Bloquées</option><option value="payment_conflict">Conflits</option><option value="all">Tout</option></select></label>
          <button type="button" data-refresh>Actualiser</button>
        </section>
        <div class="studio-reservations-v172-message" data-message></div>
        <main class="studio-reservations-v172-list" data-list><div class="studio-reservations-v172-empty">Chargement…</div></main>
      </aside>
    </div>`;
  document.body.appendChild(root);

  const trigger=root.querySelector('[data-open]'),layer=root.querySelector('[data-layer]'),count=root.querySelector('[data-count]');
  const list=root.querySelector('[data-list]'),message=root.querySelector('[data-message]'),filter=root.querySelector('[data-filter]');
  const editZone=root.querySelector('[data-edit-zone]'),blockForm=root.querySelector('[data-block-form]');
  let data={slots:[],suppliers:[],editable:false};

  trigger.addEventListener('click',()=>{layer.hidden=false;document.documentElement.classList.add('studio-reservations-v172-open');load();});
  root.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',close));
  root.querySelector('[data-refresh]').addEventListener('click',load);
  filter.addEventListener('change',render);
  blockForm.addEventListener('submit',blockSlot);
  list.addEventListener('click',handleAction);
  load(true);
  setInterval(()=>load(true),60000);

  async function load(silent=false){
    if(!silent)setMessage('Actualisation…');
    try{
      const response=await fetch('/api/admin/reservation-slots-v172',{headers:{Accept:'application/json'},cache:'no-store'});
      if(response.status===401||response.status===403){root.hidden=true;return;}
      const next=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(next.error||'load_failed');
      root.hidden=false;data=next;
      editZone.hidden=!data.editable;
      fillSuppliers();render();setMessage('');
    }catch(error){
      if(!silent)setMessage('Impossible de charger le planning.','error');
      console.warn('[studio-reservations-v172]',error);
    }
  }

  function fillSuppliers(){
    const select=blockForm.elements.supplierId,current=select.value;
    select.innerHTML=(data.suppliers||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.active?'':' · inactif'}</option>`).join('');
    if(current&&[...select.options].some(o=>o.value===current))select.value=current;
  }

  function render(){
    const slots=Array.isArray(data.slots)?data.slots:[];
    const activeCount=slots.filter(x=>['confirmed','hold','blocked','payment_conflict'].includes(x.status)&&x.slotDate>=today()).length;
    count.textContent=String(activeCount);
    const mode=filter.value;
    const filtered=slots.filter(slot=>mode==='all'||mode==='active'&&['confirmed','hold','blocked','payment_conflict'].includes(slot.status)||slot.status===mode);
    if(!filtered.length){list.innerHTML='<div class="studio-reservations-v172-empty">Aucun créneau dans cette vue.</div>';return;}
    list.innerHTML=filtered.map(card).join('');
  }

  function card(slot){
    const identity=slot.fullName||slot.company||slot.email||'Indisponibilité studio';
    const secondary=[slot.company&&slot.company!==identity?slot.company:'',slot.email&&slot.email!==identity?slot.email:''].filter(Boolean).join(' · ');
    const meta=[slot.cityName,slot.formatName,slot.supplierName].filter(Boolean).join(' · ');
    const status=statusLabel(slot.status),editable=Boolean(data.editable);
    const canMove=editable&&['confirmed','hold','blocked','payment_conflict'].includes(slot.status);
    const actionLabel=slot.status==='blocked'?'Libérer':'Annuler';
    const expires=slot.status==='hold'&&slot.expiresAt?`Retenue jusqu’à ${time(slot.expiresAt)}`:'';
    return `<article class="studio-reservation-v172 is-${esc(slot.status)}" data-slot-id="${esc(slot.id)}">
      <div class="studio-reservation-v172-head"><div><strong>${esc(prettyDate(slot.slotDate))} · ${esc(daypart(slot.daypart))}</strong><small>${esc(meta||slot.note||'Neptune Media')}</small></div><span>${esc(status)}</span></div>
      <div class="studio-reservation-v172-person"><b>${esc(identity)}</b>${secondary?`<small>${esc(secondary)}</small>`:''}${expires?`<em>${esc(expires)}</em>`:''}${slot.status==='payment_conflict'?'<em class="warning">Paiement reçu : résolution manuelle nécessaire.</em>':''}</div>
      ${canMove?`<div class="studio-reservation-v172-actions">
        <input data-date type="date" value="${esc(slot.slotDate)}" aria-label="Nouvelle date">
        <select data-daypart aria-label="Nouvelle période"><option value="morning" ${slot.daypart==='morning'?'selected':''}>Matin</option><option value="afternoon" ${slot.daypart==='afternoon'?'selected':''}>Après-midi</option></select>
        <button type="button" data-action="move">Déplacer</button>
        ${slot.status==='hold'||slot.status==='payment_conflict'?'<button type="button" data-action="confirm">Confirmer</button>':''}
        <button type="button" class="danger" data-action="cancel">${actionLabel}</button>
      </div>`:''}
    </article>`;
  }

  async function blockSlot(event){
    event.preventDefault();if(!data.editable)return;
    const fd=new FormData(blockForm),button=blockForm.querySelector('button[type="submit"]');button.disabled=true;setMessage('Blocage du créneau…');
    try{
      await mutate({action:'block',supplierId:fd.get('supplierId'),slotDate:fd.get('slotDate'),daypart:fd.get('daypart'),note:fd.get('note')});
      blockForm.elements.note.value='';setMessage('Créneau bloqué.');await load(true);
    }catch(error){setMessage(humanError(error.message),'error');}finally{button.disabled=false;}
  }

  async function handleAction(event){
    const button=event.target.closest('[data-action]');if(!button||!data.editable)return;
    const card=button.closest('[data-slot-id]'),id=card?.dataset.slotId;if(!id)return;
    button.disabled=true;const action=button.dataset.action;
    try{
      const payload={action,id};
      if(action==='move'){payload.slotDate=card.querySelector('[data-date]').value;payload.daypart=card.querySelector('[data-daypart]').value;}
      await mutate(payload);setMessage(action==='move'?'Réservation déplacée.':action==='confirm'?'Créneau confirmé.':'Créneau libéré.');await load(true);
    }catch(error){setMessage(humanError(error.message),'error');}finally{button.disabled=false;}
  }

  async function mutate(payload){
    const response=await fetch('/api/admin/reservation-slots-v172',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||`http_${response.status}`);return result;
  }

  function close(){layer.hidden=true;document.documentElement.classList.remove('studio-reservations-v172-open');}
  function setMessage(text,type=''){message.textContent=text||'';message.dataset.type=type;}
  function statusLabel(value){return({confirmed:'Confirmée',hold:'Paiement en cours',blocked:'Bloqué',payment_conflict:'Conflit paiement'}[value]||value);}
  function daypart(value){return value==='morning'?'Matin · 9h–12h':'Après-midi · 14h–17h';}
  function prettyDate(value){const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(d);}
  function time(value){const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(d);}
  function today(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function humanError(code){return({slot_unavailable:'Ce créneau est déjà occupé.',invalid_slot:'Choisissez une date et une période valides.',supplier_not_found:'Studio fournisseur introuvable.',slot_not_found:'Cette réservation n’existe plus.',forbidden:'Votre rôle ne permet pas cette modification.'}[code]||'Modification impossible. Réessayez.');}
  function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
})();
