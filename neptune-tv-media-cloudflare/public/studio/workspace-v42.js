const detailDialog=document.getElementById('clientDialog');
const sidebar=document.querySelector('.studio-sidebar');
const shell=document.querySelector('.studio-shell');
const nativeShowModal=HTMLDialogElement.prototype.showModal;

bootWorkspace();

function bootWorkspace(){
  document.body.classList.add('studio-workspace-v42');
  installSidebarToggle();
  installIntegratedDialog();
  installDateComposer();
  observeCommandCenter();
}

function installSidebarToggle(){
  if(!sidebar||document.getElementById('studioSidebarToggle'))return;
  const button=document.createElement('button');
  button.id='studioSidebarToggle';
  button.className='studio-sidebar-toggle';
  button.type='button';
  button.setAttribute('aria-label','Réduire ou ouvrir le menu');
  button.innerHTML='<span>‹</span>';
  sidebar.append(button);
  const collapsed=localStorage.getItem('neptune_studio_sidebar_collapsed')==='1';
  setSidebar(collapsed);
  button.addEventListener('click',()=>setSidebar(!document.body.classList.contains('studio-sidebar-collapsed')));
}

function setSidebar(collapsed){
  document.body.classList.toggle('studio-sidebar-collapsed',collapsed);
  localStorage.setItem('neptune_studio_sidebar_collapsed',collapsed?'1':'0');
  const button=document.getElementById('studioSidebarToggle');
  if(button)button.querySelector('span').textContent=collapsed?'›':'‹';
}

function installIntegratedDialog(){
  if(!detailDialog)return;
  HTMLDialogElement.prototype.showModal=function(){
    if(this!==detailDialog)return nativeShowModal.call(this);
    this.setAttribute('open','');
    document.body.classList.add('studio-detail-open');
    enhanceDetailHeader();
    this.dispatchEvent(new Event('studio-open'));
  };
  detailDialog.addEventListener('close',()=>{
    document.body.classList.remove('studio-detail-open');
    history.replaceState({},'',location.pathname);
  });
  detailDialog.addEventListener('cancel',(event)=>{
    event.preventDefault();
    detailDialog.close();
  });
  new MutationObserver(()=>{
    if(detailDialog.open){document.body.classList.add('studio-detail-open');enhanceDetailHeader();}
  }).observe(detailDialog,{attributes:true,attributeFilter:['open'],childList:true,subtree:true});
}

function enhanceDetailHeader(){
  const title=detailDialog?.querySelector('.detail-title');
  if(!title||title.dataset.workspaceV42)return;
  title.dataset.workspaceV42='1';
  const back=document.createElement('button');
  back.type='button';
  back.className='studio-detail-back';
  back.innerHTML='<span>←</span> Parcours clients';
  back.addEventListener('click',()=>detailDialog.close());
  title.prepend(back);
  const close=title.querySelector('.close');
  if(close)close.setAttribute('aria-label','Revenir aux parcours clients');
}

function observeCommandCenter(){
  if(!detailDialog)return;
  new MutationObserver(()=>upgradeDateForms()).observe(detailDialog,{childList:true,subtree:true});
  upgradeDateForms();
}

function upgradeDateForms(){
  detailDialog?.querySelectorAll('[data-workflow-form]').forEach((form)=>{
    if(form.dataset.dateUiV42)return;
    const type=form.dataset.workflowForm;
    if(type==='confirm_supplier_date')upgradeFilmingForm(form);
    if(type==='schedule_broadcast')upgradeBroadcastForm(form);
  });
}

function upgradeFilmingForm(form){
  form.dataset.dateUiV42='1';
  const original=form.querySelector('[name="filmingAt"]')?.value||'';
  const [date,time]=splitLocal(original);
  form.innerHTML=`<div class="date-action-head"><span>DATE DU PASSAGE</span><strong>Confirmer en quelques secondes</strong></div><div class="date-action-grid"><label><span>Jour</span><input name="filmingDate" type="date" value="${escapeAttr(date)}" required></label><label><span>Heure</span><select name="filmingTime">${timeOptions(time)}</select></label></div><input name="filmingAt" type="hidden" value="${escapeAttr(original)}"><button type="submit">Confirmer et notifier</button>`;
}

function upgradeBroadcastForm(form){
  form.dataset.dateUiV42='1';
  const [date,time]=splitLocal('');
  form.innerHTML=`<div class="date-action-head"><span>DIFFUSION</span><strong>Planifier la publication</strong></div><div class="date-action-grid"><label><span>Jour</span><input name="broadcastDate" type="date" value="${escapeAttr(date)}" required></label><label><span>Heure</span><select name="broadcastTime">${timeOptions(time||'18:00')}</select></label></div><label><span>Lien de diffusion</span><input name="broadcastUrl" type="url" placeholder="https://…"></label><input name="broadcastAt" type="hidden"><button type="submit">Programmer et notifier</button>`;
}

function installDateComposer(){
  document.addEventListener('submit',(event)=>{
    const form=event.target.closest?.('[data-workflow-form]');
    if(!form)return;
    if(form.dataset.workflowForm==='confirm_supplier_date')compose(form,'filmingDate','filmingTime','filmingAt');
    if(form.dataset.workflowForm==='schedule_broadcast')compose(form,'broadcastDate','broadcastTime','broadcastAt');
  },true);
}

function compose(form,dateName,timeName,targetName){
  const date=form.elements[dateName]?.value||'';
  const time=form.elements[timeName]?.value||'09:00';
  const target=form.elements[targetName];
  if(target)target.value=date?`${date}T${time}`:'';
}

function splitLocal(value){
  const match=String(value||'').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/u);
  if(match)return[match[1],match[2]];
  const tomorrow=new Date(Date.now()+86400000);
  return[tomorrow.toISOString().slice(0,10),'09:00'];
}

function timeOptions(selected){
  const values=[];
  for(let hour=7;hour<=20;hour++)for(const minute of ['00','30'])values.push(`${String(hour).padStart(2,'0')}:${minute}`);
  return values.map((value)=>`<option value="${value}" ${value===selected?'selected':''}>${value.replace(':','h')}</option>`).join('');
}

function escapeAttr(value){return String(value||'').replace(/[&"<>']/gu,(character)=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;',"'":'&#39;'}[character]));}
