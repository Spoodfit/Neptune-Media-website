const RELEASE='neptune-studio-hors-norme-personalization-20260824-v139.1';
let loadingFor='';
document.documentElement.dataset.studioHorsNormePersonalization=RELEASE;
start();
function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}
function boot(){new MutationObserver(sync).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','class']});window.addEventListener('hashchange',sync);sync();}
function sync(){
  const dialog=document.getElementById('clientDialog'),tabs=dialog?.querySelector('.tabs');
  if(!dialog?.open||!tabs)return;
  const existing=tabs.querySelector('[data-hn-personalization-tab]');
  const formatContext=String(dialog.querySelector('.detail-title p')?.textContent||'');
  if(!/hors\s*norme/iu.test(formatContext)){existing?.remove();return;}
  const orderId=decodeURIComponent(location.hash.slice(1)||'');
  if(!orderId||['contenus','calendrier','finances'].includes(orderId)){existing?.remove();return;}
  if(!existing){
    const button=document.createElement('button');button.type='button';button.dataset.hnPersonalizationTab='1';button.textContent='Personnalisation';button.onclick=()=>openPersonalization(orderId,button);tabs.append(button);
  }
}
async function openPersonalization(orderId,button){
  const dialog=document.getElementById('clientDialog'),body=dialog?.querySelector('#detailBody');if(!body)return;
  dialog.querySelectorAll('.tabs button').forEach(item=>item.classList.toggle('active',item===button));
  body.innerHTML='<section class="panel hn-studio-personalization-v139"><div class="hn-studio-head"><div><p class="eyebrow">HORS NORME</p><h3>Personnalisation éditoriale</h3></div><span class="hn-studio-state">Chargement…</span></div><div class="hn-studio-loading">Lecture du dossier client…</div></section>';
  loadingFor=orderId;
  try{
    const response=await fetch(`/api/admin/hors-norme-personalization?orderId=${encodeURIComponent(orderId)}`,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    const result=await response.json().catch(()=>({}));
    if(loadingFor!==orderId)return;
    if(!response.ok)throw new Error(result.error||`http_${response.status}`);
    render(body,result.personalization);
  }catch(error){body.innerHTML=`<section class="panel hn-studio-personalization-v139"><div class="hn-studio-head"><div><p class="eyebrow">HORS NORME</p><h3>Personnalisation éditoriale</h3></div><span class="hn-studio-state error">Indisponible</span></div><p class="empty">Impossible de charger la personnalisation pour ce dossier.</p></section>`;console.error('studio_hors_norme_personalization_v139_failed',error);}
}
function render(host,p){
  if(!p){host.innerHTML=`<section class="panel hn-studio-personalization-v139"><div class="hn-studio-head"><div><p class="eyebrow">HORS NORME</p><h3>Personnalisation éditoriale</h3></div><span class="hn-studio-state pending">Pas commencée</span></div><div class="hn-studio-empty"><strong>Le client n’a pas encore personnalisé ses questions.</strong><p>Le formulaire apparaît automatiquement dans son espace client pour les passages HORS NORME.</p></div></section>`;return;}
  const phases=Array.isArray(p.phases)?p.phases:[],done=Number(p.completedPhases||0),submitted=p.status==='submitted';
  host.innerHTML=`<section class="panel hn-studio-personalization-v139"><div class="hn-studio-head"><div><p class="eyebrow">HORS NORME</p><h3>Personnalisation éditoriale</h3><p>${esc(p.clientName||p.clientEmail||'')} ${p.company?`· ${esc(p.company)}`:''}</p></div><span class="hn-studio-state ${submitted?'done':'draft'}">${submitted?'✓ Confirmée':`${done}/${phases.length||11} complétées`}</span></div><div class="hn-studio-meta"><span>Mis à jour ${formatDate(p.updatedAt)}</span>${p.submittedAt?`<span>Confirmé ${formatDate(p.submittedAt)}</span>`:''}<button type="button" data-hn-copy>Copier le conducteur</button></div><div class="hn-studio-phases">${phases.map((phase,index)=>phaseCard(phase,index)).join('')}</div></section>`;
  host.querySelector('[data-hn-copy]')?.addEventListener('click',()=>copyAll(p));
}
function phaseCard(phase,index){const complete=phase.question&&String(phase.pourquoi||'').trim().length>=12;return `<article class="hn-studio-phase ${complete?'complete':'incomplete'}"><div class="hn-studio-phase-index"><span>${String(index+1).padStart(2,'0')}</span><i>${complete?'✓':'—'}</i></div><div><small>${esc(phase.title||phase.id||'Séquence')}</small><strong>${esc(phase.question||'Aucune formulation choisie')}</strong>${phase.pourquoi?`<p>${esc(phase.pourquoi)}</p>`:'<p class="muted">Justification non renseignée.</p>'}</div></article>`;}
async function copyAll(p){
  const text=(p.phases||[]).map((phase,index)=>`${index+1}. ${phase.title||phase.id}\nQuestion : ${phase.question||'—'}\nPourquoi : ${phase.pourquoi||'—'}`).join('\n\n');
  try{await navigator.clipboard.writeText(text);toast('Conducteur copié.');}catch{toast('Copie impossible.',true);}
}
function formatDate(value){if(!value)return'—';const date=new Date(value);if(Number.isNaN(date.getTime()))return'—';return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).format(date).replace(' à ',' · ');}
function toast(message,error=false){let node=document.getElementById('hnStudioToastV139');if(!node){node=document.createElement('div');node.id='hnStudioToastV139';node.className='hn-studio-toast-v139';document.body.append(node);}node.textContent=message;node.classList.toggle('error',error);node.classList.add('show');setTimeout(()=>node.classList.remove('show'),2600);}
function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
