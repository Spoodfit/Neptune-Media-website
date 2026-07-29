import { StudioStore as LegacyStore } from './store-v5.js';
import { json, sanitizeText } from './security.js';
import { ensurePortalSchema } from './portal-schema.js';
import { requireClient } from './portal-auth.js';
import { referralSummary } from './portal-referrals.js';
import { ensureWorkflowSchema, enrichOrderCollection } from './portal-workflow-v5.js';
import { ensureDriveSchema, enrichDriveOrders } from './portal-drive.js';
import { driveFilesUpsert } from './portal-drive-v2.js';

const SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;
const WATCH_WRITE_INTERVAL_MS = 15 * 1000;

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname === '/portal/drive-files' && method === 'POST') {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      const body = await request.clone().json().catch(() => ({}));
      try {
        return driveFilesUpsert(this, body);
      } catch (error) {
        console.error('drive_store_route_failed', safeError(error));
        return json({ error: 'drive_operation_failed' }, 500);
      }
    }

    if (url.pathname === '/portal/session' && method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await this.portalSessionEfficient(body);
      } catch (error) {
        console.error('portal_session_efficient_failed', safeError(error));
        return json({ authenticated: false, error: 'session_unavailable' }, 500);
      }
    }

    return super.fetch(request);
  }

  async session(body) {
    const session = await this.requireSession(body.token);
    if (!session) return json({ authenticated: false }, 401);
    touchSession(this, 'sessions', session.sessionId);
    return json({
      authenticated: true,
      csrfToken: session.csrfToken,
      user: publicUser(session),
    });
  }

  async track(body) {
    const event = sanitizeText(body.event, 40);
    const sessionId = sanitizeText(body.sessionId, 100);
    const episodeId = sanitizeText(body.episodeId, 100);
    if (!sessionId || !episodeId) return super.track(body);

    if (event === 'impression') {
      const day = new Date().toISOString().slice(0, 10);
      const duplicate = this.sql.exec(
        `SELECT id FROM video_events
         WHERE session_id=? AND episode_id=? AND event_name='impression' AND day=?
         LIMIT 1`,
        sessionId,
        episodeId,
        day,
      ).toArray()[0];
      if (duplicate) return json({ ok: true, deduplicated: true });
    }

    if (event === 'watch') {
      const recent = this.sql.exec(
        `SELECT occurred_at AS occurredAt,position_seconds AS position
         FROM video_events
         WHERE session_id=? AND episode_id=? AND event_name='watch'
         ORDER BY id DESC LIMIT 1`,
        sessionId,
        episodeId,
      ).toArray()[0];
      if (recent) {
        const age = Date.now() - new Date(recent.occurredAt || '').getTime();
        if (Number.isFinite(age) && age >= 0 && age < WATCH_WRITE_INTERVAL_MS) {
          return json({ ok: true, throttled: true });
        }
        const position = Number(body.position || 0);
        const previousPosition = Number(recent.position || 0);
        if (position > previousPosition) {
          body = {
            ...body,
            delta: Math.min(20, Math.max(Number(body.delta || 0), position - previousPosition)),
          };
        }
      }
    }

    return super.track(body);
  }

  async portalSessionEfficient(body) {
    ensurePortalSchema(this);
    ensureWorkflowSchema(this);
    ensureDriveSchema(this);

    const client = await requireClient(this, body.token);
    if (!client) return json({ authenticated: false }, 401);
    touchSession(this, 'portal_sessions', client.sessionId);

    const orders = this.sql.exec(`
      SELECT id,order_reference AS orderReference,product_code AS productCode,title,format,
             payment_status AS paymentStatus,amount_total AS amountTotal,currency,status,
             appointment_at AS appointmentAt,filming_at AS filmingAt,next_action AS nextAction,
             preparation_url AS preparationUrl,booking_url AS bookingUrl,
             created_at AS createdAt,updated_at AS updatedAt
      FROM portal_orders
      WHERE client_id=?
      ORDER BY created_at DESC
    `, client.id).toArray();

    for (const order of orders) {
      order.steps = this.sql.exec(`
        SELECT step_key AS stepKey,label,state,display_order AS displayOrder,
               completed_at AS completedAt,note
        FROM portal_steps
        WHERE order_id=?
        ORDER BY display_order
      `, order.id).toArray();
      order.files = this.sql.exec(`
        SELECT id,name,file_type AS fileType,size_label AS sizeLabel,created_at AS createdAt
        FROM portal_files
        WHERE order_id=?
        ORDER BY created_at DESC
      `, order.id).toArray().map((file) => ({
        ...file,
        downloadUrl: `/api/client/files/${encodeURIComponent(file.id)}`,
      }));
      order.schedules = this.sql.exec(`
        SELECT id,file_id AS fileId,publish_at AS publishAt,network,status,caption,
               created_at AS createdAt,updated_at AS updatedAt
        FROM portal_content_schedule
        WHERE order_id=?
        ORDER BY publish_at ASC
      `, order.id).toArray();
    }

    const deletionRequest = this.sql.exec(`
      SELECT id,status,requested_at AS requestedAt,processed_at AS processedAt,note
      FROM portal_deletion_requests
      WHERE client_id=?
      ORDER BY requested_at DESC LIMIT 1
    `, client.id).toArray()[0] || null;
    const referral = referralSummary(this, client);

    delete client.sessionId;
    delete client.expiresAt;
    const enriched = enrichOrderCollection(this, orders);

    return json({
      authenticated: true,
      client,
      orders: enrichDriveOrders(this, enriched),
      deletionRequest,
      referral,
    });
  }
}

function touchSession(store, table, sessionId) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS).toISOString();
  store.sql.exec(
    `UPDATE ${table} SET last_seen_at=? WHERE id=? AND last_seen_at<?`,
    now.toISOString(),
    sessionId,
    cutoff,
  );
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName || user.full_name || '',
    role: user.role,
  };
}

function safeError(error) {
  return {
    name: error?.name || 'Error',
    message: String(error?.message || error || 'unknown').slice(0, 500),
  };
}
