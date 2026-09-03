(() => {
  const RELEASE = 'neptune-member-gate-20260903-v170';
  const params = new URLSearchParams(location.search);
  if (params.get('reservation_token')) {
    document.documentElement.dataset.memberGate = 'bypassed';
    return;
  }

  document.documentElement.dataset.memberGate = RELEASE;
  const gate = document.createElement('section');
  gate.className = 'member-gate-v170 is-loading';
  gate.id = 'neptuneMemberGateV170';
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'memberGateTitleV170');
  gate.innerHTML = `
    <div class="member-gate-card-v170">
      <div class="member-gate-brand-v170"><img src="/assets/logo-neptune.svg" alt=""><span><b>Neptune Business</b><span>Accès membre · Neptune Media</span></span></div>
      <p class="member-gate-kicker-v170">Avantage réservé aux membres</p>
      <h1 id="memberGateTitleV170">Identifiez-vous avant de réserver.</h1>
      <p class="member-gate-lead-v170">Un compte Neptune Business gratuit suffit. Connectez-vous avec votre compte existant ou créez votre accès en quelques secondes.</p>
      <div id="memberGateSessionV170"></div>
      <div class="member-gate-tabs-v170" role="tablist" aria-label="Accès membre">
        <button type="button" class="is-active" data-gate-tab="login" role="tab" aria-selected="true">J’ai déjà un compte</button>
        <button type="button" data-gate-tab="register" role="tab" aria-selected="false">Créer mon accès gratuit</button>
      </div>
      <div class="member-gate-forms-v170">
        <form class="member-gate-form-v170" id="memberLoginV170">
          <label class="member-gate-field-v170"><span>Email de votre compte Neptune Business</span><input name="email" type="email" autocomplete="email" placeholder="vous@entreprise.com" required></label>
          <div id="memberCodeWrapV170" hidden><label class="member-gate-field-v170"><span>Code de sécurité</span><input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000"></label></div>
          <button class="member-gate-submit-v170" type="submit" id="memberLoginSubmitV170">Recevoir mon code</button>
          <button class="member-gate-secondary-v170" type="button" id="memberLoginResetV170" hidden>Changer d’adresse email</button>
          <p class="member-gate-note-v170">La connexion utilise le système sécurisé déjà associé à votre espace Neptune. Aucun mot de passe n’est transmis ni stocké par le tunnel de vente.</p>
        </form>
        <form class="member-gate-form-v170" id="memberRegisterV170" hidden>
          <div class="member-gate-grid-v170">
            <label class="member-gate-field-v170"><span>Prénom</span><input name="firstName" autocomplete="given-name" required></label>
            <label class="member-gate-field-v170"><span>Nom</span><input name="lastName" autocomplete="family-name" required></label>
          </div>
          <label class="member-gate-field-v170"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="member-gate-field-v170"><span>Téléphone</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="06 12 34 56 78" required></label>
          <button class="member-gate-submit-v170" type="submit">Créer mon accès gratuit et continuer</button>
          <p class="member-gate-note-v170">Votre accès gratuit sert aussi à retrouver votre réservation et votre espace Neptune par la suite.</p>
        </form>
        <form class="member-gate-form-v170" id="memberCompleteV170" hidden>
          <div class="member-gate-grid-v170">
            <label class="member-gate-field-v170"><span>Prénom</span><input name="firstName" autocomplete="given-name" required></label>
            <label class="member-gate-field-v170"><span>Nom</span><input name="lastName" autocomplete="family-name" required></label>
          </div>
          <label class="member-gate-field-v170"><span>Email</span><input name="email" type="email" autocomplete="email" readonly required></label>
          <label class="member-gate-field-v170"><span>Téléphone</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required></label>
          <button class="member-gate-submit-v170" type="submit">Continuer vers la réservation</button>
        </form>
      </div>
      <p class="member-gate-message-v170" id="memberGateMessageV170" aria-live="polite"></p>
    </div>`;
  document.body.append(gate);
  document.body.style.overflow = 'hidden';

  const $ = (selector) => gate.querySelector(selector);
  const loginForm = $('#memberLoginV170');
  const registerForm = $('#memberRegisterV170');
  const completeForm = $('#memberCompleteV170');
  const codeWrap = $('#memberCodeWrapV170');
  const loginSubmit = $('#memberLoginSubmitV170');
  const loginReset = $('#memberLoginResetV170');
  const messageNode = $('#memberGateMessageV170');
  let loginEmail = '';

  gate.querySelectorAll('[data-gate-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.gateTab)));
  loginForm.addEventListener('submit', onLogin);
  loginReset.addEventListener('click', resetLogin);
  registerForm.addEventListener('submit', onRegister);
  completeForm.addEventListener('submit', onComplete);

  checkExistingSession();

  async function checkExistingSession() {
    setLoading(true);
    try {
      const session = await request('/api/client/session');
      if (session?.client) {
        await continueFromClient(session.client, true);
        return;
      }
    } catch {}
    setLoading(false);
    showTab('login');
  }

  async function onLogin(event) {
    event.preventDefault();
    clearMessage();
    const data = new FormData(loginForm);
    const code = String(data.get('code') || '').replace(/\D/gu, '').slice(0, 6);
    if (codeWrap.hidden) {
      loginEmail = String(data.get('email') || '').trim().toLowerCase();
      if (!validEmail(loginEmail)) return setMessage('Saisissez une adresse email valide.', true);
      setFormBusy(loginForm, true);
      try {
        const result = await request('/api/client/request-code', { method: 'POST', body: JSON.stringify({ email: loginEmail }) });
        codeWrap.hidden = false;
        loginSubmit.textContent = 'Vérifier et continuer';
        loginReset.hidden = false;
        loginForm.elements.email.readOnly = true;
        setMessage(result?.retryAfter ? 'Un code valide a déjà été envoyé. Utilisez le dernier code reçu.' : `Code envoyé à ${maskEmail(loginEmail)}.`, false, true);
        loginForm.elements.code.focus();
      } catch (error) {
        setMessage(errorText(error), true);
      } finally {
        setFormBusy(loginForm, false);
      }
      return;
    }
    if (code.length !== 6) return setMessage('Le code doit contenir 6 chiffres.', true);
    setFormBusy(loginForm, true);
    try {
      await request('/api/client/verify-code', { method: 'POST', body: JSON.stringify({ email: loginEmail, code }) });
      const session = await request('/api/client/session');
      if (!session?.client) throw new Error('session_missing');
      await continueFromClient(session.client, true);
    } catch (error) {
      setMessage(errorText(error), true);
      loginForm.elements.code.select();
    } finally {
      setFormBusy(loginForm, false);
    }
  }

  async function onRegister(event) {
    event.preventDefault();
    const fd = new FormData(registerForm);
    await startReservation({
      firstName: String(fd.get('firstName') || '').trim(),
      lastName: String(fd.get('lastName') || '').trim(),
      email: String(fd.get('email') || '').trim().toLowerCase(),
      phone: String(fd.get('phone') || '').trim(),
    }, registerForm);
  }

  async function onComplete(event) {
    event.preventDefault();
    const fd = new FormData(completeForm);
    await startReservation({
      firstName: String(fd.get('firstName') || '').trim(),
      lastName: String(fd.get('lastName') || '').trim(),
      email: String(fd.get('email') || '').trim().toLowerCase(),
      phone: String(fd.get('phone') || '').trim(),
    }, completeForm);
  }

  async function continueFromClient(client, automatic = false) {
    const names = splitName(client.fullName || client.name || '');
    const contact = {
      firstName: String(client.firstName || names.firstName || '').trim(),
      lastName: String(client.lastName || names.lastName || '').trim(),
      email: String(client.email || '').trim().toLowerCase(),
      phone: String(client.phone || '').trim(),
    };
    if (contact.firstName && contact.lastName && validEmail(contact.email) && contact.phone) {
      const sessionBox = $('#memberGateSessionV170');
      sessionBox.innerHTML = `<div class="member-gate-session-v170"><div><strong>Compte Neptune reconnu</strong><small>${escapeHtml(contact.email)}</small></div><span>Connexion active</span></div>`;
      await startReservation(contact, null, automatic);
      return;
    }
    showCompletion(contact);
    setLoading(false);
  }

  function showCompletion(contact) {
    loginForm.hidden = true;
    registerForm.hidden = true;
    completeForm.hidden = false;
    gate.querySelector('.member-gate-tabs-v170').hidden = true;
    const names = splitName(contact.firstName && contact.lastName ? `${contact.firstName} ${contact.lastName}` : '');
    completeForm.elements.firstName.value = contact.firstName || names.firstName || '';
    completeForm.elements.lastName.value = contact.lastName || names.lastName || '';
    completeForm.elements.email.value = contact.email || loginEmail || '';
    completeForm.elements.phone.value = contact.phone || '';
    setMessage('Compte reconnu. Complétez uniquement les informations manquantes pour continuer.', false, true);
    (completeForm.elements.phone.value ? completeForm.elements.firstName : completeForm.elements.phone).focus();
  }

  async function startReservation(contact, form, silent = false) {
    clearMessage();
    if (!contact.firstName || !contact.lastName || !validEmail(contact.email) || !contact.phone) {
      setMessage('Prénom, nom, email et téléphone sont nécessaires pour accéder à la réservation.', true);
      return;
    }
    if (form) setFormBusy(form, true); else setLoading(true);
    try {
      const result = await request('/api/reservation/prospect/start', {
        method: 'POST',
        body: JSON.stringify({ ...contact, accepted: true }),
      });
      if (!result?.token) throw new Error('reservation_token_missing');
      setMessage(silent ? 'Compte reconnu. Ouverture de votre réservation…' : 'Accès confirmé. Ouverture de votre réservation…', false, true);
      const target = new URL(location.href);
      target.searchParams.set('reservation_token', result.token);
      target.searchParams.delete('payment');
      location.replace(target.toString());
    } catch (error) {
      setLoading(false);
      if (form) setFormBusy(form, false);
      setMessage(errorText(error), true);
    }
  }

  function showTab(tab) {
    const login = tab !== 'register';
    gate.querySelectorAll('[data-gate-tab]').forEach((button) => {
      const active = button.dataset.gateTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    loginForm.hidden = !login;
    registerForm.hidden = login;
    completeForm.hidden = true;
    clearMessage();
    requestAnimationFrame(() => (login ? loginForm.elements.email : registerForm.elements.firstName)?.focus());
  }

  function resetLogin() {
    loginEmail = '';
    codeWrap.hidden = true;
    loginSubmit.textContent = 'Recevoir mon code';
    loginReset.hidden = true;
    loginForm.elements.email.readOnly = false;
    loginForm.elements.code.value = '';
    clearMessage();
    loginForm.elements.email.focus();
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `http_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setLoading(value) { gate.classList.toggle('is-loading', !!value); }
  function setFormBusy(form, value) { form?.querySelectorAll('button,input').forEach((node) => { if (!(node.name === 'email' && node.readOnly)) node.disabled = !!value; }); }
  function clearMessage() { messageNode.textContent = ''; messageNode.className = 'member-gate-message-v170'; }
  function setMessage(text, error = false, ok = false) { messageNode.textContent = text; messageNode.className = `member-gate-message-v170${error ? ' is-error' : ok ? ' is-ok' : ''}`; }
  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(value || '')); }
  function splitName(value) { const parts = String(value || '').trim().split(/\s+/u).filter(Boolean); return { firstName: parts.shift() || '', lastName: parts.join(' ') || '' }; }
  function maskEmail(value) { const [local = '', domain = ''] = String(value || '').split('@'); return `${local.slice(0, 2)}${local.length > 2 ? '•••' : ''}@${domain}`; }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/gu, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char])); }
  function errorText(error) {
    const code = String(error?.message || error || '');
    if (code === 'invalid_contact') return 'Vérifiez votre prénom, votre nom, votre email et votre téléphone.';
    if (code.includes('unauthorized') || code.includes('invalid_code') || code.includes('code')) return 'Le code est invalide ou expiré. Demandez-en un nouveau.';
    if (code.includes('rate') || code.includes('thrott')) return 'Trop de tentatives rapprochées. Utilisez le dernier code reçu puis réessayez.';
    return 'Impossible de valider votre accès pour le moment. Réessayez dans quelques instants.';
  }
})();