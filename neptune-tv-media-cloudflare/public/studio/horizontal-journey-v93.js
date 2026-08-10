const RELEASE = 'neptune-horizontal-client-journey-20260810-v93';
const STYLE_URL = '/studio/horizontal-journey-v93.css?v=1';
const ROOT_SELECTOR = '#clientDetail.v92-detail';
const contextCache = new Map();
let scheduled = false;

start();

function start() {
  installContextObserver();
  ensureStylesheet();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.horizontalJourneyRelease = RELEASE;
  enhance();
  new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleEnhance);
}

function installContextObserver() {
  if (window.__neptuneHorizontalV93FetchObserver) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const requestUrl = typeof input === 'string' ? input : input?.url || '';
      if (String(requestUrl).includes('/api/admin/journey-v92/context') && response.ok) {
        response.clone().json().then((data) => {
          const orderId = String(data?.order?.id || '');
          if (!orderId) return;
          contextCache.set(orderId, data);
          scheduleEnhance();
        }).catch(() => {});
      }
    } catch {
      // Lecture passive uniquement : ne jamais bloquer la requête v92.
    }
    return response;
  };
  window.__neptuneHorizontalV93FetchObserver = true;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-horizontal-journey-v93]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_URL;
  link.dataset.horizontalJourneyV93 = 'true';
  document.head.append(link);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance();
  });
}

function enhance() {
  const root = document.querySelector(ROOT_SELECTOR);
  const steps = root?.querySelector('.v92-steps');
  if (!root || !steps) return;
  const cards = [...steps.querySelectorAll(':scope > .v92-step')];
  if (cards.length !== 8) return;
  const alreadyEnhanced = root.dataset.horizontalJourneyOwner === RELEASE && root.querySelector('.v93-journey-rail');

  preventDuplicateV92Actions(root);
  enrichClientAvailability(root, cards);
  if (alreadyEnhanced) return;
  root.dataset.horizontalJourneyOwner = RELEASE;
  root.classList.add('v93-horizontal-journey');
  steps.classList.add('v93-step-panel');

  const selected = recommendedIndex(cards);
  const rail = buildRail(cards);
  steps.before(rail);
  selectStep(root, cards, rail, selected, false);
  installRailEvents(root, cards, rail);
}

function preventDuplicateV92Actions(root) {
  if (root.__neptuneHorizontalV93Patched) return;
  const nativeAdd = root.addEventListener;
  root.addEventListener = function addEventListenerV93(type, listener, options) {
    if (type === 'click' && listener?.name === 'onAction') return;
    return nativeAdd.call(this, type, listener, options);
  };
  root.__neptuneHorizontalV93Patched = true;
}

function enrichClientAvailability(root, cards) {
  const orderId = String(root.dataset.orderId || '');
  const data = contextCache.get(orderId);
  const raw = data?.preference?.preferences;
  const dates = Array.isArray(raw) ? raw : Array.isArray(raw?.dates) ? raw.dates : [];
  const formatted = dates.map(formatDateTime).filter(Boolean).slice(0, 3);
  if (!formatted.length) return;

  const dateStep = cards[2];
  const dateHeadline = dateStep?.querySelector('.v92-step-copy > strong')?.textContent?.trim() || '';
  const dateDetail = dateStep?.querySelector('.v92-step-copy > p');
  if (/disponibilit[ée]s reçues/iu.test(dateHeadline) && dateDetail) {
    dateDetail.textContent = `Le client a proposé ${formatted.length} créneau(x) : ${formatted.join(' · ')}.`;
  }

  const infoValue = cards[4]?.querySelector('.v92-passage-detail > div:nth-child(2) > span');
  if (infoValue) {
    const existing = String(infoValue.textContent || '').trim();
    const availability = `Disponibilités client : ${formatted.join(' · ')}`;
    infoValue.textContent = !existing || existing === 'Aucune information complémentaire enregistrée.'
      ? availability
      : existing.includes('Disponibilités client') ? existing : `${availability} · ${existing}`;
    infoValue.dataset.v93ClientAvailability = 'true';
  }
}

