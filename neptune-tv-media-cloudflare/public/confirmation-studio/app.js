const $=(selector)=>document.querySelector(selector);
const params=new URLSearchParams(location.search);
const token=params.get('token')||'';
const requestedDecision=['confirm','alternate','reject'].includes(params.get('decision'))?params.get('decision'):'confirm';
let booking=null;

boot();

async function boot(){
  if(!token)return showError();
  try{
    const response=await fetch(`/api/workflow/supplier?token=${encodeURIComponent(token)}`,{headers:{Accept:'application/json'},credentials:'same-origin'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.booking)throw new Error(data.error||'invalid_link');
    booking=data.booking;
    $('#clientName').textContent=booking.fullName||'Client Neptune Media';
    $('#company').textContent=booking.company||'—';
    $('#format').textContent=booking.format||'HORS NORME';
    $('#requestedDate').textContent=formatDate(booking.requestedFilmingAt);
    applyDecision(requestedDecision);
    $('#loading').hidden=true;$('#content').hidden=false;
    requestAnimationFrame(()=>requestedDecision==='alternate'?$('#proposedAt')?.focus():$('#submitButton')?.focus());
  }catch{showError();}
}

document.querySelectorAll('input[name="decision"]').forEach((input)=>input.addEventListener('change',()=>applyDecision(input.value)));

function applyDecision(decision){
  const input=$(`input[name="decision"][value="${decision}"]`)||$('input[name="decision"][value="confirm"]');
  if(input)input.checked=true;
  const alternate=decision==='alternate';
  $('#alternateField').hidden=!alternate;
  $('#proposedAt').required=alternate;
  const button=$('#submitButton');
  if(button)button.textContent=decision==='confirm'?'Confirmer définitivement ce créneau':alternate?'Envoyer le nouveau créneau':'Signaler mon indisponibilité';
  const message=$('#message');
  if(message)message.textContent=decision==='confirm'?'Vérifiez la date ci-dessus puis confirmez. Cette dernière validation empêche les scanners automatiques d’e-mails de répondre à votre place.':'';
}

$('#responseForm').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const decision=String(form.get('decision')||'confirm');
  const proposedAt=String(form.get('proposedAt')||'');
  if(decision==='alternate'&&!proposedAt){$('#message').textContent='Renseignez la nouvelle date proposée.';return;}
  const button=$('#submitButton');button.disabled=true;button.textContent='Envoi…';$('#message').textContent='';
  try{
    const response=await fetch('/api/workflow/supplier',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({token,decision,proposedAt,note:String(form.get('note')||'')})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'send_failed');
    $('#content').hidden=true;$('#success').hidden=false;
  }catch(error){
    $('#message').textContent=error.message==='invalid_or_expired_token'?'Ce lien a expiré. Demandez une nouvelle invitation.':'La réponse n’a pas pu être enregistrée. Réessayez.';
    button.disabled=false;applyDecision(decision);
  }
});

function showError(){
  $('#loading').hidden=true;$('#content').hidden=true;$('#error').hidden=false;
}
function formatDate(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À confirmer':new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Paris'}).format(date);}
