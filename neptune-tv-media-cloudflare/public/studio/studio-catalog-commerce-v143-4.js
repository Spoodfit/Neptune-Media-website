import '/studio/studio-catalog-commerce-v143.js?v=4';

const RELEASE='neptune-studio-simple-catalog-publishing-20260827-v146';
const CONTEXT_API='/api/admin/media-catalog-v98/context';
const CITY_API='/api/admin/media-catalog-v143/city/save';
const FAMILY_API='/api/admin/media-catalog-v143/family/save';
const FORMAT_API='/api/admin/media-catalog-v98/format/save';
const ASSET_API='/api/admin/media-catalog-v98/asset/upload';
const STRIPE_API='/api/admin/sales-config-v96/stripe-links';
const PUBLIC_CATALOG='/api/reservation/catalog-v96';
let context=null,stripeLinks=[],geoChoice=null,geoTimer=0,polishTimer=0;

document.body.dataset.simpleCatalogPublishing=RELEASE;
ensureStyles();
cleanCityDrawer();
polishCockpit();
window.addEventListener('click',capturePrimaryAdd,true);
new MutationObserver(()=>{cleanCityDrawer();schedulePolish();}).observe(document.body,{childList:true,subtree:true});

function schedulePolish(){clearTimeout(polishTimer);polishTimer=setTimeout(polishCockpit,25);}
function polishCockpit(){
  const root=document.getElementById('studioCatalogCommercialCockpitV145');if(!root)return;
  const eyebrow=root.querySelector('.v145-eyebrow');if(eyebrow)eyebrow.textContent='CATALOGUE MÉDIA';
  const title=root.querySelector('.v145-titleline h2');if(title)title.textContent='Villes et formats';
  const search=root.querySelector('[data-v145-search]');if(search)search.placeholder='Rechercher une ville ou un format…';
  const add=root.querySelector('[data-v145-add]');if(add){add.textContent='+ Ajouter';add.title='Ajouter une ville, une offre ou un format';}
  const preview=[...root.querySelectorAll('a')].find(link=>/aperçu client/iu.test(link.textContent||''));if(preview)preview.textContent='Voir le tunnel ↗';
  if(!root.querySelector('.v146-catalog-explainer')){
    const toolbar=root.querySelector('.v145-toolbar');if(toolbar){const note=document.createElement('p');note.className='v146-catalog-explainer';note.innerHTML='<strong>Simple :</strong> ce qui est marqué “Prêt à vendre” est visible dans le tunnel. Le bouton <b>+ Ajouter</b> crée et publie sans passer par les réglages techniques.';toolbar.after(note);}
  }
}

function capturePrimaryAdd(event){
  const add=event.target.closest?.('[data-v145-add]');if(!add)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openChoice();
}

async function openChoice(){
  await loadContext();
  const dialog=ensureDialog();
  dialog.innerHTML=`<section class="v146-dialog-card"><header><div><span>CATALOGUE MÉDIA</span><h2>Qu’est-ce que vous ajoutez ?</h2><p>Choisissez l’action. Les détails techniques restent disponibles uniquement si vous en avez besoin.</p></div><button type="button" data-v146-close aria-label="Fermer">×</button></header><div class="v146-choice-grid"><button type="button" data-v146-choice="publish"><i>＋</i><strong>Une ville / une offre</strong><small>Publier un format dans le tunnel de vente.</small></button><button type="button" data-v146-choice="format"><i>▣</i><strong>Un nouveau format</strong><small>Créer un concept puis le proposer dans une ville.</small></button></div><footer><button type="button" class="quiet" data-v146-close>Annuler</button><a href="/studio/advanced.html#programs" class="quiet-link">Réglages avancés</a></footer></section>`;
  bindClose(dialog);dialog.querySelector('[data-v146-choice="publish"]').onclick=()=>renderPublisher(dialog);dialog.querySelector('[data-v146-choice="format"]').onclick=()=>renderFormatCreator(dialog);dialog.showModal();
}

