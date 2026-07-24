const ICONS={
  home:'<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 10.4V20h13v-9.6M9.5 20v-6h5v6"/>',
  route:'<circle cx="6" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M8.3 6h3.2a3 3 0 0 1 3 3v1.8a3 3 0 0 0 3 3h.2M6 8.3v4.2a3 3 0 0 0 3 3h6.7"/>',
  film:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m8 5 2.5 4M14 5l2.5 4M3 9h18M9.5 12.2l5 2.8-5 2.8Z"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3M8 16.5h6"/>',
  sparkles:'<path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3Z"/><path d="m18.5 12.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5.5 14l.8 2.2 2.2.8-2.2.8L5.5 20l-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  playSquare:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m10 8.7 5.8 3.3-5.8 3.3Z"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  euro:'<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5M4.5 10h9M4.5 14h8"/>',
  settings:'<circle cx="12" cy="12" r="3.1"/><path d="M19 12a7.6 7.6 0 0 0-.1-1.2l2-1.6-2-3.4-2.5 1a8 8 0 0 0-2-1.2L14 3h-4l-.4 2.6a8 8 0 0 0-2 1.2l-2.5-1-2 3.4 2 1.6A7.6 7.6 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.5-1a8 8 0 0 0 2 1.2L10 21h4l.4-2.6a8 8 0 0 0 2-1.2l2.5 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  chevronRight:'<path d="m9 5 7 7-7 7"/>',
  arrowRight:'<path d="M4 12h16M14 6l6 6-6 6"/>',
  arrowUpRight:'<path d="M7 17 17 7M8 7h9v9"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  logout:'<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m14 16 4-4-4-4M18 12H9"/>',
  microphone:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/>',
  network:'<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="m8.2 8.3 2.6 7.2M15.8 8.3l-2.6 7.2M8.4 7h7.2"/>',
  receipt:'<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .7-1.5 1.2-1.5 2.5M12 17.2v.1"/>',
  play:'<path d="m9 7 8 5-8 5Z"/>',
  copy:'<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
};

function icon(name){return `<svg class="neptune-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]||ICONS.sparkles}</svg>`;}

function replaceOnce(element,name){
  if(!element||element.dataset.premiumIcon===name)return;
  element.innerHTML=icon(name);
  element.dataset.premiumIcon=name;
}

function upgrade(root=document){
  document.documentElement.classList.add('neptune-premium-icons');

  root.querySelectorAll('.studio-nav-link').forEach((item)=>{
    const label=item.querySelector('strong')?.textContent?.trim().toLowerCase()||'';
    const name=label.includes('vue d’ensemble')?'home':label.includes('surveillance')?'route':label.includes('contenu')?'film':label.includes('calendrier')?'calendar':label.includes('video studio')?'sparkles':label.includes('programme')?'playSquare':label.includes('audience')?'chart':label.includes('finance')?'euro':label.includes('réglage')?'settings':null;
    if(!name)return;
    const holder=item.querySelector(':scope > span:first-child');
    if(holder){holder.classList.add('studio-nav-icon');replaceOnce(holder,name);}
  });

  const accountArrow=root.querySelector('.studio-account>i');
  if(accountArrow)replaceOnce(accountArrow,'arrowRight');

  root.querySelectorAll('[data-logout]').forEach((button)=>replaceOnce(button,'logout'));
  replaceOnce(root.querySelector('.header-booking>span'),'plus');
  replaceOnce(root.querySelector('#closePanel'),'close');
  replaceOnce(root.querySelector('#closeDetail'),'close');
  replaceOnce(root.querySelector('#studioSidebarToggle'),'chevronRight');

  const metricMap={appointments:'calendar',content:'film',billing:'receipt',calendar:'playSquare',tracking:'route'};
  root.querySelectorAll('.metric-card[data-open-panel]').forEach((card)=>{
    const name=metricMap[card.dataset.openPanel]||'sparkles';
    replaceOnce(card.querySelector('.metric-icon'),name);
    replaceOnce(card.querySelector('.metric-arrow'),'chevronRight');
  });

  root.querySelectorAll('.format-card').forEach((card)=>{
    const format=String(card.dataset.format||'').toLowerCase();
    const name=format.includes('hors')?'microphone':format.includes('connexio')?'network':'sparkles';
    replaceOnce(card.querySelector('.format-symbol'),name);
    replaceOnce(card.querySelector('a span'),'arrowUpRight');
  });

  root.querySelectorAll('.show-preview>span,.broadcast-screen>span').forEach((holder)=>replaceOnce(holder,'play'));
  root.querySelectorAll('.referral-code small').forEach((holder)=>{
    if(holder.dataset.premiumCopy)return;
    holder.dataset.premiumCopy='1';
    holder.insertAdjacentHTML('afterbegin',icon('copy'));
  });
}

let queued=false;
function queueUpgrade(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;upgrade();});
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>{upgrade();new MutationObserver(queueUpgrade).observe(document.body,{subtree:true,childList:true});},{once:true}):(()=>{upgrade();new MutationObserver(queueUpgrade).observe(document.body,{subtree:true,childList:true});})();
