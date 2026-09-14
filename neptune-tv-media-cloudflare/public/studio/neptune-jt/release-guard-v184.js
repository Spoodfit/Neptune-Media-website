(() => {
  const EXPORT_ID = 'exportCsv';

  enforceStrictMinimumUi();
  new MutationObserver(enforceStrictMinimumUi).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.(`#${EXPORT_ID}`);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await exportSafeCsv(button);
  }, true);

  function enforceStrictMinimumUi() {
    for (const button of document.querySelectorAll('[data-edition-action="maintain"],[data-edition-action="unmaintain"]')) button.remove();
    for (const card of document.querySelectorAll('.jt-rule-card')) {
      const strong = card.querySelector('strong');
      const paragraph = card.querySelector('p');
      if (strong?.textContent?.trim() === 'Règle de maintien' && paragraph) {
        paragraph.textContent = 'À J-7, l’édition est maintenue uniquement à partir de 4 paiements confirmés. En dessous de ce seuil, elle est annulée automatiquement.';
      }
    }
  }

  async function exportSafeCsv(button) {
    const editionId = document.getElementById('editionSelect')?.value || '';
    if (!editionId || button.disabled) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Export…';
    try {
      const csrf = sessionStorage.getItem('neptune_csrf') || '';
      const response = await fetch(`/api/admin/neptune-jt-v183/dashboard?editionId=${encodeURIComponent(editionId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-CSRF-Token': csrf },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `http_${response.status}`);

      const edition = data.selectedEdition;
      const reservations = data.reservations || [];
      if (!edition || !reservations.length) throw new Error('Aucune donnée à exporter.');

      const columns = ['Prénom', 'Nom', 'E-mail', 'Téléphone', 'Entreprise', 'Fonction', 'Membre', 'Sujet', 'Contexte', 'Source', 'CTA', 'Statut', 'Montant payé TTC', 'Payé le', 'Parrainé par', 'Code parrainage'];
      const rows = reservations.map((row) => [
        row.firstName,
        row.lastName,
        row.email,
        row.phone,
        row.company,
        row.role,
        memberLabel(row.memberStatus),
        row.topic,
        row.topicContext,
        row.sourceLink,
        row.commercialCta,
        statusLabel(row.status),
        (Number(row.amountPaidCents || 0) / 100).toFixed(2),
        row.paidAt || '',
        [row.referrerFirstName, row.referrerLastName].filter(Boolean).join(' ') || row.referrerCompany || row.referredBy || '',
        row.referralCode,
      ]);
      const csv = '\ufeff' + [columns, ...rows].map((row) => row.map(csvCell).join(';')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `neptune-jt-${slug(edition.label)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      window.alert(error.message || 'Export impossible.');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/u.test(text.trimStart())) text = `'${text}`;
    return `"${text.replace(/"/gu, '""')}"`;
  }

  function memberLabel(value) {
    return value === 'member' ? 'Membre Neptune' : value === 'non_member' ? 'Non-membre · 1 mois inclus' : 'Statut à vérifier';
  }

  function statusLabel(status) {
    return ({ confirmed: 'Payé', payment_requested: 'Paiement demandé', pre_registered: 'Pré-réservé', cancelled_participant: 'Participation annulée', cancelled_event: 'Édition annulée', moved: 'Déplacé' })[status] || status || 'Inconnu';
  }

  function slug(value) {
    return String(value || 'edition').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80) || 'edition';
  }
})();
