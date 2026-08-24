const RELEASE='neptune-hors-norme-personalization-client-20260824-v139.1';
const API='/api/client/hors-norme-personalization';
const PHASES=[
  {id:'ouverture',title:'Ouverture de l’émission',objective:'Faire comprendre pourquoi cette conversation mérite d’exister, sans tomber dans la présentation corporate.',options:['Quel problème vous a tellement marqué que vous avez fini par vous dire : “je ne peux pas laisser les gens seuls avec ça” ?','Qui avez-vous vu galérer trop longtemps avant de comprendre qu’il avait besoin d’aide ?','Quelle situation vous révolte encore aujourd’hui dans votre métier ?'],placeholder:'Expliquez pourquoi cette question révèle le mieux votre vraie raison d’être.'},
  {id:'silence',title:'Ce qu’il vit en silence',objective:'Faire reconnaître le spectateur dans ce qu’il n’ose pas forcément dire.',options:['Qu’est-ce que votre client vit en silence, mais qu’il n’avouera presque jamais au premier rendez-vous ?','Quelle phrase se répète-t-il pour se rassurer alors qu’au fond il sait que ça bloque ?','À quel moment son problème commence à lui prendre plus que de l’argent : de l’énergie, de la confiance ou de la paix mentale ?'],placeholder:'Expliquez quelle émotion ou vérité cachée vous voulez faire remonter.'},
  {id:'scene',title:'La scène qui révèle tout',objective:'Faire sortir une scène réelle, pas une explication abstraite.',options:['Racontez une scène précise où vous avez vu quelqu’un comprendre trop tard qu’il s’était trompé de problème.','Quel moment client vous revient encore parce qu’il résume tout ce que votre métier cherche à éviter ?','Décrivez la scène : qui est là, qu’est-ce qui se passe, et qu’est-ce qu’on comprend à ce moment-là ?'],placeholder:'Expliquez pourquoi cette scène rend le problème impossible à ignorer.'},
  {id:'erreurs',title:'Les erreurs qui l’épuisent',objective:'Nommer les mauvais réflexes sans humilier le spectateur.',options:['Quelle erreur votre client répète en pensant se protéger, alors qu’elle l’enfonce ?','Quel réflexe paraît raisonnable sur le moment, mais coûte très cher à long terme ?','Qu’est-ce qu’il continue de faire parce qu’il croit gagner du temps, alors qu’il en perd ?'],placeholder:'Expliquez l’erreur que vous voulez faire reconnaître sans jugement.'},
  {id:'croyances',title:'Les croyances qui bloquent',objective:'Casser une fausse croyance qui maintient le problème en place.',options:['Quelle croyance donne l’impression d’être prudent, alors qu’elle bloque tout ?','Quelle phrase votre client se raconte pour ne pas prendre la décision qu’il sait nécessaire ?','Quelle vérité dérangeante ferait gagner des mois à ceux qui vous écoutent ?'],placeholder:'Expliquez la croyance à casser et la vérité à faire accepter.'},
  {id:'chemin',title:'Le chemin qui rassure',objective:'Montrer une voie claire, humaine et accessible.',options:['Si quelqu’un se reconnaît, quel est le premier pas intelligent, pas spectaculaire, juste intelligent ?','Par où faut-il commencer quand on est fatigué de tourner autour du même problème ?','Quelle étape paraît simple, mais change tout parce qu’elle remet de l’ordre dans la tête ?'],placeholder:'Expliquez pourquoi cette question rend votre accompagnement concret et rassurant.'},
  {id:'freins',title:'Les freins qu’il n’ose pas dire',objective:'Faire émerger les objections profondes sans les traiter comme de simples excuses.',options:['Quand il dit “je n’ai pas le budget”, quelle peur est souvent cachée derrière ?','Quand il dit “je vais attendre”, qu’est-ce qu’il espère éviter de regarder en face ?','Quelle objection mérite d’être respectée, mais ne doit pas devenir une prison ?'],placeholder:'Expliquez le frein émotionnel que vous voulez traiter avec justesse.'},
  {id:'verites',title:'Les vérités qui restent',objective:'Obtenir une phrase courte que le spectateur peut garder en tête.',options:['Quelle phrase aimeriez-vous que votre client se répète demain matin ?','Quelle vérité simple ferait mal à entendre, mais du bien à accepter ?','Si vous deviez réveiller quelqu’un en une phrase, vous lui diriez quoi ?'],placeholder:'Expliquez la phrase ou l’idée que vous voulez ancrer.'},
  {id:'avant_apres',title:'Le déclic avant / après',objective:'Faire sentir la transformation vécue, pas seulement le résultat obtenu.',options:['À quoi ressemblait la personne avant de comprendre ce qui bloquait vraiment ?','Quel déclic a changé sa façon de voir le problème ?','Qu’est-ce qui a changé dans sa posture, sa confiance ou ses décisions après ?'],placeholder:'Expliquez quelle transformation humaine vous voulez rendre visible.'},
  {id:'message_final',title:'Ce qu’il devait entendre',objective:'Finir sur une parole utile, humaine, sans basculer dans la promo.',options:['Qu’avez-vous envie de dire à quelqu’un qui se reconnaît, mais qui n’a encore rien osé changer ?','Quelle phrase aurait pu l’aider plus tôt s’il l’avait entendue au bon moment ?','Qu’est-ce qu’il doit arrêter de porter seul à partir d’aujourd’hui ?'],placeholder:'Expliquez le message final que vous voulez transmettre sans vendre.'},
  {id:'cloture',title:'Clôture d’émission',objective:'Laisser une idée forte et un premier mouvement simple.',options:['Quelle idée doit rester quand l’écran s’éteint ?','Quel premier pas peut-il faire dans les prochaines 24 heures sans tout bouleverser ?','Si cette conversation devait enlever un poids à quelqu’un, lequel ?'],placeholder:'Expliquez l’impression finale que l’audience doit garder.'}
];
let data=null,index=0,saveTimer=0,saving=false,dirty=false,mountObserver=null;
document.documentElement.dataset.horsNormePersonalization=RELEASE;
start();

