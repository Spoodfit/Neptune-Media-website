const REFERRAL_BOOKING_URL = 'https://media.neptunebusiness.com/';
const CONNEXIO_API = '/api/public/connexio-availability';
const LIBRE_PREVIEW_URL = 'https://www.youtube.com/embed/jemcOyxlM6c?si=pFZGp4nmWY80Mv9m&controls=0&start=1590&rel=0&modestbranding=1&playsinline=1';

const ready = document.readyState === 'loading'
  ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve();

ready.then(initDashboardEnhancements);

async function initDashboardEnhancements() {
  installStylesheet();
  initFormatPreviews();
  await Promise.allSettled([
    initReferralExperience(),
    initConnexioAvailability(),
  ]);
}

function initFormatPreviews() {
  const horsNorme = document.querySelector('.format-card[data-format="hors norme"]');
  const libre = document.querySelector('.format-card[data-format="libre"]');

  installFormatPreview(horsNorme, {
    type: 'soon',
    label: 'Aperçu Hors Norme',
    title: 'La vidéo d’aperçu arrive bientôt',
    copy: 'Le format signature est en cours de finalisation.',
  });

  installFormatPreview(libre, {
    type: 'youtube',
    label: 'Aperçu du format Libre',
    src: LIBRE_PREVIEW_URL,
  });
}

function installFormatPreview(card, preview) {
  if (!card || card.querySelector('.format-preview, .format-video, iframe')) return;
  const bookingLink = card.querySelector('a');
  if (!bookingLink) return;

  const wrapper = document.createElement('div');
  wrapper.className = `format-preview format-preview--${preview.type}`;

  if (preview.type === 'youtube') {
    const iframe = document.createElement('iframe');
    iframe.src = preview.src;
    iframe.title = preview.label;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    wrapper.append(iframe);
  } else {
    wrapper.innerHTML = `
      <span class="format-preview-soon-icon" aria-hidden="true">▶</span>
      <div>
        <small>${escapeHtml(preview.label)}</small>
        <strong>${escapeHtml(preview.title)}</strong>
        <span>${escapeHtml(preview.copy)}</span>
      </div>`;
  }

  card.classList.add('has-format-preview');
  bookingLink.before(wrapper);
}

async function initReferralExperience() {
  const panel = document.querySelector('.referral-panel');
  if (!panel) return;
  try {
    const response = await fetch('/api/client/session', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) return;
    const state = await response.json();
    if (!state?.referral?.code) return;
    render(panel, state.referral);
  } catch {
    // Le code de parrainage minimal reste visible si la session ne peut pas être relue.
  }
}