function buildRail(cards) {
  const section = document.createElement('section');
  section.className = 'v93-journey-rail';
  section.setAttribute('aria-label', 'Étapes du passage');
  section.innerHTML = `
    <div class="v93-rail-heading">
      <div><span>PARCOURS DU PASSAGE</span><strong data-v93-focus-title></strong></div>
      <small data-v93-focus-state></small>
    </div>
    <div class="v93-rail-scroll" data-v93-rail-scroll>
      <div class="v93-rail-tabs" role="tablist" aria-label="8 étapes du passage">
        ${cards.map((card, index) => railButton(card, index)).join('')}
      </div>
    </div>`;
  return section;
}

function railButton(card, index) {
  const tone = toneOf(card);
  const title = card.querySelector('.v92-step-title h3')?.textContent?.trim() || `Étape ${index + 1}`;
  const state = card.querySelector('.v92-step-title span')?.textContent?.trim() || stateLabel(tone);
  const done = tone === 'done' || tone === 'done-muted';
  return `<button type="button" class="v93-tab is-${tone}" role="tab" aria-selected="false" tabindex="-1" data-v93-step="${index}" id="v93-step-tab-${index + 1}"><span class="v93-tab-marker"><b>${done ? '✓' : index + 1}</b></span><span class="v93-tab-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(state)}</small></span></button>`;
}

function installRailEvents(root, cards, rail) {
  const tabs = [...rail.querySelectorAll('[data-v93-step]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectStep(root, cards, rail, index, true));
    tab.addEventListener('keydown', (event) => {
      let target = null;
      if (event.key === 'ArrowRight') target = Math.min(cards.length - 1, index + 1);
      if (event.key === 'ArrowLeft') target = Math.max(0, index - 1);
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = cards.length - 1;
      if (target === null) return;
      event.preventDefault();
      selectStep(root, cards, rail, target, true);
      tabs[target]?.focus({ preventScroll: true });
    });
  });
}

function selectStep(root, cards, rail, index, userInitiated) {
  const safeIndex = Math.max(0, Math.min(cards.length - 1, Number(index) || 0));
  const tabs = [...rail.querySelectorAll('[data-v93-step]')];
  cards.forEach((card, cardIndex) => {
    const selected = cardIndex === safeIndex;
    card.hidden = !selected;
    card.classList.toggle('v93-selected-step', selected);
    card.setAttribute('role', 'tabpanel');
    card.setAttribute('aria-hidden', selected ? 'false' : 'true');
    card.setAttribute('aria-labelledby', `v93-step-tab-${cardIndex + 1}`);
    card.dataset.v93Step = String(cardIndex);
  });
  tabs.forEach((tab, tabIndex) => {
    const selected = tabIndex === safeIndex;
    tab.classList.toggle('is-selected', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });

  const card = cards[safeIndex];
  const title = card.querySelector('.v92-step-title h3')?.textContent?.trim() || `Étape ${safeIndex + 1}`;
  const state = card.querySelector('.v92-step-title span')?.textContent?.trim() || '';
  const focusTitle = rail.querySelector('[data-v93-focus-title]');
  const focusState = rail.querySelector('[data-v93-focus-state]');
  if (focusTitle) focusTitle.textContent = `Étape ${safeIndex + 1}/8 · ${title}`;
  if (focusState) focusState.textContent = state;
  root.dataset.v93SelectedStep = String(safeIndex + 1);

  const scroll = rail.querySelector('[data-v93-rail-scroll]');
  const selectedTab = tabs[safeIndex];
  if (scroll && selectedTab && scroll.scrollWidth > scroll.clientWidth + 4) {
    selectedTab.scrollIntoView({ behavior: userInitiated && !reducedMotion() ? 'smooth' : 'auto', block: 'nearest', inline: 'center' });
  }

  if (userInitiated) {
    card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }
}

function recommendedIndex(cards) {
  const warning = cards.findIndex((card) => card.classList.contains('is-warning'));
  if (warning >= 0) return warning;
  const current = cards.findIndex((card) => card.classList.contains('is-current'));
  if (current >= 0) return current;
  const pending = cards.findIndex((card) => card.classList.contains('is-pending'));
  if (pending >= 0) return pending;
  return Math.max(0, cards.length - 1);
}

function toneOf(card) {
  for (const tone of ['done-muted', 'done', 'warning', 'current', 'pending']) {
    if (card.classList.contains(`is-${tone}`)) return tone;
  }
  return 'pending';
}

function stateLabel(tone) {
  return ({ done: 'Validé', 'done-muted': 'Effectué', warning: 'À surveiller', current: 'À faire', pending: 'En attente' })[tone] || '';
}

function formatDateTime(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  }).format(date);
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}
