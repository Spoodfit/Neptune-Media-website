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
    $('#requestedDate').textContent=formatRequestedPreference(booking);
    if(booking.configurationChoice){
      const formatRow=$('#format')?.closest('div');
      if(formatRow){
        const config=document.createElement('small');
        config.textContent=`Configuration : ${booking.configurationChoice}`;
        config.style.display='block';config.style.marginTop='4px';config.style.opacity='.72';
        formatRow.append(config);
      }
    }
    ensureConfirmField();
    applyDecision(requestedDecision);
    $('#loading').hidden=true;$('#content').hidden=false;
    requestAnimationFrame(()=>{
      if(requestedDecision==='alternate')$('#proposedAt')?.focus();
      else if(requestedDecision==='confirm'&&booking.needsConfirmedTime)$('#confirmedAt')?.focus();
      else $('#submitButton')?.focus();
    });
  }catch{showError();}
}

document.querySelectorAll('input[name="decision"]').forEach((input)=>input.addEventListener('change',()=>applyDecision(input.value)));

function ensureConfirmField(){
  if($('#confirmField'))return;
  const alternate=$('#alternateField');
  if(!alternate)return;
  const label=document.createElement('label');
  label.id='confirmField';label.className='field';label.hidden=true;
  label.innerHTML='<span>Heure exacte confirmée *</span><input id="confirmedAt" name="confirmedAt" type="datetime-local"><small>Conservez la date demandée et renseignez l’heure réelle du passage.</small>';
  alternate.before(label);
  if(booking?.requestedDate){
    const input=label.querySelector('input');
    input.min=`${booking.requestedDate}T00:00`;
    input.max=`${booking.requestedDate}T23:59`;
  }
}

function applyDecision(decision){
  const input=$(`input[name="decision"][value="${decision}"]`)||$('input[name="decision"][value="confirm"]');
  if(input)input.checked=true;
  const alternate=decision==='alternate',confirm=decision==='confirm';
  $('#alternateField').hidden=!alternate;
  $('#proposedAt').required=alternate;
  const requiresTime=Boolean(confirm&&booking?.needsConfirmedTime);
  const confirmField=$('#confirmField'),confirmedAt=$('#confirmedAt');
  if(confirmField)confirmField.hidden=!requiresTime;
  if(confirmedAt)confirmedAt.required=requiresTime;
  const button=$('#submitButton');
  if(button)button.textContent=confirm
    ?(requiresTime?'Confirmer la date et l’heure':'Confirmer définitivement ce créneau')
    :alternate?'Envoyer le nouveau créneau':'Signaler mon indisponibilité';
  const message=$('#message');
  if(message)message.textContent=confirm
    ?(requiresTime?'Le client a choisi une préférence de date et de plage horaire. Indiquez l’heure exacte que le studio confirme.':'Vérifiez la date ci-dessus puis confirmez. Cette dernière validation empêche les scanners automatiques d’e-mails de répondre à votre place.')
    :'';
}

$('#responseForm').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const decision=String(form.get('decision')||'confirm');
  const proposedLocal=String(form.get('proposedAt')||'');
  const confirmedLocal=String(form.get('confirmedAt')||'');
  if(decision==='alternate'&&!proposedLocal){$('#message').textContent='Renseignez la nouvelle date proposée.';return;}
  if(decision==='confirm'&&booking?.needsConfirmedTime&&!confirmedLocal){$('#message').textContent='Renseignez l’heure exacte confirmée par le studio.';return;}
  const proposedAt=proposedLocal?localToIso(proposedLocal):'';
  const confirmedAt=confirmedLocal?localToIso(confirmedLocal):'';
  if(proposedLocal&&!proposedAt){$('#message').textContent='La nouvelle date proposée est invalide.';return;}
  if(confirmedLocal&&!confirmedAt){$('#message').textContent='L’heure confirmée est invalide.';return;}
  const button=$('#submitButton');button.disabled=true;button.textContent='Envoi…';$('#message').textContent='';
  try{
    const response=await fetch('/api/workflow/supplier',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({token,decision,confirmedAt,proposedAt,note:String(form.get('note')||'')})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'send_failed');
    $('#content').hidden=true;$('#success').hidden=false;
  }catch(error){
    const messages={
      invalid_or_expired_token:'Ce lien a expiré. Demandez une nouvelle invitation.',
      confirmed_time_required:'Renseignez l’heure exacte confirmée par le studio.',
      confirmed_date_must_match_requested_date:'Pour confirmer, conservez la date demandée. Sinon choisissez « Proposer une autre date ».',
      alternate_date_required:'Renseignez la nouvelle date proposée.',
    };
    $('#message').textContent=messages[error.message]||'La réponse n’a pas pu être enregistrée. Réessayez.';
    button.disabled=false;applyDecision(decision);
  }
});

function showError(){
  $('#loading').hidden=true;$('#content').hidden=true;$('#error').hidden=false;
}

function formatRequestedPreference(value){
  if(value?.requestedFilmingAt)return formatDate(value.requestedFilmingAt);
  if(value?.requestedDate){
    const date=new Date(`${value.requestedDate}T12:00:00`);
    const label=Number.isNaN(date.getTime())?value.requestedDate:new Intl.DateTimeFormat('fr-FR',{dateStyle:'full'}).format(date);
    const daypart=value.requestedDaypartLabel||daypartLabel(value.requestedDaypart);
    return [label,daypart].filter(Boolean).join(' · ');
  }
  return 'À confirmer';
}
function daypartLabel(value){return({morning:'Matin',afternoon:'Après-midi',flexible:'Horaire flexible'})[String(value||'')]||'';}
function formatDate(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'À confirmer':new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Paris'}).format(date);}
function localToIso(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?'':date.toISOString();}