async function renderPublisher(dialog,preselectedFormat=''){
  await Promise.all([loadContext(true),loadStripeLinks()]);
  const cities=active(context?.cities),formats=active(context?.formats),suppliers=active(context?.suppliers);
  dialog.innerHTML=`<form class="v146-dialog-card v146-publisher" data-v146-publish><header><div><span>PUBLICATION SIMPLE</span><h2>Publier dans le tunnel</h2><p>Une ville, un format, un fournisseur et un lien Stripe. Neptune vérifie ensuite automatiquement que le tunnel est à jour.</p></div><button type="button" data-v146-close aria-label="Fermer">×</button></header><div class="v146-form-grid"><label class="v146-wide"><span>Ville</span><div class="v146-city-mode"><button type="button" class="is-active" data-v146-city-mode="new">Nouvelle ville</button><button type="button" data-v146-city-mode="existing">Ville existante</button></div></label><label class="v146-wide" data-v146-new-city><span>Nom de la ville</span><div class="v146-city-search"><input name="cityName" autocomplete="off" placeholder="Ex. Toulouse" required><div class="v146-city-results" data-v146-city-results hidden></div></div><small>Saisissez quelques lettres puis choisissez la ville proposée.</small></label><label class="v146-wide" data-v146-existing-city hidden><span>Ville existante</span><select name="cityId">${optionList(cities,'Choisir une ville')}</select></label><label><span>Format</span><select name="formatId" required>${optionList(formats,'Choisir un format',preselectedFormat)}</select></label><label><span>Fournisseur</span><select name="supplierId" required>${optionList(suppliers,'Choisir un fournisseur')}</select></label><label class="v146-wide"><span>Lien de paiement Stripe</span>${stripeControl()}<small>Le prix client est repris automatiquement depuis Stripe : aucune double saisie.</small></label><div class="v146-price-preview v146-wide" data-v146-price-preview>Choisissez un lien Stripe pour voir le prix public.</div></div><div class="v146-feedback" data-v146-feedback hidden></div><footer><button type="button" class="quiet" data-v146-back>Retour</button><button type="submit" class="primary">Publier dans le tunnel →</button></footer></form>`;
  bindClose(dialog);dialog.querySelector('[data-v146-back]').onclick=openChoice;
  const form=dialog.querySelector('[data-v146-publish]');
  bindCityMode(form);bindGeoSearch(form);bindStripePreview(form);bindSupplierPreview(form);
  form.addEventListener('submit',event=>publishOffer(event,dialog));
}

function renderFormatCreator(dialog){
  dialog.innerHTML=`<form class="v146-dialog-card" data-v146-format><header><div><span>NOUVEAU FORMAT</span><h2>Créer un format</h2><p>Les champs indispensables uniquement. Vous pourrez ajouter les détails avancés plus tard.</p></div><button type="button" data-v146-close aria-label="Fermer">×</button></header><div class="v146-form-grid"><label><span>Nom du format</span><input name="name" required placeholder="Ex. Interview Duo"></label><label><span>Concept éditorial</span><input name="concept" required placeholder="Ex. Deux regards, une même problématique"></label><label><span>Durée du passage</span><input name="shootMinutes" type="number" min="5" max="600" value="60" required><small>En minutes</small></label><label><span>Temps total à prévoir</span><input name="totalMinutes" type="number" min="5" max="900" value="90" required><small>Installation comprise</small></label><label class="v146-wide"><span>Description courte</span><textarea name="description" rows="3" placeholder="Ce que le client doit comprendre en une phrase."></textarea></label><label class="v146-wide"><span>Visuel du format</span><input name="visual" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel. JPG, PNG ou WebP, 5 Mo maximum.</small></label></div><div class="v146-feedback" data-v146-feedback hidden></div><footer><button type="button" class="quiet" data-v146-back>Retour</button><button type="submit" class="primary">Créer le format →</button></footer></form>`;
  bindClose(dialog);dialog.querySelector('[data-v146-back]').onclick=openChoice;dialog.querySelector('[data-v146-format]').addEventListener('submit',event=>createFormat(event,dialog));
}

