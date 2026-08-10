import { sendEmail } from './email-service.js';

const CONTACT = 'contact@neptunebusiness.com';

export async function sendCrmActionEmailV86(env, requestUrl, prepared = {}) {
  const action = prepared.action || '';
  const client = prepared.client || {};
  const order = prepared.order || {};
  const opportunity = prepared.opportunity || {};
  const origin = new URL(requestUrl).origin;
  let subject = '';
  let title = '';
  let intro = '';
  let buttonLabel = '';
  let buttonUrl = '';
  let detail = '';

  if (action === 'payment') {
    const payment = new URL(env.BOOKING_URL || 'https://media.neptunebusiness.com');
    payment.searchParams.set('reservation_token', prepared.token || '');
    payment.searchParams.set('utm_source', 'neptune_studio');
    if (opportunity.format) payment.searchParams.set('format', normalizedFormat(opportunity.format));
    subject = `Votre passage Neptune Media · ${money(opportunity.amountTotal, opportunity.currency)}`;
    title = 'Votre passage est prêt à être confirmé.';
    intro = 'Vous n’avez rien à préparer maintenant. Il vous reste simplement à finaliser votre réservation et votre paiement sécurisé.';
    detail = card('FORMAT', opportunity.format || 'Neptune Media') + card('MONTANT', money(opportunity.amountTotal, opportunity.currency));
    buttonLabel = 'Finaliser et payer mon passage';
    buttonUrl = payment.toString();
  } else if (action === 'preparation') {
    subject = 'Choisissez votre rendez-vous de préparation · Neptune Media';
    title = 'Choisissez simplement votre créneau de préparation.';
    intro = 'Cet échange de 15 à 30 minutes nous permet de préparer votre passage sans texte à apprendre ni travail supplémentaire de votre côté.';
    detail = card('PASSAGE', order.title || order.format || 'Neptune Media');
    buttonLabel = 'Choisir mon rendez-vous';
    buttonUrl = order.bookingUrl || env.PREPARATION_BOOKING_URL || portalUrl(origin, client.email);
  } else if (action === 'filming_preferences') {
    const preferences = new URL('/disponibilites-passage/', origin);
    preferences.searchParams.set('token', prepared.token || '');
    subject = 'Quand souhaitez-vous venir au studio ? · Neptune Media';
    title = 'Indiquez les créneaux qui vous conviennent.';
    intro = 'Choisissez jusqu’à trois disponibilités. Neptune vérifie ensuite le meilleur créneau avec le studio et vous confirme la date définitive.';
    detail = card('FORMAT', order.format || 'Neptune Media');
    buttonLabel = 'Choisir mes disponibilités';
    buttonUrl = preferences.toString();
  } else if (action === 'access') {
    subject = 'Votre passage Neptune Media est prêt';
    title = 'Tout est centralisé dans votre espace client.';
    intro = 'Vos rendez-vous, votre passage et les prochaines étapes restent accessibles au même endroit.';
    detail = card('PASSAGE', order.title || order.format || 'Neptune Media');
    buttonLabel = 'Ouvrir mon espace client';
    buttonUrl = portalUrl(origin, client.email);
  } else {
    return { ok: false, error: 'unsupported_crm_action' };
  }

  const greeting = client.fullName ? `<p>Bonjour ${e(firstName(client.fullName))},</p>` : '<p>Bonjour,</p>';
  const html = layout(title, `${greeting}<p>${e(intro)}</p>${detail}${button(buttonUrl, buttonLabel)}<p style="font-size:13px;color:#73798d">Si votre situation est particulière, répondez simplement à cet e-mail.</p>`);
  const text = strip(html);
  return sendEmail(env, { to: client.email, subject, html, text });
}

function portalUrl(origin, email) {
  const url = new URL('/espace-client/', origin);
  if (email) url.searchParams.set('email', email);
  return url.toString();
}
function normalizedFormat(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('hors')) return 'horsnorme';
  if (v.includes('libre')) return 'libre';
  return v.replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 60);
}
function money(cents, currency = 'eur') {
  const value = Number(cents || 0) / 100;
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(currency || 'eur').toUpperCase() }).format(value); }
  catch { return `${value.toFixed(2)} €`; }
}
function firstName(value) { return String(value || '').trim().split(/\s+/u)[0] || ''; }
function card(label, value) { return `<div style="margin:18px 0;padding:18px;border-radius:16px;background:#f5f3ff"><small style="font-weight:800;color:#6756d9">${e(label)}</small><p style="margin:7px 0 0;font-size:19px;font-weight:850">${e(value || 'À confirmer')}</p></div>`; }
function button(url, label) { return url ? `<p style="margin:24px 0"><a href="${e(url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2);color:#fff;text-decoration:none;font-weight:800">${e(label)}</a></p>` : ''; }
function layout(title, content) { return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:34px;color:#11152b"><p style="letter-spacing:.16em;color:#6d55e8;font-weight:800">NEPTUNE MEDIA</p><h1 style="font-size:30px;line-height:1.08">${e(title)}</h1>${content}<hr style="border:0;border-top:1px solid #e7e8ef;margin:30px 0"><p style="font-size:13px;color:#73798d">Neptune Media · <a href="mailto:${CONTACT}">${CONTACT}</a></p></div>`; }
function strip(value) { return String(value || '').replace(/<[^>]+>/gu, ' ').replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&#39;/gu, "'").replace(/&quot;/gu, '"').replace(/\s+/gu, ' ').trim(); }
function e(value) { return String(value || '').replace(/[&<>"']/gu, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]); }
