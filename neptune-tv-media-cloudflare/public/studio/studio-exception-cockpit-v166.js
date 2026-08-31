(() => {
  const KEY = '__neptuneExceptionCockpitV166';
  if (window[KEY]) return;
  window[KEY] = true;

  if (!document.querySelector('link[data-studio-exception-cockpit-v166]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/studio/studio-exception-cockpit-v166.css?v=1';
    link.dataset.studioExceptionCockpitV166 = '1';
    document.head.append(link);
  }

  const start = () => {
    const pipeline = document.getElementById('pipeline');
    const main = document.querySelector('.clients-main');
    if (!pipeline || !main) return;

    document.body.classList.add('studio-exception-cockpit-v166', 'ns166-pipeline-collapsed');
    normalizeCopy();
    installCockpit(main, pipeline);
    const observer = new MutationObserver(() => renderCockpit(pipeline));
    observer.observe(pipeline, { childList: true, subtree: true });
    renderCockpit(pipeline);
  };

  function normalizeCopy() {
    const h1 = document.querySelector('.clients-topbar h1');
    if (h1) h1.textContent = 'Pilotage';
    const heroEyebrow = document.querySelector('.clients-hero-copy .eyebrow');
    if (heroEyebrow) heroEyebrow.textContent = "AUJOURD'HUI";
    const heroTitle = document.querySelector('.clients-hero-copy h2');
    if (heroTitle) heroTitle.innerHTML = 'Neptune gère le flux.<br><span>Vous ne traitez que l’exception.</span>';
    const heroText = document.querySelector('.clients-hero-copy > p:last-child');
    if (heroText) heroText.textContent = 'Les dossiers normaux restent silencieux. Les retards, validations et points à surveiller remontent ici automatiquement.';

    const newButton = document.getElementById('newClient');
    if (newButton) {
      newButton.textContent = 'Créer hors tunnel';
      newButton.classList.add('ns166-fallback-action');
      newButton.title = 'Secours uniquement : la réservation en ligne crée normalement le passage automatiquement.';
    }

    const form = document.getElementById('newOrder');
    if (form) {
      const eyebrow = form.querySelector('.dialog-head .eyebrow');
      const title = form.querySelector('.dialog-head h2');
      if (eyebrow) eyebrow.textContent = 'SECOURS / CAS PARTICULIER';
      if (title) title.textContent = 'Créer un passage manuellement';
      if (!form.querySelector('.ns166-manual-warning')) {
        const warning = document.createElement('p');
        warning.className = 'ns166-manual-warning';
        warning.innerHTML = '<strong>À utiliser uniquement hors tunnel.</strong> Une réservation en ligne crée normalement le dossier automatiquement. Utilisez ce formulaire pour une reprise, une demande hors ligne ou une correction exceptionnelle.';
        form.querySelector('.dialog-head')?.after(warning);
      }
    }

    const canonicalNav = document.querySelector('.neptune-studio-nav');
    if (canonicalNav) {
      const client = canonicalNav.querySelector('[data-studio-route="clients"] strong');
      if (client) client.textContent = 'Pilotage';
      const catalog = canonicalNav.querySelector('[data-studio-route="catalog"]');
      if (catalog) {
        catalog.href = '/studio/video-ai.html';
        catalog.querySelector('strong').textContent = 'Contenus';
        const icon = catalog.querySelector('.neptune-studio-nav-icon');
        if (icon) icon.textContent = '✦';
      }
      const finance = canonicalNav.querySelector('[data-studio-route="finance"]');
      if (finance) finance.hidden = true;
      const settings = canonicalNav.querySelector('[data-studio-route="settings-main"] strong');
      if (settings) settings.textContent = 'Réglages';
    }
  }

  function installCockpit(main, pipeline) {
    if (document.getElementById('exceptionCockpitV166')) return;
    const section = document.createElement('section');
    section.id = 'exceptionCockpitV166';
    section.className = 'exception-cockpit-v166';
    section.innerHTML = `
      <header class="exception-head-v166">
        <div><p class="eyebrow">FILE D’ACTIONS</p><h2>Ce qui mérite votre attention</h2><p id="exceptionSummaryV166">Analyse des passages…</p></div>
        <div class="exception-head-actions-v166">
          <button type="button" class="secondary" data-ns166-view="calendar">Calendrier</button>
          <button type="button" class="secondary" data-ns166-view="content">Contenus</button>
          <button type="button" class="secondary" id="togglePipelineV166" aria-expanded="false">Voir tous les passages</button>
        </div>
      </header>
      <div class="exception-kpis-v166" id="exceptionKpisV166"></div>
      <div class="exception-groups-v166">
        <section class="exception-group-v166 is-red"><header><div><span>●</span><h3>À traiter</h3></div><b id="redCountV166">0</b></header><div id="redListV166" class="exception-list-v166"></div></section>
        <section class="exception-group-v166 is-amber"><header><div><span>●</span><h3>À vérifier</h3></div><b id="amberCountV166">0</b></header><div id="amberListV166" class="exception-list-v166"></div></section>
        <section class="exception-group-v166 is-green"><header><div><span>●</span><h3>Autonomes</h3></div><b id="greenCountV166">0</b></header><div id="greenListV166" class="exception-list-v166"></div></section>
      </div>`;
    const controls = main.querySelector('.controls');
    if (controls) controls.before(section);
    else pipeline.before(section);

    document.getElementById('togglePipelineV166')?.addEventListener('click', (event) => {
      const collapsed = document.body.classList.toggle('ns166-pipeline-collapsed');
      event.currentTarget.textContent = collapsed ? 'Voir tous les passages' : 'Masquer les passages';
      event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
      if (!collapsed) pipeline.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    section.querySelector('[data-ns166-view="calendar"]')?.addEventListener('click', () => document.querySelector('[data-open-section="calendrier"]')?.click());
    section.querySelector('[data-ns166-view="content"]')?.addEventListener('click', () => location.href = '/studio/video-ai.html');
    section.addEventListener('click', (event) => {
      const action = event.target.closest('[data-cockpit-order]');
      if (!action) return;
      const original = pipeline.querySelector(`[data-order-card="${CSS.escape(action.dataset.cockpitOrder)}"]`);
      original?.click();
    });
  }

  function classify(card) {
    const column = card.closest('[data-column]')?.dataset.column || '';
    if (column === 'done') return 'done';
    if (card.querySelector('.deadline.overdue')) return 'red';
    if (card.classList.contains('urgent')) return 'amber';
    if (card.querySelector('[data-advance]') && ['confirm', 'prepare', 'delivery'].includes(column)) return 'amber';
    return 'green';
  }

  function renderCockpit(pipeline) {
    normalizeCopy();
    const cards = [...pipeline.querySelectorAll('[data-order-card]')];
    if (!cards.length && pipeline.textContent.includes('Chargement')) return;
    const groups = { red: [], amber: [], green: [] };
    for (const card of cards) {
      const bucket = classify(card);
      if (groups[bucket]) groups[bucket].push(card);
    }
    const active = groups.red.length + groups.amber.length + groups.green.length;
    const attention = groups.red.length + groups.amber.length;
    const autonomous = groups.green.length;

    const summary = document.getElementById('exceptionSummaryV166');
    if (summary) summary.textContent = attention
      ? `${active} passage${active > 1 ? 's' : ''} actif${active > 1 ? 's' : ''} · ${autonomous} autonome${autonomous > 1 ? 's' : ''} · ${attention} action${attention > 1 ? 's' : ''} à regarder`
      : `${active} passage${active > 1 ? 's' : ''} actif${active > 1 ? 's' : ''} · aucun point nécessitant votre intervention`;

    const kpis = document.getElementById('exceptionKpisV166');
    if (kpis) kpis.innerHTML = `
      <div><b>${active}</b><span>passages actifs</span></div>
      <div><b>${autonomous}</b><span>autonomes</span></div>
      <div class="${attention ? 'has-attention' : ''}"><b>${attention}</b><span>à regarder</span></div>`;

    paint('red', groups.red, 'Aucun retard bloquant.');
    paint('amber', groups.amber, 'Aucune vérification nécessaire.');
    paint('green', groups.green, 'Aucun passage autonome en cours.');
  }

  function paint(kind, cards, emptyText) {
    const count = document.getElementById(`${kind}CountV166`);
    const list = document.getElementById(`${kind}ListV166`);
    if (count) count.textContent = String(cards.length);
    if (!list) return;
    if (!cards.length) {
      list.innerHTML = `<p class="exception-empty-v166">${emptyText}</p>`;
      return;
    }
    const limit = kind === 'green' ? 4 : 8;
    list.innerHTML = cards.slice(0, limit).map((card) => item(card, kind)).join('') + (cards.length > limit ? `<p class="exception-more-v166">+ ${cards.length - limit} autre${cards.length - limit > 1 ? 's' : ''}</p>` : '');
  }

  function item(card, kind) {
    const id = card.dataset.orderCard || '';
    const name = card.querySelector('.client-name')?.textContent?.trim() || 'Passage client';
    const company = card.querySelector('.client-company')?.textContent?.trim() || '';
    const status = card.querySelector('h3')?.textContent?.trim() || 'À consulter';
    const action = card.querySelector('p')?.textContent?.trim() || 'Ouvrir le dossier';
    const deadline = card.querySelector('.deadline')?.textContent?.trim() || '';
    const cta = kind === 'green' ? 'Voir' : 'Traiter';
    return `<button type="button" class="exception-item-v166" data-cockpit-order="${escapeAttr(id)}"><span class="exception-person-v166"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(company)}</small></span><span class="exception-action-v166"><b>${escapeHtml(status)}</b><small>${escapeHtml(action)}</small></span>${deadline ? `<em>${escapeHtml(deadline)}</em>` : ''}<i>${cta} →</i></button>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }
  function escapeAttr(value) { return escapeHtml(value); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
