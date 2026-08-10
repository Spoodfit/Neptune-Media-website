import { sendEmail } from './email-service.js';
import { sendCrmActionEmailV86 } from './portal-crm-email-v86.js';

export async function sendCrmActionEmailV90(env, requestUrl, prepared = {}) {
  if (prepared.action !== 'payment') return sendCrmActionEmailV86(env, requestUrl, prepared);
  const client = prepared.client || {};
  const opportunity = prepared.opportunity || {};
  const paymentUrl = String(prepared.paymentUrl || '').trim();
  if (!paymentUrl) return { ok: false, error: 'stripe_payment_link_missing' };

  const amount = money(opportunity.amountTotal, opportunity.currency);
  const format = opportunity.format || 'Neptune Media';
  const firstName = String(client.fullName || '').trim().split(/\s+/u)[0] || '';
  const greeting = firstName ? `Bonjour ${escapeHtml(firstName)},` : 'Bonjour,';
  const subject = `Votre passage Neptune Media · ${amount}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:34px;color:#11152b">
      <p style="letter-spacing:.16em;color:#6d55e8;font-weight:800">NEPTUNE MEDIA</p>
      <h1 style="font-size:30px;line-height:1.08">Votre passage est prêt à être confirmé.</h1>
      <p>${greeting}</p>
      <p>Le paiement est sécurisé directement par Stripe. Une fois le règlement confirmé, votre dossier Neptune se met à jour automatiquement.</p>
      ${card('FORMAT', format)}
      ${card('MONTANT', amount)}
      <p style="margin:24px 0"><a href="${escapeHtml(paymentUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2);color:#fff;text-decoration:none;font-weight:800">Payer et confirmer mon passage</a></p>
      <p style="font-size:13px;color:#73798d">Le lien est associé à votre dossier pour éviter les rapprochements manuels.</p>
      <hr style="border:0;border-top:1px solid #e7e8ef;margin:30px 0">
      <p style="font-size:13px;color:#73798d">Neptune Media · <a href="mailto:contact@neptunebusiness.com">contact@neptunebusiness.com</a></p>
    </div>`;
  const text = `Votre passage Neptune Media est prêt à être confirmé. Format : ${format}. Montant : ${amount}. Paiement Stripe : ${paymentUrl}`;
  return sendEmail(env, { to: client.email, subject, html, text });
}

function money(cents, currency = 'eur') {
  const value = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: String(currency || 'eur').toUpperCase(),
    }).format(value);
  } catch {
    return `${value.toFixed(2)} €`;
  }
}

function card(label, value) {
  return `<div style="margin:18px 0;padding:18px;border-radius:16px;background:#f5f3ff"><small style="font-weight:800;color:#6756d9">${escapeHtml(label)}</small><p style="margin:7px 0 0;font-size:19px;font-weight:850">${escapeHtml(value || 'À confirmer')}</p></div>`;
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
