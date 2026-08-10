import { sendEmail } from './email-service.js';
import { sendWorkflowOutboxItem as sendLegacyWorkflowOutboxItem } from './portal-workflow-email-v5.js';

const CONTACT = 'contact@neptunebusiness.com';

export async function sendWorkflowOutboxItem(env, requestUrl, item = {}) {
  const key = String(item.messageKey || '');
  if (key.startsWith('journey_')) {
    const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
    const copy = journeyContent(requestUrl, item, payload);
    if (!copy) return { ok: false, error: 'unsupported_journey_email' };
    return sendEmail(env, {
      to: item.toEmail,
      subject: copy.subject,
      html: layout(copy.title, copy.html),
      text: strip(copy.html),
    });
  }
  if (!key.startsWith('passage_change_')) {
    return sendLegacyWorkflowOutboxItem(env, requestUrl, item);
  }

  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  const copy = passageChangeContent(requestUrl, item, payload);
  return sendEmail(env, {
    to: item.toEmail,
    subject: copy.subject,
    html: layout(copy.title, copy.html),
    text: strip(copy.html),
  });
}

function journeyContent(requestUrl, item, payload) {
  const key = String(item.messageKey || '');
  const clientName = payload.fullName || payload.company || 'Client Neptune Media';
  const greeting = `<p>Bonjour ${escapeHtml(firstName(clientName))},</p>`;
  if (key.includes('reservation_link')) {
    return {
      subject: 'Choisissez votre format · Neptune Media',
      title: 'Choisissez simplement votre format.',
      html: `${greeting}<p>Pour démarrer votre prochain passage Neptune Media, sélectionnez le format qui correspond à votre besoin. Cela prend quelques instants.</p>${button(payload.reservationUrl, 'Choisir mon format')}<p style="font-size:13px;color:#73798d">Si vous changez d’avis ensuite, Neptune pourra modifier le format dans votre dossier.</p>`,
    };
  }
  if (key.includes('payment_link')) {
    return {
      subject: `Paiement de votre passage · ${payload.format || 'Neptune Media'}`,
      title: 'Votre passage est prêt à être confirmé.',
      html: `${greeting}<p>Voici le lien de paiement sécurisé correspondant au format et à l’offre retenus.</p>${card('FORMAT', payload.format || 'Neptune Media')}${payload.paymentName ? card('OFFRE', payload.paymentName) : ''}${button(payload.paymentUrl, 'Payer mon passage')}<p style="font-size:13px;color:#73798d">Une fois le paiement confirmé par Stripe, le dossier se met à jour automatiquement.</p>`,
    };
  }
  if (key.includes('preparation_link')) {
    return {
      subject: 'Choisissez votre rendez-vous de préparation · Neptune Media',
      title: 'Réservez votre préparation en quelques clics.',
      html: `${greeting}<p>Choisissez le créneau qui vous convient pour préparer votre passage. Le rendez-vous sera ajouté à votre agenda.</p>${payload.filmingAt ? card('PASSAGE STUDIO', formatDate(payload.filmingAt)) : ''}${button(payload.preparationUrl, 'Choisir mon rendez-vous')}<p style="font-size:13px;color:#73798d">Vous pourrez retrouver les informations du rendez-vous dans votre espace Neptune.</p>`,
    };
  }
  if (key.includes('sources_received_client')) {
    return {
      subject: 'Vos vidéos ont bien été réceptionnées · Neptune Media',
      title: 'Nous avons bien reçu les vidéos du studio.',
      html: `${greeting}<p>Les fichiers de votre passage sont désormais chez Neptune. Le montage peut commencer.</p>${card('PASSAGE', payload.title || payload.format || 'Neptune Media')}<p>Vous n’avez rien à faire : nous vous préviendrons lorsque les livrables seront disponibles.</p>`,
    };
  }
  if (key.includes('filming_date_confirmed_client')) {
    return {
      subject: 'Votre date de passage est confirmée · Neptune Media',
      title: 'Votre passage est planifié.',
      html: `${greeting}${card('DATE DU PASSAGE', formatDate(payload.filmingAt))}${card('FORMAT', payload.format || 'Neptune Media')}<p>Les prochaines informations utiles seront centralisées dans votre espace client.</p>`,
    };
  }
  if (key.includes('force_majeure_supplier')) {
    return {
      subject: `Demande exceptionnelle de report · ${clientName}`,
      title: 'Demande de report pour force majeure',
      html: `<p><strong>${escapeHtml(clientName)}</strong>${payload.company ? ` · ${escapeHtml(payload.company)}` : ''}</p>${card('PASSAGE INITIAL', formatDate(payload.previousFilmingAt))}${card('FORMAT', payload.format || 'Neptune Media')}<div style="margin:18px 0;padding:16px;border-radius:14px;background:#fff4e8;color:#6b3d00"><strong>Motif exceptionnel</strong><br>${escapeHtml(payload.reason || 'Force majeure')}</div><p>Merci de considérer l’ancien créneau comme faisant l’objet d’une demande de report. Neptune reviendra vers vous avec une nouvelle proposition de date.</p>`,
    };
  }
  return null;
}

