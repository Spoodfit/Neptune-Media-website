(() => {
  const RELEASE = 'v166';
  if (!document.querySelector('link[data-sales-experience-v166]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/reserver/assets/sales-experience-v166.css?v=1';
    link.dataset.salesExperienceV166 = '1';
    document.head.append(link);
  }
  const macro = [
    { id: 'experience', label: 'Votre expérience', hint: 'Concept, ville et mise en scène' },
    { id: 'slot', label: 'Votre créneau', hint: 'Jour et disponibilité' },
    { id: 'reserve', label: 'Réserver', hint: 'Validation et paiement sécurisé' },
  ];
  let scheduled = false;
  let lastSignature = '';

  const stageFromDom = () => {
    const eyebrow = document.querySelector('#app-content > .eyebrow, #app-content .confirmation-hero .eyebrow')?.textContent?.toLowerCase() || '';
    if (eyebrow.includes('paiement confirmé')) return 'done';
    if (eyebrow.includes('retour stripe') || eyebrow.includes('paiement')) return 'reserve';
    if (eyebrow.includes('créneau')) return 'slot';
    if (eyebrow.includes('réservation commence') || eyebrow.includes('concept') || eyebrow.includes('où tourner') || eyebrow.includes('format physique')) return 'experience';
    return '';
  };

  function enhance() {
    scheduled = false;
    const host = document.getElementById('app-content');
    if (!host) return;
    const stage = stageFromDom();
    if (!stage) return;

    const signature = `${stage}|${host.querySelector(':scope > h1')?.textContent || ''}|${host.querySelector(':scope > .eyebrow')?.textContent || ''}`;
    if (document.getElementById('neptuneBookingMacroV166') && signature === lastSignature) return;
    document.body.dataset.salesExperience = RELEASE;
    const old = document.getElementById('neptuneBookingMacroV166');
    if (old) old.remove();

    const nav = document.createElement('nav');
    nav.id = 'neptuneBookingMacroV166';
    nav.className = `booking-macro-v166 booking-macro-v166--${stage}`;
    nav.setAttribute('aria-label', 'Progression de votre réservation');
    nav.innerHTML = macro.map((item, index) => {
      const active = item.id === stage || stage === 'done' && item.id === 'reserve';
      const done = stage === 'done' || (stage === 'slot' && index === 0) || (stage === 'reserve' && index < 2);
      return `<div class="booking-macro-step-v166 ${active ? 'is-current' : ''} ${done ? 'is-done' : ''}"><span>${done && !active ? '✓' : index + 1}</span><div><strong>${item.label}</strong><small>${item.hint}</small></div></div>`;
    }).join('');
    host.prepend(nav);

    const progress = document.getElementById('progress');
    if (progress) {
      progress.hidden = true;
      progress.setAttribute('aria-hidden', 'true');
    }

    const eyebrow = host.querySelector(':scope > .eyebrow');
    const title = host.querySelector(':scope > h1');
    const lead = host.querySelector(':scope > .lead');

    if (stage === 'experience') {
      if (eyebrow) eyebrow.textContent = '1 · Votre expérience';
      if (lead && /seules les villes/i.test(lead.textContent || '')) lead.textContent = 'Choisissez simplement où vous souhaitez tourner. Votre progression est enregistrée automatiquement.';
      if (lead && /mise en scène/i.test(lead.textContent || '')) lead.textContent = 'Choisissez l’univers qui vous ressemble. Votre sélection est enregistrée automatiquement.';
    }

    if (stage === 'slot') {
      if (eyebrow) eyebrow.textContent = '2 · Votre créneau';
      if (title) title.textContent = 'Choisissez votre créneau de tournage.';
      if (lead) lead.textContent = 'Sélectionnez le jour et la plage horaire qui vous conviennent. Le studio partenaire confirme ensuite définitivement le passage.';
      const continueButton = document.getElementById('continuePayment');
      if (continueButton) continueButton.textContent = 'Réserver ce créneau →';
    }

    if (stage === 'reserve') {
      if (eyebrow && !eyebrow.textContent.toLowerCase().includes('retour stripe')) eyebrow.textContent = '3 · Réserver';
      if (title && /sécurisez votre passage/i.test(title.textContent || '')) title.textContent = 'Votre créneau est prêt à être réservé.';
      if (lead && /stripe collecte/i.test(lead.textContent || '')) lead.textContent = 'Validez votre réservation. Le paiement sécurisé Stripe confirme votre commande et rattache vos coordonnées au passage.';
      const payLink = document.getElementById('payLink');
      if (payLink) payLink.textContent = payLink.textContent.replace(/^Payer\s+/u, 'Confirmer et payer ');
    }

    if (stage === 'done') nav.classList.add('is-complete');
    lastSignature = `${stage}|${host.querySelector(':scope > h1')?.textContent || ''}|${host.querySelector(':scope > .eyebrow')?.textContent || ''}`;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
