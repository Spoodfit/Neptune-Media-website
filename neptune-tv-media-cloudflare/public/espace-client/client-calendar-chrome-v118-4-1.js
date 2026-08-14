const RELEASE='neptune-client-calendar-chrome-20260814-v118.4.1';
const TITLE='Que dois-je publier ?';
const DESCRIPTION='Visualisez le contenu prévu, le bon jour et les bons canaux. Passez de la semaine au mois selon le niveau de détail dont vous avez besoin.';
const SECTION_TITLE='Planning de publication';
const SECTION_COPY='Chaque carte correspond à la vidéo réellement prévue. Cliquez dessus pour vérifier la date et les canaux.';

if(location.pathname==='/espace-client/calendrier'||location.pathname.startsWith('/espace-client/calendrier/')){
  document.documentElement.dataset.clientCalendarChromeV11841='1';
  document.documentElement.dataset.clientCalendarChromeRelease=RELEASE;
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
}

function boot(){
  let queued=false;
  const sync=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  };
  apply();
  new MutationObserver(sync).observe(document.body,{childList:true,subtree:true,characterData:true});
}

function apply(){
  const intro=document.querySelector('.calendar-intro');
  const title=intro?.querySelector('h1');
  const description=intro?.querySelector('div>p:last-child');
  if(title&&title.textContent!==TITLE)title.textContent=TITLE;
  if(description&&description.textContent!==DESCRIPTION)description.textContent=DESCRIPTION;

  const heading=document.querySelector('.calendar-toolbar');
  const headingTitle=heading?.querySelector('h2');
  const headingCopy=heading?.querySelector('div>p:last-child');
  if(headingTitle&&headingTitle.textContent!==SECTION_TITLE)headingTitle.textContent=SECTION_TITLE;
  if(headingCopy&&headingCopy.textContent!==SECTION_COPY)headingCopy.textContent=SECTION_COPY;

  const reuseGuide=document.querySelector('.reuse-guide');
  if(reuseGuide&&!reuseGuide.hidden)reuseGuide.hidden=true;
  const legacyLibrary=document.querySelector('#libraryView');
  if(legacyLibrary&&!legacyLibrary.hidden)legacyLibrary.hidden=true;
  const viewSwitch=document.querySelector('.view-switch');
  if(viewSwitch&&!viewSwitch.hidden)viewSwitch.hidden=true;
}
