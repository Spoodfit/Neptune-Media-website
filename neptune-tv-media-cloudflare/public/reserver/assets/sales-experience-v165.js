(() => {
  const RELEASE='neptune-sales-experience-20260831-v165';
  const STORAGE='neptune_media_reservation_v163';
  const MIN_LEAD_DAYS=15;
  const host=document.getElementById('app-content');
  if(!host)return;
  document.body.dataset.salesExperienceRelease=RELEASE;

  rewriteBanner();
  mountCallbackBubble();

  const observer=new MutationObserver(()=>{
    polishCurrentStep();
    enforceLeadTime();
    if(!new URLSearchParams(location.search).get('reservation_token')) maybeRenderConceptLanding();
  });
  observer.observe(host,{childList:true,subtree:true});

  setTimeout(()=>{
    polishCurrentStep();
    enforceLeadTime();
    if(!new URLSearchParams(location.search).get('reservation_token')) maybeRenderConceptLanding();
  },0);

  function rewriteBanner(){
    const track=document.querySelector('.launch-track');
    if(!track)return;
    track.innerHTML='<span>Choisissez ce qui vous ressemble.</span><span>Puis votre ville et votre décor.</span><span>Vous gardez la main jusqu’au paiement.</span>';
  }

  async function maybeRenderConceptLanding(){
    if(host.dataset.v165Landing==='loading'||host.dataset.v165Landing==='ready')return;
    const legacy=host.querySelector('#companyForm');
    if(!legacy)return;
    host.dataset.v165Landing='loading';
    try{
      const response=await fetch('/api/reservation/catalog-v96',{headers:{Accept:'application/json'},cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'catalog_unavailable');
      const list=normaliseConcepts(data);
      if(!list.length)throw new Error('no_concepts');
      host.dataset.v165Landing='ready';
      host.innerHTML=`<div class="sales-v165-shell"><div class="sales-v165-intro"><div class="eyebrow">Trouvez le format qui vous correspond</div><h1>Qu’avez-vous envie que les gens retiennent de vous ?</h1><p class="lead">Vous n’avez pas besoin de connaître la vidéo, les plateaux ou les codes d’une interview. Choisissez simplement votre objectif. Nous vous guidons ensuite pour le lieu, le décor et le tournage.</p></div><div class="sales-v165-grid">${list.map(cardMarkup).join('')}</div></div>`;
      host.querySelectorAll('[data-v165-concept]').forEach(button=>button.addEventListener('click',()=>selectConcept(button)));
    }catch(error){
      host.dataset.v165Landing='';
      console.error('[sales-v165] concept landing failed',error);
    }
  }

  function normaliseConcepts(data){
    if(Array.isArray(data.concepts)&&data.concepts.length)return data.concepts;
    const map=new Map();
    for(const city of data.cities||[]){
      for(const format of city.formats||[]){
        if(!map.has(format.id))map.set(format.id,{id:format.id,slug:format.slug,name:format.name,image:format.image,description:format.description,editorialLine:format.concept,cities:[]});
        map.get(format.id).cities.push(city);
      }
    }
    return [...map.values()];
  }

  function cardMarkup(c){
    const copy=conceptCopy(c);
    const image=c.image||fallbackImage(c.slug||c.name);
    return `<button type="button" class="sales-v165-card" data-v165-concept="${esc(c.id)}"><div class="sales-v165-visual"><img src="${esc(image)}" alt="" loading="eager"></div><div class="sales-v165-copy"><span class="sales-v165-kicker">${esc(copy.kicker)}</span><h2>${esc(c.name)}</h2><p class="sales-v165-promise">${esc(copy.promise)}</p><ul class="sales-v165-fit">${copy.fit.map(item=>`<li>${esc(item)}</li>`).join('')}</ul><div class="sales-v165-result">${esc(copy.result)}</div><span class="sales-v165-cta">${esc(copy.cta)}</span></div></button>`;
  }

  function conceptCopy(c){
    const key=`${c.slug||''} ${c.name||''}`.toLowerCase();
    if(key.includes('hors'))return {
      kicker:'Pour créer de la confiance',
      promise:'Votre parcours, votre vision ou vos convictions méritent plus qu’une présentation commerciale.',
      fit:['Vous voulez montrer la personne derrière l’entreprise','Votre histoire aide à comprendre pourquoi on peut vous faire confiance','Vous cherchez du contenu fort qui reste utile longtemps'],
      result:'Le résultat : une prise de parole incarnée qui donne envie de vous connaître avant même de vous contacter.',
      cta:'Je veux raconter mon histoire'
    };
    if(key.includes('libre'))return {
      kicker:'Pour faire comprendre votre valeur',
      promise:'Vous avez une expertise, une offre ou une idée à expliquer sans jargon et sans perdre votre audience.',
      fit:['Vous voulez rendre votre métier simple à comprendre','Vous avez un sujet précis à défendre ou à expliquer','Vous voulez nourrir LinkedIn et vos réseaux avec du contenu crédible'],
      result:'Le résultat : un message plus clair, plus mémorable et plus facile à réutiliser dans votre communication.',
      cta:'Je veux rendre mon message clair'
    };
    return {
      kicker:'Pour prendre la parole autrement',
      promise:'Un format pensé pour transformer ce que vous savez en contenu clair, humain et utile.',
      fit:['Vous voulez être compris rapidement','Vous souhaitez renforcer votre crédibilité','Vous voulez repartir avec du contenu réutilisable'],
      result:'Le résultat : une prise de parole professionnelle qui ressemble davantage à votre entreprise.',
      cta:'Découvrir ce format'
    };
  }

  async function selectConcept(button){
    if(button.classList.contains('sales-v165-loading'))return;
    button.classList.add('sales-v165-loading');
    const conceptId=button.dataset.v165Concept;
    try{
      const response=await fetch('/api/reservation/prospect/anonymous-v165',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:'{}'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.token)throw new Error(data.error||'session_unavailable');
      localStorage.setItem(STORAGE,JSON.stringify({token:data.token,contact:null,conceptId,cityId:'',offerId:'',physicalFormat:'',requestedDate:'',requestedDaypart:''}));
      const url=new URL(location.href);
      url.searchParams.set('reservation_token',data.token);
      location.assign(url.toString());
    }catch(error){
      button.classList.remove('sales-v165-loading');
      alert('Impossible de continuer pour le moment. Réessayez dans quelques instants.');
      console.error('[sales-v165] anonymous prospect failed',error);
    }
  }

  function setText(element,value){
    if(element&&element.textContent!==value)element.textContent=value;
  }

  function polishCurrentStep(){
    const eyebrow=host.querySelector(':scope > .eyebrow');
    const title=host.querySelector(':scope > h1');
    const lead=host.querySelector(':scope > .lead');
    if(!title||!lead)return;
    const text=(eyebrow?.textContent||'').toLowerCase();
    if(text.includes('où tourner')){
      setText(title,'Où souhaitez-vous tourner ?');
      setText(lead,'Choisissez simplement la ville qui vous convient. Nous affichons uniquement les studios où le format sélectionné est réellement disponible.');
    }else if(text.includes('format physique')){
      setText(title,'Quel décor vous correspond le mieux ?');
      setText(lead,'Le contenu ne change pas. Ici, vous choisissez seulement l’ambiance visuelle dans laquelle vous serez le plus à l’aise.');
    }else if(text.includes('créneau')){
      setText(title,'Quand souhaitez-vous tourner ?');
      setText(lead,'Pour préparer votre passage correctement, les tournages sont réservables au minimum 15 jours à l’avance. Choisissez ensuite le jour qui vous convient.');
      if(!host.querySelector('.sales-v165-date-note'))lead.insertAdjacentHTML('afterend','<small class="sales-v165-date-note">Les dates trop proches sont volontairement bloquées afin de laisser le temps nécessaire à la préparation.</small>');
    }else if(text.includes('paiement')){
      setText(title,'Votre passage est presque réservé.');
      setText(lead,'Vérifiez votre choix puis sécurisez votre réservation. Vous recevrez ensuite les prochaines étapes de préparation.');
    }
  }

  function enforceLeadTime(){
    const min=new Date();
    min.setHours(0,0,0,0);
    min.setDate(min.getDate()+MIN_LEAD_DAYS);
    host.querySelectorAll('.day[data-date]').forEach(button=>{
      const date=parseLocalDate(button.dataset.date);
      if(date&&date<min){button.disabled=true;button.dataset.v165TooSoon='1';button.setAttribute('aria-label',`${button.textContent} indisponible, délai minimum de 15 jours`);}
    });
  }

  function mountCallbackBubble(){
    if(document.getElementById('salesV165Help'))return;
    const wrap=document.createElement('div');
    wrap.className='sales-v165-help';wrap.id='salesV165Help';
    wrap.innerHTML=`<button type="button" class="sales-v165-help-button" aria-expanded="false"><span>☎</span><span class="sales-v165-help-label">Une question ? Être rappelé</span></button><div class="sales-v165-help-panel" hidden><h3>On vous rappelle.</h3><p>Laissez-nous vos coordonnées. Un membre de l’équipe Neptune Media vous recontacte sous 24 heures pour répondre à vos questions.</p><form class="sales-v165-help-form"><label><span>Prénom</span><input name="firstName" autocomplete="given-name" required></label><label><span>Nom</span><input name="lastName" autocomplete="family-name" required></label><label><span>Adresse e-mail</span><input name="email" type="email" autocomplete="email" required></label><label><span>Numéro de téléphone</span><input name="phone" type="tel" autocomplete="tel" required></label><p class="sales-v165-help-status" aria-live="polite"></p><button type="submit" class="btn btn-primary">Demander à être rappelé</button></form></div>`;
    document.body.appendChild(wrap);
    const toggle=wrap.querySelector('.sales-v165-help-button'),panel=wrap.querySelector('.sales-v165-help-panel'),form=wrap.querySelector('form'),status=wrap.querySelector('.sales-v165-help-status');
    toggle.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)form.querySelector('input')?.focus();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();status.className='sales-v165-help-status';status.textContent='';
      const button=form.querySelector('button[type="submit"]'),fd=new FormData(form);
      button.disabled=true;
      try{
        const payload={firstName:String(fd.get('firstName')||'').trim(),lastName:String(fd.get('lastName')||'').trim(),email:String(fd.get('email')||'').trim(),phone:String(fd.get('phone')||'').trim(),reservationToken:new URLSearchParams(location.search).get('reservation_token')||'',page:location.pathname};
        const response=await fetch('/api/reservation/callback-v165',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'callback_failed');
        form.reset();status.classList.add('ok');status.textContent='C’est enregistré. Nous vous recontactons sous 24 heures.';
        setTimeout(()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');},2200);
      }catch(error){status.classList.add('err');status.textContent='La demande n’a pas pu être envoyée. Réessayez dans quelques instants.';console.error('[sales-v165] callback failed',error);}finally{button.disabled=false;}
    });
  }

  function fallbackImage(value){return String(value||'').toLowerCase().includes('hors')?'/assets/posters/hors-norme-wide.webp':'/assets/posters/concept-libre-wide.webp';}
  function parseLocalDate(value){const [y,m,d]=String(value||'').split('-').map(Number);if(!y||!m||!d)return null;return new Date(y,m-1,d);}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
})();