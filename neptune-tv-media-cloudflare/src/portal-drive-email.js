import { sendEmail } from './email-service.js';
import { portalUrl } from './portal-email.js';
import { sha256 } from './security.js';

export async function sendDriveDelivery(env, requestUrl, payload = {}) {
  const email = String(payload.email || '').trim().toLowerCase();
  const events = Array.isArray(payload.pendingEvents) ? payload.pendingEvents : [];
  if (!email || !events.length) return { ok: true, skipped: true };

  const longEvents = events.filter((item) => item.category === 'long');
  const shortEvents = events.filter((item) => item.category === 'short');
  const updatedCount = events.filter((item) => item.eventType === 'updated').length;
  const passageNumber = Math.max(1, Number(payload.passageNumber || 1));
  const title = String(payload.title || payload.format || 'Votre passage Neptune Media');
  const url = portalUrl(requestUrl, email);
  const subject = subjectFor({ longCount: longEvents.length, shortCount: shortEvents.length, passageNumber, updatedCount });
  const intro = updatedCount === events.length
    ? 'Des versions mises à jour de vos contenus sont disponibles.'
    : 'De nouveaux contenus sont disponibles dans votre espace client.';
  const rows = events.slice(0, 40).map((item) => {
    const label = item.category === 'short' ? 'Format court' : 'Long format';
    const status = item.eventType === 'updated' ? 'Version mise à jour' : 'Nouveau fichier';
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #eceef5"><strong>${escapeHtml(item.name)}</strong><br><span style="font-size:12px;color:#687086">${label} · ${status}</span></td></tr>`;
  }).join('');
  const idempotencyKey = await deliveryIdempotencyKey(payload.orderId, events);

  return sendEmail(env, {
    to: email,
    subject,
    idempotencyKey,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:34px;color:#121326"><p style="letter-spacing:.16em;color:#6d55e8;font-weight:700">NEPTUNE MEDIA</p><h1>Vos contenus sont disponibles</h1><p>Bonjour${payload.fullName ? ` ${escapeHtml(firstName(payload.fullName))}` : ''},</p><p>${intro}</p><div style="margin:22px 0;padding:18px;border-radius:16px;background:#f5f3ff"><small style="color:#6658a8;font-weight:700">PASSAGE ${String(passageNumber).padStart(2, '0')}</small><p style="margin:6px 0 0;font-weight:800">${escapeHtml(title)}</p></div><table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table>${events.length > 40 ? `<p style="font-size:13px;color:#687086">${events.length - 40} autre(s) fichier(s) sont également disponibles.</p>` : ''}<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2);color:#fff;text-decoration:none;font-weight:700">Accéder à mes contenus</a></p><p style="font-size:13px;color:#687086">Vos fichiers restent classés par passage, avec le long format et les shorts séparés.</p></div>`,
    text: `${subject}\n${intro}\n${events.map((item) => `- ${item.name} (${item.category === 'short' ? 'format court' : 'long format'})`).join('\n')}\n${url}`,
  });
}

async function deliveryIdempotencyKey(orderId, events) {
  const signature = events
    .map((item) => [item.id, item.driveFileId, item.modifiedAt, item.eventType].filter(Boolean).join(':'))
    .sort()
    .join('|');
  const digest = await sha256(signature || String(orderId || 'drive-delivery'));
  return `drive-delivery:${String(orderId || 'unknown').slice(0, 80)}:${digest.slice(0, 48)}`;
}

function subjectFor({ longCount, shortCount, passageNumber, updatedCount }) {
  if (longCount && !shortCount) return `${updatedCount ? 'Long format mis à jour' : 'Votre long format est disponible'} — Passage ${String(passageNumber).padStart(2, '0')}`;
  if (shortCount && !longCount) return `${shortCount} nouveau${shortCount > 1 ? 'x' : ''} short${shortCount > 1 ? 's' : ''} disponible${shortCount > 1 ? 's' : ''} — Passage ${String(passageNumber).padStart(2, '0')}`;
  return `Nouveaux contenus disponibles — Passage ${String(passageNumber).padStart(2, '0')}`;
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/u)[0] || '';
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