async function createFormat(event,dialog){
  event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v146-feedback]');setBusy(submit,true,'Création…');feedback.hidden=true;
  try{
    const values=new FormData(form),name=String(values.get('name')||'').trim(),concept=String(values.get('concept')||'').trim(),shootMinutes=Number(values.get('shootMinutes')||0),totalMinutes=Number(values.get('totalMinutes')||0),file=values.get('visual');
    let imageUrl='';if(file&&typeof file==='object'&&Number(file.size||0)>0)imageUrl=await uploadAsset(file);
    const result=await api(FORMAT_API,{name,concept,description:String(values.get('description')||'').trim(),shootMinutes,totalMinutes,imageUrl,active:true,publicOrder:100});
    context=result;const savedId=String(result.savedId||'');
    feedback.hidden=false;feedback.className='v146-feedback is-success';feedback.innerHTML='<strong>Format créé ✓</strong><span>Il est prêt. Choisissez maintenant la ville où vous souhaitez le vendre.</span>';
    setTimeout(()=>renderPublisher(dialog,savedId),650);
  }catch(error){showError(feedback,error);}finally{setBusy(submit,false,'Créer le format →');}
}

async function publishOffer(event,dialog){
  event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type="submit"]'),feedback=form.querySelector('[data-v146-feedback]');setBusy(submit,true,'Publication…');feedback.hidden=true;
  try{
    const values=new FormData(form),formatId=String(values.get('formatId')||''),supplierId=String(values.get('supplierId')||''),linkId=String(values.get('stripeLink')||''),customUrl=String(values.get('stripeUrl')||'').trim();
    if(!formatId||!supplierId)throw new Error('Choisissez un format et un fournisseur.');
    const stripe=stripeLinks.find(link=>String(link.id)===linkId)||null,paymentUrl=stripe?.url||customUrl,price=Number(stripe?.amountTotal||values.get('clientPriceCents')||0);
    if(!/^https:\/\//iu.test(paymentUrl))throw new Error('Choisissez un lien Stripe valide.');
    if(!(price>0))throw new Error('Le lien Stripe doit contenir un prix exploitable.');
    const supplier=(context?.suppliers||[]).find(item=>String(item.id)===supplierId)||{},gross=Number(supplier.defaultGrossCents||Math.round(Number(supplier.defaultNetCents||0)*(1+Number(supplier.vatRateBps||2000)/10000))||0);
    if(gross>0&&price<gross)throw new Error(`Le prix Stripe doit être au minimum de ${money(gross)} TTC pour couvrir le fournisseur.`);
    let cityId=String(values.get('cityId')||'');
    if(form.dataset.cityMode!=='existing'){
      const cityName=String(values.get('cityName')||'').trim();if(!cityName)throw new Error('Choisissez une ville.');
      const existing=(context?.cities||[]).find(city=>normal(city.name)===normal(cityName));
      if(existing)cityId=String(existing.id);else{
        const geo=geoChoice&&normal(geoChoice.name)===normal(cityName)?geoChoice:await resolveCity(cityName);
        const saved=await api(CITY_API,{name:geo?.name||cityName,country:'France',active:true,latitude:geo?.lat??null,longitude:geo?.lng??null,geoSource:geo?'geo.api.gouv.fr':'manual'});cityId=String(saved.savedId||'');
      }
    }
    if(!cityId)throw new Error('La ville n’a pas pu être créée.');
    const familyForFormat=(context?.families||[]).find(family=>String(family.formatId)===formatId&&Array.isArray(family.configurationOptions)&&family.configurationOptions.length);
    await api(FAMILY_API,{cityId,formatId,supplierId,supplierNetCents:Number(supplier.defaultNetCents||0),vatRateBps:Number(supplier.vatRateBps||2000),configurationOptions:familyForFormat?.configurationOptions||[],active:true,tiers:{launch:{visible:false,clientPriceCents:0,paymentUrl:'',capacity:0},promo:{visible:false,clientPriceCents:0,paymentUrl:'',capacity:0},base:{visible:true,clientPriceCents:price,paymentUrl,capacity:0}}});
    const published=await verifyPublished(cityId,formatId);if(!published)throw new Error('Enregistré, mais le tunnel ne renvoie pas encore cette offre. Neptune refuse de l’annoncer comme publiée : réessayez dans quelques secondes.');
    feedback.hidden=false;feedback.className='v146-feedback is-success';feedback.innerHTML='<strong>Publié dans le tunnel ✓</strong><span>La ville et le format sont maintenant visibles côté client.</span><a href="/reserver?catalog_preview=studio" target="_blank" rel="noopener">Voir le tunnel ↗</a>';
    context=null;document.getElementById('refresh')?.click();setTimeout(()=>loadContext(true),250);
    submit.textContent='Publié ✓';
  }catch(error){showError(feedback,error);setBusy(submit,false,'Publier dans le tunnel →');}
}