async function initConnexioAvailability() {
  const card = document.querySelector('.format-card[data-format="connexio"]');
  const grid = card?.closest('.format-grid');
  if (!card || !grid) return;

  card.classList.remove('is-event-available');
  card.setAttribute('aria-hidden', 'true');
  grid.classList.remove('has-connexio-event');

  try {
    const response = await fetch(CONNEXIO_API, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return;
    const result = await response.json();
    if (!result?.available || !result.event) return;

    const event = result.event;
    card.classList.add('is-event-available');
    card.removeAttribute('aria-hidden');
    grid.classList.add('has-connexio-event');

    let badge = card.querySelector('.connexio-event-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'connexio-event-badge';
      card.prepend(badge);
    }
    badge.textContent = event.scheduledAt ? `Ouvert · ${formatEventDate(event.scheduledAt)}` : 'Événement ouvert';

    const copy = card.querySelector('p');
    if (copy) {
      const title = String(event.title || event.programName || 'Prochain événement Connexio');
      copy.textContent = `${title}. Une émission collective et spontanée pour créer des rencontres, du contenu et de la visibilité.`;
    }

    const link = card.querySelector('a');
    if (link) {
      link.href = event.bookingUrl || connexioBookingUrl(event.id);
      link.innerHTML = 'Réserver pour cet événement <span>→</span>';
    }
  } catch {
    // Sans événement confirmé, Connexio reste volontairement absent des offres.
  }
}

function render(panel, referral) {
  const count = Math.max(0, Number(referral.confirmedCount || 0));
  const goal = Math.max(1, Number(referral.goal || 3));
  const visibleCount = Math.min(goal, count);
  const remaining = Math.max(0, goal - count);
  const unlocked = Boolean(referral.rewardUnlocked || count >= goal);
  const code = normalizeCode(referral.code);
  const companyLabel = String(referral.companyLabel || code).trim();
  const shareUrl = new URL(REFERRAL_BOOKING_URL);
  shareUrl.searchParams.set('ref', code);
  const message = shareMessage(shareUrl.toString());
  const encodedMessage = encodeURIComponent(message);
  const progress = Array.from({ length: goal }, (_, index) => {
    const step = index + 1;
    const state = step <= visibleCount ? 'done' : step === visibleCount + 1 ? 'next' : 'waiting';
    return `<li data-state="${state}"><span>${step <= visibleCount ? '✓' : step}</span><small>${step === goal ? 'Émission au prix coûtant' : 'Recommandation confirmée'}</small></li>`;
  }).join('');

  panel.classList.add('referral-challenge');
  panel.innerHTML = `
    <div class="referral-challenge-head">
      <div>
        <p class="referral-challenge-kicker">OBJECTIF RECOMMANDATION</p>
        <h2>${unlocked ? 'Votre émission au prix coûtant est débloquée.' : '3 reco’ = une émission à prix coûtant'}</h2>
      </div>
      <span class="referral-counter">${visibleCount}/${goal}</span>
    </div>
    <p class="referral-promise">Pour chaque reco’, vous et votre entreprise serez mis à l’honneur lors de son format Hors Norme.</p>
    <ol class="referral-milestones" aria-label="Progression vers la récompense">${progress}</ol>
    <div class="referral-reward ${unlocked ? 'is-unlocked' : ''}">
      <span class="referral-reward-icon" aria-hidden="true">${unlocked ? '✓' : '✦'}</span>
      <div>
        <small>${unlocked ? 'AVANTAGE DÉBLOQUÉ' : 'PROCHAINE RÉCOMPENSE'}</small>
        <strong>${unlocked ? 'Choisissez votre émission au prix coûtant.' : remaining === 1 ? 'Plus qu’une réservation confirmée.' : `Plus que ${remaining} réservations confirmées.`}</strong>
      </div>
    </div>
    <div class="referral-actions">
      <button id="shareReferralNative" class="referral-share-primary" type="button"><span aria-hidden="true">↗</span> Partager à mes contacts</button>
      <a class="referral-share-icon" href="https://wa.me/?text=${encodedMessage}" target="_blank" rel="noopener" aria-label="Partager sur WhatsApp" title="Partager sur WhatsApp">W</a>
      <a class="referral-share-icon" href="mailto:?subject=${encodeURIComponent('Une idée pour votre visibilité')}&body=${encodedMessage}" aria-label="Partager par e-mail" title="Partager par e-mail">@</a>
      <button id="copyReferralLink" class="referral-share-icon" type="button" aria-label="Copier le lien de recommandation" title="Copier le lien">⧉</button>
    </div>
    <div class="referral-link-row">
      <code>${escapeHtml(code)}</code>
      <span>Lien personnel identifié au nom de ${escapeHtml(companyLabel)}.</span>
    </div>
    <p class="referral-rule">La réservation doit être faite depuis votre lien personnel pour être comptabilisée. Sans ce lien, elle ne pourra pas être rattachée automatiquement à votre recommandation.</p>
    ${unlocked ? '<a class="referral-claim" href="mailto:contact@neptunebusiness.com?subject=Je souhaite utiliser mon émission au prix coûtant">Choisir mon émission avec Neptune →</a>' : ''}
  `;

  panel.querySelector('#shareReferralNative')?.addEventListener('click', () => shareReferral(shareUrl.toString(), message));
  panel.querySelector('#copyReferralLink')?.addEventListener('click', () => copyReferral(shareUrl.toString(), panel));
}

async function shareReferral(url, message) {
  const data = {
    title: 'Neptune Media',
    text: 'Je pense que ce format peut vraiment vous aider à gagner en visibilité. Réservez directement depuis mon lien pour que ma recommandation soit prise en compte.',
    url,
  };
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  const copied = await copyText(message);
  announce(copied
    ? 'Message et lien copiés. Votre contact doit réserver depuis ce lien.'
    : 'Le partage direct n’est pas disponible. Utilisez WhatsApp ou l’e-mail.');
}

async function copyReferral(url, panel) {
  const copied = await copyText(url);
  if (!copied) {
    announce('Copie impossible sur cet appareil. Utilisez le bouton de partage.');
    return;
  }
  const button = panel.querySelector('#copyReferralLink');
  if (button) button.textContent = '✓';
  announce('Lien personnel copié. La réservation doit être faite depuis ce lien.');
  window.setTimeout(() => {
    const current = panel.querySelector('#copyReferralLink');
    if (current) current.textContent = '⧉';
  }, 1800);
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

function shareMessage(url) {
  return `Je pense que Neptune Media pourrait vous aider à transformer une demi-journée en plusieurs mois de contenus professionnels, sans devoir jouer à l’influenceur. Pour que ma recommandation soit prise en compte, réservez directement depuis ce lien : ${url}`;
}

function connexioBookingUrl(eventId) {
  const url = new URL(REFERRAL_BOOKING_URL);
  url.searchParams.set('format', 'connexio');
  if (eventId) url.searchParams.set('event', String(eventId));
  return url.toString();
}

function formatEventDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'prochainement';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(date);
}

function announce(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast';
  toast.hidden = false;
  clearTimeout(announce.timer);
  announce.timer = window.setTimeout(() => { toast.hidden = true; }, 3800);
}

function normalizeCode(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '')
    .slice(0, 18);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function installStylesheet() {
  if (!document.querySelector('link[data-referral-v39]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/espace-client/referral-v39.css?v=1';
    link.dataset.referralV39 = 'true';
    document.head.append(link);
  }

  if (!document.querySelector('link[data-dashboard-layout-v40]')) {
    const layout = document.createElement('link');
    layout.rel = 'stylesheet';
    layout.href = '/espace-client/dashboard-layout-v40.css?v=3';
    layout.dataset.dashboardLayoutV40 = 'true';
    document.head.append(layout);
  }
}
