(() => {
  const DASHBOARD_PATHS = new Set(['/espace-client', '/espace-client/', '/espace-client/index.html']);
  const VIDEO_PREFIX = '/espace-client/videos';
  const CALENDAR_PREFIX = '/espace-client/calendrier';
  let session = null;
  let decorated = false;
  let selectedFileHandled = false;

  function ready(callback) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  ready(() => {
    document.body.dataset.clientArchitecture = 'v62';
    installNavigation();
    installRouteActions();
    decorateCurrentScreen();
    observeDynamicContent();
    window.setTimeout(decorateCurrentScreen, 300);
    window.setTimeout(decorateCurrentScreen, 1200);
  });

  function currentScreen() {
    const path = location.pathname;
    if (DASHBOARD_PATHS.has(path)) return 'home';
    if (path.startsWith(VIDEO_PREFIX)) return 'content';
    if (path.startsWith(CALENDAR_PREFIX)) return 'publications';
    return '';
  }

  function installNavigation() {
    const screen = currentScreen();
    if (!screen) return;
    const navigation = document.createElement('nav');
    navigation.className = 'client-nav-v62';
    navigation.setAttribute('aria-label', 'Navigation principale de l’espace client');
    navigation.innerHTML = [
      navLink('/espace-client/', 'Accueil', screen === 'home'),
      navLink('/espace-client/videos/', 'Contenus', screen === 'content'),
      navLink('/espace-client/calendrier/', 'Publications', screen === 'publications'),
      navLink('/espace-client/#account', 'Compte', false),
    ].join('');

    if (screen === 'home') {
      const tools = document.querySelector('.header-tools');
      if (!tools || tools.querySelector('.client-nav-v62')) return;
      tools.prepend(navigation);
      return;
    }

    const actions = document.querySelector('.library-header .header-actions, .calendar-header .header-actions');
    if (!actions) return;
    actions.replaceChildren(navigation);
  }

  function navLink(href, label, current) {
    return `<a href="${href}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
  }

  function installRouteActions() {
    document.addEventListener('click', (event) => {
      const account = event.target.closest('a[href="/espace-client/#account"]');
      if (account && currentScreen() === 'home') {
        event.preventDefault();
        openAccountPanel();
        return;
      }

      const route = event.target.closest('[data-client-route]');
      if (route) {
        event.preventDefault();
        event.stopImmediatePropagation();
        location.assign(route.dataset.clientRoute);
        return;
      }

      const appointment = event.target.closest('[data-client-action="appointment"]');
      if (appointment) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelector('#prepareLink')?.click();
      }
    }, true);
  }

  function decorateCurrentScreen() {
    const screen = currentScreen();
    if (screen === 'home') decorateDashboard();
    if (screen === 'content') decorateVideoLibrary();
    if (screen === 'publications') decorateCalendar();
    decorated = true;
  }

  function decorateDashboard() {
    const dashboard = document.querySelector('#dashboard');
    if (!dashboard || dashboard.hidden) return;

    setText(dashboard.querySelector('.dashboard-heading .eyebrow'), 'ACCUEIL');
    setText(dashboard.querySelector('.dashboard-heading-copy > p:last-child'), 'Votre projet, votre prochaine action et vos contenus essentiels au même endroit.');

    const deliveryAction = dashboard.querySelector('.show-card [data-open-panel="content"]');
    if (deliveryAction && deliveryAction.tagName !== 'A') {
      const link = document.createElement('a');
      link.className = deliveryAction.className;
      link.href = '/espace-client/videos/';
      link.textContent = 'Voir les contenus';
      deliveryAction.replaceWith(link);
    }

    const appointment = dashboard.querySelector('[data-open-panel="appointments"]');
    if (appointment) {
      appointment.removeAttribute('data-open-panel');
      appointment.dataset.clientAction = 'appointment';
      setText(appointment.querySelector('.metric-copy > span'), 'Prochain rendez-vous');
    }

    const content = dashboard.querySelector('[data-open-panel="content"]');
    if (content) {
      content.removeAttribute('data-open-panel');
      content.dataset.clientRoute = '/espace-client/videos/';
      setText(content.querySelector('.metric-copy > span'), 'Mes contenus');
    }

    const publications = dashboard.querySelector('[data-open-panel="calendar"]');
    if (publications) {
      publications.removeAttribute('data-open-panel');
      publications.dataset.clientRoute = '/espace-client/calendrier/';
      setText(publications.querySelector('.metric-copy > span'), 'Mes publications');
    }

    const account = dashboard.querySelector('[data-open-panel="billing"]');
    if (account) setText(account.querySelector('.metric-copy > span'), 'Compte & factures');

    if (location.hash === '#account') {
      history.replaceState({}, '', '/espace-client/');
      window.setTimeout(openAccountPanel, 80);
    }

    hydrateDashboardProjects();
  }

  async function hydrateDashboardProjects() {
    if (session) return renderProjectHistory(session);
    try {
      const response = await fetch('/api/client/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      session = await response.json();
      renderProjectHistory(session);
    } catch {
      // Le tableau de bord reste utilisable sans ce raccourci facultatif.
    }
  }

  function renderProjectHistory(payload) {
    const orders = Array.isArray(payload?.orders) ? payload.orders : [];
    const header = document.querySelector('.production-card-header');
    const technical = document.querySelector('[data-dashboard-technical]');
    if (!header || !technical) return;
    let button = header.querySelector('.project-history-action');
    if (orders.length < 2) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'project-history-action';
      button.addEventListener('click', () => technical.click());
      header.append(button);
    }
    setText(button, `Mes passages (${orders.length})`);
  }

  function openAccountPanel() {
    document.querySelector('[data-open-panel="billing"]')?.click();
  }

  function decorateVideoLibrary() {
    setText(document.querySelector('.library-intro h1'), 'Mes contenus.');
    setText(document.querySelector('.library-intro .intro-copy > p:last-child'), 'Retrouvez, regardez et téléchargez vos émissions et vos shorts depuis une seule bibliothèque.');

    const selector = document.querySelector('#passageSelector');
    if (selector) selector.classList.toggle('is-single-passage', selector.querySelectorAll('button').length <= 1);

    document.querySelectorAll('[data-media-section="short"]').forEach((section) => {
      if (section.id !== 'shorts') section.id = 'shorts';
    });
    document.querySelectorAll('.compact-media-card').forEach((card) => {
      const id = card.querySelector('[data-open-video]')?.dataset.openVideo || '';
      card.querySelectorAll('.compact-media-actions a, .compact-media-actions button').forEach((action) => {
        const label = action.textContent.trim().toLowerCase();
        if (label.includes('préparer le post')) action.classList.add('is-redundant-action');
        if ((label === 'planifier' || label.includes('planifier')) && action.getAttribute('href') !== `/espace-client/calendrier/?file=${encodeURIComponent(id)}`) {
          action.setAttribute('href', `/espace-client/calendrier/?file=${encodeURIComponent(id)}`);
        }
      });
    });
  }

  function decorateCalendar() {
    setText(document.querySelector('.calendar-intro h1'), 'Mes publications.');
    setText(document.querySelector('.calendar-intro > div:first-child > p:last-child'), 'Planifiez et réutilisez vos shorts depuis un seul calendrier éditorial.');

    const calendarView = document.querySelector('#calendarView');
    const libraryView = document.querySelector('#libraryView');
    if (calendarView) {
      if (calendarView.hidden) calendarView.hidden = false;
      calendarView.classList.add('active');
    }
    if (libraryView) {
      if (!libraryView.hidden) libraryView.hidden = true;
      if (libraryView.getAttribute('aria-hidden') !== 'true') libraryView.setAttribute('aria-hidden', 'true');
    }

    const tools = document.querySelector('.calendar-intro .intro-tools');
    if (tools && !tools.querySelector('.client-source-action')) {
      const link = document.createElement('a');
      link.className = 'client-source-action';
      link.href = '/espace-client/videos/#shorts';
      link.textContent = 'Choisir un contenu';
      tools.prepend(link);
    }

    openSelectedShortWhenReady();
  }

  function openSelectedShortWhenReady() {
    if (selectedFileHandled) return;
    const fileId = new URLSearchParams(location.search).get('file');
    if (!fileId) return;
    const button = [...document.querySelectorAll('[data-reuse-file]')]
      .find((item) => String(item.dataset.reuseFile) === fileId);
    if (!button) return;
    selectedFileHandled = true;
    history.replaceState({}, '', '/espace-client/calendrier/');
    button.click();
  }

  function observeDynamicContent() {
    const observer = new MutationObserver(() => {
      window.clearTimeout(observeDynamicContent.timer);
      observeDynamicContent.timer = window.setTimeout(decorateCurrentScreen, decorated ? 60 : 0);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
})();
