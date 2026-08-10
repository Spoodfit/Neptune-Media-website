const ACTIVE_PAYMENT_LINKS = Object.freeze([
  { id: 'plink_1TnlktFBHUPYDjPsnodMwjLh', format: 'Hors Norme', offer: 'standard', name: 'Neptune Média - Hors Norme', url: 'https://buy.stripe.com/8x214n2CN22C5ps9Cu73G0a' },
  { id: 'plink_1TnleIFBHUPYDjPsHEW3GUSQ', format: 'Concept Libre', offer: 'promo', name: 'Neptune Média - Concept Libre promo', url: 'https://book.stripe.com/dRm14nfpz8r04lo7um73G09' },
  { id: 'plink_1Tltb8FBHUPYDjPsdGzneVsc', format: 'Concept Libre', offer: 'base', name: 'Neptune Média - Tarif de base Concept Libre', url: 'https://buy.stripe.com/28EcN5a5fcHg5psdSK73G08' },
  { id: 'plink_1Tlta5FBHUPYDjPsU8VxRDSe', format: 'Hors Norme', offer: 'base', name: 'Neptune Média - Tarif de base Hors Norme', url: 'https://buy.stripe.com/14AcN5gtD7mW19c8yq73G07' },
  { id: 'plink_1TltXEFBHUPYDjPsZxQlq9K0', format: 'Hors Norme', offer: 'lancement', name: 'Neptune Média - Lancement Hors Norme', url: 'https://buy.stripe.com/cNi8wPelvgXw9FIdSK73G06' },
  { id: 'plink_1TltRLFBHUPYDjPsKZVWCdx5', format: 'Concept Libre', offer: 'lancement', name: 'Neptune Média - Lancement Concept Libre', url: 'https://book.stripe.com/fZu9AT1yJ5eO2dg4ia73G05' },
]);

export function fallbackPaymentLinksV92(format, orderId = '', email = '') {
  const normalized = normalizeFormat(format);
  return ACTIVE_PAYMENT_LINKS
    .filter((item) => normalizeFormat(item.format) === normalized)
    .map((item) => ({ ...item, url: decorate(item.url, orderId, email), source: 'payment_links.csv' }));
}

export function isKnownPaymentLinkV92(value) {
  try {
    const url = new URL(String(value || ''));
    return ['buy.stripe.com', 'book.stripe.com'].includes(url.hostname)
      && ACTIVE_PAYMENT_LINKS.some((item) => new URL(item.url).pathname === url.pathname && new URL(item.url).hostname === url.hostname);
  } catch {
    return false;
  }
}

export function decoratePaymentLinkV92(value, orderId = '', email = '') {
  if (!isKnownPaymentLinkV92(value)) return '';
  return decorate(value, orderId, email);
}

function decorate(value, orderId, email) {
  const url = new URL(value);
  if (orderId) url.searchParams.set('client_reference_id', `NPORD_${String(orderId).slice(0, 180)}`);
  if (email) url.searchParams.set('locked_prefilled_email', String(email).trim().toLowerCase().slice(0, 240));
  return url.toString();
}

function normalizeFormat(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('hors')) return 'hors-norme';
  if (text.includes('libre')) return 'concept-libre';
  return text.replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
}