function bindCityMode(form){
  form.dataset.cityMode='new';for(const button of form.querySelectorAll('[data-v146-city-mode]'))button.onclick=()=>{const mode=button.dataset.v146CityMode;form.dataset.cityMode=mode;form.querySelectorAll('[data-v146-city-mode]').forEach(item=>item.classList.toggle('is-active',item===button));form.querySelector('[data-v146-new-city]').hidden=mode!=='new';form.querySelector('[data-v146-existing-city]').hidden=mode!=='existing';};
}
function bindGeoSearch(form){const input=form.querySelector('input[name="cityName"]'),box=form.querySelector('[data-v146-city-results]');if(!input||!box)return;input.addEventListener('input',()=>{geoChoice=null;clearTimeout(geoTimer);const q=input.value.trim();if(q.length<2){box.hidden=true;return;}geoTimer=setTimeout(async()=>{const items=await searchCities(q);box.innerHTML=items.length?items.map((item,index)=>`<button type="button" data-v146-geo="${index}"><strong>${esc(item.name)}</strong><small>${esc(item.postcode||'France')}</small></button>`).join(''):'<span>Aucune ville trouvée</span>';box.hidden=false;box.querySelectorAll('[data-v146-geo]').forEach(button=>button.onclick=()=>{geoChoice=items[Number(button.dataset.v146Geo)];input.value=geoChoice.name;box.hidden=true;});},180);});}
function bindStripePreview(form){const select=form.querySelector('select[name="stripeLink"]'),input=form.querySelector('input[name="stripeUrl"]'),preview=form.querySelector('[data-v146-price-preview]');const update=()=>{const link=stripeLinks.find(item=>String(item.id)===String(select?.value||''));preview.innerHTML=link?`<span>Prix client</span><strong>${money(link.amountTotal)}</strong><small>${esc(link.label||'Lien Stripe')}</small>`:'Choisissez un lien Stripe pour voir le prix public.';};select?.addEventListener('change',update);input?.addEventListener('input',update);update();}
function bindSupplierPreview(form){const select=form.querySelector('select[name="supplierId"]'),preview=form.querySelector('[data-v146-price-preview]');select?.addEventListener('change',()=>{const supplier=(context?.suppliers||[]).find(item=>String(item.id)===String(select.value));if(supplier&&Number(supplier.defaultGrossCents||0)>0)preview.dataset.supplierMinimum=money(supplier.defaultGrossCents);});}
function stripeControl(){if(stripeLinks.length)return `<select name="stripeLink" required><option value="">Choisir un lien Stripe</option>${stripeLinks.map(link=>`<option value="${attr(link.id)}">${esc(link.label||link.id)} · ${money(link.amountTotal)}</option>`).join('')}</select>`;return '<input name="stripeUrl" type="url" inputmode="url" placeholder="https://buy.stripe.com/…" required><input name="clientPriceCents" type="number" min="1" placeholder="Prix en centimes" required>'}

