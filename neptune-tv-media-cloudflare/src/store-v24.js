import { StudioStore as LegacyStore } from './store-v23.js';
import { stripeApplyV90, stripeTargetV90 } from './portal-stripe-v90.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'POST' && url.pathname === '/portal/stripe-target-v90') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await stripeTargetV90(this, body);
      } catch (error) {
        console.error('stripe_target_v90_failed', safeError(error));
        return json({ error: 'stripe_target_failed' }, 500);
      }
    }
    if (method === 'POST' && url.pathname === '/portal/stripe-apply-v90') {
      const body = await request.clone().json().catch(() => ({}));
      try {
        return await stripeApplyV90(this, body);
      } catch (error) {
        console.error('stripe_apply_v90_failed', safeError(error));
        return json({ error: 'stripe_apply_failed' }, 500);
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
