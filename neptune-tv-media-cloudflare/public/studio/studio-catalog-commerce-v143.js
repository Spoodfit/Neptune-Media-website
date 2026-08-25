const RELEASE='neptune-studio-catalog-commerce-20260825-v143';
const API98='/api/admin/media-catalog-v98/';
const API143='/api/admin/media-catalog-v143/';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const enhanced=new WeakSet();
let contextCache=null,policyCache=null,citySearchTimer=0;

boot();
function boot(){document.body.dataset.catalogCommerceV143=RELEASE;enhanceAll();new MutationObserver(enhanceAll).observe(document.body,{subtree:true,childList:true});window.addEventListener('click',interceptClick,true);window.addEventListener('input',onInput,true);window.addEventListener('keydown',onKeydown,true);}
function enhanceAll(){fixCatalogViewport();for(const drawer of $$('.v133-drawer'))enhanceDrawer(drawer);}
function fixCatalogViewport(){if(!document.body.classList.contains('v133-catalog'))return;const page=$('.c98-page');if(page)page.dataset.catalogViewportV143='1';}
function enhanceDrawer(drawer){if(enhanced.has(drawer))return;enhanced.add(drawer);if($('[data-v133-save-entity]',drawer)&&$('input[name="country"]',drawer)&&$('input[name="name"]',drawer))enhanceCityDrawer(drawer);if($('[data-v133-save-offer]',drawer))enhanceOfferDrawer(drawer);}

function enhanceCityDrawer(drawer){
  drawer.classList.add('v143-city-drawer');
  const order=$('input[name="publicOrder"]',drawer)?.closest('label');if(order)order.remove();
  const input=$('input[name="name"]',drawer);if(!input)return;input.autocomplete='off';input.spellcheck=false;input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
  const label=input.closest('label');label.classList.add('v143-city-field');const initial=input.value;input.dataset.initialCity=initial;
  const box=document.createElement('div');box.className='v143-city-combobox';input.before(box);box.append(input);
  const list=document.createElement('div');list.className='v143-city-listbox';list.id='v143CityListbox';list.setAttribute('role','listbox');list.hidden=true;box.append(list);input.setAttribute('aria-controls',list.id);
  const help=document.createElement('small');help.className='v143-city-help';help.textContent='Recherchez puis sélectionnez une commune. Sa position sera enregistrée pour classer les villes par proximité dans le tunnel.';label.append(help);
  const country=$('input[name="country"]',drawer);if(country){country.readOnly=true;country.value=country.value||'France';}
}

function enhanceOfferDrawer(drawer){
  drawer.classList.add('v143-offer-drawer');
  const section=$('.v133-payment-grid',drawer)?.closest('.v133-editor-section');if(!section)return;
  const intro=$('header p',section);if(intro)intro.textContent='Le coût fournisseur TTC fixe le plancher. Neptune calcule des tarifs conseillés rentables, que vous pouvez ajuster sans passer sous ce seuil.';
  const paymentCards=$$('.v133-payment',drawer),keys=['launch','promo','base'],labels=['Lancement','Préférentiel','De base'];
  paymentCards.forEach((card,index)=>{const key=keys[index];if(!key)return;card.dataset.v143Tier=key;const title=card.querySelector(':scope > span');if(title)title.textContent=labels[index];const controls=document.createElement('div');controls.className='v143-tier-head';controls.innerHTML=`<label class="v143-tier-visible"><input type="checkbox" data-v143-tier-visible="${key}" checked><span></span><b>Visible</b></label><label class="v143-capacity"><span>Places</span><input type="number" min="0" step="1" data-v143-tier-capacity="${key}" value="${key==='launch'?3:key==='promo'?7:0}"><small>${key==='base'?'0 = illimité':'quota'}</small></label>`;card.prepend(controls);const price=$(`input[name="tier_${key}_price"]`,card);if(price){price.dataset.v143Manual=price.value?'1':'0';price.addEventListener('input',()=>price.dataset.v143Manual='1');const suggest=document.createElement('button');suggest.type='button';suggest.className='v143-suggest';suggest.dataset.v143Suggest=key;suggest.textContent='Appliquer le tarif conseillé';price.closest('label')?.append(suggest);}const small=card.querySelector(':scope > small');if(small)small.textContent='Masquez ce tarif sans le supprimer. Le tunnel bascule automatiquement vers le prochain tarif disponible.';});
  const floor=document.createElement('div');floor.className='v143-price-floor';floor.innerHTML='<span>Coût fournisseur TTC</span><strong data-v143-floor>—</strong><small>Prix client minimum autorisé : ce montant. Toute vente à perte est bloquée côté serveur.</small>';$('.v133-money-row',section)?.after(floor);
  refreshPricing(drawer,true);hydrateTierPolicies(drawer).catch(()=>{});
}

