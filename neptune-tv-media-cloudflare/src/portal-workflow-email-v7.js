import { sendEmail } from './email-service.js';
import { sendWorkflowOutboxItem as sendPreviousWorkflowOutboxItem } from './portal-workflow-email-v6.js';

const CONTACT = 'contact@neptunebusiness.com';

export async function sendWorkflowOutboxItem(env, requestUrl, item = {}) {
  if (!String(item.messageKey || '').startsWith('change_request_')) {
    return sendPreviousWorkflowOutboxItem(env, requestUrl, item);
  }

  const payload = object(item.payload);
  const copy = changeRequestContent(requestUrl, item, payload);
  const result = await sendEmail(env, {
    to: item.toEmail,
    subject: copy.subject,
    html: layout(copy.title, copy.html),
    text: strip(copy.html),
    idempotencyKey: `change-request/${item.id || item.messageKey || crypto.randomUUID()}`,
  });
  return { ...result, subject: copy.subject };
}

function changeRequestContent(requestUrl, item, payload) {
  const template = payload.template || '';
  const client = payload.fullName || payload.company || 'Client Neptune Media';
  const passage = payload.title || 'Passage Neptune Media';
  const requestedAt = payload.requestedValue?.requestedAt;
  const currentAt = payload.requestedValue?.currentAt;
  const proposedAt = payload.proposedAt || payload.proposedValue?.proposedAt;
  const finalAt = payload.finalAt || requestedAt || proposedAt;
  const reason = payload.reason ? detail('Motif', payload.reason) : '';
  const format = payload.targetFormat || payload.format || '';
  const decor = payload.decorLabel || '';
  const decorImage = publicUrl(requestUrl, payload.decorImage || '');
  const brief = payload.conceptBrief ? detail('Brief du concept', payload.conceptBrief) : '';
  const requestLabel = typeLabel(payload.requestType);

  if (template === 'supplier_filming_date_request') {
    const yesUrl = supplierUrl(requestUrl, payload.supplierToken, 'confirm');
    const alternateUrl = supplierUrl(requestUrl, payload.supplierToken, 'alternate');
    return {
      subject: `${payload.reminder ? 'Relance · ' : ''}Modification de date · ${client}`,
      title: 'Le client demande une nouvelle date',
      html: `
        <p><strong>${escapeHtml(client)}</strong>${payload.company ? ` · ${escapeHtml(payload.company)}` : ''}</p>
        <p>${escapeHtml(passage)} · ${escapeHtml(payload.format || '')}</p>
        ${dateComparison(currentAt, requestedAt)}
        ${reason}
        <p>Le créneau actuel reste inchangé tant que la nouvelle date n’a pas été confirmée.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:24px 0">
          ${button(yesUrl, 'Oui, cette date est possible')}
          ${button(alternateUrl, 'Proposer une autre date', true)}
        </div>
        <p style="font-size:13px;color:#73798d">Les boutons ouvrent un écran de validation. Un clic automatique d’un scanner d’e-mail ne modifie pas le rendez-vous.</p>`,
    };
  }

  if (template === 'supplier_format_approved') {
    return {
      subject: `Préparation studio modifiée · ${client}`,
      title: 'Nouveau format et décor à préparer',
      html: `
        <p><strong>${escapeHtml(client)}</strong>${payload.company ? ` · ${escapeHtml(payload.company)}` : ''}</p>
        ${detail('Format validé', format)}
        ${detail('Décor choisi', decor)}
        ${payload.filmingAt ? detail('Passage', date(payload.filmingAt)) : ''}
        ${payload.appointmentAt ? detail('Préparation client', date(payload.appointmentAt)) : ''}
        ${decorImage ? `<img src="${escapeHtml(decorImage)}" alt="${escapeHtml(decor)}" style="display:block;width:100%;max-width:560px;margin:20px 0;border-radius:18px;border:1px solid #e5e7f0">` : ''}
        ${brief}
        <div style="margin:18px 0;padding:16px;border-radius:14px;background:#f2efff;color:#2c235e">
          <strong>Éléments de préparation studio</strong><br>
          Préparer l’implantation correspondant au décor ci-dessus, vérifier le mobilier, les écrans, les axes caméra, les sources lumineuses et l’espace nécessaire au concept.
        </div>
        <p>Cette demande a été validée par Neptune Media. Elle remplace le format précédemment prévu.</p>`,
    };
  }

  const copies = {
    admin_request_received: {
      subject: `Nouvelle demande client · ${requestLabel} · ${client}`,
      title: 'Une demande doit être traitée',
      body: `<p><strong>${escapeHtml(client)}</strong>${payload.company ? ` · ${escapeHtml(payload.company)}` : ''}</p>${summary(payload)}${reason}${button(studioUrl(requestUrl, payload.orderId), 'Traiter dans le Studio')}`,
    },
    client_request_received: {
      subject: `Demande reçue · ${requestLabel}`,
      title: 'Votre demande a bien été transmise',
      body: `<p>Bonjour ${escapeHtml(firstName(client))},</p>${summary(payload)}<p>Neptune Media va vérifier votre demande avant toute modification. Les informations actuellement confirmées restent valables jusque-là.</p>${button(clientUrl(requestUrl), 'Suivre ma demande')}`,
    },
    client_request_forwarded: {
      subject: 'Votre demande de date a été transmise au studio',
      title: 'Le studio vérifie la nouvelle date',
      body: `<p>Bonjour ${escapeHtml(firstName(client))},</p>${dateComparison(currentAt, requestedAt)}<p>Le fournisseur peut confirmer cette date ou proposer un autre créneau. Votre date actuelle reste réservée jusqu’à la confirmation.</p>${button(clientUrl(requestUrl), 'Suivre ma demande')}`,
    },
    client_request_rejected: {
      subject: `Demande non retenue · ${requestLabel}`,
      title: 'Votre demande ne peut pas être acceptée',
      body: `<p>Bonjour ${escapeHtml(firstName(client))},</p>${summary(payload)}${payload.note ? detail('Réponse de Neptune Media', payload.note) : ''}<p>Les informations déjà confirmées restent inchangées.</p>${button(clientUrl(requestUrl), 'Voir mon passage')}`,
    },
    client_preparation_approved: {
      subject: 'Nouveau rendez-vous de préparation confirmé',
      title: 'Votre préparation a été reprogrammée',
      body: `<p>Bonjour ${escapeHtml(firstName(client))},</p>${detail('Nouvelle date', date(payload.finalAt))}${payload.meetingUrl ? button(payload.meetingUrl, 'Ouvrir le rendez-vous') : ''}${button(clientUrl(requestUrl), 'Voir mon passage')}`,
    },
    client_format_approved: {
      subject: `Format modifié · ${format}`,
      title: 'Votre nouveau format est validé',
      body: `<p>Bonjour ${escapeHtml(firstName(client))},</p>${detail('Format', format)}${detail('Décor', decor)}${decorImage ? `<img src="${escapeHtml(decorImage)}" alt="${escapeHtml(decor)}" style="display:block;width:100%;max-width:560px;margin:20px 0;border-radius:18px;border:1px solid #e5e7f0">` : ''}<p>Le fournisseur a reçu les éléments nécessaires à la préparation du studio.</p>${button(clientUrl(requestUrl), 'Voir mon passage')}`,
    },
    client_supplier_confirmed: {
      subject: 'Votre nouvelle date de passage est confirmée',
      title: 'La modification de date est validée',
      body: `<p>Bonjour ${escapeHtml(firstName(client))},</p>${detail('Nouvelle date confirmée', date(finalAt))}<p>L’ancienne date n’est plus applicable.</p>${button(clientUrl(requestUrl), 'Voir mon passage')}`,
    },
    admin_supplier_confirmed: {
      subject: `Nouvelle date confirmée · ${client}`,
      title: 'Le fournisseur a confirmé la demande',
      body: `<p><strong>${escapeHtml(client)}</strong></p>${detail('Date confirmée', date(finalAt))}${button(studioUrl(requestUrl, payload.orderId), 'Ouvrir le dossier')}`,
    },
    supplier_confirmed_ack: {
      subject: `Confirmation enregistrée · ${client}`,
      title: 'La nouvelle date est enregistrée',
      body: `<p><strong>${escapeHtml(client)}</strong></p>${detail('Date définitive', date(finalAt))}<p>Le client et Neptune Media ont été informés.</p>`,
    },
    client_supplier_alternate: {
      subject: 'Le studio propose une autre date',
      title: 'Une nouvelle date vous est proposée',
      body: `<p>Bonjour ${escapeHtml(firstName(client))},</p>${dateComparison(requestedAt, proposedAt)}${payload.supplierNote ? detail('Message du studio', payload.supplierNote) : ''}<p>Confirmez ou refusez cette proposition depuis votre espace client.</p>${button(clientUrl(requestUrl), 'Répondre à la proposition')}`,
    },
    admin_supplier_alternate: {
      subject: `Autre date proposée · ${client}`,
      title: 'Le studio propose un autre créneau',
      body: `<p><strong>${escapeHtml(client)}</strong></p>${dateComparison(requestedAt, proposedAt)}<p>Le client peut accepter ou refuser directement depuis son espace.</p>${button(studioUrl(requestUrl, payload.orderId), 'Suivre la réponse')}`,
    },
    admin_alternate_accepted: {
      subject: `Date alternative acceptée · ${client}`,
      title: 'Le client a accepté la proposition',
      body: `<p><strong>${escapeHtml(client)}</strong></p>${detail('Date définitive', date(proposedAt))}${button(studioUrl(requestUrl, payload.orderId), 'Ouvrir le dossier')}`,
    },
    supplier_alternate_accepted: {
      subject: `Date alternative validée · ${client}`,
      title: 'Le client accepte votre proposition',
      body: `<p><strong>${escapeHtml(client)}</strong></p>${detail('Date définitive', date(proposedAt))}<p>Neptune Media a enregistré le nouveau créneau.</p>`,
    },
    client_alternate_accepted: {
      subject: 'Votre nouvelle date est confirmée',
      title: 'La date proposée est maintenant définitive',
      body: `<p>Bonjour ${escapeHtml(firstName(client))},</p>${detail('Date définitive', date(proposedAt))}${button(clientUrl(requestUrl), 'Voir mon passage')}`,
    },
    admin_alternate_declined: {
      subject: `Date alternative refusée · ${client}`,
      title: 'Le client refuse la proposition du studio',
      body: `<p><strong>${escapeHtml(client)}</strong></p>${detail('Date refusée', date(proposedAt))}<p>Une nouvelle solution doit être trouvée. La date initiale du passage reste inchangée.</p>${button(studioUrl(requestUrl, payload.orderId), 'Traiter la demande')}`,
    },
  };

  const copy = copies[template] || copies.admin_request_received;
  return { subject: copy.subject, title: copy.title, html: copy.body };
}

