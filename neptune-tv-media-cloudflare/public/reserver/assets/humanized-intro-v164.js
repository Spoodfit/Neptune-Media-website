(() => {
  const RELEASE = 'neptune-reservation-humanized-intro-20260831-v164';
  const START_ENDPOINT = '/api/reservation/prospect/start';
  const CACHE_KEY = 'neptune_media_humanized_intro_v164';

  document.body.dataset.humanizedIntroRelease = RELEASE;

  const observer = new MutationObserver(() => enhanceCompanyStep());
  const root = document.getElementById('app-content');
  if (!root) return;
  observer.observe(root, { childList: true, subtree: true });
  enhanceCompanyStep();

  function enhanceCompanyStep() {
    const legacyForm = document.getElementById('companyForm');
    if (!legacyForm || legacyForm.dataset.humanized === '1') return;

    const legacyCompany = legacyForm.querySelector('[name="companyIdentity"]')?.value || '';
    const cached = readCache();
    const shell = legacyForm.parentElement;
    if (!shell) return;

    const eyebrow = shell.querySelector('.eyebrow');
    const title = shell.querySelector('h1');
    const lead = shell.querySelector('.lead');
    if (eyebrow) eyebrow.textContent = 'Votre réservation commence ici';
    if (title) title.textContent = 'Faisons connaissance.';
    if (lead) lead.textContent = 'Avant de vous montrer les concepts, dites-nous simplement qui vous êtes et quelle entreprise vous représentez.';

    const form = document.createElement('form');
    form.className = 'panel company-first-panel humanized-intro-v164';
    form.id = 'companyForm';
    form.dataset.humanized = '1';
    form.noValidate = true;
    form.innerHTML = `
      <div class="humanized-fields-v164">
        <label class="field">
          <span>Comment vous appelez-vous ?</span>
          <input name="fullName" type="text" value="${escapeHtml(cached.fullName || '')}" placeholder="Votre prénom et votre nom" autocomplete="name" required>
        </label>
        <label class="field">
          <span>Quelle entreprise représentez-vous ?</span>
          <input name="companyIdentity" type="text" value="${escapeHtml(cached.companyIdentity || legacyCompany)}" placeholder="Nom de l’entreprise, site web ou adresse" autocomplete="organization" required>
          <small class="field-hint-v164">Le nom ou le site suffit : Neptune pourra enrichir automatiquement votre fiche entreprise.</small>
        </label>
        <label class="field callback-field-v164">
          <span>Vous souhaitez être rappelé ? <em>Facultatif</em></span>
          <input name="callbackContact" type="text" value="${escapeHtml(cached.callbackContact || '')}" placeholder="Téléphone ou e-mail" inputmode="text">
          <small class="field-hint-v164">Renseignez ce champ uniquement si vous souhaitez que l’équipe Neptune Media vous recontacte.</small>
        </label>
      </div>
      <p class="legal-note">Ces informations sont rattachées à votre demande pour préparer votre suivi dans le Studio Neptune Media.</p>
      <div class="error" id="error" role="alert" aria-live="polite"></div>
      <div class="actions"><span></span><button class="btn btn-primary" type="submit">Découvrir les concepts</button></div>`;

    legacyForm.replaceWith(form);
    form.addEventListener('submit', submitHumanizedIntro);
  }

  async function submitHumanizedIntro(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const error = form.querySelector('#error');
    const fd = new FormData(form);
    const fullName = String(fd.get('fullName') || '').trim().replace(/\s+/g, ' ');
    const companyIdentity = String(fd.get('companyIdentity') || '').trim();
    const callbackContact = String(fd.get('callbackContact') || '').trim();

    error.textContent = '';
    if (fullName.length < 2) return showError(error, 'Indiquez votre prénom et votre nom.');
    if (!companyIdentity) return showError(error, 'Indiquez l’entreprise que vous représentez.');

    const contact = classifyContact(callbackContact);
    if (callbackContact && !contact.valid) {
      return showError(error, 'Indiquez un numéro de téléphone ou une adresse e-mail valide.');
    }

    const { firstName, lastName } = splitName(fullName);
    const payload = {
      firstName,
      lastName,
      companyIdentity,
      accepted: true,
      ...(contact.email ? { email: contact.email } : {}),
      ...(contact.phone ? { phone: contact.phone } : {}),
    };

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(START_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error || `HTTP ${response.status}`);

      writeCache({ fullName, companyIdentity, callbackContact });
      const url = new URL(location.href);
      url.searchParams.set('reservation_token', data.token);
      url.searchParams.delete('payment');
      location.assign(url.toString());
    } catch (err) {
      console.error('[humanized-intro-v164] prospect start failed', err);
      showError(error, friendlyError(err.message));
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function splitName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
  }

  function classifyContact(value) {
    const raw = String(value || '').trim();
    if (!raw) return { valid: true, email: '', phone: '' };
    if (raw.includes('@')) {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(raw);
      return { valid, email: valid ? raw.toLowerCase() : '', phone: '' };
    }
    const digits = raw.replace(/\D/g, '');
    const valid = digits.length >= 8 && digits.length <= 15;
    return { valid, email: '', phone: valid ? raw : '' };
  }

  function friendlyError(message) {
    const key = String(message || '');
    if (key.includes('company_required')) return 'Indiquez l’entreprise que vous représentez.';
    if (key.includes('origin_forbidden')) return 'La demande a été bloquée. Rechargez la page puis réessayez.';
    if (key.includes('HTTP 5') || key.includes('internal_error')) return 'Le service est momentanément indisponible. Réessayez dans quelques instants.';
    return 'Impossible d’enregistrer vos informations pour le moment. Réessayez.';
  }

  function showError(node, message) {
    node.textContent = message;
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function readCache() {
    try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function writeCache(value) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(value)); }
    catch {}
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
  }
})();
