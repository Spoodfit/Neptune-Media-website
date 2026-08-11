const RELEASE='neptune-media-catalog-ux-20260811-v99';
const API='/api/admin/media-catalog-v98/';
let currentFamilyKey='';
let renderingConfigurations=false;

document.body.dataset.mediaCatalogUx=RELEASE;
installStyle();
boot();

function boot(){
  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-c98-tab]');
    if(tab?.dataset.c98Tab==='configurations')setTimeout(renderConfigurationManager,40);
    const preview=event.target.closest('[data-preview]');
    if(preview?.dataset.preview){currentFamilyKey=preview.dataset.preview;setTimeout(enhancePreview,40);}
  },true);
  const observer=new MutationObserver(()=>queueMicrotask(enhance));
  observer.observe(document.body,{subtree:true,childList:true});
  enhance();
}

function enhance(){
  const page=document.querySelector('.c98-page');
  if(!page)return;
  page.dataset.catalogUx=RELEASE;
  relabel(page);
  enhanceConceptCopy(page);
  enhancePreview();
  const active=document.querySelector('[data-c98-tab="configurations"].is-active');
  if(active&&!document.querySelector('[data-c99-config-manager]'))renderConfigurationManager();
}

function relabel(page){
  const labels={formats:'Concepts',configurations:'Formats & configurations',offers:'Tarifs & offres',suppliers:'Fournisseurs',cities:'Villes'};
  for(const button of page.querySelectorAll('[data-c98-tab]'))if(labels[button.dataset.c98Tab])button.textContent=labels[button.dataset.c98Tab];
  const hero=page.querySelector('.c98-hero p:last-child');
  if(hero)hero.textContent='Un seul endroit pour gérer ce que le client voit et achète : concepts, configurations de plateau, fournisseurs, villes et tarifs. Chaque modification publiée est contrôlable dans le vrai tunnel à droite.';
}

function enhanceConceptCopy(page){
  if(!document.querySelector('[data-c98-tab="formats"].is-active'))return;
  const head=page.querySelector('#c98Work .c98-section-head');
  if(head&&!head.dataset.c99){
    head.dataset.c99='1';
    const title=head.querySelector('h3');if(title)title.textContent='Concepts';
    const description=head.querySelector('p:last-child');if(description)description.textContent='Une carte = un concept vendu dans le tunnel. Le nom, le texte et surtout l’image affichée ici sont ceux à contrôler avant publication.';
  }
  for(const card of page.querySelectorAll('#c98Work .c98-entity-card')){
    if(card.querySelector('.c99-visual-label'))continue;
    const media=card.querySelector('.c98-media');if(!media)continue;
    const label=document.createElement('span');label.className='c99-visual-label';label.textContent='VISUEL CLIENT';media.append(label);
  }
}

function enhancePreview(){
  const host=document.getElementById('c98Preview');
  if(!host||host.querySelector('[data-c99-live-preview]'))return;
  const src=previewUrl();
  host.innerHTML=`<div class="c98-preview-sticky c99-preview" data-c99-live-preview>
    <div class="c98-preview-head"><div><p class="c98-eyebrow">APERÇU TUNNEL RÉEL</p><h3>Ce que voit réellement le client</h3></div><span class="c98-live">LIVE</span></div>
    <p class="c99-preview-note">Ce cadre charge directement <strong>/reserver</strong>. Il ne reconstruit plus le tunnel avec un faux aperçu.</p>
    <div class="c99-device"><iframe title="Aperçu réel du tunnel Neptune Media" src="${esc(src)}" loading="eager"></iframe></div>
    <div class="c99-preview-actions"><button class="c98-button c98-button--ghost" type="button" data-c99-refresh>Recharger l’aperçu</button><a class="c98-button" href="/reserver" target="_blank" rel="noopener">Ouvrir en plein écran ↗</a></div>
  </div>`;
  host.querySelector('[data-c99-refresh]').onclick=()=>{const frame=host.querySelector('iframe');frame.src=previewUrl(true);};
}

function previewUrl(refresh=false){
  const params=new URLSearchParams({catalog_preview:'studio'});
  if(currentFamilyKey)params.set('catalog_family',currentFamilyKey);
  if(refresh)params.set('_',String(Date.now()));
  return `/reserver?${params}`;
}

