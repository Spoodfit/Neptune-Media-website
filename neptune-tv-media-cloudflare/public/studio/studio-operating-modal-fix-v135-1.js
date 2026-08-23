const RELEASE='neptune-studio-operating-modal-focus-20260823-v135.1';

document.body.dataset.studioOperatingModalFocus=RELEASE;

document.addEventListener('click',event=>{
  const target=event.target;
  if(!(target instanceof Element))return;
  if(target.closest('[data-v135-order]'))return;
  const opensAction=target.closest('[data-v135-date]')||target.closest('[data-v135-create]');
  if(!opensAction)return;
  const agenda=document.getElementById('studioAgendaDialogV135');
  if(agenda?.open)agenda.close();
},true);