function passageChangeContent(requestUrl, item, payload) {
  const type = payload.recipientType || item.recipientType || 'admin';
  const clientName = payload.fullName || payload.company || item.clientEmail || 'Client Neptune Media';
  const passageName = payload.title || 'Passage Neptune Media';
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  const changeList = changes.length
    ? `<div style="margin:20px 0;border:1px solid #e4e7f2;border-radius:18px;overflow:hidden">${changes.map(changeRow).join('')}</div>`
    : '<p>Les informations du passage ont été actualisées.</p>';

  const action = payload.actionRequired
    ? '<div style="margin:18px 0;padding:16px;border-radius:14px;background:#fff4e8;color:#6b3d00"><strong>Une action est attendue.</strong><br>Consultez les informations ci-dessous et contactez Neptune en cas de difficulté.</div>'
    : '<p style="color:#60677d">Aucune action n’est nécessaire si ces informations sont correctes.</p>';

  if (type === 'client') {
    return {
      subject: `Mise à jour de votre passage · ${passageName}`,
      title: 'Votre passage a été mis à jour',
      html: `<p>Bonjour ${escapeHtml(firstName(clientName))},</p><p>Neptune Media a modifié une ou plusieurs informations importantes concernant votre passage.</p>${changeList}${action}${button(portalUrl(requestUrl, item.clientEmail), 'Voir mon passage')}`,
    };
  }

  if (type === 'supplier') {
    return {
      subject: `Modification studio · ${clientName}`,
      title: 'Informations du passage modifiées',
      html: `<p><strong>${escapeHtml(clientName)}</strong>${payload.company ? ` · ${escapeHtml(payload.company)}` : ''}</p><p>${escapeHtml(passageName)} · ${escapeHtml(payload.format || '')}</p>${changeList}${action}<p>Cette notification remplace les anciennes informations pour l’organisation du tournage.</p>`,
    };
  }

  return {
    subject: `Passage modifié · ${clientName}`,
    title: 'Le dossier client a été actualisé',
    html: `<p><strong>${escapeHtml(clientName)}</strong>${payload.company ? ` · ${escapeHtml(payload.company)}` : ''}</p><p>${escapeHtml(passageName)} · ${escapeHtml(payload.format || '')}</p>${changeList}${action}<p style="font-size:13px;color:#73798d">Modification effectuée depuis le Studio Admin${payload.actorEmail ? ` par ${escapeHtml(payload.actorEmail)}` : ''}.</p>`,
  };
}

function changeRow(change = {}) {
  return `<div style="padding:15px 17px;border-bottom:1px solid #edf0f7;background:#fff"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:#6756d9">${escapeHtml(change.label || change.field || 'Information')}</div><div style="display:grid;grid-template-columns:1fr 24px 1fr;gap:8px;align-items:center;margin-top:8px"><span style="color:#7a8094;text-decoration:line-through">${escapeHtml(change.before || 'Non renseigné')}</span><span style="text-align:center;color:#8a91a6">→</span><strong style="color:#11152b">${escapeHtml(change.after || 'Non renseigné')}</strong></div></div>`;
}

function button(url, label) {
  return url ? `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2);color:#fff;text-decoration:none;font-weight:800">${escapeHtml(label)}</a></p>` : '';
}

function card(label, value) {
  return `<div style="margin:18px 0;padding:16px;border-radius:14px;background:#f5f3ff"><small style="font-weight:800;color:#6756d9">${escapeHtml(label)}</small><p style="margin:7px 0 0;font-size:18px;font-weight:800">${escapeHtml(value || 'À confirmer')}</p></div>`;
}

function layout(title, content) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:34px;color:#11152b"><p style="letter-spacing:.16em;color:#6d55e8;font-weight:800">NEPTUNE MEDIA</p><h1 style="font-size:30px;line-height:1.08">${escapeHtml(title)}</h1>${content}<hr style="border:0;border-top:1px solid #e7e8ef;margin:30px 0"><p style="font-size:13px;color:#73798d">Neptune Media · <a href="mailto:${CONTACT}">${CONTACT}</a></p></div>`;
}

function portalUrl(requestUrl, email) {
  const url = new URL('/espace-client/', new URL(requestUrl).origin);
  if (email) url.searchParams.set('email', email);
  return url.toString();
}

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'À confirmer';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(date);
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/u)[0] || 'Bonjour';
}

function strip(value) {
  return String(value || '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, ' ')
    .trim();
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