function summary(payload) {
  if (payload.requestType === 'filming_date') {
    return dateComparison(payload.requestedValue?.currentAt, payload.requestedValue?.requestedAt);
  }
  if (payload.requestType === 'preparation_date') {
    return dateComparison(payload.requestedValue?.currentAt, payload.requestedValue?.requestedAt);
  }
  if (payload.requestType === 'format') {
    return `${detail('Nouveau format demandé', payload.targetFormat || '')}${detail('Décor', payload.decorLabel || '')}${payload.conceptBrief ? detail('Brief', payload.conceptBrief) : ''}`;
  }
  return '';
}

function dateComparison(before, after) {
  return `<div style="margin:18px 0;padding:16px;border:1px solid #e4e7f2;border-radius:16px;background:#fff">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:#6756d9">Modification demandée</div>
    <div style="margin-top:10px;color:#73798d;text-decoration:line-through">${escapeHtml(date(before))}</div>
    <div style="margin-top:6px;font-size:18px;font-weight:800;color:#11152b">${escapeHtml(date(after))}</div>
  </div>`;
}

function detail(label, value) {
  if (!value) return '';
  return `<div style="margin:12px 0;padding:14px 16px;border-radius:14px;background:#f5f6fb">
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:#6d55e8">${escapeHtml(label)}</div>
    <div style="margin-top:6px;white-space:pre-wrap">${escapeHtml(value)}</div>
  </div>`;
}