async function loadContext(force=false){if(context&&!force)return context;context=await api(CONTEXT_API,{});return context;}
async function loadStripeLinks(){try{const data=await api(STRIPE_API,{});stripeLinks=Array.isArray(data.links)?data.links.filter(link=>link?.url&&Number(link.amountTotal)>0):[];}catch{stripeLinks=[];}return stripeLinks;}
async function api(path,payload){const headers={'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache, no-store'},csrf=sessionStorage.getItem('neptune_csrf')||'';if(csrf)headers['X-CSRF-Token']=csrf;const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers,body:JSON.stringify(payload||{})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(messageFor(data.error)||data.error||`HTTP ${response.status}`);return data;}
async function uploadAsset(file){const form=new FormData();form.set('file',file);const headers={},csrf=sessionStorage.getItem('neptune_csrf')||'';if(csrf)headers['X-CSRF-Token']=csrf;const response=await fetch(ASSET_API,{method:'POST',credentials:'same-origin',headers,body:form}),data=await response.json().catch(()=>({}));if(!response.ok||!data.url)throw new Error(messageFor(data.error)||'Le visuel n’a pas pu être importé.');return data.url;}
async function verifyPublished(cityId,formatId){for(let attempt=0;attempt<4;attempt+=1){const response=await fetch(`${PUBLIC_CATALOG}?v146=${Date.now()}-${attempt}`,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache, no-store'}}),data=await response.json().catch(()=>({}));if(response.ok&&(data.cities||[]).some(city=>String(city.id)===cityId&&(city.formats||[]).some(format=>String(format.id)===formatId&&(format.offers||[]).length)))return true;await wait(350);}return false;}

async function searchCities(q){try{const url=new URL('https://geo.api.gouv.fr/communes');url.searchParams.set('nom',q);url.searchParams.set('fields','nom,centre,codesPostaux');url.searchParams.set('boost','population');url.searchParams.set('limit','7');const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)return[];const data=await response.json();return(data||[]).map(item=>({name:item.nom,postcode:item.codesPostaux?.[0]||'',lat:Number(item.centre?.coordinates?.[1]),lng:Number(item.centre?.coordinates?.[0])})).filter(item=>item.name);}catch{return[];}}
async function resolveCity(name){const items=await searchCities(name);return items.find(item=>normal(item.name)===normal(name))||items[0]||null;}

function cleanCityDrawer(){
  document.body.dataset.cityDrawerV1434=RELEASE;const drawer=document.querySelector('.v143-city-drawer');if(!drawer)return;drawer.dataset.cityDrawerV1434='1';const input=drawer.querySelector('input[name="name"]');if(input){input.removeAttribute('list');input.setAttribute('autocomplete','off');input.setAttribute('autocapitalize','off');input.setAttribute('spellcheck','false');input.setAttribute('data-city-autocomplete','neptune');}for(const datalist of drawer.querySelectorAll('datalist'))datalist.remove();const field=input?.closest('label');if(field){for(const help of field.querySelectorAll('small'))if(!help.classList.contains('v143-city-help'))help.hidden=true;}
}
function ensureDialog(){let dialog=document.getElementById('simpleCatalogDialogV146');if(dialog)return dialog;dialog=document.createElement('dialog');dialog.id='simpleCatalogDialogV146';dialog.className='v146-dialog';document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});return dialog;}
function bindClose(dialog){dialog.querySelectorAll('[data-v146-close]').forEach(button=>button.onclick=()=>dialog.close());}
function optionList(items,placeholder,selected=''){return `<option value="">${esc(placeholder)}</option>`+items.map(item=>`<option value="${attr(item.id)}" ${String(item.id)===String(selected)?'selected':''}>${esc(item.name||item.label||item.id)}</option>`).join('');}
function active(items){return(Array.isArray(items)?items:[]).filter(item=>item.active!==false);}
function setBusy(button,busy,label){if(!button)return;button.disabled=busy;button.textContent=label;}
function showError(node,error){node.hidden=false;node.className='v146-feedback is-error';node.textContent=String(error?.message||error||'Une erreur est survenue.');}
function messageFor(code){return({city_name_required:'Indiquez une ville.',format_name_required:'Indiquez le nom du format.',concept_required:'Indiquez le concept éditorial.',shoot_duration_required:'Indiquez la durée du passage.',total_duration_required:'Indiquez le temps total à prévoir.',client_price_below_supplier_gross:'Le prix client ne peut pas être inférieur au coût fournisseur.',payment_url_required_base:'Choisissez un lien Stripe.',offer_reference_invalid:'La combinaison ville / format / fournisseur n’est pas valide.'})[String(code||'')]||'';}
function money(cents){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(cents||0)/100);}
function normal(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-|-$/gu,'');}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function esc(value){return String(value??'').replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function attr(value){return esc(value);}

function ensureStyles(){if(document.getElementById('simpleCatalogStylesV146'))return;const style=document.createElement('style');style.id='simpleCatalogStylesV146';style.textContent=`
body.v145-catalog-active .v145-kpis,body.v145-catalog-active [data-v145-filter],body.v145-catalog-active .v145-filter-panel{display:none!important}
body.v145-catalog-active .v145-summary-head{min-height:68px!important;padding:15px 20px!important}
body.v145-catalog-active .v145-summary-head>div:first-child{width:100%}
body.v145-catalog-active .v145-supplier-id em{display:none!important}
body.v145-catalog-active .v145-money{grid-template-columns:minmax(130px,180px)!important}
body.v145-catalog-active .v145-money>div:not(.is-main){display:none!important}
body.v145-catalog-active .v145-alert small{max-width:700px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v146-catalog-explainer{margin:0;padding:10px 20px 12px;border-top:1px solid #edf0f6;background:#fbfcfe;color:#68738b;font-size:11px;line-height:1.45}.v146-catalog-explainer strong,.v146-catalog-explainer b{color:#1a2644}
.v146-dialog{width:min(760px,calc(100vw - 28px));max-height:min(850px,calc(100dvh - 28px));padding:0;border:0;border-radius:24px;background:#fff;color:#17213a;box-shadow:0 32px 100px rgba(14,24,52,.25)}.v146-dialog::backdrop{background:rgba(8,16,36,.54);backdrop-filter:blur(7px)}.v146-dialog-card{display:grid;grid-template-rows:auto minmax(0,1fr) auto;max-height:inherit}.v146-dialog-card>header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:25px 27px 20px;border-bottom:1px solid #edf0f5}.v146-dialog-card>header span{color:#6755df;font-size:10px;font-weight:900;letter-spacing:.13em}.v146-dialog-card>header h2{margin:5px 0 0;font-size:26px;letter-spacing:-.035em}.v146-dialog-card>header p{max-width:590px;margin:7px 0 0;color:#778198;font-size:12px;line-height:1.5}.v146-dialog-card>header button{width:38px;height:38px;border:1px solid #e0e5ed;border-radius:11px;background:#fff;color:#68758a;font-size:20px;cursor:pointer}.v146-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:25px 27px}.v146-choice-grid button{min-height:150px;padding:22px;border:1px solid #e0e5ee;border-radius:17px;background:#fff;text-align:left;cursor:pointer;transition:.15s}.v146-choice-grid button:hover{transform:translateY(-2px);border-color:#bdb4f2;box-shadow:0 12px 28px rgba(52,40,132,.09)}.v146-choice-grid i{display:grid;width:38px;height:38px;place-items:center;margin-bottom:16px;border-radius:12px;background:#f0edff;color:#6351dc;font-style:normal;font-weight:900}.v146-choice-grid strong{display:block;font-size:15px}.v146-choice-grid small{display:block;margin-top:6px;color:#788399;font-size:11px;line-height:1.45}.v146-dialog-card>footer{display:flex;align-items:center;justify-content:flex-end;gap:9px;padding:14px 27px 20px;border-top:1px solid #edf0f5}.v146-dialog-card>footer .quiet,.v146-dialog-card>footer .primary,.v146-dialog-card>footer .quiet-link{min-height:42px;padding:0 14px;border-radius:10px;font:inherit;font-size:11px;font-weight:820;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer}.v146-dialog-card>footer .quiet{border:1px solid #dfe4ed;background:#fff;color:#58657b}.v146-dialog-card>footer .quiet-link{margin-right:auto;color:#6b5adf}.v146-dialog-card>footer .primary{border:0;background:linear-gradient(110deg,#4e71ff,#7c55ed 55%,#d443c0);color:#fff}.v146-dialog-card>footer .primary:disabled{opacity:.55;cursor:wait}.v146-form-grid{overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:15px 17px;padding:22px 27px 25px;background:#f8f9fc}.v146-form-grid label{display:grid;align-content:start;gap:6px;min-width:0}.v146-form-grid label>span{color:#344057;font-size:10px;font-weight:850}.v146-form-grid input,.v146-form-grid select,.v146-form-grid textarea{width:100%;min-height:44px;padding:10px 11px;border:1px solid #d6dce7;border-radius:10px;background:#fff;color:#17213a;font:inherit;font-size:12px;outline:0}.v146-form-grid textarea{resize:vertical}.v146-form-grid input:focus,.v146-form-grid select:focus,.v146-form-grid textarea:focus{border-color:#7661e7;box-shadow:0 0 0 3px rgba(103,82,220,.09)}.v146-form-grid label>small{color:#8993a5;font-size:10px;line-height:1.4}.v146-wide{grid-column:1/-1}.v146-city-mode{display:flex;gap:6px;padding:3px;border:1px solid #dde2eb;border-radius:10px;background:#eef1f6}.v146-city-mode button{flex:1;min-height:34px;border:0;border-radius:7px;background:transparent;color:#68748a;font:inherit;font-size:10px;font-weight:800;cursor:pointer}.v146-city-mode button.is-active{background:#fff;color:#4f40ca;box-shadow:0 2px 8px rgba(25,34,58,.08)}.v146-city-search{position:relative}.v146-city-results{position:absolute;z-index:30;top:calc(100% + 5px);left:0;right:0;max-height:220px;overflow:auto;padding:5px;border:1px solid #dde2eb;border-radius:11px;background:#fff;box-shadow:0 16px 38px rgba(21,31,57,.17)}.v146-city-results button{width:100%;display:grid;gap:2px;padding:9px 10px;border:0;border-radius:8px;background:#fff;text-align:left;cursor:pointer}.v146-city-results button:hover{background:#f5f3ff}.v146-city-results strong{font-size:11px}.v146-city-results small,.v146-city-results>span{color:#7d879a;font-size:10px}.v146-price-preview{min-height:58px;padding:11px 13px;border:1px solid #e0e4ec;border-radius:12px;background:#fff;color:#7d8799;font-size:11px}.v146-price-preview span{display:block;color:#7f899b;font-size:9px;font-weight:850;text-transform:uppercase}.v146-price-preview strong{display:inline-block;margin-top:3px;color:#14203b;font-size:18px}.v146-price-preview small{margin-left:9px}.v146-feedback{margin:0 27px 16px;padding:12px 14px;border-radius:11px;font-size:11px;line-height:1.45}.v146-feedback.is-error{border:1px solid #efc5c1;background:#fff4f3;color:#9f322b}.v146-feedback.is-success{border:1px solid #bfe4d4;background:#effaf5;color:#176b55;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.v146-feedback.is-success span{color:#527c6f}.v146-feedback.is-success a{margin-left:auto;color:#4f42cf;font-weight:850;text-decoration:none}
@media(max-width:700px){.v146-dialog{width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;border-radius:0}.v146-choice-grid,.v146-form-grid{grid-template-columns:1fr;padding:18px}.v146-wide{grid-column:1}.v146-dialog-card>header{padding:20px 18px 16px}.v146-dialog-card>footer{padding:12px 18px calc(12px + env(safe-area-inset-bottom));flex-wrap:wrap}.v146-dialog-card>footer .quiet-link{order:3;width:100%;margin:0}.v146-choice-grid button{min-height:120px}}
`;document.head.append(style);}
