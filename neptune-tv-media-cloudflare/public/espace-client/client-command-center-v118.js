const RELEASE='neptune-client-command-center-20260814-v118';
const SESSION_API='/api/client/session';
const CATALOG_API='/api/reservation/catalog-v96';
const PREP_SEEN_KEY='neptune:hors-norme-preparation:v77';
const PREP_ACK_PREFIX='neptune:preparation-ack:v118:';
const HN_CARD_IDS=Array.from({length:10},(_,index)=>`hn-${String(index+1).padStart(2,'0')}`);
const STAGE_KEYS=['format','payment','date','preparation','filming','source','editing','complete'];
const STAGE_LABELS=['Format','Paiement','Date du passage','Préparation','Passage','Réception des vidéos','Montage','Terminé'];
const FINAL_STATUSES=new Set(['delivered','completed']);
const POST_FILMING_STATUSES=new Set(['filmed','videos_pending','videos_received','editing','approval','delivered','completed']);

let sessionState=null;
let activeOrder=null;
let catalogState=null;
let selectedIndex=null;
let enhanceQueued=false;
let preparationImportStarted=false;
let catalogRenderTimer=0;

markRelease();
start();

function markRelease(){
  document.documentElement.dataset.clientCommandCenterV118='1';
  document.documentElement.dataset.clientCommandReleaseV118=RELEASE;
  if(!document.querySelector('link[data-client-command-css-v118]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/espace-client/client-command-center-v118.css?v=1';
    link.dataset.clientCommandCssV118='1';
    document.head.append(link);
  }
}

function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}

function boot(){
  if(!isHome())return;
  document.addEventListener('click',captureWorkflowClick,true);
  document.addEventListener('click',capturePreparationClick,true);
  const observer=new MutationObserver(queueEnhance);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-mode']});
  hydrate();
  queueEnhance();
}

