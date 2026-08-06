import { StudioStore as LegacyStore } from './store-v17.js';
import {
  adminChangeRequestAction,
  adminChangeRequestState,
  clientChangeRequestState,
  clientRespondToAlternate,
  clientSubmitChangeRequest,
  supplierChangeRequestContext,
  supplierRespondToChangeRequest,
} from './portal-change-requests-v83.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const body = method === 'POST' ? await request.clone().json().catch(() => ({})) : {};

    try {
      if (method === 'POST' && url.pathname === '/portal/change-client-state-v83') {
        return clientChangeRequestState(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/change-client-submit-v83') {
        return clientSubmitChangeRequest(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/change-client-respond-v83') {
        return clientRespondToAlternate(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/change-admin-state-v83') {
        return adminChangeRequestState(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/change-admin-action-v83') {
        return adminChangeRequestAction(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/change-supplier-context-v83') {
        return supplierChangeRequestContext(this, body);
      }
      if (method === 'POST' && url.pathname === '/portal/change-supplier-respond-v83') {
        return supplierRespondToChangeRequest(this, body);
      }
    } catch (error) {
      console.error('portal_change_requests_v83_failed', {
        path: url.pathname,
        name: String(error?.name || 'Error').slice(0, 120),
        message: String(error?.message || error || 'unknown').slice(0, 500),
      });
      return json({ error: 'change_request_failed' }, 500);
    }

    return super.fetch(request);
  }
}