async function hydrateTierPolicies(drawer){
  const [ctx,policies]=await Promise.all([getContext(),getPolicies()]);if(!drawer.isConnected)return;
  const cityId=$('input[name="cityIds"]:checked',drawer)?.value||'',supplierId=$('input[name="supplierId"]:checked',drawer)?.value||'',formatId=$('input[name="conceptId"]:checked',drawer)?.value||'';
  const family=(ctx.families||[]).find(f=>String(f.cityId)===String(cityId)&&String(f.supplierId)===String(supplierId)&&String(f.formatId)===String(formatId));if(!family)return;
  const map=new Map((policies.offerPolicies||[]).map(p=>[String(p.offerId),p]));for(const key of ['launch','promo','base']){const offer=family.tiers?.[key],policy=offer?.id?map.get(String(offer.id)):null;if(!policy)continue;const visible=$(`[data-v143-tier-visible="${key}"]`,drawer),capacity=$(`[data-v143-tier-capacity="${key}"]`,drawer);if(visible)visible.checked=policy.visible!==false;if(capacity)capacity.value=String(Number(policy.capacity||0));toggleTierCard(drawer,key,visible?.checked!==false);}}

function onInput(e){
  const drawer=e.target.closest?.('.v133-drawer');if(!drawer)return;
  if(e.target.matches('input[name="supplierNet"],input[name="vatRate"]'))queueMicrotask(()=>refreshPricing(drawer,false));
  if(e.target.matches('[data-v143-tier-visible]'))toggleTierCard(drawer,e.target.dataset.v143TierVisible,e.target.checked);
  if(e.target.matches('.v143-city-field input[name="name"]'))scheduleCitySearch(drawer,e.target.value);
}
function toggleTierCard(drawer,key,visible){const card=$(`.v133-payment[data-v143-tier="${key}"]`,drawer);if(!card)return;card.classList.toggle('is-v143-hidden',!visible);for(const input of $$('input:not([data-v143-tier-visible]):not([data-v143-tier-capacity])',card))input.disabled=!visible;}

function refreshPricing(drawer,fillEmpty){const net=Number($('input[name="supplierNet"]',drawer)?.value||0),vat=Number($('input[name="vatRate"]',drawer)?.value||0),gross=Math.max(0,net*(1+vat/100)),suggestions=priceSuggestions(gross);const floor=$('[data-v143-floor]',drawer);if(floor)floor.textContent=gross?eur(gross):'—';for(const key of ['launch','promo','base']){const input=$(`input[name="tier_${key}_price"]`,drawer);if(!input)continue;input.min=gross?String(Math.ceil(gross*100)/100):'0';input.dataset.v143Suggestion=String(suggestions[key]||0);if((fillEmpty||input.dataset.v143Manual!=='1')&&!input.value&&suggestions[key])input.value=String(suggestions[key]);input.classList.toggle('is-v143-below-floor',Boolean(gross&&Number(input.value||0)<gross));}}
function priceSuggestions(gross){if(!gross)return{launch:0,promo:0,base:0};const launch=psych(gross+Math.max(50,gross*.10)),promo=psych(Math.max(gross+Math.max(120,gross*.25),launch+50)),base=psych(Math.max(gross+Math.max(250,gross*.45),promo+100));return{launch,promo,base};}
function psych(value){const n=Math.ceil(value);return Math.ceil((n+1)/10)*10-1;}