function isHome(){return ['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname);}

async function hydrate(){
  try{
    const [session,catalog]=await Promise.all([fetchJson(SESSION_API),fetchJson(CATALOG_API).catch(()=>null)]);
    sessionState=session;
    catalogState=catalog;
    const orders=Array.isArray(session?.orders)?session.orders:[];
    activeOrder=orders.find(isActiveOrder)||null;
    renderContentFolders(orders);
    renderHomeCatalog(catalog);
    queueEnhance();
  }catch(error){console.error('client_command_center_v118_hydrate_failed',error);}
}

async function fetchJson(url){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`http_${response.status}`);
  return data;
}

function isActiveOrder(order){return Boolean(order?.id)&&!FINAL_STATUSES.has(String(order?.status||'').toLowerCase());}

function queueEnhance(){
  if(enhanceQueued)return;
  enhanceQueued=true;
  requestAnimationFrame(()=>{enhanceQueued=false;enhance();});
}

function enhance(){
  const center=document.querySelector('.client-command-center');
  if(!center)return;
  center.classList.add('client-command-center-v118');
  document.querySelector('.cc-details-button')?.setAttribute('hidden','');
  restoreFormatsPanel();
  if(sessionState){
    const orders=Array.isArray(sessionState.orders)?sessionState.orders:[];
    renderContentFolders(orders);
  }
  if(catalogState)renderHomeCatalog(catalogState);
  if(!activeOrder||center.dataset.mode==='catalog')return;
  const stages=[...document.querySelectorAll('.cc-stage[data-stage-index]')];
  if(!stages.length)return;
  if(selectedIndex===null||selectedIndex<0||selectedIndex>=stages.length)selectedIndex=focusIndexFromDom(stages);
  applySelectedStage(stages,selectedIndex);
  renderStageDetail(selectedIndex,{scroll:false});
}

function captureWorkflowClick(event){
  if(!activeOrder)return;
  const stage=event.target.closest?.('[data-cc-stage]');
  if(stage){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const index=Number(stage.dataset.ccStage||0);
    selectStage(index,true);
    return;
  }
  const tracking=event.target.closest?.('[data-cc-track]');
  if(tracking){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const stages=[...document.querySelectorAll('.cc-stage[data-stage-index]')];
    const focus=focusIndexFromDom(stages);
    selectStage(focus,true);
  }
}

function selectStage(index,scroll){
  const stages=[...document.querySelectorAll('.cc-stage[data-stage-index]')];
  if(!stages.length)return;
  selectedIndex=Math.max(0,Math.min(stages.length-1,Number(index)||0));
  applySelectedStage(stages,selectedIndex);
  renderStageDetail(selectedIndex,{scroll});
  centerStage(selectedIndex);
}

function focusIndexFromDom(stages){
  let index=stages.findIndex(stage=>stage.getAttribute('aria-current')==='step');
  if(index>=0)return index;
  for(const state of ['action','current','waiting','upcoming']){
    index=stages.findIndex(stage=>stage.dataset.state===state);
    if(index>=0)return index;
  }
  return Math.max(0,stages.length-1);
}

function applySelectedStage(stages,index){
  stages.forEach((stage,i)=>{
    const button=stage.querySelector('[data-cc-stage]');
    const selected=i===index;
    stage.classList.toggle('is-selected-v118',selected);
    if(button){button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-controls','ccDetailRegion');}
  });
}

function renderStageDetail(index,{scroll=false}={}){
  const region=document.querySelector('#ccDetailRegion');
  if(!region||!activeOrder)return;
  const key=STAGE_KEYS[index]||STAGE_KEYS[0];
  const stage=document.querySelector(`.cc-stage[data-stage-index="${index}"]`);
  const state=stage?.dataset.state||'upcoming';
  region.hidden=false;
  region.dataset.stage=key;
  region.dataset.stageState=state;
  region.innerHTML=detailForStage(key,state,activeOrder);
  region.querySelector('[data-v118-close-detail]')?.addEventListener('click',()=>{region.hidden=true;});
  region.querySelector('[data-v118-prep-ack]')?.addEventListener('click',confirmPreparation);
  if(key==='preparation')mountPreparationExperience(activeOrder);
  if(scroll)requestAnimationFrame(()=>region.scrollIntoView({block:'nearest',behavior:motionAllowed()?'smooth':'auto'}));
}

function detailForStage(key,state,order){
  const label=STAGE_LABELS[STAGE_KEYS.indexOf(key)]||'Étape';
  const intro=stageIntro(key,state,order);
  const body=stageBody(key,state,order);
  return `<div class="cc-v118-detail-head"><div><span>${esc(label.toUpperCase())}</span><h3>${esc(intro.title)}</h3><p>${esc(intro.detail)}</p></div><button type="button" data-v118-close-detail aria-label="Masquer le détail">×</button></div>${body}`;
}

function stageIntro(key,state,order){
  const done=state==='done';
  if(key==='format')return {title:done?'Votre format est confirmé':'Votre format',detail:done?'Le format choisi sert de référence à toute la préparation de votre passage.':'Le format sélectionné apparaîtra ici dès sa confirmation.'};
  if(key==='payment')return {title:done?'Paiement validé':'Suivi du paiement',detail:done?'Aucune action n’est requise sur cette étape.':'Le statut se met à jour automatiquement après validation du paiement.'};
  if(key==='date')return {title:done?'Votre date de passage est confirmée':state==='waiting'?'Neptune confirme votre créneau avec le studio':'Votre date de passage',detail:state==='waiting'?'Votre demande est enregistrée. Neptune gère la confirmation avec le fournisseur.':done?'Le créneau est verrouillé pour votre passage.':'Les informations de réservation et de confirmation sont regroupées ici.'};
  if(key==='preparation')return {title:isHorsNorme(order)?'Préparer Hors Norme':'Préparer votre passage',detail:isHorsNorme(order)?'Consultez les consignes et cartes de préparation avant votre passage, puis confirmez que tout est clair.':'Retrouvez ici votre rendez-vous de préparation et les consignes utiles au format choisi.'};
  if(key==='filming')return {title:done?'Votre passage a été réalisé':'Votre passage studio',detail:done?'Cette étape est terminée. Les vidéos peuvent maintenant être transférées à Neptune.':'Date, heure et état du passage sont regroupés ici.'};
  if(key==='source')return {title:done?'Les vidéos ont été reçues':'Réception des vidéos',detail:done?'Les rushs nécessaires au montage sont disponibles côté Neptune.':'Après le tournage, le studio transfère les vidéos à Neptune. Vous n’avez rien à faire.'};
  if(key==='editing')return {title:done?'Montage finalisé':'Montage de vos contenus',detail:done?'Les contenus finalisés sont disponibles dans votre bibliothèque.':'Neptune prépare l’émission complète et les déclinaisons courtes prévues.'};
  return {title:done?'Votre passage est terminé':'Finalisation de votre passage',detail:done?'Vos contenus restent accessibles dans votre espace et peuvent être réutilisés.':'Cette étape se valide à la livraison et à la finalisation du passage.'};
}

function stageBody(key,state,order){
  if(key==='format')return formatDetail(order,state);
  if(key==='payment')return paymentDetail(order,state);
  if(key==='date')return dateDetail(order,state);
  if(key==='preparation')return preparationDetail(order,state);
  if(key==='filming')return filmingDetail(order,state);
  if(key==='source')return sourceDetail(order,state);
  if(key==='editing')return editingDetail(order,state);
  return completeDetail(order,state);
}

function formatDetail(order,state){
  const catalog=findCatalogFormat(order);
  const image=safeImage(catalog?.format?.imagePublicUrl||catalog?.format?.image||'');
  return `<div class="cc-v118-stage-layout">${image?`<div class="cc-v118-stage-visual"><img src="${esc(image)}" alt="" loading="lazy" decoding="async"></div>`:''}<div class="cc-v118-facts">${fact('Format',order?.format||catalog?.format?.name||'À confirmer')}${fact('Concept',catalog?.format?.concept||'Neptune Media')}${fact('Durée',catalog?.format?.durationLabel||'Selon le format')}${statusFact(state)}</div></div>`;
}

function paymentDetail(order,state){
  const status=String(order?.paymentStatus||order?.payment_status||'').toLowerCase();
  const paid=state==='done'||['paid','succeeded','completed','complete'].includes(status);
  return `<div class="cc-v118-facts">${fact('Statut',paid?'Paiement validé':'Validation en cours')}${fact('Référence',order?.reference||order?.orderNumber||order?.id||'Passage Neptune Media')}${statusFact(state)}</div><div class="cc-v118-note" data-tone="${paid?'ok':'neutral'}"><span>${paid?'✓':'↻'}</span><div><strong>${paid?'Tout est réglé pour cette étape':'Mise à jour automatique'}</strong><p>${paid?'Vous n’avez aucune action à effectuer ici.':'Le dashboard se met à jour dès que le paiement est confirmé dans le dossier Neptune.'}</p></div></div>`;
}

function dateDetail(order,state){
  const flow=order?.workflow||{};
  const filming=dateValue(order?.filmingAt);
  const requested=dateValue(flow.requestedFilmingAt||order?.requestedFilmingAt);
  const supplier=String(flow.supplierStatus||'').toLowerCase();
  const confirmation=safeHref(order?.filmingConfirmationUrl||order?.confirmationUrl||'');
  const waiting=['pending','alternate_proposed','rejected'].includes(supplier);
  return `<div class="cc-v118-facts">${fact('Date confirmée',filming?formatLongDateTime(filming):'À confirmer')}${fact('Date demandée',requested?formatLongDate(requested):'Aucune demande en attente')}${fact('Confirmation studio',supplierLabel(supplier))}${statusFact(state)}</div>${waiting?`<div class="cc-v118-note" data-tone="waiting"><span>↻</span><div><strong>${supplier==='rejected'?'Un autre créneau va être recherché':'Neptune s’occupe de la confirmation'}</strong><p>Vous n’avez rien à faire tant qu’un nouveau choix ou une confirmation ne vous est pas demandé.</p></div></div>`:''}${confirmation&&String(order?.status||'')==='studio_date_confirmation_pending'?`<a class="cc-v118-action" href="${esc(confirmation)}">Confirmer ma date <span>→</span></a>`:''}`;
}

function preparationDetail(order,state){
  const appointment=dateValue(order?.appointmentAt);
  const booking=safeHref(order?.bookingUrl||order?.preparationBookingUrl||'/reserver');
  const hn=isHorsNorme(order);
  return `<div class="cc-v118-facts">${fact('Rendez-vous de préparation',appointment?formatLongDateTime(appointment):'À réserver')}${fact('Format',order?.format||'À confirmer')}${statusFact(state)}</div>${!appointment&&prePassage(order)?`<a class="cc-v118-action" href="${esc(booking)}">Réserver ma visio <span>→</span></a>`:''}${hn?`<section class="cc-v118-preparation" aria-label="Préparation Hors Norme"><div class="cc-v118-prep-status" data-v118-prep-status>${preparationStatusMarkup(order)}</div><div id="ccPreparationDeckV118" class="cc-v118-prep-deck"><div class="cc-v118-prep-loading">Chargement des cartes de préparation…</div></div></section>`:`<div class="cc-v118-note" data-tone="neutral"><span>i</span><div><strong>Préparation adaptée à votre format</strong><p>Si des supports spécifiques sont ajoutés au format dans Neptune, ils apparaîtront ici.</p></div></div>`}`;
}

function filmingDetail(order,state){
  const filming=dateValue(order?.filmingAt);
  const done=state==='done'||POST_FILMING_STATUSES.has(String(order?.status||'').toLowerCase());
  return `<div class="cc-v118-facts">${fact('Passage studio',filming?formatLongDateTime(filming):'À confirmer')}${fact('État',done?'Passage réalisé':filming?'Créneau planifié':'En attente de confirmation')}${statusFact(state)}</div>${!done?`<div class="cc-v118-note" data-tone="neutral"><span>i</span><div><strong>Le jour du passage</strong><p>Présentez-vous selon les informations confirmées dans votre dossier. Neptune vous notifiera si un élément change.</p></div></div>`:''}`;
}

function sourceDetail(order,state){
  const files=Array.isArray(order?.files)?order.files:[];
  const latest=[...files].sort((a,b)=>fileTime(b)-fileTime(a))[0]||null;
  const done=state==='done';
  return `<div class="cc-v118-facts">${fact('Réception',done?'Vidéos reçues par Neptune':'En attente du transfert studio')}${fact('Dernier fichier',latest?.name||'Aucun fichier reçu')}${latest?.createdAt?fact('Dernière réception',formatLongDateTime(new Date(latest.createdAt))):''}${statusFact(state)}</div><div class="cc-v118-note" data-tone="${done?'ok':'waiting'}"><span>${done?'✓':'↻'}</span><div><strong>${done?'Transfert terminé':'Aucune action de votre côté'}</strong><p>${done?'Neptune dispose des éléments nécessaires pour poursuivre la production.':'Le fournisseur transmet les vidéos directement à Neptune après votre passage.'}</p></div></div>`;
}

function editingDetail(order,state){
  const filming=dateValue(order?.filmingAt);
  const target=filming?new Date(filming.getTime()+15*86_400_000):null;
  const files=Array.isArray(order?.files)?order.files:[];
  const done=state==='done';
  return `<div class="cc-v118-facts">${fact('État du montage',done?'Finalisé':state==='current'||String(order?.status||'')==='editing'?'En cours':'À venir')}${fact('Livraison cible',target?formatLongDate(target):'Calculée après le passage')}${fact('Contenus déjà disponibles',String(files.length))}${statusFact(state)}</div>${done?`<a class="cc-v118-action" href="/espace-client/videos/?passage=${encodeURIComponent(order.id||'')}">Voir les contenus <span>→</span></a>`:`<div class="cc-v118-note" data-tone="neutral"><span>↻</span><div><strong>Neptune s’occupe du montage</strong><p>Vous serez sollicité uniquement si une validation est réellement nécessaire.</p></div></div>`}`;
}

function completeDetail(order,state){
  const files=Array.isArray(order?.files)?order.files:[];
  const done=state==='done'||FINAL_STATUSES.has(String(order?.status||'').toLowerCase());
  return `<div class="cc-v118-facts">${fact('Passage',done?'Terminé':'En cours')}${fact('Contenus disponibles',String(files.length))}${fact('Format',order?.format||'Neptune Media')}${statusFact(state)}</div>${files.length?`<a class="cc-v118-action" href="/espace-client/videos/?passage=${encodeURIComponent(order.id||'')}">Ouvrir le dossier de ce passage <span>→</span></a>`:''}`;
}

function statusFact(state){const labels={done:'Validé',current:'En cours',action:'Action requise',waiting:'Neptune s’en occupe',upcoming:'À venir'};return fact('Statut de l’étape',labels[state]||'À venir');}
function fact(label,value){return `<article><span>${esc(label)}</span><strong>${esc(value||'—')}</strong></article>`;}

function renderContentFolders(orders){
  const metrics=document.querySelector('.metrics-section');
  if(!metrics)return;
  const withFiles=(orders||[]).filter(order=>Array.isArray(order?.files)&&order.files.length>0).sort((a,b)=>orderTime(b)-orderTime(a));
  let secondary=document.querySelector('#clientSecondaryRow');
  let rail=document.querySelector('#clientContentFoldersV118');
  if(!withFiles.length){
    secondary?.remove();
    rail?.remove();
    return;
  }
  if(!rail){
    rail=document.createElement('section');
    rail.id='clientContentFoldersV118';
    rail.className='cc-v118-folders';
    rail.setAttribute('aria-labelledby','ccFoldersTitle');
    if(secondary)secondary.replaceWith(rail);else metrics.after(rail);
  }else if(secondary&&secondary!==rail)secondary.remove();
  rail.innerHTML=`<header><div><span>VOS CONTENUS</span><h2 id="ccFoldersTitle">Un dossier par passage</h2><p>Retrouvez rapidement les contenus livrés pour chaque passage.</p></div><div class="cc-v118-folder-controls"><button type="button" data-folder-scroll="-1" aria-label="Dossiers précédents">←</button><button type="button" data-folder-scroll="1" aria-label="Dossiers suivants">→</button></div></header><div class="cc-v118-folder-track">${withFiles.map(folderMarkup).join('')}</div>`;
  rail.querySelectorAll('[data-folder-scroll]').forEach(button=>button.addEventListener('click',()=>{
    const track=rail.querySelector('.cc-v118-folder-track');
    track?.scrollBy({left:Number(button.dataset.folderScroll||1)*Math.max(280,track.clientWidth*.7),behavior:motionAllowed()?'smooth':'auto'});
  }));
}

function folderMarkup(order){
  const files=Array.isArray(order.files)?order.files:[];
  const latest=[...files].sort((a,b)=>fileTime(b)-fileTime(a))[0]||null;
  const date=dateValue(order.filmingAt);
  const href=`/espace-client/videos/?passage=${encodeURIComponent(order.id||'')}`;
  return `<a class="cc-v118-folder" href="${href}"><div class="cc-v118-folder-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg></div><div class="cc-v118-folder-copy"><span>${esc(date?formatCompactDate(date):'Passage Neptune Media')}</span><strong>${esc(order.format||order.title||'Passage Neptune Media')}</strong><small>${files.length} contenu${files.length>1?'s':''}${latest?.name?` · ${esc(shorten(latest.name,34))}`:''}</small></div><b aria-hidden="true">→</b></a>`;
}

function restoreFormatsPanel(){
  const panel=document.querySelector('.formats-panel');
  if(!panel)return;
  panel.hidden=false;
  panel.classList.remove('cc-legacy-formats');
  panel.classList.add('cc-v118-catalog-panel');
}

function renderHomeCatalog(data){
  const panel=document.querySelector('.formats-panel');
  const grid=panel?.querySelector('.format-grid');
  if(!panel||!grid||!data)return;
  restoreFormatsPanel();
  const formats=flattenCatalog(data);
  if(!formats.length)return;
  const title=panel.querySelector('#formatsTitle,.section-heading h2');
  const description=panel.querySelector('.section-heading p:not(.section-label)');
  if(title)title.textContent='Choisissez votre prochain format';
  if(description)description.textContent='Formats, prix et visuels synchronisés avec le catalogue du Studio Neptune Media.';
  grid.classList.add('cc-v118-catalog-grid');
  grid.innerHTML=formats.map(homeCatalogCard).join('');
  panel.dataset.clientCatalogV118='ready';
  clearTimeout(catalogRenderTimer);
  catalogRenderTimer=setTimeout(()=>{
    if(!grid.querySelector('.cc-v118-catalog-card'))renderHomeCatalog(catalogState);
  },900);
}

function flattenCatalog(data){
  const seen=new Set(),result=[];
  for(const city of data?.cities||[]){
    for(const format of city?.formats||[]){
      const key=String(format.id||format.slug||format.name||'');
      if(!key||seen.has(key))continue;
      seen.add(key);
      const offers=Array.isArray(format.offers)?format.offers:[];
      const prices=offers.map(item=>Number(item.clientPriceCents||0)).filter(value=>value>0);
      result.push({city,format,minPrice:prices.length?Math.min(...prices):0});
    }
  }
  return result.slice(0,16);
}

function homeCatalogCard({city,format,minPrice}){
  const image=safeImage(format.imagePublicUrl||format.image||'');
  const url=new URL('/reserver',location.origin);
  if(city?.slug)url.searchParams.set('city',city.slug);
  if(format?.slug)url.searchParams.set('format',format.slug);
  return `<article class="format-card cc-v118-catalog-card" data-format="${esc(format.slug||format.name||'format')}"><a class="cc-v118-catalog-visual" href="${esc(url.pathname+url.search)}">${image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async">`:`<span>NEPTUNE</span>`}<i>${esc(city?.name||'Neptune Media')}</i></a><div class="cc-v118-catalog-copy"><span>${esc(format.concept||'NEPTUNE MEDIA')}</span><strong>${esc(format.name||'Format Neptune Media')}</strong>${format.durationLabel?`<small>${esc(format.durationLabel)}</small>`:''}<p>${esc(shorten(format.description||'Format Neptune Media disponible à la réservation.',130))}</p></div><footer><b>${minPrice?`Dès ${money(minPrice)}`:'Voir les offres'}</b><a href="${esc(url.pathname+url.search)}">Choisir <span>→</span></a></footer></article>`;
}

function findCatalogFormat(order){
  const target=normal(order?.format||'');
  if(!target)return null;
  return flattenCatalog(catalogState||{}).find(item=>normal(item.format?.name||'')===target||normal(item.format?.slug||'')===target)||null;
}

async function mountPreparationExperience(order){
  if(!isHorsNorme(order))return;
  movePreparationDeck();
  if(document.querySelector('#horsNormePreparationV77')){refreshPreparationStatus(order);return;}
  if(!preparationImportStarted){
    preparationImportStarted=true;
    import('/espace-client/client-preparation-v77.js?v=2').catch(error=>console.error('client_preparation_v77_import_failed',error));
  }
  let attempts=0;
  const wait=()=>{
    attempts+=1;
    if(movePreparationDeck()){refreshPreparationStatus(order);return;}
    if(attempts<30)setTimeout(wait,120);
  };
  wait();
}

function movePreparationDeck(){
  const mount=document.querySelector('#ccPreparationDeckV118');
  const deck=document.querySelector('#horsNormePreparationV77');
  if(!mount||!deck)return false;
  if(deck.parentElement!==mount)mount.replaceChildren(deck);
  return true;
}

function capturePreparationClick(event){
  if(event.target.closest?.('.hn77-card')&&selectedIndex===3&&activeOrder)setTimeout(()=>refreshPreparationStatus(activeOrder),40);
}

function preparationStatusMarkup(order){
  const seen=seenPreparationCards();
  const count=HN_CARD_IDS.filter(id=>seen.has(id)).length;
  const all=count===HN_CARD_IDS.length;
  const ack=preparationAck(order);
  if(!prePassage(order))return `<div><span>PRÉPARATION</span><strong>${count}/${HN_CARD_IDS.length} cartes consultées</strong><p>Votre passage a déjà eu lieu : la préparation reste disponible comme référence.</p></div>`;
  if(ack)return `<div><span>PRÉPARATION VALIDÉE</span><strong>Vous avez confirmé avoir lu et compris la préparation</strong><p>${ack.confirmedAt?`Confirmé le ${esc(formatLongDateTime(new Date(ack.confirmedAt)))}`:'Confirmation enregistrée sur cet appareil.'}</p></div><span class="cc-v118-prep-confirmed">✓ Compris</span>`;
  return `<div><span>AVANT VOTRE PASSAGE</span><strong data-prep-progress>${count}/${HN_CARD_IDS.length} cartes consultées</strong><p>${all?'Vous avez parcouru toute la préparation. Confirmez maintenant que les consignes sont comprises.':'Ouvrez chaque carte ci-dessous avant de confirmer votre préparation.'}</p></div><button type="button" data-v118-prep-ack ${all?'':'disabled'}>${all?'J’ai lu et compris ma préparation':`Encore ${HN_CARD_IDS.length-count} carte${HN_CARD_IDS.length-count>1?'s':''} à consulter`}</button>`;
}

function refreshPreparationStatus(order){const host=document.querySelector('[data-v118-prep-status]');if(host)host.innerHTML=preparationStatusMarkup(order);host?.querySelector('[data-v118-prep-ack]')?.addEventListener('click',confirmPreparation);}

function confirmPreparation(){
  if(!activeOrder)return;
  const seen=seenPreparationCards();
  if(!HN_CARD_IDS.every(id=>seen.has(id)))return;
  try{localStorage.setItem(PREP_ACK_PREFIX+String(activeOrder.id),JSON.stringify({orderId:String(activeOrder.id),format:String(activeOrder.format||''),confirmedAt:new Date().toISOString(),release:RELEASE}));}catch{}
  refreshPreparationStatus(activeOrder);
}

function seenPreparationCards(){
  try{const parsed=JSON.parse(localStorage.getItem(PREP_SEEN_KEY)||'[]');return new Set(Array.isArray(parsed)?parsed.map(String):[]);}catch{return new Set();}
}
function preparationAck(order){
  try{const parsed=JSON.parse(localStorage.getItem(PREP_ACK_PREFIX+String(order?.id||''))||'null');return parsed&&parsed.orderId===String(order?.id||'')?parsed:null;}catch{return null;}
}

function prePassage(order){
  const status=String(order?.status||'').toLowerCase();
  if(POST_FILMING_STATUSES.has(status))return false;
  const filming=dateValue(order?.filmingAt);
  return !filming||filming.getTime()>Date.now();
}
function isHorsNorme(order){return /hors\s*norme/iu.test(String(order?.format||order?.title||''));}

function supplierLabel(value){if(value==='confirmed')return'Confirmée';if(value==='pending')return'En attente du studio';if(value==='alternate_proposed')return'Alternative proposée';if(value==='rejected')return'Nouveau créneau recherché';return'À confirmer';}

function centerStage(index){
  const scroller=document.querySelector('.cc-flow-scroll');
  const stage=document.querySelector(`.cc-stage[data-stage-index="${index}"]`);
  if(!scroller||!stage)return;
  const left=stage.offsetLeft-(scroller.clientWidth-stage.clientWidth)/2;
  scroller.scrollTo({left:Math.max(0,left),behavior:motionAllowed()?'smooth':'auto'});
}

function dateValue(value){const date=new Date(value||'');return Number.isNaN(date.getTime())?null:date;}
function fileTime(file){const date=dateValue(file?.createdAt||file?.updatedAt);return date?date.getTime():0;}
function orderTime(order){const date=dateValue(order?.updatedAt||order?.filmingAt||order?.createdAt);return date?date.getTime():0;}
function formatCompactDate(date){return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Paris'}).format(date);}
function formatLongDate(date){return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(date);}
function formatLongDateTime(date){return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(date).replace(' à ',' · ');}
function safeHref(value){const text=String(value||'').trim();return /^(https?:\/\/|\/)/iu.test(text)?text:'';}
function safeImage(value){const text=String(value||'').trim();if(/^\/(?:assets|media)\//u.test(text))return text;try{const url=new URL(text);return url.protocol==='https:'?url.toString():'';}catch{return'';}}
function shorten(value,limit){const text=String(value||'').replace(/\s+/gu,' ').trim();return text.length>limit?`${text.slice(0,Math.max(0,limit-1)).trimEnd()}…`:text;}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100);}
function normal(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-|-$/gu,'');}
function motionAllowed(){return !matchMedia('(prefers-reduced-motion: reduce)').matches;}
function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);}
