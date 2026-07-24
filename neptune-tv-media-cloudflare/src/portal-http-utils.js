import { parseCookies } from './security.js';

export const CLIENT_COOKIE = '__Host-neptune_client';
export const ADMIN_COOKIE = '__Host-neptune_session';

export function clientToken(request) {
  return parseCookies(request.headers.get('Cookie') || '')[CLIENT_COOKIE] || '';
}

export function adminAuth(request) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  return { token: cookies[ADMIN_COOKIE] || '', csrfToken: request.headers.get('X-CSRF-Token') || '' };
}

export function clientCookie(token, requestUrl, maxAge) {
  const url = new URL(requestUrl);
  const secure = !['localhost', '127.0.0.1'].includes(url.hostname) ? 'Secure' : '';
  return [
    `${CLIENT_COOKIE}=${encodeURIComponent(token || '')}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure,
    `Max-Age=${Math.max(0, Number(maxAge || 0))}`,
  ].filter(Boolean).join('; ');
}

export function unwrapWebhookPayload(raw = {}) {
  return raw?.data?.object && typeof raw.data.object === 'object' ? raw.data.object : raw;
}

export function normalizeOrderPayload(raw = {}, env = {}) {
  const source = unwrapWebhookPayload(raw);
  const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
  const clientReference = String(source.client_reference_id || source.clientReferenceId || metadata.client_reference_id || '').trim();
  const requestedFilmingAt = firstValue(
    source.requestedFilmingAt,
    source.requested_filming_at,
    source.selectedDate,
    source.selected_date,
    source.shootingDate,
    source.shooting_date,
    source.dateSouhaitee,
    source.date_souhaitee,
    metadata.requestedFilmingAt,
    metadata.requested_filming_at,
    metadata.selectedDate,
    metadata.selected_date,
    metadata.shootingDate,
    metadata.shooting_date,
    metadata.dateSouhaitee,
    metadata.date_souhaitee,
    source.filmingAt,
    source.filming_at,
    metadata.filmingAt,
  );
  return {
    email: String(
      source.email
      || source.customerEmail
      || source.customer_email
      || source.customer_details?.email
      || metadata.email
      || '',
    ).trim().toLowerCase(),
    fullName: String(
      source.fullName
      || source.name
      || source.customerName
      || source.customer_details?.name
      || metadata.fullName
      || metadata.name
      || '',
    ).trim(),
    company: String(source.company || metadata.company || metadata.entreprise || '').trim(),
    externalPaymentId: String(
      source.externalPaymentId
      || source.stripePaymentId
      || source.paymentIntentId
      || source.payment_intent
      || source.checkoutSessionId
      || source.id
      || '',
    ).trim(),
    orderReference: String(source.orderReference || source.reference || clientReference || metadata.orderReference || '').trim(),
    productCode: String(source.productCode || source.offer || metadata.productCode || metadata.offer || '').trim(),
    title: String(source.title || source.productName || metadata.title || metadata.productName || '').trim(),
    format: String(source.format || metadata.format || metadata.concept || '').trim(),
    paymentStatus: String(source.paymentStatus || source.payment_status || source.status || 'paid').trim().toLowerCase(),
    amountTotal: Number(source.amountTotal ?? source.amount_total ?? source.amount ?? 0),
    currency: String(source.currency || 'eur').trim().toLowerCase(),
    status: String(source.projectStatus || source.portalStatus || source.statusProject || 'reservation_confirmed').trim(),
    requestedFilmingAt,
    filmingAt: requestedFilmingAt,
    appointmentAt: source.appointmentAt || source.appointment_at || metadata.appointmentAt || null,
    nextAction: String(source.nextAction || metadata.nextAction || '').trim(),
    preparationUrl: String(source.preparationUrl || source.preparation_url || metadata.preparationUrl || '').trim(),
    bookingUrl: String(source.bookingUrl || source.booking_url || metadata.bookingUrl || env.PREPARATION_BOOKING_URL || env.BOOKING_URL || '').trim(),
    supplierEmail: String(source.supplierEmail || metadata.supplierEmail || env.STUDIO_SUPPLIER_EMAIL || '').trim().toLowerCase(),
    supplierName: String(source.supplierName || metadata.supplierName || env.STUDIO_SUPPLIER_NAME || '').trim(),
    referralCode: referralCodeFrom(source, metadata, clientReference),
  };
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || null;
}

function referralCodeFrom(source, metadata, clientReference) {
  const direct = String(
    source.referralCode
    || source.referral_code
    || source.ref
    || metadata.referralCode
    || metadata.referral_code
    || metadata.ref
    || '',
  ).toUpperCase();
  const directCode = normalizeReferral(direct);
  if (directCode) return directCode;
  const composite = String(clientReference || '').toUpperCase();
  const marker = composite.match(/NEPTUNE[-_:]?REF[-_:]?([A-Z0-9]{6,18})(?:$|[^A-Z0-9])/u);
  return marker ? marker[1] : '';
}

function normalizeReferral(value) {
  const clean = String(value || '')
    .replace(/^NEPTUNE[-_:]?REF[-_:]?/u, '')
    .replace(/[^A-Z0-9]/gu, '')
    .slice(0, 18);
  return clean.length >= 6 ? clean : '';
}

export function safeFilename(value) {
  return String(value || 'fichier').replace(/[\r\n"\\/]/gu, '_').slice(0, 180) || 'fichier';
}
