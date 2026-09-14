(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const API = '/api/admin/neptune-jt-v183';
  let csrf = sessionStorage.getItem('neptune_csrf') || '';
  let state = null;
  let selectedParticipantId = '';
  let loading = false;

  bindStatic();
  boot();

  async function boot() {
    try {
      const auth = await request('/api/auth/status', {}, false);
      if (!auth?.user) throw new Error('unauthorized');
      csrf = auth.csrfToken || csrf;
      if (csrf) sessionStorage.setItem('neptune_csrf', csrf);
      $('#accountName').textContent = auth.user.fullName || auth.user.email || 'Compte Studio';
      $('#accountRole').textContent = labelRole(auth.user.role);
      await load();
      $('#loading').hidden = true;
      $('#authGate').hidden = true;
      $('#app').hidden = false;
    } catch (error) {
      console.error('[Neptune JT Studio] boot failed', error);
      $('#loading').hidden = true;
      $('#app').hidden = true;
      $('#authGate').hidden = false;
    }
  }

  function bindStatic() {
    $('#refresh').addEventListener('click', () => load(state?.selectedEdition?.id));
    $('#editionSelect').addEventListener('change', (event) => load(event.target.value));
    $('#newEdition').addEventListener('click', () => openEditionDialog());
    $('#editEdition').addEventListener('click', () => openEditionDialog(state?.selectedEdition));
    $('#saveEdition').addEventListener('click', saveEdition);
    $('#exportCsv').addEventListener('click', exportCsv);
    $('#search').addEventListener('input', renderParticipants);
    $('#statusFilter').addEventListener('change', renderParticipants);
    $('#closeParticipant').addEventListener('click', () => $('#participantDialog').close());
    $('#logout').addEventListener('click', logout);
    $('#menuToggle').addEventListener('click', () => document.body.classList.toggle('jt-menu-open'));
    $('#backdrop').addEventListener('click', () => document.body.classList.remove('jt-menu-open'));
    $('#participantDialog').addEventListener('close', () => { selectedParticipantId = ''; });
  }

  async function request(url, options = {}, addCsrf = true) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (addCsrf && csrf) headers['X-CSRF-Token'] = csrf;
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `http_${response.status}`);
      error.payload = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function load(editionId = '') {
    if (loading) return;
    loading = true;
    $('#syncState').textContent = 'Synchronisation…';
    $('#refresh').disabled = true;
    try {
      const suffix = editionId ? `?editionId=${encodeURIComponent(editionId)}` : '';
      state = await request(`${API}/dashboard${suffix}`);
      render();
      $('#syncState').textContent = 'Synchronisé';
    } catch (error) {
      $('#syncState').textContent = 'Erreur de synchronisation';
      if (error.message === 'unauthorized' || error.status === 401) {
        $('#app').hidden = true;
        $('#authGate').hidden = false;
      } else toast(humanError(error.message), true);
    } finally {
      loading = false;
      $('#refresh').disabled = false;
    }
  }

  function render() {
    renderEditionSelect();
    renderEditionBanner();
    renderMetrics();
    renderParticipants();
    renderEditionControl();
    renderReferrals();
    const canEdit = Boolean(state?.canEdit);
    $('#newEdition').hidden = !canEdit;
    $('#editEdition').hidden = !canEdit || !state?.selectedEdition;
  }

  function renderEditionSelect() {
    const select = $('#editionSelect');
    const editions = state?.editions || [];
    select.innerHTML = editions.map((edition) => `<option value="${escapeHtml(edition.id)}" ${edition.id === state?.selectedEdition?.id ? 'selected' : ''}>${escapeHtml(edition.label)} · ${escapeHtml(statusLabel(edition.status))}${edition.id === state?.activeEditionId ? ' · ACTIVE' : ''}</option>`).join('') || '<option value="">Aucune édition</option>';
    select.disabled = !editions.length;
  }

  function renderEditionBanner() {
    const edition = state?.selectedEdition;
    const banner = $('#editionBanner');
    if (!edition) {
      banner.innerHTML = '<h2>Aucune édition Neptune JT</h2><p>Créez la première édition depuis le Studio.</p>';
      return;
    }
    const active = edition.id === state.activeEditionId;
    const deadline = edition.cutoffAt ? `Seuil vérifié le ${formatDate(edition.cutoffAt)}` : 'Date J-7 non définie';
    banner.innerHTML = `<h2>${escapeHtml(edition.label)}</h2><p>${escapeHtml(formatDate(edition.eventAt))} · ${escapeHtml(edition.location || 'Lieu à confirmer')}</p><div class="jt-banner-meta"><span class="${active ? 'active' : ''}">${active ? '● Édition active du tunnel' : 'Historique / autre édition'}</span><span>${escapeHtml(deadline)}</span><span>${escapeHtml(statusLabel(edition.status))}</span>${edition.forceMaintained ? '<span>Maintien manuel actif</span>' : ''}${edition.registrationsClosedAt ? '<span>Inscriptions fermées</span>' : ''}</div>`;
  }

  function renderMetrics() {
    const counts = state?.counts || {};
    const total = Number(counts.total || 0);
    const confirmed = Number(counts.confirmed || 0);
    const payment = Number(counts.paymentRequested || 0);
    const remaining = Math.max(0, 6 - total);
    $('#metrics').innerHTML = [
      metric(`${total}/4`, 'Seuil participants', `${Math.min(100, (total / 4) * 100)}%`, total >= 4 ? 'Seuil de pré-réservation atteint' : `${Math.max(0, 4 - total)} personne(s) à trouver`),
      metric(`${confirmed}/4`, 'Paiements confirmés', `${Math.min(100, (confirmed / 4) * 100)}%`, confirmed >= 4 ? 'Édition financièrement maintenue' : `${Math.max(0, 4 - confirmed)} paiement(s) manquant(s)`),
      metric(String(remaining), 'Places restantes', `${Math.min(100, (total / 6) * 100)}%`, `${payment} paiement(s) en attente`),
      metric(euro.format(Number(counts.revenueCents || 0) / 100), 'CA encaissé', `${Math.min(100, (confirmed / 6) * 100)}%`, `${Number(counts.paidEver || 0)} règlement(s) Stripe`),
    ].join('');
  }

  function metric(value, label, width, detail) {
    return `<article class="jt-metric"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p><div class="jt-progress"><i style="width:${escapeHtml(width)}"></i></div></article>`;
  }

  function filteredReservations() {
    const query = ($('#search').value || '').trim().toLowerCase();
    const status = $('#statusFilter').value;
    return (state?.reservations || []).filter((reservation) => {
      if (status && reservation.status !== status) return false;
      if (!query) return true;
      const haystack = [reservation.firstName, reservation.lastName, reservation.email, reservation.company, reservation.role, reservation.topic, reservation.topicContext].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderParticipants() {
    if (!state) return;
    const reservations = filteredReservations();
    const all = state.reservations || [];
    $('#participantsSummary').textContent = `${all.length} dossier${all.length > 1 ? 's' : ''} · ${Number(state.counts?.confirmed || 0)} paiement${Number(state.counts?.confirmed || 0) > 1 ? 's' : ''} confirmé${Number(state.counts?.confirmed || 0) > 1 ? 's' : ''}`;
    $('#participantRows').innerHTML = reservations.map((reservation) => {
      const referrer = [reservation.referrerFirstName, reservation.referrerLastName].filter(Boolean).join(' ') || reservation.referrerCompany || '';
      return `<tr>
        <td><div class="jt-person"><strong>${escapeHtml(`${reservation.firstName} ${reservation.lastName}`)}</strong><small>${escapeHtml(reservation.company || reservation.email)}</small></div></td>
        <td><div class="jt-topic"><strong>${escapeHtml(reservation.topic || 'Sujet à préciser')}</strong><small>${escapeHtml(reservation.role || reservation.topicContext || '')}</small></div></td>
        <td>${statusPill(reservation.status)}</td>
        <td>${referrer ? `<div class="jt-person"><strong>${escapeHtml(referrer)}</strong><small>via ${escapeHtml(reservation.referredBy || '')}</small></div>` : '<span style="color:#98a2b3">Direct</span>'}</td>
        <td><strong>${Number(reservation.amountPaidCents || 0) ? escapeHtml(euro.format(Number(reservation.amountPaidCents) / 100)) : '—'}</strong></td>
        <td><button class="jt-row-action" type="button" data-open-participant="${escapeHtml(reservation.id)}">Ouvrir</button></td>
      </tr>`;
    }).join('');
    $('#emptyParticipants').hidden = reservations.length > 0;
    $$('[data-open-participant]').forEach((button) => button.addEventListener('click', () => openParticipant(button.dataset.openParticipant)));
  }

  function renderEditionControl() {
    const edition = state?.selectedEdition;
    const holder = $('#editionControl');
    if (!edition) { holder.innerHTML = '<p class="jt-empty">Aucune édition sélectionnée.</p>'; return; }
    if (!state.canEdit) { holder.innerHTML = '<p class="jt-empty">Votre rôle permet la consultation uniquement.</p>'; return; }
    const active = edition.id === state.activeEditionId;
    const closed = Boolean(edition.registrationsClosedAt);
    holder.innerHTML = `
      ${active ? '' : '<button class="jt-btn jt-btn--primary" data-edition-action="activate" type="button">Définir comme édition active</button>'}
      <button class="jt-btn jt-btn--ghost" data-edition-action="${closed ? 'reopen' : 'close'}" type="button">${closed ? 'Réouvrir les inscriptions' : 'Fermer les inscriptions'}</button>
      <button class="jt-btn ${edition.forceMaintained ? 'jt-btn--ghost' : 'jt-btn--warning'}" data-edition-action="${edition.forceMaintained ? 'unmaintain' : 'maintain'}" type="button">${edition.forceMaintained ? 'Retirer le maintien manuel' : 'Maintenir manuellement l’édition'}</button>
      ${edition.status !== 'cancelled' && edition.status !== 'archived' ? '<button class="jt-btn jt-btn--danger" data-edition-action="cancel" type="button">Annuler l’édition</button>' : ''}
      ${edition.status === 'cancelled' ? '<button class="jt-btn jt-btn--ghost" data-edition-action="archive" type="button">Archiver l’édition</button>' : ''}`;
    $$('[data-edition-action]', holder).forEach((button) => button.addEventListener('click', () => editionAction(button.dataset.editionAction, button)));
  }

  function renderReferrals() {
    const reservations = (state?.reservations || []).filter((reservation) => reservation.referredBy);
    const holder = $('#referralList');
    if (!reservations.length) {
      holder.innerHTML = '<div class="jt-empty"><strong>Aucun parrainage attribué pour le moment.</strong><span>Les liens personnels du tunnel seront comptabilisés ici.</span></div>';
      return;
    }
    const grouped = new Map();
    for (const reservation of reservations) {
      const label = [reservation.referrerFirstName, reservation.referrerLastName].filter(Boolean).join(' ') || reservation.referrerCompany || reservation.referredBy;
      const entry = grouped.get(label) || { label, count: 0, companies: [] };
      entry.count += 1;
      if (reservation.company && !entry.companies.includes(reservation.company)) entry.companies.push(reservation.company);
      grouped.set(label, entry);
    }
    holder.innerHTML = [...grouped.values()].sort((a, b) => b.count - a.count).map((entry) => `<article class="jt-referral"><strong>${escapeHtml(entry.label)}</strong><span>${entry.count} participant${entry.count > 1 ? 's' : ''} apporté${entry.count > 1 ? 's' : ''}</span><span>${escapeHtml(entry.companies.slice(0, 3).join(' · '))}</span></article>`).join('');
  }

  function openEditionDialog(edition = null) {
    if (!state?.canEdit) return;
    const form = $('#editionForm');
    form.reset();
    form.elements.id.value = edition?.id || '';
    form.elements.label.value = edition?.label || '';
    form.elements.eventAt.value = edition?.eventAt ? toLocalInput(edition.eventAt) : '';
    form.elements.location.value = edition?.location || 'REC BOX Studio · 11 Allée de Longueterre, 31850 Montrabé';
    form.elements.paymentLink.value = edition?.paymentLink || state?.paymentLinkFallback || 'https://buy.stripe.com/bJe28rcdngXw0586qi73G0d';
    form.elements.notes.value = edition?.notes || '';
    form.elements.activate.checked = !edition || edition.id === state?.activeEditionId;
    $('#editionDialogTitle').textContent = edition ? 'Modifier l’édition' : 'Nouvelle édition';
    $('#editionDialog').showModal();
  }

  async function saveEdition() {
    if (!state?.canEdit) return;
    const form = $('#editionForm');
    if (!form.reportValidity()) return;
    const button = $('#saveEdition');
    button.disabled = true;
    try {
      const payload = {
        id: form.elements.id.value || undefined,
        label: form.elements.label.value.trim(),
        eventAt: new Date(form.elements.eventAt.value).toISOString(),
        location: form.elements.location.value.trim(),
        paymentLink: form.elements.paymentLink.value.trim(),
        notes: form.elements.notes.value.trim(),
        activate: form.elements.activate.checked,
      };
      const result = await request(`${API}/edition`, { method: 'POST', body: JSON.stringify(payload) });
      $('#editionDialog').close();
      toast(payload.id ? 'Édition mise à jour.' : 'Nouvelle édition créée.');
      await load(result.edition?.id || payload.id || '');
    } catch (error) {
      toast(humanError(error.message), true);
    } finally {
      button.disabled = false;
    }
  }

  async function editionAction(action, button) {
    if (!state?.canEdit || !state?.selectedEdition) return;
    const edition = state.selectedEdition;
    const counts = state.counts || {};
    let confirmPaidRisk = false;
    if (action === 'cancel') {
      const paid = Number(counts.confirmed || 0);
      const message = paid
        ? `Cette édition comporte ${paid} paiement(s) confirmé(s). L’annulation déclenchera les notifications et signalera les remboursements à traiter. Continuer ?`
        : 'Annuler cette édition et prévenir les participants ?';
      if (!window.confirm(message)) return;
      confirmPaidRisk = paid > 0;
    }
    if (action === 'maintain' && !window.confirm('Maintenir manuellement cette édition même si le seuil de 4 paiements n’est pas atteint à J-7 ?')) return;
    if (action === 'archive' && !window.confirm('Archiver définitivement cette édition ?')) return;
    button.disabled = true;
    try {
      await request(`${API}/edition-action`, { method: 'POST', body: JSON.stringify({ editionId: edition.id, action, confirmPaidRisk }) });
      toast(actionMessage(action));
      await load(action === 'cancel' ? '' : edition.id);
    } catch (error) {
      toast(humanError(error.message), true);
      button.disabled = false;
    }
  }

  function openParticipant(id) {
    const reservation = (state?.reservations || []).find((item) => item.id === id);
    if (!reservation) return;
    selectedParticipantId = id;
    $('#participantTitle').textContent = `${reservation.firstName} ${reservation.lastName}`;
    const website = safeHttpUrl(reservation.website);
    const source = safeHttpUrl(reservation.sourceLink);
    const referrer = [reservation.referrerFirstName, reservation.referrerLastName].filter(Boolean).join(' ') || reservation.referrerCompany || reservation.referredBy || 'Direct';
    const otherEditions = (state.editions || []).filter((edition) => edition.id !== reservation.editionId && !['cancelled', 'archived'].includes(edition.status));
    const canMove = state.canEdit && reservation.status !== 'confirmed' && Number(reservation.amountPaidCents || 0) === 0 && otherEditions.length;
    const canResend = state.canEdit && ['pre_registered', 'payment_requested', 'confirmed'].includes(reservation.status);
    const canCancel = state.canEdit && ['pre_registered', 'payment_requested', 'confirmed'].includes(reservation.status);
    $('#participantDetail').innerHTML = `<div class="jt-detail-grid">
      ${detail('Coordonnées', `<strong>${escapeHtml(reservation.email)}</strong><p>${escapeHtml(reservation.phone || 'Téléphone non renseigné')}</p>`)}
      ${detail('Entreprise', `<strong>${escapeHtml(reservation.company || '—')}</strong><p>${escapeHtml(reservation.role || 'Fonction non renseignée')}</p>`)}
      ${detail('Adhésion', `<strong>${escapeHtml(memberLabel(reservation.memberStatus))}</strong><p>${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">Ouvrir le site ↗</a>` : 'Aucun site renseigné'}</p>`)}
      ${detail('Paiement', `<strong>${escapeHtml(statusLabel(reservation.status))}</strong><p>${Number(reservation.amountPaidCents || 0) ? escapeHtml(euro.format(Number(reservation.amountPaidCents) / 100)) : 'Aucun encaissement'}${reservation.paidAt ? ` · ${escapeHtml(formatDate(reservation.paidAt))}` : ''}</p>`)}
      ${detail('Sujet proposé', `<strong>${escapeHtml(reservation.topic || '—')}</strong><p>${escapeHtml(reservation.topicContext || 'Aucun contexte complémentaire.')}</p>`, true)}
      ${detail('Source / actualité', source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener">${escapeHtml(reservation.sourceLink)} ↗</a>` : '<p>Aucune source fournie.</p>', true)}
      ${detail('CTA commercial', `<p>${escapeHtml(reservation.commercialCta || 'À définir pendant la préparation.')}</p>`, true)}
      ${detail('Parrainage', `<strong>${escapeHtml(referrer)}</strong><p>Code personnel : ${escapeHtml(reservation.referralCode || '—')}</p>`)}
      ${detail('Stripe', `<strong>${escapeHtml(reservation.stripeSessionId || 'Aucune session')}</strong><p>${escapeHtml(reservation.stripePaymentIntentId || '')}</p>`)}
      <div class="jt-detail-actions">
        ${canResend ? '<button class="jt-btn jt-btn--ghost" id="resendParticipant" type="button">Renvoyer l’e-mail utile</button>' : ''}
        ${canCancel ? `<button class="jt-btn jt-btn--danger" id="cancelParticipant" type="button">${reservation.status === 'confirmed' ? 'Annuler · remboursement à traiter' : 'Annuler la participation'}</button>` : ''}
        ${canMove ? `<div class="jt-move"><select id="moveEdition">${otherEditions.map((edition) => `<option value="${escapeHtml(edition.id)}">${escapeHtml(edition.label)}</option>`).join('')}</select><button class="jt-btn jt-btn--ghost" id="moveParticipant" type="button">Déplacer</button></div>` : ''}
      </div>
    </div>`;
    $('#resendParticipant')?.addEventListener('click', (event) => participantAction('resend', event.currentTarget));
    $('#cancelParticipant')?.addEventListener('click', (event) => participantAction('cancel', event.currentTarget));
    $('#moveParticipant')?.addEventListener('click', (event) => participantAction('move', event.currentTarget, $('#moveEdition').value));
    $('#participantDialog').showModal();
  }

  function detail(label, html, wide = false) {
    return `<article class="jt-detail-card ${wide ? 'jt-detail-card--wide' : ''}"><small>${escapeHtml(label)}</small>${html}</article>`;
  }

  async function participantAction(action, button, targetEditionId = '') {
    const reservation = (state?.reservations || []).find((item) => item.id === selectedParticipantId);
    if (!reservation) return;
    let confirmPaidRisk = false;
    if (action === 'cancel') {
      if (reservation.status === 'confirmed' || Number(reservation.amountPaidCents || 0) > 0) {
        if (!window.confirm('Ce participant a payé. L’annulation ne rembourse pas automatiquement Stripe : elle signale le dossier financier à traiter. Continuer ?')) return;
        confirmPaidRisk = true;
      } else if (!window.confirm('Annuler cette pré-réservation ?')) return;
    }
    if (action === 'move' && !window.confirm('Déplacer ce participant vers l’édition sélectionnée ? Son statut de paiement sera recalculé selon la nouvelle édition.')) return;
    button.disabled = true;
    try {
      await request(`${API}/reservation-action`, { method: 'POST', body: JSON.stringify({ reservationId: reservation.id, action, targetEditionId, confirmPaidRisk }) });
      toast(action === 'resend' ? 'E-mail renvoyé.' : action === 'move' ? 'Participant déplacé.' : 'Participation annulée.');
      $('#participantDialog').close();
      await load(state?.selectedEdition?.id || '');
    } catch (error) {
      toast(humanError(error.message), true);
      button.disabled = false;
    }
  }

  function exportCsv() {
    const edition = state?.selectedEdition;
    const reservations = state?.reservations || [];
    if (!edition || !reservations.length) { toast('Aucune donnée à exporter.', true); return; }
    const columns = ['Prénom', 'Nom', 'E-mail', 'Téléphone', 'Entreprise', 'Fonction', 'Membre', 'Sujet', 'Contexte', 'Source', 'CTA', 'Statut', 'Montant payé TTC', 'Payé le', 'Parrainé par', 'Code parrainage'];
    const rows = reservations.map((r) => [r.firstName, r.lastName, r.email, r.phone, r.company, r.role, memberLabel(r.memberStatus), r.topic, r.topicContext, r.sourceLink, r.commercialCta, statusLabel(r.status), (Number(r.amountPaidCents || 0) / 100).toFixed(2), r.paidAt || '', [r.referrerFirstName, r.referrerLastName].filter(Boolean).join(' ') || r.referrerCompany || r.referredBy || '', r.referralCode]);
    const csv = '\ufeff' + [columns, ...rows].map((row) => row.map(csvCell).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `neptune-jt-${slug(edition.label)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }, false); } catch {}
    sessionStorage.removeItem('neptune_csrf');
    location.replace('/studio/');
  }

  function statusPill(status) {
    const map = {
      confirmed: ['jt-pill--paid', 'Payé'],
      payment_requested: ['jt-pill--payment', 'Paiement demandé'],
      pre_registered: ['jt-pill--pre', 'Pré-réservé'],
      cancelled_participant: ['jt-pill--cancel', 'Annulé'],
      cancelled_event: ['jt-pill--cancel', 'Édition annulée'],
      moved: ['jt-pill--cancel', 'Déplacé'],
    };
    const entry = map[status] || ['jt-pill--cancel', status || 'Inconnu'];
    return `<span class="jt-pill ${entry[0]}">${escapeHtml(entry[1])}</span>`;
  }

  function statusLabel(status) {
    return ({ collecting: 'Pré-réservations ouvertes', payment_open: 'Paiement ouvert', confirmed: 'Édition maintenue', cancelled: 'Édition annulée', archived: 'Archivée', pre_registered: 'Pré-réservé', payment_requested: 'Paiement demandé', cancelled_participant: 'Participation annulée', cancelled_event: 'Édition annulée', moved: 'Déplacé' })[status] || status || 'Inconnu';
  }

  function memberLabel(value) { return value === 'member' ? 'Membre Neptune' : value === 'non_member' ? 'Non-membre · 1 mois inclus' : 'Statut à vérifier'; }
  function labelRole(role) { return ({ admin: 'Administrateur', editor: 'Éditeur', analyst: 'Analyste' })[role] || role || 'Studio'; }
  function formatDate(value) { if (!value) return 'Date à confirmer'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date à confirmer' : dateTime.format(date); }
  function toLocalInput(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
  function csvCell(value) { return `"${String(value ?? '').replace(/"/gu, '""')}"`; }
  function slug(value) { return String(value || 'edition').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80) || 'edition'; }
  function safeHttpUrl(value) { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } }

  function actionMessage(action) {
    return ({ activate: 'Édition définie comme active.', close: 'Inscriptions fermées.', reopen: 'Inscriptions réouvertes.', maintain: 'Maintien manuel activé.', unmaintain: 'Maintien manuel retiré.', cancel: 'Édition annulée. Notifications lancées.', archive: 'Édition archivée.' })[action] || 'Mise à jour enregistrée.';
  }

  function humanError(code) {
    const map = {
      unauthorized: 'Votre session Studio a expiré.',
      csrf_failed: 'La session de sécurité a expiré. Actualisez la page.',
      forbidden: 'Votre rôle ne permet pas cette action.',
      edition_fields_invalid: 'Vérifiez le nom, la date, le lieu et le lien Stripe.',
      edition_not_found: 'Édition introuvable.',
      archived_edition_read_only: 'Une édition archivée ne peut plus être modifiée.',
      paid_participants_require_refund_confirmation: 'Des participants ont payé. Confirmez explicitement la gestion des remboursements.',
      paid_reservation_requires_refund_confirmation: 'Ce participant a payé. Le remboursement doit être traité volontairement.',
      paid_reservation_cannot_be_moved_automatically: 'Un participant payé ne peut pas être déplacé automatiquement.',
      target_edition_full_or_closed: 'L’édition cible est complète ou fermée.',
      target_edition_duplicate_email: 'Cette personne est déjà inscrite sur l’édition cible.',
      cutoff_already_reached: 'Le cutoff J-7 est déjà atteint.',
      active_reservations_prevent_archive: 'Cette édition contient encore des réservations actives.',
      reservation_message_not_available: 'Aucun e-mail automatique n’est disponible pour ce statut.',
    };
    return map[code] || `Impossible de terminer l’action (${code}).`;
  }

  function toast(message, error = false) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.toggle('error', error);
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 4200);
  }
})();
