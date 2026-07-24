const detailDialog=document.getElementById('clientDialog');
const sidebar=document.querySelector('.studio-sidebar');
const nativeShowModal=typeof HTMLDialogElement!=='undefined'?HTMLDialogElement.prototype.showModal:null;
let detailResizeObserver=null;

bootWorkspace();

function bootWorkspace(){
  document.body.classList.add('studio-workspace-v42');
  installSidebarToggle();
  installIntegratedDialog();
  installDateComposer();
  installInlineValidationGuard();
  observeCommandCenter();
  window.addEventListener('resize',syncDetailOffsets,{passive:true});
}

function installSidebarToggle(){
  if(!sidebar||document.getElementById('studioSidebarToggle'))return;
  const button=document.createElement('button');
  button.id='studioSidebarToggle';
  button.className='studio-sidebar-toggle';
  button.type='button';
  button.setAttribute('aria-label','Réduire le menu latéral');
  button.setAttribute('aria-controls','studioPrimaryNavigation');
  button.innerHTML='<span aria-hidden="true">‹</span>';
  const navigation=sidebar.querySelector('.studio-nav');
  if(navigation)navigation.id='studioPrimaryNavigation';
  sidebar.append(button);
  const collapsed=localStorage.getItem('neptune_studio_sidebar_collapsed')==='1';
  setSidebar(collapsed,false);
  button.addEventListener('click',()=>setSidebar(!document.body.classList.contains('studio-sidebar-collapsed'),true));
}

function setSidebar(collapsed,focusButton=false){
  document.body.classList.toggle('studio-sidebar-collapsed',collapsed);
  localStorage.setItem('neptune_studio_sidebar_collapsed',collapsed?'1':'0');
  const button=document.getElementById('studioSidebarToggle');
  if(button){
    button.querySelector('span').textContent=collapsed?'›':'‹';
    button.setAttribute('aria-expanded',collapsed?'false':'true');
    button.setAttribute('aria-label',collapsed?'Ouvrir le menu latéral':'Réduire le menu latéral');
    button.title=collapsed?'Ouvrir le menu':'Réduire le menu';
    if(focusButton)button.focus({preventScroll:true});
  }
  window.setTimeout(syncDetailOffsets,230);
}

function installIntegratedDialog(){
  if(!detailDialog||!nativeShowModal)return;
  HTMLDialogElement.prototype.showModal=function(){
    if(this!==detailDialog)return nativeShowModal.call(this);
    this.setAttribute('open','');
    this.setAttribute('aria-modal','false');
    document.body.classList.add('studio-detail-open');
    enhanceDetailHeader();
    syncDetailOffsets();
    this.dispatchEvent(new Event('studio-open'));
  };
  detailDialog.addEventListener('close',()=>{
    document.body.classList.remove('studio-detail-open');
    detailResizeObserver?.disconnect();
    history.replaceState({},'',location.pathname);
  });
  detailDialog.addEventListener('cancel',(event)=>{
    event.preventDefault();
    detailDialog.close();
  });
  new MutationObserver(()=>{
    if(detailDialog.open){
      document.body.classList.add('studio-detail-open');
      enhanceDetailHeader();
      syncDetailOffsets();
      syncDetailView();
    }
  }).observe(detailDialog,{attributes:true,attributeFilter:['open'],childList:true,subtree:true});
}

function enhanceDetailHeader(){
  const title=detailDialog?.querySelector('.detail-title');
  if(!title)return;
  if(!title.dataset.workspaceV42){
    title.dataset.workspaceV42='1';
    const back=document.createElement('button');
    back.type='button';
    back.className='studio-detail-back';
    back.innerHTML='<span aria-hidden="true">←</span> Parcours clients';
    back.addEventListener('click',()=>detailDialog.close());
    title.prepend(back);
    const close=title.querySelector('.close');
    if(close)close.setAttribute('aria-label','Revenir aux parcours clients');
  }
  detailResizeObserver?.disconnect();
  if(typeof ResizeObserver==='function'){
    detailResizeObserver=new ResizeObserver(syncDetailOffsets);
    detailResizeObserver.observe(title);
  }
}

function syncDetailOffsets(){
  const title=detailDialog?.querySelector('.detail-title');
  if(!title)return;
  const height=Math.ceil(title.getBoundingClientRect().height);
  if(height>0)document.documentElement.style.setProperty('--studio-detail-title-height',`${height}px`);
}

function observeCommandCenter(){
  if(!detailDialog)return;
  new MutationObserver(()=>{
    upgradeDateForms();
    syncDetailView();
  }).observe(detailDialog,{childList:true,subtree:true});
  detailDialog.addEventListener('click',(event)=>{
    if(event.target.closest?.('[data-detail-tab]'))window.setTimeout(syncDetailView,0);
  });
  upgradeDateForms();
  syncDetailView();
}

function syncDetailView(){
  const root=detailDialog?.querySelector('#clientDetail');
  const body=root?.querySelector('#detailBody');
  if(!body)return;
  const activeTab=root.querySelector('.tabs button.active')?.dataset.detailTab||'tracking';
  const commandCenter=root.querySelector('#workflowCommandCenter');
  body.hidden=activeTab==='tracking'&&Boolean(commandCenter);
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
  form.innerHTML=`<div class="date-action-head"><span>DATE DU PASSAGE</span><strong>Confirmer en quelques secondes</strong></div><div class="date-action-grid"><label><span>Jour</span><input name="filmingDate" type="date" value="${escapeAttr(date)}" required></label><label><span>Heure</span><select name="filmingTime" aria-label="Heure du passage">${timeOptions(time)}</select></label></div><input name="filmingAt" type="hidden" value="${escapeAttr(original)}"><button type="submit">Confirmer et notifier</button>`;
}

function upgradeBroadcastForm(form){
  form.dataset.dateUiV42='1';
  const [date,time]=splitLocal('');
  form.innerHTML=`<div class="date-action-head"><span>DIFFUSION</span><strong>Planifier la publication</strong></div><div class="date-action-grid"><label><span>Jour</span><input name="broadcastDate" type="date" value="${escapeAttr(date)}" required></label><label><span>Heure</span><select name="broadcastTime" aria-label="Heure de diffusion">${timeOptions(time||'18:00')}</select></label></div><label><span>Lien de diffusion</span><input name="broadcastUrl" type="url" inputmode="url" placeholder="https://…"></label><input name="broadcastAt" type="hidden"><button type="submit">Programmer et notifier</button>`;
}

function installDateComposer(){
  document.addEventListener('submit',(event)=>{
    const form=event.target.closest?.('[data-workflow-form]');
    if(!form)return;
    if(form.dataset.workflowForm==='confirm_supplier_date')compose(form,'filmingDate','filmingTime','filmingAt');
    if(form.dataset.workflowForm==='schedule_broadcast')compose(form,'broadcastDate','broadcastTime','broadcastAt');
  },true);
}

function installInlineValidationGuard(){
  document.addEventListener('click',(event)=>{
    const accept=event.target.closest?.('[data-confirm-accept]');
    if(!accept)return;
    const confirmation=accept.closest('.workflow-inline-confirm');
    const note=confirmation?.querySelector('[data-confirm-note]');
    if(note&&String(note.value||'').trim()===''){
      event.preventDefault();
      event.stopImmediatePropagation();
      note.setAttribute('aria-invalid','true');
      note.focus();
    }
  },true);
  document.addEventListener('input',(event)=>{
    if(event.target.matches?.('[data-confirm-note]'))event.target.removeAttribute('aria-invalid');
  });
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
