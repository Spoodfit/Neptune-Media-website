(() => {
  const form = document.getElementById('jtForm');
  const formCard = document.getElementById('formCard');
  const successCard = document.getElementById('successCard');
  const submitBtn = document.getElementById('submitBtn');
  const formError = document.getElementById('formError');
  const ref = new URLSearchParams(location.search).get('ref') || '';
  document.getElementById('referredBy').value = ref.slice(0, 80);

  const statusCount = document.getElementById('statusCount');
  const statusText = document.getElementById('statusText');
  const segments = document.getElementById('segments');
  let registrationOpen = false;

  installAbuseGuards();

  function installAbuseGuards() {
    const honeypot = document.createElement('input');
    honeypot.name = '_companyWebsite';
    honeypot.type = 'text';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.cssText = 'position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important';
    form.append(honeypot);

    const startedAt = document.createElement('input');
    startedAt.type = 'hidden';
    startedAt.name = '_formStartedAt';
    startedAt.value = String(Date.now());
    form.append(startedAt);
  }

  function renderSegments(total = 0, confirmed = 0) {
    segments.innerHTML = '';
    for (let i = 0; i < 6; i += 1) {
      const el = document.createElement('i');
      if (i < total) el.classList.add('filled');
      if (i < confirmed) el.classList.add('paid');
      segments.appendChild(el);
    }
  }

  function renderEditionMeta(edition) {
    let node = document.getElementById('editionMeta');
    if (!node) {
      node = document.createElement('div');
      node.id = 'editionMeta';
      node.style.cssText = 'margin-top:14px;padding-top:14px;border-top:1px solid rgba(172,193,228,.16);display:grid;gap:5px;color:#c6d1e3;font-size:.82rem;line-height:1.45';
      statusText.insertAdjacentElement('afterend', node);
    }
    if (!edition?.eventAt) {
      node.innerHTML = '<strong style="color:#fff">Prochaine date en préparation</strong><span>Les inscriptions ouvriront dès que la date et le lieu seront validés.</span>';
      return;
    }
    const when = formatEditionDate(edition.eventAt);
    const where = edition.location || 'Lieu à confirmer';
    node.innerHTML = `<strong style="color:#fff">${escapeHtml(when)}</strong><span>${escapeHtml(where)}</span>`;
  }

  async function loadStatus() {
    registrationOpen = false;
    submitBtn.disabled = true;
    try {
      const response = await fetch('/api/neptune-jt/status', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'status_unavailable');
      const total = Number(data.counts?.total || 0);
      const confirmed = Number(data.counts?.confirmed || 0);
      statusCount.textContent = `${Math.min(total, 4)} / 4`;
      renderSegments(total, confirmed);
      renderEditionMeta(data.edition);

      registrationOpen = data.registrationOpen === true && total < 6;
      if (!registrationOpen) {
        const message = closedMessage(data.registrationReason, data.edition);
        statusText.textContent = message;
        submitBtn.disabled = true;
        submitBtn.textContent = total >= 6 ? 'Édition complète' : 'Pré-réservations indisponibles';
        return;
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'Pré-réserver ma place';
      if (total >= 4) {
        statusText.textContent = `Minimum atteint · ${confirmed}/${total} pré-réservation(s) déjà confirmée(s) par paiement.`;
      } else {
        const missing = 4 - total;
        statusText.textContent = `${total}/4 pré-réservation(s) · encore ${missing} pour déclencher les règlements.`;
      }
    } catch (error) {
      registrationOpen = false;
      statusText.textContent = 'Impossible de vérifier l’édition en cours. Rechargez la page avant toute pré-réservation.';
      renderSegments(0, 0);
      renderEditionMeta(null);
      submitBtn.disabled = true;
      submitBtn.textContent = 'Vérification indisponible';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';
    if (!registrationOpen) {
      formError.textContent = 'Les pré-réservations ne sont pas ouvertes pour le moment. Rechargez la page pour vérifier la prochaine édition.';
      return;
    }
    if (!form.reportValidity()) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Pré-réservation en cours…';
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.acceptTerms = fd.get('acceptTerms') === 'on';
    payload.acceptMediaRights = fd.get('acceptMediaRights') === 'on';
    try {
      const response = await fetch('/api/neptune-jt/pre-register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(friendlyError(data.error));
      showSuccess(data);
      loadStatus();
    } catch (error) {
      formError.textContent = error.message || 'Impossible d’enregistrer la pré-réservation.';
      submitBtn.disabled = !registrationOpen;
      submitBtn.textContent = registrationOpen ? 'Pré-réserver ma place' : 'Pré-réservations indisponibles';
    }
  });

  function showSuccess(data) {
    formCard.hidden = true;
    successCard.hidden = false;
    const total = Number(data.counts?.total || 0);
    const thresholdReached = total >= 4;
    document.getElementById('successTitle').textContent = thresholdReached ? 'Le minimum est atteint.' : 'Votre sujet est dans la sélection.';
    document.getElementById('successText').textContent = thresholdReached
      ? 'Le lien de paiement de 200 € TTC vous est envoyé par e-mail pour confirmer définitivement votre place. Vérifiez aussi vos courriers indésirables.'
      : `Nous sommes maintenant ${total}/4. Aucun paiement n'est demandé pour l'instant. Dès que le quatrième participant pré-réserve, chacun reçoit le lien de règlement.`;
    const share = new URL(data.sharePath || '/reserver/neptune-jt/', location.origin).toString();
    const shareInput = document.getElementById('shareUrl');
    shareInput.value = share;
    const message = `Une place au prochain Neptune JT peut t'intéresser : on vient décrypter une actualité liée à son entreprise sur un plateau, avec son passage + 10 shorts minimum. Pré-réservation ici : ${share}`;
    document.getElementById('whatsappBtn').href = `https://wa.me/?text=${encodeURIComponent(message)}`;
    document.getElementById('linkedinBtn').href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share)}`;
    document.getElementById('copyBtn').onclick = async () => {
      await navigator.clipboard.writeText(share).catch(() => { shareInput.select(); document.execCommand('copy'); });
      document.getElementById('copyBtn').textContent = 'Copié ✓';
    };
    successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closedMessage(reason, edition) {
    const map = {
      edition_not_ready: 'La prochaine édition est en préparation. Les pré-réservations ouvriront dès que sa date sera confirmée.',
      edition_date_passed: 'Cette édition est terminée. La prochaine date sera affichée dès son ouverture.',
      edition_unavailable: 'Cette édition n’est plus disponible. Une prochaine date sera proposée.',
      registrations_closed: 'Les pré-réservations sont closes pour cette édition.',
      edition_full: 'Cette édition a atteint ses 6 pré-réservations.',
    };
    if (!edition) return map.edition_not_ready;
    return map[reason] || 'Les pré-réservations ne sont pas ouvertes pour cette édition.';
  }

  function friendlyError(code) {
    const map = {
      edition_full: 'Cette édition a déjà atteint ses 6 pré-réservations.',
      edition_cancelled: 'Cette édition est annulée. Une nouvelle date sera proposée prochainement.',
      edition_unavailable: 'Cette édition n’est plus disponible.',
      edition_not_ready: 'La prochaine édition n’est pas encore ouverte aux pré-réservations.',
      edition_date_passed: 'La date de cette édition est dépassée.',
      registrations_closed: 'Les pré-réservations sont closes pour cette édition.',
      already_registered: 'Cette adresse e-mail est déjà rattachée à cette édition. Contactez Neptune si vous souhaitez modifier votre dossier.',
      required_fields_missing: 'Complétez au minimum votre identité, votre entreprise, votre e-mail et votre sujet.',
      consent_required: 'Les conditions et l’autorisation de captation doivent être acceptées.',
      request_rejected: 'La demande n’a pas pu être validée. Rechargez la page puis réessayez.',
      origin_forbidden: 'Rechargez la page avant de réessayer.'
    };
    return map[code] || 'Impossible d’enregistrer la pré-réservation pour le moment.';
  }

  function formatEditionDate(value) {
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

  loadStatus();
})();