function scheduleCitySearch(drawer,value){clearTimeout(citySearchTimer);const q=String(value||'').trim();const list=$('.v143-city-listbox',drawer);if(!list)return;if(q.length<2){list.hidden=true;return;}citySearchTimer=setTimeout(()=>searchCities(drawer,q),220);}
async function searchCities(drawer,q){const list=$('.v143-city-listbox',drawer),input=$('input[name="name"]',drawer);if(!list||!input)return;list.hidden=false;list.innerHTML='<div class="v143-city-loading">Recherche…</div>';try{const url=`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,centre,codesPostaux,codeDepartement&boost=population&limit=8`;const res=await fetch(url,{headers:{Accept:'application/json'}});if(!res.ok)throw new Error('geo');const rows=await res.json();if(!Array.isArray(rows)||!rows.length){list.innerHTML='<div class="v143-city-empty">Aucune commune trouvée</div>';return;}list.innerHTML=rows.map((c,i)=>{const coords=c.centre?.coordinates||[],postal=Array.isArray(c.codesPostaux)?c.codesPostaux[0]||'':'';return `<button type="button" role="option" data-v143-city-option data-name="${esc(c.nom)}" data-lat="${esc(coords[1]??'')}" data-lng="${esc(coords[0]??'')}" data-index="${i}"><strong>${esc(c.nom)}</strong><small>${esc(postal?`${postal} · France`:'France')}</small></button>`}).join('');input.setAttribute('aria-expanded','true');}catch{list.innerHTML='<div class="v143-city-empty">Recherche indisponible. Vous pouvez saisir la ville manuellement.</div>';}}
function chooseCityOption(button){const drawer=button.closest('.v133-drawer'),input=$('input[name="name"]',drawer),country=$('input[name="country"]',drawer),list=$('.v143-city-listbox',drawer);if(!input)return;input.value=button.dataset.name||'';input.dataset.latitude=button.dataset.lat||'';input.dataset.longitude=button.dataset.lng||'';input.dispatchEvent(new Event('input',{bubbles:true}));if(country)country.value='France';if(list)list.hidden=true;input.setAttribute('aria-expanded','false');}
function onKeydown(e){const input=e.target.closest?.('.v143-city-field input[name="name"]');if(!input)return;const list=$('.v143-city-listbox',input.closest('.v133-drawer'));if(e.key==='Escape'&&list){list.hidden=true;input.setAttribute('aria-expanded','false');}}

async function interceptClick(e){
  const cityOption=e.target.closest?.('[data-v143-city-option]');if(cityOption){e.preventDefault();e.stopImmediatePropagation();chooseCityOption(cityOption);return;}
  const suggest=e.target.closest?.('[data-v143-suggest]');if(suggest){e.preventDefault();e.stopImmediatePropagation();const drawer=suggest.closest('.v133-drawer'),key=suggest.dataset.v143Suggest,input=$(`input[name="tier_${key}_price"]`,drawer),value=Number(input?.dataset.v143Suggestion||0);if(input&&value){input.value=String(value);input.dataset.v143Manual='1';input.dispatchEvent(new Event('input',{bubbles:true}));}return;}
  const saveCity=e.target.closest?.('.v143-city-drawer [data-v133-save-entity]');if(saveCity){e.preventDefault();e.stopImmediatePropagation();await saveCityDrawer(saveCity.closest('.v133-drawer'));return;}
  const saveOffer=e.target.closest?.('.v143-offer-drawer [data-v133-save-offer]');if(saveOffer){e.preventDefault();e.stopImmediatePropagation();await saveOfferDrawer(saveOffer.closest('.v133-drawer'));return;}
}

async function saveCityDrawer(drawer){const msg=$('#v133SaveMsg',drawer),name=$('input[name="name"]',drawer)?.value.trim(),country=$('input[name="country"]',drawer)?.value.trim()||'France';if(!name){setMsg(msg,'Choisissez une ville.','error');return;}setMsg(msg,'Enregistrement…');try{const ctx=await getContext(true),initial=$('input[name="name"]',drawer)?.dataset.initialCity||'',existing=(ctx.cities||[]).find(c=>String(c.name).toLowerCase()===String(initial).toLowerCase());await post143('city/save',{id:existing?.id||'',name,country,latitude:$('input[name="name"]',drawer)?.dataset.latitude||'',longitude:$('input[name="name"]',drawer)?.dataset.longitude||'',geoSource:'geo.api.gouv.fr',active:$('input[name="active"]',drawer)?.checked!==false});setMsg(msg,'Ville enregistrée.');closeAndRefresh(drawer);}catch(error){setMsg(msg,humanError(error.message),'error');}}