async function renderConfigurationManager(){
  if(renderingConfigurations)return;
  const work=document.getElementById('c98Work');if(!work)return;
  renderingConfigurations=true;
  try{
    const context=await post('context',{});
    const families=(context.families||[]).filter(f=>f.formatId);
    if(!families.length){work.innerHTML=empty('Aucune offre n’est encore liée à un concept. Créez d’abord une offre dans « Tarifs & offres ».');return;}
    const family=families.find(f=>f.key===currentFamilyKey)||families[0];currentFamilyKey=family.key;
    const visuals=family.configurationVisuals||[];
    work.innerHTML=`<div data-c99-config-manager>
      ${head('FORMATS VISUELS','Formats & configurations','Gérez ici les choix Canapé, Chaise, Plateau, Bar… comme de vraies cartes. Plus de liste séparée par des virgules. Chaque carte contient son nom, son visuel et sa description client.','<button class="c98-button" type="button" data-c99-add>Ajouter une configuration</button>')}
      <label class="c98-family-picker c99-family-picker">Concept / offre à modifier<select data-c99-family>${families.map(f=>`<option value="${esc(f.key)}" ${f.key===family.key?'selected':''}>${esc(f.cityName)} · ${esc(f.formatName)} · ${esc(f.supplierName)}</option>`).join('')}</select></label>
      <div class="c99-config-help"><strong>Règle simple :</strong> l’image visible sur chaque carte ci-dessous est celle qui doit représenter exactement cette configuration dans le tunnel. Pour HORS NORME, <b>Canapé = exact-hn1</b> et <b>Chaise = exact-hn2</b>.</div>
      <div class="c99-config-grid">${visuals.map(v=>configCard(v)).join('')||empty('Aucune configuration. Cliquez sur « Ajouter une configuration ».')}</div>
      <div data-c99-config-editor></div>
    </div>`;
    work.querySelector('[data-c99-family]').onchange=e=>{currentFamilyKey=e.target.value;renderingConfigurations=false;renderConfigurationManager();};
    work.querySelector('[data-c99-add]').onclick=()=>openConfigEditor(context,family,null);
    work.querySelectorAll('[data-c99-edit]').forEach(button=>button.onclick=()=>openConfigEditor(context,family,visuals.find(v=>v.label===button.dataset.c99Edit)));
    work.querySelectorAll('[data-c99-remove]').forEach(button=>button.onclick=()=>removeConfiguration(context,family,button.dataset.c99Remove));
    await hydrateB64(work);
  }catch(error){work.innerHTML=empty(`Impossible de charger les configurations : ${err(error.message)}`);}
  finally{renderingConfigurations=false;}
}

function configCard(v){
  return `<article class="c99-config-card"><div class="c99-config-media">${visual(v,v.label)}<span>VISUEL CLIENT</span></div><div class="c99-config-body"><div><p class="c98-eyebrow">CONFIGURATION</p><h4>${esc(v.label)}</h4><p>${esc(v.description||'Aucune description client.')}</p></div><div class="c99-config-actions"><button class="c98-link" type="button" data-c99-edit="${esc(v.label)}">Modifier</button><button class="c98-link c99-danger" type="button" data-c99-remove="${esc(v.label)}">Retirer</button></div></div></article>`;
}

