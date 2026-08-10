const RELEASE = 'neptune-studio-operational-clarity-20260810-v91';
let frame = 0;

start();

function start() {
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

function boot() {
  document.body.dataset.operationalClarityRelease = RELEASE;
  document.addEventListener('click', interceptAmbiguousActions, true);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    simplifyPipeline();
    clarifyBilling();
    protectLegacyDetailAdvance();
  });
}

function simplifyPipeline() {
  for (const button of document.querySelectorAll('#pipeline [data-advance]')) {
    if (button.dataset.openDossierV91 === 'true') continue;
    button.dataset.openDossierV91 = 'true';
    button.removeAttribute('data-advance');
    button.textContent = 'Ouvrir le dossier';
    button.setAttribute('aria-label', 'Ouvrir le dossier et voir la prochaine action recommandée');
    button.title = 'Les validations se font dans le dossier pour éviter les erreurs.';
  }
}

function interceptAmbiguousActions(event) {
  const quickOpen = event.target.closest?.('#pipeline [data-open-dossier-v91="true"]');
  if (quickOpen) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = quickOpen.closest('[data-order-card]');
    if (card) card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return;
  }

  const billingButton = event.target.closest?.('[data-v91-open-payment-status]');
  if (billingButton) {
    event.preventDefault();
    document.querySelector('#clientDetail .tabs [data-detail-tab="tracking"]')?.click();
  }
}

function clarifyBilling() {
  const body = document.querySelector('#clientDialog[open] #detailBody');
  if (!body) return;
  const billingTab = document.querySelector('#clientDetail .tabs [data-detail-tab="billing"].active');
  if (!billingTab) return;

  for (const card of body.querySelectorAll('.finance-card')) {
    const label = card.querySelector('span');
    if (label?.textContent.trim() === 'Paiement client') label.textContent = 'Montant du dossier';
  }

  const financeCards = body.querySelector('.finance-cards');
  if (!financeCards || body.querySelector('.billing-clarity-v91')) return;
  const notice = document.createElement('section');
  notice.className = 'billing-clarity-v91';
  notice.innerHTML = `
    <div>
      <small>PAIEMENT CLIENT</small>
      <strong>Le montant affiché n’est pas une preuve de paiement.</strong>
      <p>Le statut d’encaissement est vérifié uniquement avec Stripe dans l’onglet Suivi.</p>
    </div>
    <button type="button" data-v91-open-payment-status>Voir le statut Stripe</button>`;
  financeCards.before(notice);
}

function protectLegacyDetailAdvance() {
  const button = document.querySelector('#clientDialog[open] #detailAdvance');
  const modernTracking = document.querySelector('#clientDialog[open] .dossier-v89-shell');
  if (!button || modernTracking) return;
  button.disabled = true;
  button.textContent = 'Chargement de la prochaine action…';
  button.setAttribute('aria-disabled', 'true');
}
