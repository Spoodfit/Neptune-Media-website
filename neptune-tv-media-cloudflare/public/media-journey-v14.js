(() => {
  'use strict';

  const body = document.body;
  const proofStrip = document.querySelector('.voice-proof-strip');
  const formatGrid = document.querySelector('.format-grid');
  const formatCards = formatGrid ? [...formatGrid.querySelectorAll('.format-card')] : [];
  const compareActions = document.querySelector('.format-compare-actions');
  const hero = document.querySelector('.voice-hero');

  body.dataset.mediaJourney = 'v19';

  if (proofStrip && !document.querySelector('.intent-router')) {
    const booking = document.createElement('section');
    booking.className = 'intent-router booking-router';
    booking.setAttribute('aria-label', 'Réserver un prochain passage dans une émission Neptune Media');
    booking.innerHTML = `
      <div class="booking-router__copy">
        <span class="booking-router__eyebrow"><span aria-hidden="true"></span>Prochains créneaux disponibles</span>
        <strong>Je réserve mon passage</strong>
        <small>Vos futurs clients n'attendent que vous</small>
      </div>
      <a
        class="booking-router__cta"
        href="https://media.neptunebusiness.com/?utm_source=webtv&utm_medium=homepage_booking_cta&utm_campaign=neptune_media"
        data-funnel
        data-track="intent_book_passage"
      >
        <span>Je réserve mon passage</span>
        <span class="booking-router__arrow" aria-hidden="true">→</span>
      </a>
    `;
    proofStrip.insertAdjacentElement('afterend', booking);
  }

  if (formatGrid && formatCards.length === 2 && !document.querySelector('.format-guidance')) {
    const offers = [
      {
        id: 'hors-norme',
        label: 'Hors Norme',
        title: 'Choisissez Hors Norme pour révéler ce qui a réellement fondé votre entreprise.',
        copy: 'Le format part d’un problème vécu, d’un déclic et de vos convictions. Il convient aux dirigeants qui veulent créer une connexion humaine forte plutôt qu’une présentation commerciale classique.',
      },
      {
        id: 'concept-libre',
        label: 'Concept Libre',
        title: 'Choisissez Concept Libre pour construire un format autour d’un objectif précis.',
        copy: 'Le dispositif s’adapte à ce que votre audience doit comprendre, ressentir ou retenir : expertise, lancement, démonstration, série, échange ou concept de marque.',
      },
    ];

    const guidance = document.createElement('aside');
    guidance.className = 'format-guidance';
    guidance.hidden = true;
    guidance.setAttribute('aria-live', 'polite');
    guidance.innerHTML = `
      <div>
        <small>Votre format recommandé</small>
        <strong data-format-title></strong>
        <p data-format-copy></p>
      </div>
      <a class="btn btn-primary" data-format-cta data-funnel data-track="format_guided_choice" href="https://media.neptunebusiness.com/">Voir cette offre et les créneaux</a>
    `;
    formatGrid.insertAdjacentElement('afterend', guidance);

    const selectFormat = (index, focusGuidance = false) => {
      const offer = offers[index];
      formatCards.forEach((card, cardIndex) => {
        const selected = cardIndex === index;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-checked', String(selected));
      });
      guidance.querySelector('[data-format-title]').textContent = offer.title;
      guidance.querySelector('[data-format-copy]').textContent = offer.copy;
      const cta = guidance.querySelector('[data-format-cta]');
      const url = new URL('https://media.neptunebusiness.com/');
      url.searchParams.set('format', offer.id);
      url.searchParams.set('offre', offer.id);
      url.searchParams.set('utm_source', 'webtv');
      url.searchParams.set('utm_medium', 'guided_format');
      url.searchParams.set('utm_campaign', 'neptune_media');
      cta.href = url.toString();
      cta.textContent = `Voir ${offer.label} et les créneaux`;

      // Revealing the recommendation must never take control of the user's viewport.
      // The previous scrollIntoView() caused the visible jump back to the formats block.
      const scrollYBeforeReveal = window.scrollY;
      guidance.hidden = false;

      if (focusGuidance) {
        requestAnimationFrame(() => {
          // Protect against scroll anchoring / focus side effects while the hidden
          // recommendation block is inserted into the document flow.
          if (Math.abs(window.scrollY - scrollYBeforeReveal) > 2) {
            window.scrollTo({ top: scrollYBeforeReveal, left: window.scrollX, behavior: 'auto' });
          }
        });
      }
    };

    formatCards.forEach((card, index) => {
      card.dataset.formatChoice = offers[index].id;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', 'false');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Choisir le format ${offers[index].label}`);
      card.addEventListener('click', () => selectFormat(index, true));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectFormat(index, true);
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          const next = event.key === 'ArrowRight' ? (index + 1) % formatCards.length : (index - 1 + formatCards.length) % formatCards.length;
          formatCards[next].focus({ preventScroll: true });
          selectFormat(next, false);
        }
      });
    });

    formatGrid.setAttribute('role', 'radiogroup');
    formatGrid.setAttribute('aria-label', 'Choisir le format Neptune Media adapté');
    if (compareActions) compareActions.setAttribute('aria-label', 'Informations avant réservation');
  }

  if (!document.querySelector('.mobile-journey-dock')) {
    const dock = document.createElement('nav');
    dock.className = 'mobile-journey-dock';
    dock.setAttribute('aria-label', 'Actions rapides Neptune Media');
    dock.innerHTML = `
      <a href="#a-voir" data-track="mobile_dock_watch">Regarder</a>
      <a href="https://media.neptunebusiness.com/" data-funnel data-track="mobile_dock_offers">Voir les offres</a>
    `;
    body.append(dock);

    const syncDock = () => {
      if (!hero) return;
      const threshold = hero.offsetTop + hero.offsetHeight * .72;
      dock.classList.toggle('is-visible', window.scrollY > threshold && window.scrollY < document.documentElement.scrollHeight - innerHeight - 260);
    };
    syncDock();
    addEventListener('scroll', syncDock, { passive: true });
    addEventListener('resize', syncDock);
  }
})();
