const RELEASE='neptune-studio-operating-modal-focus-20260823-v135.5';

document.body.dataset.studioOperatingModalFocus=RELEASE;

if(!window.__neptuneStudioDialogFocusV1355){
  window.__neptuneStudioDialogFocusV1355=true;
  const nativeShowModal=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function studioShowModalV1355(){
    if(this.id==='studioAgendaActionV135'){
      const agenda=document.getElementById('studioAgendaDialogV135');
      if(agenda?.open)agenda.close();
    }
    return nativeShowModal.call(this);
  };
}
