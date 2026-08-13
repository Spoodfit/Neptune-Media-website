(() => {
  'use strict';
  if (document.documentElement.dataset.finalExperienceBound === '1') return;
  document.documentElement.dataset.finalExperienceBound = '1';

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const ready = (callback) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', callback, { once: true })
    : callback();

  appendStylesheet('/styles/final-quality-v12.css?v=2', 'finalQuality', 'v12');
  appendStylesheet('/styles/clarity-air-v15.css?v=15', 'clarityAir', 'v15');
  appendStylesheet('/styles/scroll-pipeline-v2.css?v=6', 'scrollPipelineCurve', 'v6', true);
  appendStylesheet('/styles/single-header-v1.css?v=2', 'singleHeader', 'v2', true);

  ready(() => {
    document.documentElement.dataset.finalExperience = 'v12';
    document.body.dataset.finalUx = 'v12';
    document.body.dataset.prdVisual = 'v16';
    document.body.dataset.visualDensity = 'v17';
    document.body.dataset.visibilityShowcase = 'v21';
    document.body.dataset.heroRefresh = 'v28';
    document.body.dataset.scrollPipeline = 'curve-v2';

    installSingleHeader();
    loadJourneyV19();
    loadScrollPipelineCurve();
    appendStylesheet('/styles/prd-visual-v16.css?v=16', 'prdVisual', 'v16', true);
    appendStylesheet('/styles/visual-density-v17.css?v=17', 'visualDensity', 'v17', true);
    appendStylesheet('/styles/intent-actions-v18.css?v=19', 'intentActions', 'v19', true);
    appendStylesheet('/styles/visibility-showcase-v19.css?v=21', 'visibilityShowcase', 'v21', true);
    loadVisibilityShowcaseV21();
    appendStylesheet('/styles/hero-live-v21.css?v=28', 'heroLive', 'v28', true);
    appendStylesheet('/styles/neptune-brand-bridge-v20.css?v=20', 'neptuneBrandBridge', 'v20', true);
    appendStylesheet('/styles/inner-voice-continuity-v1.css?v=1', 'innerVoiceContinuity', 'v1', true);
    loadHeroLiveV28();
    removeJourneyNavigation();
    bindFormatDecision();
    bindRevealMotion();
    bindInnerVoiceContinuity();
    bindRailAffordance();
  });

  function appendStylesheet(href, dataKey, dataValue, moveToEnd = false) {
    document.querySelectorAll(`link[data-${dataKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`).forEach((node) => {
      if (node.getAttribute('href') !== href) node.remove();
    });
    const existing = document.querySelector(`link[href="${href}"]`);
    if (existing) {
      if (moveToEnd) document.head.append(existing);
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[dataKey] = dataValue;
    document.head.append(link);
  }

  function installSingleHeader() {
    const header = qs('body > .site-header') || qs('.site-header');
    if (!header) return;

    header.dataset.singleHeader = '1';
    header.innerHTML = `
      <div class="container header-inner">
        <a class="brand" href="/" aria-label="Neptune Media, accueil">
          <img src="/assets/logo-neptune.svg" alt="Neptune Media">
        </a>
        <nav id="primary-navigation" class="nav" data-nav aria-label="Navigation principale">
          <a href="/direct/">Direct</a>
          <a href="/#formats">Les formats</a>
          <a href="/actualites/">Actualités</a>
          <a href="https://www.neptunebusiness.com">Neptune Club</a>
          <a class="nav-action nav-action--client" href="/espace-client/">Espace Client</a>
          <a class="nav-action nav-action--booking" data-funnel data-track="header_reservation" href="https://media.neptunebusiness.com/">Réserver mon passage</a>
        </nav>
        <button class="menu-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="primary-navigation" data-menu-toggle><span aria-hidden="true"></span></button>
      </div>`;

    if (!qs('script[data-single-header-script]')) {
      const script = document.createElement('script');
      script.src = '/single-header-v1.js?v=2';
      script.defer = true;
      script.dataset.singleHeaderScript = '1';
      document.head.append(script);
    }
  }

  function loadJourneyV19() {
    document.querySelectorAll('script[data-media-journey-v14],script[data-media-journey-v18],script[data-media-journey-v19]').forEach((node) => node.remove());
    const script = document.createElement('script');
    script.src = '/media-journey-v14.js?v=19';
    script.defer = true;
    script.dataset.mediaJourneyV19 = '1';
    document.head.append(script);
  }

  function loadScrollPipelineCurve() {
    if (document.documentElement.dataset.scrollPipelineV2Bound === '1') return;
    const current = document.querySelector('script[src="/scroll-pipeline-v2.js?v=8"]');
    if (current) return;
    document.querySelectorAll('script[data-scroll-pipeline-3d],script[data-scroll-pipeline-v2],script[data-scroll-pipeline-curve]').forEach((node) => node.remove());
    const script = document.createElement('script');
    script.src = '/scroll-pipeline-v2.js?v=8';
    script.defer = true;
    script.setAttribute('data-scroll-pipeline-curve', '1');
    document.head.append(script);
  }

  function loadVisibilityShowcaseV21() {
    document.querySelectorAll('script[data-visibility-showcase-v20],script[data-visibility-showcase-v21]').forEach((node) => node.remove());
    const script = document.createElement('script');
    script.src = '/visibility-showcase-v19.js?v=21';
    script.defer = true;
    script.dataset.visibilityShowcaseV21 = '1';
    document.head.append(script);
  }

  function loadHeroLiveV28() {
    document.querySelectorAll('script[data-hero-live-v21],script[data-hero-live-v22],script[data-hero-live-v23],script[data-hero-live-v24],script[data-hero-live-v26],script[data-hero-live-v27],script[data-hero-live-v28]').forEach((node) => node.remove());
    const script = document.createElement('script');
    script.src = '/hero-live-v21.js?v=28';
    script.defer = true;
    script.dataset.heroLiveV28 = '1';
    document.head.append(script);
  }

  function removeJourneyNavigation() {
    const selectors = '.journey-nav,.mobile-journey-dock,.sticky-conversion-nav,.section-progress-nav,.conversion-nav,[data-journey-nav],[data-sticky-navigation],[data-scroll-navigation]';
    const clean = () => qsa(selectors).forEach((node) => node.remove());
    clean();
    const observer = new MutationObserver(clean);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 20000);
  }

  function bindFormatDecision() {
    const cards = qsa('[data-format-choice]');
    const panel = qs('[data-format-recommendation]');
    if (!cards.length || !panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';
    const title = qs('[data-format-result]', panel);
    const copy = qs('[data-format-result-copy]', panel);
    const booking = qs('[data-format-booking]', panel);
    const options = {
      horsnorme: ['Hors Norme est probablement votre point de départ.', 'Votre audience doit comprendre ce qui vous a conduit à créer, tenir ou transformer votre entreprise.', 'Voir les créneaux Hors Norme'],
      libre: ['Concept Libre est probablement votre point de départ.', 'Votre audience doit comprendre une offre, une méthode, une démonstration, un lancement ou un univers de marque.', 'Voir les créneaux Concept Libre']
    };
    const choose = (card) => {
      const key = card.dataset.format;
      const option = options[key];
      if (!option) return;
      cards.forEach((item) => {
        const selected = item === card;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      if (title) title.textContent = option[0];
      if (copy) copy.textContent = option[1];
      if (booking) {
        booking.dataset.format = key;
        booking.textContent = option[2];
        booking.href = key === 'horsnorme'
          ? 'https://media.neptunebusiness.com/?format=horsnorme&offre=horsnorme'
          : 'https://media.neptunebusiness.com/?format=libre&offre=libre';
      }
      panel.dataset.selectedFormat = key;
    };
    cards.forEach((card) => {
      card.addEventListener('click', () => choose(card));
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        choose(card);
      });
    });
  }

  function bindRevealMotion() {
    const items = qsa('main > section:not(.voice-hero),.inner-voice-card,.solution-voice-card,.proof-compact article,.format-card[data-format-choice],.faq-item')
      .filter((item) => !item.dataset.revealBound);
    if (!items.length) return;
    items.forEach((item, index) => {
      item.dataset.revealBound = '1';
      item.classList.add('neptune-reveal');
      item.dataset.revealDelay = String(index % 4);
    });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    document.body.classList.add('reveal-ready');
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    items.forEach((item) => observer.observe(item));
  }

  function bindInnerVoiceContinuity() {
    const section = qs('#probleme.inner-voice-section');
    if (!section || section.dataset.voiceContinuityBound === '1') return;

    const container = qs('.container', section);
    const head = qs('.voice-section-head', section);
    const grid = qs('.inner-voice-grid', section);
    const bridge = qs('.thought-bridge', section);
    const cards = qsa('.inner-voice-card', section);
    if (!container || !head || !grid || !bridge || !cards.length) return;

    section.dataset.voiceContinuityBound = '1';
    section.dataset.voiceContinuity = 'v1';

    const intro = document.createElement('div');
    intro.className = 'inner-voice-intro';
    head.before(intro);
    intro.append(head);

    const progress = document.createElement('div');
    progress.className = 'inner-voice-reading-progress';
    progress.setAttribute('aria-label', 'Progression de lecture des quatre constats');
    progress.innerHTML = '<i aria-hidden="true"></i><small aria-live="polite">1 / 4</small>';
    intro.append(progress, bridge);

    cards.forEach((card, index) => {
      card.dataset.voiceIndex = String(index);
      card.style.setProperty('--voice-card-index', String(index));
    });

    section.classList.add('voice-continuity-ready');
    const revealTargets = [head, progress, ...cards, bridge];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealTargets.forEach((target) => target.classList.add('is-voice-revealed'));
      cards.forEach((card, index) => card.classList.toggle('is-voice-active', index === 0));
      progress.style.setProperty('--voice-progress', '0.25');
      return;
    }

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-voice-revealed');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -18% 0px', threshold: .16 });
    revealTargets.forEach((target) => revealObserver.observe(target));

    let frame = 0;
    let activeIndex = -1;
    const progressLabel = qs('small', progress);

    const updateReadingState = () => {
      frame = 0;
      const sectionRect = section.getBoundingClientRect();
      const viewport = window.innerHeight || document.documentElement.clientHeight;
      if (sectionRect.bottom < viewport * .14 || sectionRect.top > viewport * .9) return;

      const readingLine = viewport * (window.innerWidth <= 760 ? .58 : .52);
      let closestIndex = 0;
      let closestDistance = Infinity;

      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - readingLine);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
        if (rect.top < viewport * .82) card.classList.add('is-voice-revealed');
      });

      if (closestIndex === activeIndex) return;
      activeIndex = closestIndex;
      cards.forEach((card, index) => {
        card.classList.toggle('is-voice-active', index === activeIndex);
        card.classList.toggle('is-voice-read', index < activeIndex);
      });
      const completed = (activeIndex + 1) / cards.length;
      progress.style.setProperty('--voice-progress', String(completed));
      if (progressLabel) progressLabel.textContent = `${activeIndex + 1} / ${cards.length}`;
      if (activeIndex === cards.length - 1) bridge.classList.add('is-voice-revealed');
    };

    const requestReadingUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(updateReadingState);
    };

    window.addEventListener('scroll', requestReadingUpdate, { passive: true });
    window.addEventListener('resize', requestReadingUpdate, { passive: true });
    requestAnimationFrame(updateReadingState);
  }

  function bindRailAffordance() {
    qsa('[data-content-rail]').forEach((shell) => {
      const rail = qs('[data-rail-track]', shell);
      if (!rail) return;
      const update = () => {
        const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
        shell.dataset.atStart = String(rail.scrollLeft <= 4);
        shell.dataset.atEnd = String(max <= 4 || rail.scrollLeft >= max - 4);
      };
      if (shell.dataset.finalRailBound !== '1') {
        shell.dataset.finalRailBound = '1';
        rail.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update, { passive: true });
      }
      requestAnimationFrame(update);
    });
  }
})();

// Production browser quality gate revision 30.
