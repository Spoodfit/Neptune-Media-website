(() => {
  const RELEASE='neptune-member-gate-20260903-v171-email-only';
  const STORAGE='neptune_media_reservation_v163';
  const ADMITTED='neptune_reservation_member_admitted_v171';
  const ENTRY_SESSION='neptune_reservation_member_entry_session_v171';
  const params=new URLSearchParams(location.search);
  const saved=readSaved();
  const currentToken=String(params.get('reservation_token')||saved?.token||'').trim();

  if(currentToken&&sessionStorage.getItem(ADMITTED)===currentToken){
    document.documentElement.dataset.memberGate='bypassed';
    return;
  }

  document.documentElement.dataset.memberGate=RELEASE;
  const gate=document.createElement('section');
  gate.className='member-gate-v170';
  gate.id='neptuneMemberGateV170';
  gate.setAttribute('role','dialog');
  gate.setAttribute('aria-modal','true');
  gate.setAttribute('aria-labelledby','memberGateTitleV170');
  gate.innerHTML=`
    <div class="member-gate-card-v170">
      <a class="member-gate-brand-v170" href="/" aria-label="Neptune Media"><img src="/assets/logo-neptune.svg" alt=""><span><b>Neptune Media</b><span>Accès réservation</span></span></a>
      <p class="member-gate-kicker-v170">Votre réservation commence ici</p>
      <h1 id="memberGateTitleV170">Votre e-mail suffit.</h1>
      <p class="member-gate-lead-v170">Il rattache votre réservation à votre espace Neptune et vous permet de retrouver votre parcours plus tard.</p>
      <form class="member-gate-form-v170" id="memberEmailGateV171">
        <label class="member-gate-field-v170"><span>Votre adresse e-mail</span><input name="email" type="email" autocomplete="email" inputmode="email" placeholder="vous@entreprise.com" required></label>
        <button class="member-gate-submit-v170" type="submit">Continuer</button>
        <p class="member-gate-note-v170">Nouveau chez Neptune ? Votre espace client est créé automatiquement. Déjà connu ? Nous retrouvons simplement votre compte. Aucun mot de passe ici : un code sécurisé sera demandé uniquement lorsque vous ouvrirez votre espace client.</p>
        <p class="member-gate-message-v170" id="memberGateMessageV170" aria-live="polite"></p>
      </form>
    </div>`;
  document.body.appendChild(gate);
  document.body.style.overflow='hidden';

  const form=gate.querySelector('#memberEmailGateV171');
  const emailInput=form.elements.email;
  const message=gate.querySelector('#memberGateMessageV170');
  const knownEmail=String(saved?.contact?.email||'').trim().toLowerCase();
  if(validEmail(knownEmail))emailInput.value=knownEmail;
  requestAnimationFrame(()=>emailInput.focus());

  form.addEventListener('submit',submit);

  async function submit(event){
    event.preventDefault();
    clearMessage();
    const email=String(new FormData(form).get('email')||'').trim().toLowerCase();
    if(!validEmail(email)){
      setMessage('Saisissez une adresse e-mail valide.',true);
      emailInput.focus();
      return;
    }

    setBusy(true);
    try{
      const entrySessionId=getEntrySessionId();
      const response=await fetch('/api/reservation/member-entry-v171',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({email,reservationToken:currentToken,entrySessionId}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.token)throw new Error(data.error||'member_entry_failed');

      const next={...(saved||{}),token:data.token,contact:{...(saved?.contact||{}),email}};
      localStorage.setItem(STORAGE,JSON.stringify(next));
      sessionStorage.setItem(ADMITTED,data.token);
      sessionStorage.removeItem(ENTRY_SESSION);
      setMessage('Accès reconnu. Ouverture de votre réservation…',false,true);

      const target=new URL(location.href);
      target.searchParams.set('reservation_token',data.token);
      target.searchParams.delete('payment');
      location.replace(target.toString());
    }catch(error){
      console.error('[member-gate-v171] entry failed',error);
      setMessage('Impossible de continuer pour le moment. Réessayez dans quelques instants.',true);
      setBusy(false);
    }
  }

  function getEntrySessionId(){
    let value=sessionStorage.getItem(ENTRY_SESSION)||'';
    if(!value){
      value=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(ENTRY_SESSION,value);
    }
    return value;
  }
  function setBusy(value){
    form.querySelectorAll('input,button').forEach(node=>{node.disabled=Boolean(value);});
    form.querySelector('button').textContent=value?'Ouverture…':'Continuer';
  }
  function clearMessage(){message.textContent='';message.className='member-gate-message-v170';}
  function setMessage(text,error=false,ok=false){message.textContent=text;message.className=`member-gate-message-v170${error?' is-error':ok?' is-ok':''}`;}
  function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(String(value||''));}
  function readSaved(){try{return JSON.parse(localStorage.getItem(STORAGE)||'null');}catch{return null;}}
})();
