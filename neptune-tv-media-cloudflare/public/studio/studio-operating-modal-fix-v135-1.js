const RELEASE='neptune-studio-operating-modal-focus-20260823-v135.4';

document.body.dataset.studioOperatingModalFocus=RELEASE;

document.addEventListener('click',event=>{
  const raw=event.target;
  if(!(raw instanceof Element))return;
  const target=raw;
  if(target.closest('[data-v135-order]'))return;
  const trigger=target.closest('[data-v135-date]')||target.closest('[data-v135-create]');
  if(!trigger)return;
  if(trigger.dataset.v135ModalReplay==='1'){
    delete trigger.dataset.v135ModalReplay;
    return;
  }
  const agenda=document.getElementById('studioAgendaDialogV135');
  if(!agenda?.open)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  trigger.dataset.v135ModalReplay='1';
  agenda.addEventListener('close',()=>trigger.click(),{once:true});
  agenda.close();
},true);
