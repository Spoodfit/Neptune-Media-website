import { sendEmail } from './email-service.js';
import { sendWorkflowOutboxItem as sendLegacyWorkflowOutboxItem } from './portal-workflow-email-v5.js';

const CONTACT = 'contact@neptunebusiness.com';

export async function sendWorkflowOutboxItem(env, requestUrl, item = {}) {
  if (!String(item.messageKey || '').startsWith('passage_change_')) {
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

function layout(title, content) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:34px;color:#11152b"><p style="letter-spacing:.16em;color:#6d55e8;font-weight:800">NEPTUNE MEDIA</p><h1 style="font-size:30px;line-height:1.08">${escapeHtml(title)}</h1>${content}<hr style="border:0;border-top:1px solid #e7e8ef;margin:30px 0"><p style="font-size:13px;color:#73798d">Neptune Media · <a href="mailto:${CONTACT}">${CONTACT}</a></p></div>`;
}

function portalUrl(requestUrl, email) {
  const url = new URL('/espace-client/', new URL(requestUrl).origin);
  if (email) url.searchParams.set('email', email);
  return url.toString();
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
