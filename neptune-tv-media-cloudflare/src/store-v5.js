import { StudioStore as LegacyStore } from './store-v4.js';
import { json, sanitizeUrl } from './security.js';
import { ensurePortalSchema } from './portal-schema.js';
import { latestCalendarAppointment } from './workflow-db-v5.js';
import {
  driveFilesUpsert,
  driveMarkNotified,
  driveProvisioned,
  driveSyncPlan,
  enrichDriveOrders,
  ensureDriveSchema,
} from './portal-drive.js';
import {
  ensureWorkflowSchema,
  enrichOrderCollection,
  initializeWorkflowForOrder,
  reconcileWorkflowFromLegacyUpdate,
  supplierContext,
  supplierRespond,
  updateAppointmentWorkflow,
  workflowAction,
  workflowControlSnapshot,
  workflowEmailDue,
  workflowEmailMark,
  workflowEvents,
  workflowReconcile,
} from './portal-workflow-v5.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname.startsWith('/portal/drive-')) {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      const body = method === 'GET' ? {} : await request.clone().json().catch(() => ({}));
      try {
        if (url.pathname === '/portal/drive-sync-plan' && method === 'POST') return driveSyncPlan(this);
        if (url.pathname === '/portal/drive-provisioned' && method === 'POST') return driveProvisioned(this, body);
        if (url.pathname === '/portal/drive-files' && method === 'POST') return driveFilesUpsert(this, body);
        if (url.pathname === '/portal/drive-notified' && method === 'POST') return driveMarkNotified(this, body);
      } catch (error) {
        console.error('drive_store_route_failed', {
          path: url.pathname,
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'drive_operation_failed' }, 500);
      }
    }

    if (url.pathname.startsWith('/portal/workflow-') || url.pathname === '/portal/autopilot-snapshot' || url.pathname === '/portal/autopilot-reconcile') {
      ensurePortalSchema(this);
      ensureWorkflowSchema(this);
      const body = method === 'GET' ? {} : await request.clone().json().catch(() => ({}));
      try {
        if (url.pathname === '/portal/workflow-supplier-context' && method === 'POST') return supplierContext(this, body.token);
        if (url.pathname === '/portal/workflow-supplier-respond' && method === 'POST') return supplierRespond(this, body);
        if (url.pathname === '/portal/workflow-action' && method === 'POST') return workflowAction(this, body);
        if (url.pathname === '/portal/workflow-reconcile' && method === 'POST') return workflowReconcile(this, body);
        if (url.pathname === '/portal/workflow-email-due' && method === 'POST') return workflowEmailDue(this);
        if (url.pathname === '/portal/workflow-email-mark' && method === 'POST') return workflowEmailMark(this, body);
        if (url.pathname === '/portal/workflow-events' && method === 'POST') return workflowEvents(this, body);
        if (url.pathname === '/portal/autopilot-snapshot' && method === 'POST') return workflowControlSnapshot(this, body);
        if (url.pathname === '/portal/autopilot-reconcile' && method === 'POST') return workflowReconcile(this, body);
      } catch (error) {
        console.error('workflow_store_route_failed', {
          path: url.pathname,
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'workflow_operation_failed' }, 500);
      }
    }

    const relevant = new Set([
      '/portal/order-upsert',
      '/portal/appointment-upsert',
      '/portal/session',
      '/portal/admin-list',
      '/portal/admin-file',
      '/portal/admin-update',
    ]);
    if (!relevant.has(url.pathname)) return super.fetch(request);

    let body = method === 'GET' ? {} : await request.clone().json().catch(() => ({}));
    let forwardedRequest = request;
    let appointmentProtected = false;

    if (url.pathname === '/portal/admin-update' && method === 'POST') {
      ensurePortalSchema(this);
      ensureWorkflowSchema(this);
      const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
      const orderId = String(payload.orderId || '').trim();
      const calendar = orderId ? latestCalendarAppointment(this, orderId) : null;
      const explicitOverride = payload.forceAppointmentOverride === true;
      if (calendar?.appointmentAt && !explicitOverride && Object.hasOwn(payload, 'appointmentAt')) {
        const protectedPayload = { ...payload, appointmentAt: calendar.appointmentAt };
        body = body.payload && typeof body.payload === 'object' ? { ...body, payload: protectedPayload } : protectedPayload;
        forwardedRequest = requestWithJson(request, body);
        appointmentProtected = true;
      }
    }

    const response = await super.fetch(forwardedRequest);
    if (!response.ok) return response;
    const result = await response.json().catch(() => ({}));

    try {
      ensureWorkflowSchema(this);
      ensureDriveSchema(this);
      if (url.pathname === '/portal/order-upsert' && result.orderId) {
        const workflow = await initializeWorkflowForOrder(this, result.orderId, body, { created: Boolean(result.created) });
        return json({ ...result, ...workflow, driveProvisionPending: Boolean(result.created) });
      }
      if (url.pathname === '/portal/appointment-upsert' && result.orderId) {
        const appointmentAt = result.appointmentAt || body.appointmentAt || body.appointment_at || body.start || body.startAt;
        const syncedAppointmentUrl = appointmentUrlFrom(body);
        if (syncedAppointmentUrl) {
          this.sql.exec(
            'UPDATE portal_orders SET preparation_url=?,updated_at=? WHERE id=?',
            syncedAppointmentUrl,
            new Date().toISOString(),
            result.orderId,
          );
        }
        const workflow = updateAppointmentWorkflow(this, result.orderId, appointmentAt);
        const storedAppointmentUrl = this.sql.exec(
          'SELECT preparation_url AS appointmentUrl FROM portal_orders WHERE id=?',
          result.orderId,
        ).toArray()[0]?.appointmentUrl || '';
        return json({
          ...result,
          ...workflow,
          appointmentAt,
          appointmentUrl: storedAppointmentUrl,
          preparationUrl: storedAppointmentUrl,
          appointmentSource: 'google_calendar',
          status: this.currentOrderStatus(result.orderId),
        });
      }
      if (url.pathname === '/portal/session') {
        const enriched = enrichOrderCollection(this, Array.isArray(result.orders) ? result.orders : []);
        return json({ ...result, orders: enrichDriveOrders(this, enriched) });
      }
      if (url.pathname === '/portal/admin-list') {
        const enriched = enrichOrderCollection(this, Array.isArray(result.orders) ? result.orders : []);
        return json({ ...result, orders: enrichDriveOrders(this, enriched) });
      }
      if (url.pathname === '/portal/admin-file' && result.fileId) {
        const reconciled = await workflowReconcile(this, { system: true });
        const reconciliation = await reconciled.json().catch(() => ({}));
        return json({ ...result, workflowReconciled: true, workflowTransitions: reconciliation.transitions || [] });
      }
      if (url.pathname === '/portal/admin-update' && result.orderId) {
        reconcileWorkflowFromLegacyUpdate(this, result.orderId, body.payload || body);
        const enriched = enrichDriveOrders(this, enrichOrderCollection(this, [{ ...result, id: result.orderId }]))[0];
        return json({ ...result, appointmentAt: enriched?.appointmentAt || result.appointmentAt, appointmentSource: enriched?.appointmentSource || null, appointmentProtected, workflow: enriched?.workflow || null, drive: enriched?.drive || null });
      }
    } catch (error) {
      console.error('workflow_store_enrichment_failed', {
        path: url.pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error || 'unknown').slice(0, 500),
      });
      return json({ ...result, workflowWarning: 'workflow_enrichment_failed' });
    }

    return json(result);
  }

  currentOrderStatus(orderId) {
    return this.sql.exec('SELECT status FROM portal_orders WHERE id=?', orderId).toArray()[0]?.status || '';
  }
}

function appointmentUrlFrom(raw = {}) {
  const entryPoints = Array.isArray(raw.conferenceData?.entryPoints) ? raw.conferenceData.entryPoints : [];
  const nestedEntryPoints = Array.isArray(raw.event?.conferenceData?.entryPoints) ? raw.event.conferenceData.entryPoints : [];
  const candidates = [
    raw.appointmentUrl,
    raw.appointment_url,
    raw.meetingUrl,
    raw.meeting_url,
    raw.videoCallUrl,
    raw.video_call_url,
    raw.hangoutLink,
    raw.htmlLink,
    raw.calendarEventUrl,
    raw.calendar_event_url,
    raw.event?.hangoutLink,
    raw.event?.htmlLink,
    ...entryPoints.map((entry) => entry?.uri),
    ...nestedEntryPoints.map((entry) => entry?.uri),
  ];
  for (const candidate of candidates) {
    const url = sanitizeUrl(candidate, 1500);
    if (url) return url;
  }
  return '';
}

function requestWithJson(request, body) {
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body || {}),
  });
}
