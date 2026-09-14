(() => {
  const bookingLinks = [...document.querySelectorAll('a[href^="/reserver/neptune-jt"]')];
  const micro = document.querySelector('.hero-copy .micro');
  if (!micro) return;

  const card = document.createElement('div');
  card.id = 'jtEditionStatusV184';
  card.setAttribute('aria-live', 'polite');
  card.style.cssText = 'margin-top:16px;padding:14px 16px;border:1px solid rgba(172,193,228,.16);border-radius:14px;background:rgba(7,16,31,.58);display:grid;gap:4px;max-width:620px;color:#bdc9db;font-size:.84rem;line-height:1.45';
  card.innerHTML = '<strong style="color:#fff">Vérification de la prochaine édition…</strong>';
  micro.insertAdjacentElement('afterend', card);

  fetch('/api/neptune-jt/status', { credentials: 'same-origin', cache: 'no-store' })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'status_unavailable');
      render(data);
    })
    .catch(() => {
      card.innerHTML = '<strong style="color:#fff">Disponibilité en cours de vérification</strong><span>La page de pré-réservation confirmera l’ouverture de la prochaine édition.</span>';
    });

  function render(data) {
    const edition = data.edition;
    if (!edition?.eventAt) {
      card.innerHTML = '<strong style="color:#fff">Prochaine date en préparation</strong><span>Les pré-réservations ouvriront dès que la date et le lieu seront validés.</span>';
      disableBooking('Date en préparation');
      return;
    }

    const total = Number(data.counts?.total || 0);
    const date = formatDate(edition.eventAt);
    const location = edition.location || 'Lieu à confirmer';
    const capacity = `${Math.min(total, 6)}/6 pré-réservation${total > 1 ? 's' : ''}`;
    card.innerHTML = `<strong style="color:#fff">${escapeHtml(date)}</strong><span>${escapeHtml(location)} · ${escapeHtml(capacity)}</span>`;

    if (data.registrationOpen !== true) {
      const labels = {
        edition_full: 'Édition complète',
        registrations_closed: 'Inscriptions closes',
        edition_date_passed: 'Édition terminée',
        edition_unavailable: 'Édition indisponible',
        edition_not_ready: 'Date en préparation',
      };
      disableBooking(labels[data.registrationReason] || 'Inscriptions closes');
    }
  }

  function disableBooking(label) {
    for (const link of bookingLinks) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.style.opacity = '.58';
      link.style.cursor = 'not-allowed';
      link.style.pointerEvents = 'none';
      if (/pré-réserver/iu.test(link.textContent || '')) link.textContent = label;
    }
  }

  function formatDate(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return 'Date à confirmer';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
})();
