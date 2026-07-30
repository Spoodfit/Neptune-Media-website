import { sendEmail } from './email-service.js';
import { portalUrl } from './portal-email.js';
import { sha256 } from './security.js';

export async function sendDriveDelivery(env, requestUrl, payload = {}) {
  const email = String(payload.email || '').trim().toLowerCase();
  const events = Array.isArray(payload.pendingEvents) ? payload.pendingEvents : [];
  if (!email || !events.length) return { ok: true, skipped: true };

  const uniqueEvents = latestEventPerFile(events);
  const summary = deliverySummary(payload.summary, uniqueEvents);
  const updatedCount = uniqueEvents.filter((item) => item.eventType === 'updated').length;
  const passageNumber = Math.max(1, Number(payload.passageNumber || 1));
  const title = String(payload.title || payload.format || 'Votre passage Neptune Media');
  const url = portalUrl(requestUrl, email);
  const subject = `Vos contenus sont disponibles — Passage ${String(passageNumber).padStart(2, '0')}`;
  const intro = updatedCount === uniqueEvents.length
    ? 'Des versions mises à jour de vos contenus sont disponibles.'
    : 'De nouveaux contenus sont disponibles dans votre espace client.';
  const idempotencyKey = await deliveryIdempotencyKey(payload.orderId, events);
  const totalSentence = librarySentence(summary);

  return sendEmail(env, {
    to: email,
    subject,
    idempotencyKey,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:36px 28px;color:#121326"><p style="margin:0 0 24px;letter-spacing:.16em;color:#6d55e8;font-size:13px;font-weight:800">NEPTUNE MEDIA</p><h1 style="margin:0 0 24px;font-size:34px;line-height:1.08">Vos contenus sont disponibles</h1><p style="margin:0 0 12px">Bonjour${payload.fullName ? ` ${escapeHtml(firstName(payload.fullName))}` : ''},</p><p style="margin:0 0 24px;line-height:1.55">${intro}</p><div style="margin:0 0 22px;padding:18px 20px;border-radius:16px;background:#f5f3ff"><small style="color:#6658a8;font-weight:800">PASSAGE ${String(passageNumber).padStart(2, '0')}</small><p style="margin:6px 0 0;font-weight:800">${escapeHtml(title)}</p></div><div style="display:flex;gap:10px;margin:0 0 26px"><div style="flex:1;padding:15px;border:1px solid #eceef5;border-radius:14px;text-align:center"><strong style="display:block;font-size:24px;color:#10275f">${summary.longCount}</strong><span style="font-size:12px;color:#687086">${summary.longCount > 1 ? 'émissions' : 'émission'}</span></div><div style="flex:1;padding:15px;border:1px solid #eceef5;border-radius:14px;text-align:center"><strong style="display:block;font-size:24px;color:#10275f">${summary.shortCount}</strong><span style="font-size:12px;color:#687086">shorts</span></div></div><p style="margin:0 0 24px;color:#4f586d;line-height:1.5">${escapeHtml(totalSentence)}</p><p style="margin:0 0 28px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 24px;border-radius:999px;background:linear-gradient(120deg,#4267ff,#8d4cff,#ef4ba2);color:#fff;text-decoration:none;font-weight:800">Voir mes contenus</a></p><p style="margin:0;font-size:13px;color:#687086;line-height:1.5">La bibliothèque est mise à jour automatiquement. Ouvrez votre espace client pour visualiser, lire ou télécharger vos formats.</p></div>`,
    text: `${subject}\n\n${intro}\n${totalSentence}\n\nVoir mes contenus : ${url}`,
  });
}

function latestEventPerFile(events) {
  const byFile = new Map();
  for (const event of events) {
    const key = String(event.driveFileId || event.id || event.name || '');
    const current = byFile.get(key);
    if (!current || eventTimestamp(event) >= eventTimestamp(current)) byFile.set(key, event);
  }
  return [...byFile.values()];
}

function deliverySummary(rawSummary, uniqueEvents) {
  const supplied = rawSummary && typeof rawSummary === 'object' ? rawSummary : {};
  const fallbackLong = uniqueEvents.filter((item) => item.category === 'long').length;
  const fallbackShort = uniqueEvents.filter((item) => item.category === 'short').length;
  return {
    longCount: Math.max(0, Number.isFinite(Number(supplied.longCount)) ? Number(supplied.longCount) : fallbackLong),
    shortCount: Math.max(0, Number.isFinite(Number(supplied.shortCount)) ? Number(supplied.shortCount) : fallbackShort),
  };
}

function librarySentence(summary) {
  const longLabel = `${summary.longCount} émission${summary.longCount > 1 ? 's' : ''} complète${summary.longCount > 1 ? 's' : ''}`;
  const shortLabel = `${summary.shortCount} short${summary.shortCount > 1 ? 's' : ''}`;
  return `Votre bibliothèque contient maintenant ${longLabel} et ${shortLabel}.`;
}

function eventTimestamp(event) {
  const value = new Date(event.modifiedAt || event.createdAt || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}

async function deliveryIdempotencyKey(orderId, events) {
  const signature = events
    .map((item) => [item.id, item.driveFileId, item.modifiedAt, item.eventType].filter(Boolean).join(':'))
    .sort()
    .join('|');
  const digest = await sha256(signature || String(orderId || 'drive-delivery'));
  return `drive-delivery:${String(orderId || 'unknown').slice(0, 80)}:${digest.slice(0, 48)}`;
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