function openConfigEditor(context,family,existing){
  const host=document.querySelector('[data-c99-config-editor]');if(!host)return;
  const editing=Boolean(existing?.label);
  host.innerHTML=`<form class="c98-editor c99-config-editor" data-c99-form>
    <div class="c98-editor-title"><div><p class="c98-eyebrow">${editing?'MODIFIER':'NOUVELLE CONFIGURATION'}</p><h4>${esc(existing?.label||'Ajouter une configuration')}</h4></div><button class="c98-close" type="button" data-c99-close>×</button></div>
    <div class="c98-editor-grid">${field('Nom affiché au client','label',existing?.label||'',true)}${area('Description client','description',existing?.description||'','c98-span-2')}
      <div class="c98-visual-editor c98-span-2"><div class="c98-visual-thumb" data-c99-thumb>${visual(existing||{},existing?.label||'Visuel')}</div><div><label class="c98-field"><span>Adresse du visuel</span><input name="imageUrl" value="${esc(existing?.image||'')}"></label><label class="c98-upload"><input data-c99-upload type="file" accept="image/jpeg,image/png,image/webp"><span>Importer JPG / PNG / WebP</span></label><small>L’image importée devient la référence de cette configuration. Aucun renommage de fichier ne doit déterminer Canapé ou Chaise.</small></div></div>
    </div><div class="c98-editor-actions"><span data-c99-msg></span><button class="c98-button c98-button--ghost" type="button" data-c99-cancel>Annuler</button><button class="c98-button">Enregistrer et publier</button></div>
  </form>`;
  const form=host.querySelector('[data-c99-form]');
  const close=()=>host.innerHTML='';form.querySelector('[data-c99-close]').onclick=form.querySelector('[data-c99-cancel]').onclick=close;
  form.querySelector('[data-c99-upload]').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;const msg=form.querySelector('[data-c99-msg]');try{msg.textContent='Import…';form.imageUrl.value=await upload(file);form.querySelector('[data-c99-thumb]').innerHTML=image(form.imageUrl.value,'Visuel');msg.textContent='Image importée.';}catch(error){msg.textContent=err(error.message);}};
  hydrateB64(form);
  form.onsubmit=async event=>{
    event.preventDefault();const msg=form.querySelector('[data-c99-msg]');const label=form.label.value.trim();if(!label)return;
    try{
      msg.textContent='Publication…';
      let labels=[...(family.configurationOptions||[])];
      if(editing&&existing.label!==label)labels=labels.filter(x=>x!==existing.label);
      if(!labels.includes(label))labels.push(label);
      await saveFamilyLabels(family,labels);
      await post('configuration-visual/save',{formatId:family.formatId,label,imageUrl:form.imageUrl.value,description:form.description.value});
      msg.textContent='Publié.';currentFamilyKey=family.key;await refreshTunnelPreview();renderConfigurationManager();
    }catch(error){msg.textContent=err(error.message);}
  };
}

async function removeConfiguration(context,family,label){
  if(!confirm(`Retirer « ${label} » du tunnel pour cette offre ?`))return;
  const labels=(family.configurationOptions||[]).filter(x=>x!==label);
  try{await saveFamilyLabels(family,labels);await refreshTunnelPreview();renderConfigurationManager();}catch(error){alert(err(error.message));}
}

function saveFamilyLabels(family,labels){
  return post('family/save',{
    cityId:family.cityId,formatId:family.formatId,supplierId:family.supplierId,publicOrder:n(family.publicOrder,100),
    supplierNetCents:n(family.supplierNetCents),vatRateBps:n(family.vatRateBps,2000),preparationUrl:family.preparationUrl||'',
    configurationOptions:labels,priceSuffix:family.priceSuffix||'HT',currency:family.currency||'eur',active:family.active!==false,
    tiers:{launch:tierPayload(family.tiers?.launch),promo:tierPayload(family.tiers?.promo),base:tierPayload(family.tiers?.base)}
  });
}
function tierPayload(t={}){return{id:t?.id||'',clientPriceCents:n(t?.clientPriceCents),paymentUrl:t?.paymentUrl||''};}

async function refreshTunnelPreview(){
  const response=await fetch('/api/reservation/catalog-v96',{cache:'no-store'});if(!response.ok)throw Error('catalog_public_refresh_failed');
  const host=document.getElementById('c98Preview');if(host)host.innerHTML='';enhancePreview();
}

async function upload(file){const fd=new FormData();fd.append('file',file);const response=await fetch(API+'asset/upload',{method:'POST',body:fd});const payload=await response.json().catch(()=>({}));if(!response.ok)throw Error(payload.error||'upload_failed');return payload.url;}
async function post(path,payload){const response=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||`http_${response.status}`);return data;}

