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

  function renderSegments(total = 0, confirmed = 0) {
    segments.innerHTML = '';
    for (let i = 0; i < 6; i += 1) {
      const el = document.createElement('i');
      if (i < total) el.classList.add('filled');
      if (i < confirmed) el.classList.add('paid');
      segments.appendChild(el);
    }
  }

  async function loadStatus() {
    try {
      const response = await fetch('/api/neptune-jt/status', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'status_unavailable');
      const total = Number(data.counts?.total || 0);
      const confirmed = Number(data.counts?.confirmed || 0);
      statusCount.textContent = `${Math.min(total, 4)} / 4`;
      renderSegments(total, confirmed);
      if (data.edition?.status === 'cancelled') {
        statusText.textContent = 'Cette édition est annulée. Une nouvelle date sera proposée prochainement.';
        submitBtn.disabled = true;
      } else if (total >= 6) {
        statusText.textContent = `Édition complète · ${confirmed}/6 place(s) déjà confirmée(s) par paiement.`;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Édition complète';
      } else if (total >= 4) {
        statusText.textContent = `Minimum atteint · ${confirmed}/${total} pré-réservation(s) déjà confirmée(s) par paiement.`;
      } else {
        const missing = 4 - total;
        statusText.textContent = `${total}/4 pré-réservation(s) · encore ${missing} pour déclencher les règlements.`;
      }
    } catch (error) {
      statusText.textContent = 'Le compteur sera actualisé lors de votre pré-réservation.';
      renderSegments(0, 0);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';
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
      submitBtn.disabled = false;
      submitBtn.textContent = 'Pré-réserver ma place';
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

  function friendlyError(code) {
    const map = {
      edition_full: 'Cette édition a déjà atteint ses 6 pré-réservations.',
      edition_cancelled: 'Cette édition est annulée. Une nouvelle date sera proposée prochainement.',
      registrations_closed: 'Les pré-réservations sont closes pour cette édition.',
      already_registered: 'Cette adresse e-mail est déjà pré-réservée pour cette édition.',
      required_fields_missing: 'Complétez au minimum votre identité, votre entreprise, votre e-mail et votre sujet.',
      consent_required: 'Les conditions et l’autorisation de captation doivent être acceptées.',
      origin_forbidden: 'Rechargez la page avant de réessayer.'
    };
    return map[code] || 'Impossible d’enregistrer la pré-réservation pour le moment.';
  }

  loadStatus();
})();
