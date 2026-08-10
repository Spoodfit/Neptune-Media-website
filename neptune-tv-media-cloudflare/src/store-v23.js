import { StudioStore as LegacyStore } from './store-v22.js';
import { json } from './security.js';

const RECIPIENT_COOLDOWN_MS = 45 * 60 * 1000;

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'POST' && url.pathname === '/portal/crm-action-prepare-v86') {
      const response = await super.fetch(request);
      if (!response.ok) return response;
      const prepared = await response.json().catch(() => ({}));
      if (prepared.suppressed || !prepared.client?.id || prepared.action === 'none') return json(prepared);
      const since = new Date(Date.now() - RECIPIENT_COOLDOWN_MS).toISOString();
      const recentCrm = this.sql.exec(`
        SELECT action,sent_at AS sentAt FROM portal_crm_messages_v86
        WHERE client_id=? AND sent_at>=? ORDER BY sent_at DESC LIMIT 1
      `, prepared.client.id, since).toArray()[0];
      const recentWorkflow = this.sql.exec(`
        SELECT e.message_key AS action,e.sent_at AS sentAt
        FROM portal_email_outbox e
        JOIN portal_orders o ON o.id=e.order_id
        WHERE o.client_id=? AND LOWER(e.to_email)=LOWER(?) AND e.status='sent' AND e.sent_at>=?
        ORDER BY e.sent_at DESC LIMIT 1
      `, prepared.client.id, prepared.client.email || '', since).toArray()[0];
      const recent = latest(recentCrm, recentWorkflow);
      if (recent) {
        return json({
          ...prepared,
          suppressed: true,
          reason: 'recipient_cooldown',
          previousAction: recent.action,
          sentAt: recent.sentAt,
        });
      }
      return json(prepared);
    }

    if (method === 'POST' && url.pathname === '/portal/workflow-email-due') {
      const response = await super.fetch(request);
      if (!response.ok) return response;
      const due = await response.json().catch(() => ({}));
      if (!Array.isArray(due.items) || !due.items.length) return json(due);
      const now = Date.now();
      const kept = [];
      let crmDeferred = 0;
      for (const item of due.items) {
        if (!item.clientId) {
          kept.push(item);
          continue;
        }
        const recent = this.sql.exec(`
          SELECT action,sent_at AS sentAt FROM portal_crm_messages_v86
          WHERE client_id=? ORDER BY sent_at DESC LIMIT 1
        `, item.clientId).toArray()[0];
        const earliest = recent?.sentAt ? new Date(recent.sentAt).getTime() + RECIPIENT_COOLDOWN_MS : 0;
        if (!earliest || earliest <= now) {
          kept.push(item);
          continue;
        }
        const nextAt = new Date(earliest).toISOString();
        this.sql.exec(`
          UPDATE portal_email_outbox
          SET status='pending',scheduled_at=?,last_error=?,updated_at=?
          WHERE id=?
        `, nextAt, 'notification_governor:crm_recipient_cooldown', new Date().toISOString(), item.id);
        crmDeferred += 1;
      }
      return json({
        ...due,
        items: kept,
        policy: {
          ...(due.policy || {}),
          crmRecipientCooldownMinutes: 45,
          crmDeferred: Number(due.policy?.crmDeferred || 0) + crmDeferred,
        },
      });
    }

    return super.fetch(request);
  }
}

function latest(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return new Date(left.sentAt || 0).getTime() >= new Date(right.sentAt || 0).getTime() ? left : right;
}