async function hydrateB64(root){for(const img of root.querySelectorAll('[data-c99-b64]'))try{const text=await fetch(img.dataset.c99B64).then(r=>r.text());img.src='data:image/webp;base64,'+text.trim();}catch{img.src='/assets/posters/studio-wide.webp';}}
function visual(v,alt=''){return v?.imageBase64?`<img data-c99-b64="${esc(v.imageBase64)}" alt="${esc(alt)}">`:image(v?.image,alt);}
function image(src,alt=''){return `<img src="${esc(src||'/assets/posters/studio-wide.webp')}" alt="${esc(alt)}" loading="eager">`;}
function head(k,t,d,a=''){return `<div class="c98-section-head"><div><p class="c98-eyebrow">${k}</p><h3>${t}</h3><p>${d}</p></div>${a}</div>`;}
function field(l,k,v='',required=false,type='text'){return `<label class="c98-field"><span>${l}</span><input name="${k}" type="${type}" value="${esc(v??'')}" ${required?'required':''}></label>`;}
function area(l,k,v='',cl=''){return `<label class="c98-field ${cl}"><span>${l}</span><textarea name="${k}" rows="3">${esc(v||'')}</textarea></label>`;}
function empty(text){return `<div class="c98-loading c99-empty"><p>${esc(text)}</p></div>`;}
function n(v,d=0){const value=Number(v);return Number.isFinite(value)?value:d;}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function err(value){return ({unauthorized:'Session Studio expirée.',origin_forbidden:'Session Studio expirée.',image_type_not_supported:'Utilisez JPG, PNG ou WebP.',image_too_large:'Image supérieure à 5 Mo.',payment_url_required_launch:'Le lien Stripe du prix coûtant manque.',payment_url_required_promo:'Le lien Stripe préférentiel manque.',payment_url_required_base:'Le lien Stripe normal manque.',catalog_public_refresh_failed:'La publication est enregistrée mais le tunnel public n’a pas pu être relu.'}[value]||value||'Une erreur est survenue.');}

function installStyle(){
  if(document.getElementById('mediaCatalogUxV99Style'))return;
  const style=document.createElement('style');style.id='mediaCatalogUxV99Style';style.textContent=`
  .c98-media,.c99-config-media{position:relative}.c99-visual-label,.c99-config-media>span{position:absolute;left:10px;top:10px;padding:5px 7px;border-radius:999px;background:rgba(5,13,31,.78);backdrop-filter:blur(8px);color:#fff;font-size:.52rem;font-weight:900;letter-spacing:.09em}
  .c99-preview{gap:10px}.c99-preview-note{margin:0;color:#667085;font-size:.64rem;line-height:1.45}.c99-device{height:min(620px,68vh);overflow:hidden;border:1px solid #d6dbe5;border-radius:16px;background:#071229;box-shadow:0 12px 30px rgba(16,24,40,.1)}.c99-device iframe{width:100%;height:100%;border:0;background:#fff}.c99-preview-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.c99-preview-actions>*{width:100%}
  .c99-family-picker{margin-top:12px}.c99-config-help{margin-top:12px;padding:12px 14px;border:1px solid #d7def0;border-radius:14px;background:#f8faff;color:#475467;font-size:.68rem;line-height:1.5}.c99-config-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;margin-top:13px}.c99-config-card{overflow:hidden;border:1px solid #dfe5ef;border-radius:18px;background:#fff;box-shadow:0 5px 16px rgba(16,24,40,.055)}.c99-config-media{aspect-ratio:16/9;overflow:hidden;background:#07142e}.c99-config-media img{width:100%;height:100%;object-fit:cover}.c99-config-body{display:grid;gap:12px;padding:14px}.c99-config-body h4{margin:0;font-size:.96rem}.c99-config-body p:not(.c98-eyebrow){margin:5px 0 0;color:#667085;font-size:.68rem;line-height:1.45}.c99-config-actions{display:flex;justify-content:space-between;gap:10px}.c99-danger{color:#b42318!important}.c99-config-editor{margin-top:14px}.c99-empty{min-height:110px!important}
  @media(max-width:1180px){.c99-device{height:520px}.c99-config-grid{grid-template-columns:1fr}}
  @media(max-width:980px){.c99-device{height:650px}.c99-config-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:720px){.c99-device{height:610px}.c99-preview-actions,.c99-config-grid{grid-template-columns:1fr}.c99-preview-actions>*{min-height:44px}}
  `;document.head.append(style);
}
