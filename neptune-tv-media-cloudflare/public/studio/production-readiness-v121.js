const RELEASE='neptune-studio-production-readiness-20260817-v121';
document.documentElement.dataset.studioProductionReadinessV121='1';
document.documentElement.dataset.studioProductionReadinessRelease=RELEASE;

start();

function start(){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
}

function boot(){
  normalizeVisibleCopy();
  if(isWebTv())installWebTvIntegration();
  new MutationObserver(()=>{
    normalizeVisibleCopy();
    if(isWebTv())installWebTvIntegration();
  }).observe(document.body,{childList:true,subtree:true});
}

function isWebTv(){return ['/studio/webtv','/studio/webtv/','/studio/webtv.html'].includes(location.pathname);}

function normalizeVisibleCopy(){
  for(const node of document.querySelectorAll('p')){
    const text=String(node.textContent||'').trim();
    if(text.includes('Une dette fournisseur de 720 € TTC est créée automatiquement')){
      node.textContent='Le montant fournisseur provient du coût réellement enregistré pour le passage. Aucun forfait générique n’est appliqué.';
      node.dataset.supplierIntegrityCopy='v121';
    }
  }
}

function installWebTvIntegration(){
  if(document.getElementById('webTvIntegrationV121'))return;
  const stack=document.querySelector('.side-stack');
  if(!stack)return;
  const origin=location.origin;
  const publicUrl=`${origin}/direct/`;
  const embedUrl=`${origin}/direct/?embed=1`;
  const iframe=`<iframe src="${embedUrl}" title="Neptune Business · Direct" allow="autoplay; fullscreen" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen></iframe>`;
  const panel=document.createElement('section');
  panel.className='panel settings-card webtv-integration-v121';
  panel.id='webTvIntegrationV121';
  panel.innerHTML=`
    <p class="eyebrow">INTÉGRATION WEB TV</p>
    <h3>Diffuser la chaîne ailleurs</h3>
    <p class="webtv-integration-copy">Utilisez le lien public pour partager la chaîne, ou copiez le code d’intégration pour afficher le lecteur Neptune sur un site externe.</p>
    ${copyField('Lien public',publicUrl,'public')}
    ${copyField('Lien du lecteur intégré',embedUrl,'embed')}
    <label class="webtv-embed-code"><span>Code iframe</span><textarea id="webTvEmbedCodeV121" readonly rows="5" spellcheck="false">${escapeHtml(iframe)}</textarea></label>
    <div class="webtv-integration-actions">
      <button class="button" type="button" data-copy-v121="iframe">Copier le code d’intégration</button>
      <a class="button" href="${escapeAttr(publicUrl)}" target="_blank" rel="noopener">Ouvrir la chaîne</a>
    </div>
    <p class="microcopy" id="webTvIntegrationStatusV121" aria-live="polite">Le lecteur intégré conserve uniquement l’antenne vidéo et peut être affiché sur un site HTTPS externe.</p>`;
  const antenna=stack.querySelector('.settings-card');
  antenna?.after(panel);
  panel.querySelectorAll('[data-copy-v121]').forEach(button=>button.addEventListener('click',()=>copyValue(button.dataset.copyV121,button)));
}

function copyField(label,value,key){
  return `<label class="webtv-copy-row"><span>${escapeHtml(label)}</span><div><input id="webTvCopy_${key}" value="${escapeAttr(value)}" readonly aria-label="${escapeAttr(label)}"><button class="button" type="button" data-copy-v121="${key}">Copier</button></div></label>`;
}

async function copyValue(key,button){
  const value=key==='iframe'
    ?document.getElementById('webTvEmbedCodeV121')?.value||''
    :document.getElementById(`webTvCopy_${key}`)?.value||'';
  if(!value)return;
  const original=button.textContent;
  try{
    await clipboardWrite(value);
    button.textContent='Copié';
    status('Copié dans le presse-papiers.');
  }catch{
    button.textContent='À copier';
    status('La copie automatique est bloquée par le navigateur. Sélectionnez le champ et copiez-le manuellement.',true);
  }finally{
    setTimeout(()=>{button.textContent=original;},1600);
  }
}

async function clipboardWrite(value){
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(value);
  const area=document.createElement('textarea');
  area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();
  const ok=document.execCommand('copy');area.remove();if(!ok)throw new Error('copy_failed');
}

function status(text,error=false){
  const node=document.getElementById('webTvIntegrationStatusV121');
  if(node){node.textContent=text;node.dataset.error=error?'true':'false';}
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escapeAttr(value){return escapeHtml(value);}