function button(url, label, secondary = false) {
  if (!url) return '';
  const background = secondary ? '#11152b' : 'linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2)';
  return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:${background};color:#fff;text-decoration:none;font-weight:800">${escapeHtml(label)}</a>`;
}

function layout(title, content) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:34px;color:#11152b">
    <p style="letter-spacing:.16em;color:#6d55e8;font-weight:800">NEPTUNE MEDIA</p>
    <h1 style="font-size:30px;line-height:1.08">${escapeHtml(title)}</h1>
    ${content}
    <hr style="border:0;border-top:1px solid #e7e8ef;margin:30px 0">
    <p style="font-size:13px;color:#73798d">Neptune Media · <a href="mailto:${CONTACT}">${CONTACT}</a></p>
  </div>`;
}

function supplierUrl(requestUrl, token, decision) {
  if (!token) return '';
  const url = new URL('/modification-studio/', new URL(requestUrl).origin);
  url.searchParams.set('token', token);
  url.searchParams.set('decision', decision);
  return url.toString();
}

function studioUrl(requestUrl, orderId) {
  const url = new URL('/studio/clients', new URL(requestUrl).origin);
  if (orderId) url.hash = encodeURIComponent(orderId);
  return url.toString();
}

function clientUrl(requestUrl) {
  return new URL('/espace-client/', new URL(requestUrl).origin).toString();
}

function publicUrl(requestUrl, path) {
  if (!path) return '';
  return new URL(path, new URL(requestUrl).origin).toString();
}

function typeLabel(type) {
  return ({
    filming_date: 'date de passage',
    preparation_date: 'rendez-vous de préparation',
    format: 'format et décor',
  })[type] || 'modification';
}

function date(value) {
  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime())
    ? 'Date à confirmer'
    : new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    }).format(parsed);
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

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