async function saveOfferDrawer(drawer){
  const msg=$('#v133SaveMsg',drawer),cityIds=$$('input[name="cityIds"]:checked',drawer).map(x=>x.value),supplierId=$('input[name="supplierId"]:checked',drawer)?.value||'',formatId=$('input[name="conceptId"]:checked',drawer)?.value||'',options=$$('input[name="formatLabels"]:checked',drawer).map(x=>x.value);
  if(!cityIds.length)return setMsg(msg,'Choisissez au moins une ville.','error');if(!supplierId)return setMsg(msg,'Choisissez un fournisseur.','error');if(!formatId)return setMsg(msg,'Choisissez un concept.','error');if(!options.length)return setMsg(msg,'Ajoutez au moins un format physique.','error');
  const net=Number($('input[name="supplierNet"]',drawer)?.value||0),vat=Number($('input[name="vatRate"]',drawer)?.value||0),gross=net*(1+vat/100),tiers={};
  for(const key of ['launch','promo','base']){const visible=$(`[data-v143-tier-visible="${key}"]`,drawer)?.checked!==false,price=Number($(`input[name="tier_${key}_price"]`,drawer)?.value||0),url=$(`input[name="tier_${key}_url"]`,drawer)?.value.trim()||'',capacity=Number($(`[data-v143-tier-capacity="${key}"]`,drawer)?.value||0);if(visible&&!url)return setMsg(msg,`Ajoutez le lien Stripe du tarif ${tierLabel(key)} ou masquez ce tarif.`,'error');if(visible&&price<gross)return setMsg(msg,`Le tarif ${tierLabel(key)} est inférieur au coût fournisseur TTC (${eur(gross)}).`,'error');tiers[key]={clientPriceCents:Math.round(price*100),paymentUrl:url,visible,capacity:Math.max(0,Math.round(capacity))};}
  if(!Object.values(tiers).some(t=>t.visible))return setMsg(msg,'Gardez au moins un tarif visible.','error');
  setMsg(msg,'Synchronisation du catalogue et du tunnel…');try{for(const cityId of cityIds)await post143('family/save',{cityId,formatId,supplierId,supplierNetCents:Math.round(net*100),vatRateBps:Math.round(vat*100),configurationOptions:options,active:$('input[name="active"]',drawer)?.checked!==false,tiers});contextCache=null;policyCache=null;setMsg(msg,'Synchronisé.');closeAndRefresh(drawer);}catch(error){setMsg(msg,humanError(error.message),'error');}}

function closeAndRefresh(drawer){drawer.closest('#v133DrawerHost')?.querySelector('[data-v133-close]')?.click();setTimeout(()=>document.querySelector('#refresh')?.click(),80);}
async function getContext(force=false){if(contextCache&&!force)return contextCache;const r=await fetch(API98+'context',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'catalog_context_failed');contextCache=d;return d;}
async function getPolicies(){if(policyCache)return policyCache;policyCache=await post143('policies',{});return policyCache;}
async function post143(path,payload){const r=await fetch(API143+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'save_failed');return d;}
function humanError(code){const map={client_price_below_supplier_gross:'Le prix client ne peut pas être inférieur au coût fournisseur TTC.',offer_family_fields_required:'Ville, fournisseur ou concept manquant.',offer_reference_invalid:'La ville, le fournisseur ou le concept n’existe plus.',payment_url_required_launch:'Lien Stripe requis pour le tarif de lancement.',payment_url_required_promo:'Lien Stripe requis pour le tarif préférentiel.',payment_url_required_base:'Lien Stripe requis pour le tarif de base.',offer_capacity_exhausted:'Ce tarif n’a plus de place disponible.'};return map[code]||String(code||'Enregistrement impossible').replaceAll('_',' ');}
function setMsg(el,text,type=''){if(!el)return;el.textContent=text;el.dataset.state=type;}
function tierLabel(k){return k==='launch'?'de lancement':k==='promo'?'préférentiel':'de base';}
function eur(v){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v||0));}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
