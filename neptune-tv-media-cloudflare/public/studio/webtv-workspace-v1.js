(() => {
  const KEY='__neptuneWebTvWorkspaceV1';
  if(window[KEY])return;
  window[KEY]=true;

  const start=()=>{
    const main=document.querySelector('.studio-page-webtv .main')||document.querySelector('.main');
    const topbar=document.querySelector('.studio-page-webtv .topbar')||document.querySelector('.topbar');
    const hero=main?.querySelector('.hero');
    const liveCard=document.getElementById('liveCard');
    const monitor=main?.querySelector('.antenna-monitor');
    const metrics=main?.querySelector('.metrics');
    const program=document.getElementById('programPanel');
    const sideStack=main?.querySelector('.side-stack');
    const layout=main?.querySelector('.layout');
    if(!main||!topbar||!monitor||!program||!sideStack)return;

    document.body.classList.add('webtv-workspace-v1');

    const tabs=document.createElement('nav');
    tabs.className='webtv-section-tabs';
    tabs.setAttribute('aria-label','Sections de la régie Web TV');
    tabs.setAttribute('role','tablist');
    tabs.innerHTML=[
      ['antenna','Antenne','Direct et état'],
      ['program','Programme','Grille de diffusion'],
      ['settings','Configuration','YouTube et sécurité'],
    ].map(([id,label,desc])=>`<button type="button" role="tab" data-webtv-section-button="${id}"><span>${label}</span><small>${desc}</small></button>`).join('');
    topbar.after(tabs);

    const workspace=document.createElement('div');
    workspace.className='webtv-section-workspace';

    const antenna=makeSection('antenna','Antenne','Surveillez le direct et l’état réel de la diffusion sans quitter le Studio.');
    const antennaGrid=document.createElement('div');
    antennaGrid.className='webtv-antenna-grid';
    antennaGrid.append(monitor);
    const statusRail=document.createElement('aside');
    statusRail.className='webtv-status-rail';
    if(liveCard)statusRail.append(liveCard);
    if(metrics)statusRail.append(metrics);
    antennaGrid.append(statusRail);
    antenna.body.append(antennaGrid);

    const programSection=makeSection('program','Programme','Préparez la suite, repérez le contenu actuellement diffusé puis appliquez les changements à l’antenne.');
    programSection.body.append(program);

    const settings=makeSection('settings','Configuration','Les paramètres sensibles sont séparés du programme pour éviter les erreurs pendant un direct.');
    sideStack.classList.add('webtv-settings-grid');
    settings.body.append(sideStack);

    workspace.append(antenna.root,programSection.root,settings.root);
    main.prepend(workspace);

    hero?.remove();
    layout?.remove();

    const buttons=[...tabs.querySelectorAll('[data-webtv-section-button]')];
    const panels=[...workspace.querySelectorAll('[data-webtv-section-panel]')];

    const activate=(id,{focus=false,updateHash=true}={})=>{
      const valid=panels.some(panel=>panel.dataset.webtvSectionPanel===id)?id:'antenna';
      panels.forEach(panel=>{panel.hidden=panel.dataset.webtvSectionPanel!==valid;});
      buttons.forEach(button=>{
        const active=button.dataset.webtvSectionButton===valid;
        button.classList.toggle('active',active);
        button.setAttribute('aria-selected',active?'true':'false');
        button.tabIndex=active?0:-1;
        if(active&&focus)button.focus({preventScroll:true});
      });
      try{sessionStorage.setItem('neptune_webtv_section',valid);}catch{}
      if(updateHash&&location.hash!==`#${valid}`)history.replaceState(null,'',`${location.pathname}#${valid}`);
      document.querySelector('.webtv-section-workspace')?.scrollIntoView({block:'start'});
    };

    buttons.forEach((button,index)=>{
      button.addEventListener('click',()=>activate(button.dataset.webtvSectionButton));
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();
        const delta=event.key==='ArrowRight'?1:-1;
        const next=buttons[(index+delta+buttons.length)%buttons.length];
        activate(next.dataset.webtvSectionButton,{focus:true});
      });
    });

    const syncTabStates=()=>{
      const antennaButton=tabs.querySelector('[data-webtv-section-button="antenna"]');
      const programButton=tabs.querySelector('[data-webtv-section-button="program"]');
      const liveText=String(document.getElementById('liveLabel')?.textContent||'').toUpperCase();
      const syncText=String(document.getElementById('syncState')?.textContent||'').toLowerCase();
      antennaButton?.classList.toggle('has-live',liveText.includes('DIRECT'));
      programButton?.classList.toggle('needs-apply',syncText.includes('non appliqu'));
    };
    syncTabStates();
    const observer=new MutationObserver(syncTabStates);
    const liveLabel=document.getElementById('liveLabel');
    const syncState=document.getElementById('syncState');
    if(liveLabel)observer.observe(liveLabel,{childList:true,subtree:true,characterData:true});
    if(syncState)observer.observe(syncState,{childList:true,subtree:true,characterData:true});

    let initial=location.hash.replace('#','').trim();
    if(!['antenna','program','settings'].includes(initial)){
      try{initial=sessionStorage.getItem('neptune_webtv_section')||'antenna';}catch{initial='antenna';}
    }
    activate(initial,{updateHash:false});

    window.addEventListener('hashchange',()=>{
      const id=location.hash.replace('#','').trim();
      if(['antenna','program','settings'].includes(id))activate(id,{updateHash:false});
    });
  };

  function makeSection(id,title,description){
    const root=document.createElement('section');
    root.className='webtv-section';
    root.dataset.webtvSectionPanel=id;
    root.setAttribute('role','tabpanel');
    root.setAttribute('aria-label',title);
    const header=document.createElement('header');
    header.className='webtv-section-header';
    header.innerHTML=`<div><p class="eyebrow">RÉGIE WEB TV</p><h2>${title}</h2><p>${description}</p></div>`;
    const body=document.createElement('div');
    body.className='webtv-section-body';
    root.append(header,body);
    return{root,body};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
