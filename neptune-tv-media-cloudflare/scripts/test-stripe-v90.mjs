import cryptoNode from 'node:crypto';
import {
  parseStripeReference,
  stripeSafeReference,
  stripePaymentOptions,
  stripePaidCandidates,
  verifyStripeWebhook,
} from '../src/stripe-journey-v90.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const orderId = '12345678-1234-1234-1234-123456789abc';
assert(stripeSafeReference({ opportunityId: orderId }) === `NPOPP_${orderId}`, 'opportunity reference');
assert(parseStripeReference(`NPORD_${orderId}`).orderId === orderId, 'order reference parse');

const raw = '{"id":"evt_test"}';
const timestamp = Math.floor(Date.now() / 1000);
const secret = 'whsec_test';
const signature = cryptoNode.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
assert(await verifyStripeWebhook(raw, `t=${timestamp},v1=${signature}`, secret), 'Stripe signature');

const session = {
  id: 'cs_paid',
  payment_status: 'paid',
  amount_total: 150000,
  currency: 'eur',
  created: 10,
  customer_details: { email: 'client@example.com' },
  client_reference_id: `NPORD_${orderId}`,
};

globalThis.fetch = async (url) => {
  const value = String(url);
  if (value.includes('/payment_links?')) {
    return Response.json({ data: [{
      id: 'plink_a',
      active: true,
      url: 'https://buy.stripe.com/testa',
      metadata: { format: 'Hors Norme' },
      line_items: { data: [{ amount_total: 150000, currency: 'eur', description: 'Hors Norme', quantity: 1 }] },
    }] });
  }
  if (value.includes('/checkout/sessions?')) return Response.json({ data: [session] });
  throw new Error(`unexpected Stripe request: ${value}`);
};

const target = { orderId, email: 'client@example.com', amountTotal: 150000, currency: 'eur', format: 'Hors Norme' };
const options = await stripePaymentOptions({ STRIPE_SECRET_KEY: 'sk_test' }, target);
assert(options.options.length === 1 && options.options[0].recommended, 'recommended Payment Link');
assert(options.options[0].url.includes('client_reference_id=NPORD_'), 'Payment Link Neptune reference');
assert(options.options[0].url.includes('locked_prefilled_email=client%40example.com'), 'Payment Link locked email');
const paid = await stripePaidCandidates({ STRIPE_SECRET_KEY: 'sk_test' }, target);
assert(paid.confident && paid.session.id === 'cs_paid', 'paid Checkout Session match');
console.log('stripe v90 unit smoke ok');
