import { StudioStore as LegacyStore } from './store-v26.js';
import { json } from './security.js';
import {
  clientAccountV95,
  configurationV95,
  saveFormatV95,
  saveSupplierV95,
  supplierPaymentActionV95,
  supplierPaymentContextV95,
} from './portal-studio-operations-v95.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const routes = {
      '/portal/studio-operations-v95/client-account': clientAccountV95,
      '/portal/studio-operations-v95/configuration': configurationV95,
      '/portal/studio-operations-v95/supplier/save': saveSupplierV95,
      '/portal/studio-operations-v95/format/save': saveFormatV95,
      '/portal/studio-operations-v95/supplier-payment/context': supplierPaymentContextV95,
      '/portal/studio-operations-v95/supplier-payment/action': supplierPaymentActionV95,
    };
    if (method === 'POST' && routes[url.pathname]) {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await routes[url.pathname](this, body);
      } catch (error) {
        console.error('studio_operations_v95_failed', url.pathname, safeError(error));
        return json({ error: 'studio_operations_v95_failed' }, 500);
      }
    }
    if (method === 'GET' && url.pathname === '/portal/studio-operations-v95/public-catalog') {
      try {
        return await configurationV95(this, {}, { publicOnly: true });
      } catch (error) {
        console.error('media_catalog_v95_failed', safeError(error));
        return json({ error: 'media_catalog_v95_failed' }, 500);
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