function start(){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();}
async function boot(){
  if(!['/espace-client','/espace-client/','/espace-client/index.html'].includes(location.pathname))return;
  try{
    const response=await fetch(API,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)return;
    data=await response.json();
    hydrate();
    index=firstIncompleteIndex();
    mount();
    mountObserver=new MutationObserver(()=>mount());
    mountObserver.observe(document.body,{childList:true,subtree:true});
  }catch(error){console.error('hors_norme_personalization_v139_boot_failed',error);}
}
function hydrate(){
  const saved=new Map((data.personalization?.phases||[]).map(phase=>[phase.id,phase]));
  data.personalization=data.personalization||{};
  data.personalization.phases=PHASES.map(phase=>({...phase,question:String(saved.get(phase.id)?.question||''),pourquoi:String(saved.get(phase.id)?.pourquoi||'')}));
}
function firstIncompleteIndex(){const found=data.personalization.phases.findIndex(phase=>!phase.question||phase.pourquoi.trim().length<12);return found<0?0:found;}
function mount(){
  if(document.getElementById('hnPersonalizationV139'))return;
  const deck=document.getElementById('ccPreparationDeckV118');
  const target=deck?.parentElement||document.getElementById('horsNormePreparationV77')?.parentElement||document.querySelector('.dashboard-canvas');
  if(!target)return;
  const card=document.createElement('section');
  card.id='hnPersonalizationV139';
  card.className='hn-personalization-v139';
  if(deck)deck.after(card);else target.append(card);
  renderCard(card);
  ensureDialog();
}
function renderCard(card=document.getElementById('hnPersonalizationV139')){
  if(!card||!data)return;
  const p=data.personalization;
  const done=countDone();
  const submitted=p.status==='submitted';
  card.innerHTML=`<div class="hn-personalization-copy"><span>PERSONNALISATION HORS NORME</span><h3>${submitted?'Votre conducteur est personnalisé':'Choisissez les questions qui vous ressemblent'}</h3><p>${submitted?'Neptune dispose de vos choix pour préparer l’interview. Vous pouvez encore les relire avant votre passage.':'11 séquences, une décision simple à chaque étape. Vos réponses sont sauvegardées automatiquement dans votre dossier.'}</p></div><div class="hn-personalization-progress"><strong>${done}/${PHASES.length}</strong><span>${submitted?'envoyées':'complétées'}</span><div><i style="width:${Math.round(done/PHASES.length*100)}%"></i></div></div><button type="button" data-hn-open>${submitted?'Relire mes choix':done?'Continuer':'Commencer'}</button>`;
  card.querySelector('[data-hn-open]').onclick=openDialog;
}
function ensureDialog(){
  if(document.getElementById('hnPersonalizationDialogV139'))return;
  const dialog=document.createElement('dialog');
  dialog.id='hnPersonalizationDialogV139';dialog.className='hn-personalization-dialog-v139';
  dialog.innerHTML='<section><header><div><span data-hn-meta></span><h2 data-hn-title></h2><p data-hn-objective></p></div><button type="button" data-hn-close aria-label="Fermer">×</button></header><div class="hn-personalization-body"><div data-hn-choices></div><label class="hn-personalization-why"><span>Pourquoi ce choix ?</span><textarea data-hn-why rows="5"></textarea><small data-hn-error></small></label></div><footer><button type="button" class="secondary" data-hn-back>Retour</button><span data-hn-save>Enregistré automatiquement</span><button type="button" class="primary" data-hn-next>Continuer</button></footer></section>';
  document.body.append(dialog);
  dialog.querySelector('[data-hn-close]').onclick=()=>closeDialog();
  dialog.querySelector('[data-hn-back]').onclick=()=>previous();
  dialog.querySelector('[data-hn-next]').onclick=()=>next();
  dialog.querySelector('[data-hn-why]').addEventListener('input',event=>{current().pourquoi=event.target.value;markDirty();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog();});
}
function openDialog(){
  const dialog=document.getElementById('hnPersonalizationDialogV139');
  if(!dialog)return;
  index=data.personalization.status==='submitted'?0:firstIncompleteIndex();
  renderStep();dialog.showModal();
}
async function closeDialog(){await save('draft',false);document.getElementById('hnPersonalizationDialogV139')?.close();renderCard();}
function renderStep(){
  const dialog=document.getElementById('hnPersonalizationDialogV139'),phase=current();if(!dialog||!phase)return;
  dialog.querySelector('[data-hn-meta]').textContent=`Phase ${index+1} / ${PHASES.length} · ${countDone()} complétées`;
  dialog.querySelector('[data-hn-title]').textContent=phase.title;
  dialog.querySelector('[data-hn-objective]').innerHTML=`<strong>Objectif :</strong> ${esc(phase.objective)}`;
  dialog.querySelector('[data-hn-choices]').innerHTML=phase.options.map(option=>`<label class="hn-choice ${phase.question===option?'selected':''}"><input type="radio" name="hn-question" value="${esc(option)}" ${phase.question===option?'checked':''}><i></i><span>${esc(option)}</span></label>`).join('');
  dialog.querySelectorAll('input[name="hn-question"]').forEach(input=>input.onchange=()=>{phase.question=input.value;dialog.querySelectorAll('.hn-choice').forEach(label=>label.classList.toggle('selected',label.querySelector('input')?.checked));markDirty();});
  const why=dialog.querySelector('[data-hn-why]');why.value=phase.pourquoi;why.placeholder=phase.placeholder;
  dialog.querySelector('[data-hn-error]').textContent='';
  dialog.querySelector('[data-hn-back]').disabled=index===0;
  dialog.querySelector('[data-hn-next]').textContent=index===PHASES.length-1?'Confirmer mes choix':'Continuer';
}
function previous(){if(index>0){index-=1;renderStep();}}
async function next(){
  const phase=current(),error=document.querySelector('[data-hn-error]');
  phase.pourquoi=String(document.querySelector('[data-hn-why]')?.value||'').trim();
  if(!phase.question){error.textContent='Sélectionnez une formulation.';return;}
  if(phase.pourquoi.length<12){error.textContent='Expliquez votre choix en une phrase claire.';return;}
  markDirty();
  if(index<PHASES.length-1){const ok=await save('draft',false);if(!ok)return;index+=1;renderStep();return;}
  const ok=await save('submitted',true);
  if(!ok)return;
  document.getElementById('hnPersonalizationDialogV139').close();renderCard();toast('Vos choix sont enregistrés dans votre dossier Neptune.');
}
function markDirty(){dirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(()=>save('draft',false),650);updateSaveLabel('Sauvegarde…');}
async function save(status='draft',showErrors=false){
  if(!data)return false;
  if(saving){await waitForSave();if(status==='draft'&&!dirty)return true;}
  clearTimeout(saveTimer);
  if(status==='draft'&&!dirty)return true;
  saving=true;updateSaveLabel('Sauvegarde…');
  try{
    const response=await fetch(API,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({orderId:data.order.id,status,phases:data.personalization.phases.map(({id,title,objective,question,pourquoi})=>({id,title,objective,question,pourquoi}))})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||`http_${response.status}`);
    data.personalization=result.personalization;hydrate();dirty=false;updateSaveLabel(status==='submitted'?'Choix confirmés':'Enregistré automatiquement');renderCard();return true;
  }catch(error){console.error('hors_norme_personalization_v139_save_failed',error);updateSaveLabel('Sauvegarde impossible · réessayez');if(showErrors)document.querySelector('[data-hn-error]').textContent='Impossible d’enregistrer pour le moment. Réessayez.';return false;}
  finally{saving=false;}
}
async function waitForSave(){for(let attempt=0;attempt<40&&saving;attempt+=1)await new Promise(resolve=>setTimeout(resolve,50));}
function countDone(){return (data?.personalization?.phases||[]).filter(phase=>phase.question&&String(phase.pourquoi||'').trim().length>=12).length;}
function current(){return data.personalization.phases[index];}
function updateSaveLabel(value){const node=document.querySelector('[data-hn-save]');if(node)node.textContent=value;}
function toast(message){let node=document.getElementById('hnToastV139');if(!node){node=document.createElement('div');node.id='hnToastV139';node.className='hn-toast-v139';document.body.append(node);}node.textContent=message;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),3200);}
function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
