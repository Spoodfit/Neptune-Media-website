import { StudioStore as LegacyStore } from './store-v20.js';
import { json } from './security.js';
import { ensureWorkflowSchema } from './workflow-db-v5.js';
import {
  clearPreparationCalendar,
  ensureManualWorkflowForOrder,
  manualScheduleContext,
  syncPreparationCalendar,
} from './portal-manual-scheduling-v85.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'POST' && url.pathname === '/portal/manual-schedule-context-v85') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await manualScheduleContext(this, body);
      } catch (error) {
        console.error('manual_schedule_context_v85_failed', safeError(error));
        return json({ error: 'manual_schedule_context_failed' }, 500);
      }
    }

    if (method === 'POST' && url.pathname === '/portal/preparation-calendar-synced-v85') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await syncPreparationCalendar(this, body);
      } catch (error) {
        console.error('preparation_calendar_sync_v85_failed', safeError(error));
        return json({ error: 'preparation_calendar_sync_failed' }, 500);
      }
    }

    if (method === 'POST' && url.pathname === '/portal/preparation-calendar-cleared-v85') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await clearPreparationCalendar(this, body);
      } catch (error) {
        console.error('preparation_calendar_clear_v85_failed', safeError(error));
        return json({ error: 'preparation_calendar_clear_failed' }, 500);
      }
    }

    if (method === 'POST' && url.pathname === '/portal/admin-upsert') {
      ensureWorkflowSchema(this);
      const body = await request.clone().json().catch(() => ({}));
      const response = await super.fetch(request);
      if (!response.ok) return response;
      const result = await response.json().catch(() => ({}));
      if (!result.orderId || !result.created) return json(result);
      try {
        const workflow = ensureManualWorkflowForOrder(this, result.orderId, body.payload || {});
        return json({ ...result, ...workflow, manualPassage: true });
      } catch (error) {
        console.error('manual_passage_workflow_v85_failed', safeError(error));
        return json({ ...result, workflowWarning: 'manual_workflow_initialization_failed', manualPassage: true });
      }
    }

    return super.fetch(request);
  }
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 120),
    message: String(error?.message || error || 'unknown').slice(0, 500),
  };
}
