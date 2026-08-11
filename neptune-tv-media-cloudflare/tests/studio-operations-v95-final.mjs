import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.OUTPUT_DIR || 'test-results/studio-operations-v95');
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'started.txt'), new Date().toISOString());

const now = Date.now();
const iso = (offset) => new Date(now + offset).toISOString();
const client = {
  id: 'client-v95',
  email: 'lea@example.com',
  fullName: 'Léa Depoulain',
  company: 'Neptune business',
  active: true,
  lastAccessAt: iso(-3600000),
  createdAt: iso(-90 * 86400000),
  updatedAt: iso(0),
};
const orderA = {
  id: 'order-v95-a', clientId: client.id, email: client.email, fullName: client.fullName, company: client.company,
  title: 'Passage Neptune Media', format: 'Hors Norme', status: 'editing', paymentStatus: 'paid', amountTotal: 250000,
  currency: 'eur', appointmentAt: iso(-16 * 86400000), filmingAt: iso(-9 * 86400000), createdAt: iso(-40 * 86400000),
  updatedAt: iso(0), files: [], steps: [], schedules: [], nextAction: 'Montage en cours',
};
const orderB = {
  ...orderA, id: 'order-v95-b', title: 'Deuxième passage', format: 'Libre', status: 'filming_confirmed',
  appointmentAt: iso(3 * 86400000), filmingAt: iso(10 * 86400000), createdAt: iso(-3 * 86400000),
  updatedAt: iso(-2 * 3600000), nextAction: 'Passage à venir',
};
const adminState = { clients: [client], orders: [orderA, orderB], supplierPayments: [], refundRequests: [], deletionRequests: [], finance: {} };
const supplier = {
  id: 'recbox', name: 'RECBOX', email: 'contact@recbox.fr', legalName: 'RECBOX', defaultNetCents: 60000,
  vatRateBps: 2000, defaultGrossCents: 72000, active: true,
};
const formats = [
  { id: 'format-hors-norme', slug: 'hors-norme', name: 'Hors Norme', concept: 'Émission Neptune Business', description: 'Un passage éditorial structuré.', durationLabel: '', priceCents: 0, bookingUrl: '', active: true, publicOrder: 10 },
  { id: 'format-libre', slug: 'libre', name: 'Libre', concept: 'Format libre', description: 'Un concept configurable.', durationLabel: '', priceCents: 0, bookingUrl: '', active: true, publicOrder: 20 },
];
let financeStatus = 'assigned';
const finance = () => ({
  id: 'finance-v95', orderId: orderA.id, supplierId: supplier.id, status: financeStatus,
  netCents: 60000, vatCents: 12000, grossCents: 72000,
  invoiceNumber: ['received', 'paid'].includes(financeStatus) ? 'REC-2026-0811' : '',
  invoiceUrl: ['received', 'paid'].includes(financeStatus) ? 'https://drive.google.com/invoice' : '',
  requestedAt: financeStatus === 'assigned' ? null : iso(-60000),
  receivedAt: ['received', 'paid'].includes(financeStatus) ? iso(-30000) : null,
  paidAt: financeStatus === 'paid' ? iso(-10000) : null,
  paymentReference: financeStatus === 'paid' ? 'VIR-RECBOX-0811' : '',
  supplierName: supplier.name, supplierEmail: supplier.email, supplierLegalName: supplier.legalName, vatRateBps: supplier.vatRateBps,
});
const account = { ok: true, release: 'neptune-studio-operations-20260811-v95', client, orders: [orderB, orderA], finance: [] };
const configuration = () => ({ ok: true, release: 'neptune-studio-operations-20260811-v95', suppliers: [supplier], formats });

function journeyFor(order) {
  return {
    ok: true,
    order: {
      ...order, orderReference: 'NM-V95', productCode: 'HORS-NORME', preparationUrl: 'https://meet.google.com/neptune-v95',
      bookingUrl: '', supplierName: 'REC BOX Studio', supplierStatus: 'confirmed', supplierNote: '', preparationStatus: 'completed',
      sourceReceivedAt: iso(-3 * 86400000), sourceDeliveryDueAt: iso(-2 * 86400000), sourceQcStatus: 'complete',
      editingStartedAt: order.status === 'editing' ? iso(-3 * 86400000) : null, deliveryDueAt: iso(4 * 86400000), deliveredAt: null,
      formatSelected: true, canClientChangeDate: false, dateLocked: true, supplierWaitHours: 0, supplierRelaunchAvailable: false,
      preparationBookingUrl: 'https://calendar.app.google/X9q1T5JT9ngMfZY67', reservationUrl: 'https://media.neptunebusiness.com/reserver',
      inventory: { sourceCount: 3, finalCount: 0, shortCount: 0, hasSource: true, hasFinal: false, hasShort: false }, sourceMailSent: true,
    },
    siblings: [orderA, orderB], agenda: [], messages: [], preference: { status: 'applied', preferences: [], submittedAt: iso(-20 * 86400000) },
    stripe: { stripe: { state: 'paid_verified', options: [], candidates: [] } }, fallbackPaymentLinks: [],
  };
}

const errors = [];
const report = {};
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(`studio pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(`studio console: ${message.text()}`);
});
const respond = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

await page.route('**/api/admin/**', (route) => respond(route, { ok: true }));
await page.route('**/api/admin/studio-operations-v95/client-account', (route) => respond(route, account));
await page.route('**/api/admin/studio-operations-v95/configuration', (route) => respond(route, configuration()));
await page.route('**/api/admin/studio-operations-v95/supplier-payment/context', (route) => respond(route, {
  ok: true, release: 'neptune-studio-operations-20260811-v95', order: orderA, suppliers: [supplier], payments: [finance()],
}));
await page.route('**/api/admin/studio-operations-v95/supplier-payment/action', (route) => {
  const body = route.request().postDataJSON?.() || {};
  if (body.action === 'request_invoice') financeStatus = 'requested';
  if (body.action === 'mark_received') financeStatus = 'received';
  if (body.action === 'mark_paid') financeStatus = 'paid';
  return respond(route, { ok: true, payment: finance() });
});
await page.route('**/api/admin/journey-v92/context', (route) => {
  const body = route.request().postDataJSON?.() || {};
  return respond(route, journeyFor(body.orderId === orderB.id ? orderB : orderA));
});
await page.route('**/api/admin/clients', (route) => respond(route, adminState));
await page.route('**/api/auth/status', (route) => respond(route, { authenticated: true, csrfToken: 'csrf-v95' }));

const response = await page.goto(`${baseUrl}/studio/clients.html`, { waitUntil: 'networkidle', timeout: 60000 });
if (!response || response.status() >= 400) throw new Error(`Studio HTTP ${response?.status() || 0}`);
await page.locator(`[data-order-card="${orderA.id}"]`).click();
await page.waitForSelector('#clientDialog[open]', { timeout: 10000 });
await page.addStyleTag({ url: `${baseUrl}/studio/simple-journey-v92.css?v=3` });
await page.addScriptTag({ url: `${baseUrl}/studio/simple-journey-v92.js?v=1`, type: 'module' });
await page.waitForSelector('.v93-journey-rail', { timeout: 10000 });

await page.evaluate(() => {
  if (document.getElementById('manageClientAccounts')) return;
  const button = document.createElement('button');
  button.id = 'manageClientAccounts';
  button.type = 'button';
  button.textContent = 'Comptes clients';
  (document.querySelector('.clients-top-actions') || document.body).append(button);
});
await page.addScriptTag({ url: `${baseUrl}/studio/studio-operations-compat-v95.js?v=1`, type: 'module' });
await page.addStyleTag({ url: `${baseUrl}/studio/studio-operations-v95.css?v=1` });
await page.addScriptTag({ url: `${baseUrl}/studio/studio-operations-v95.js?v=1`, type: 'module' });
await page.waitForSelector('#openMediaConfigurationV95', { timeout: 10000 });

await page.evaluate(() => {
  let button = [...document.querySelectorAll('button')].find((node) => /^gérer le compte$/iu.test(node.textContent?.trim() || ''));
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Gérer le compte';
    (document.querySelector('#clientDetail .detail-title') || document.getElementById('clientDetail')).append(button);
  }
  button.dataset.v95AccountTest = '1';
});

await page.locator('[data-v95-account-test]').click();
await page.waitForSelector('#clientAccountV95[open]');
await page.waitForSelector('#clientAccountV95 .v95-passage-row');
report.account = await page.evaluate(() => ({
  title: document.querySelector('[data-v95-account-title]')?.textContent || '',
  rows: document.querySelectorAll('#clientAccountV95 .v95-passage-row').length,
  hasNewPassage: Boolean(document.querySelector('[data-v95-new-passage]')),
  hasManagerBridge: Boolean(document.querySelector('[data-v95-manager-bridge]')),
  overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
}));
if (!report.account.title.includes('Léa')) errors.push('Compte client: identité absente.');
if (report.account.rows !== 2) errors.push(`Compte client: ${report.account.rows} passages au lieu de 2.`);
if (!report.account.hasNewPassage) errors.push('Compte client: Nouveau passage absent.');
if (!report.account.hasManagerBridge) errors.push('Compte client: pont v76 absent.');
if (report.account.overflow > 3) errors.push(`Compte client desktop: overflow ${report.account.overflow}px.`);
await page.screenshot({ path: path.join(outputDir, 'client-account-desktop-1440.png') });

const navCount = await page.evaluate(() => performance.getEntriesByType('navigation').length);
await page.locator(`[data-v95-open-order="${orderB.id}"]`).click();
await page.waitForTimeout(250);
report.navigation = await page.evaluate(() => ({
  hash: location.hash,
  navigationEntries: performance.getEntriesByType('navigation').length,
  dossierOpen: Boolean(document.getElementById('clientDialog')?.open),
}));
if (!report.navigation.hash.includes(orderB.id) || !report.navigation.dossierOpen) errors.push('Voir dossier: le passage cible ne s’ouvre pas immédiatement.');
if (report.navigation.navigationEntries !== navCount) errors.push('Voir dossier: un rechargement a été déclenché.');

await page.evaluate(() => {
  let button = [...document.querySelectorAll('button')].find((node) => /^gérer le compte$/iu.test(node.textContent?.trim() || ''));
  if (!button) {
    button = document.createElement('button'); button.type = 'button'; button.textContent = 'Gérer le compte';
    (document.querySelector('#clientDetail .detail-title') || document.getElementById('clientDetail')).append(button);
  }
  button.dataset.v95AccountTest = '1';
});
await page.locator('[data-v95-account-test]').click();
await page.waitForSelector('#clientAccountV95[open]');
await page.locator('[data-v95-new-passage]').click();
await page.waitForSelector('#newDialog[open]');
report.prefill = await page.evaluate(() => ({
  email: document.querySelector('#newOrder [name="email"]')?.value || '',
  fullName: document.querySelector('#newOrder [name="fullName"]')?.value || '',
  company: document.querySelector('#newOrder [name="company"]')?.value || '',
}));
if (report.prefill.email !== client.email || !report.prefill.fullName.includes('Léa') || report.prefill.company !== client.company) {
  errors.push(`Nouveau passage: préremplissage incorrect ${JSON.stringify(report.prefill)}.`);
}
await page.evaluate(() => document.getElementById('newDialog')?.close());

await page.locator(`[data-order-card="${orderA.id}"]`).click();
await page.waitForTimeout(150);
const paymentTab = page.locator('[role="tab"]').filter({ hasText: /Paiement/i }).first();
if (await paymentTab.count()) await paymentTab.click();
else await page.locator('[role="tab"][data-v93-step="1"]').click();
await page.waitForSelector('[data-v95-supplier-finance]');
await page.waitForTimeout(120);
const paymentMount = page.locator('[data-v95-supplier-finance]').first();
let paymentText = await paymentMount.innerText();
if (!paymentText.includes('RECBOX') || !paymentText.includes('600') || !paymentText.includes('720')) errors.push('Paiement fournisseur: RECBOX 600 HT / 720 TTC non visible.');
if (!paymentText.includes('Demander la facture')) errors.push('Paiement fournisseur: demande de facture absente.');
await paymentMount.locator('[data-v95-request-invoice]').click();
await page.waitForTimeout(180);
paymentText = await paymentMount.innerText();
if (!paymentText.includes('Facture demandée') || !paymentText.includes('Facture reçue')) errors.push('Paiement fournisseur: transition facture demandée incorrecte.');
await page.screenshot({ path: path.join(outputDir, 'supplier-payment-desktop-1440.png') });

await paymentMount.locator('[data-v95-manage-suppliers]').click();
await page.waitForSelector('#mediaConfigurationV95[open]');
await page.waitForSelector('[data-v95-supplier-form="recbox"]');
const supplierConfiguration = await page.locator('[data-v95-supplier-form="recbox"]').evaluate((form) => ({
  text: form.innerText,
  net: form.querySelector('[name="netEuros"]')?.value || '',
  vat: form.querySelector('[name="vatRate"]')?.value || '',
  gross: [...form.querySelectorAll('input')].find((input) => input.readOnly)?.value || '',
}));
report.supplierConfiguration = supplierConfiguration;
if (!supplierConfiguration.text.includes('RECBOX') || Number(supplierConfiguration.net) !== 600 || Number(supplierConfiguration.vat) !== 20 || !supplierConfiguration.gross.includes('720')) {
  errors.push(`Configuration: valeurs RECBOX incorrectes ${JSON.stringify(supplierConfiguration)}.`);
}
await page.locator('[data-v95-config-tab="formats"]').click();
const formatConfigText = await page.locator('#mediaConfigurationV95').innerText();
if (!formatConfigText.includes('Hors Norme') || !formatConfigText.includes('Libre')) errors.push('Configuration: formats actifs absents.');
await page.screenshot({ path: path.join(outputDir, 'media-configuration-desktop-1440.png') });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(180);
report.mobileStudio = await page.evaluate(() => {
  const dialog = document.getElementById('mediaConfigurationV95')?.getBoundingClientRect();
  return {
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    dialogWidth: Math.round(dialog?.width || 0), viewportWidth: innerWidth,
  };
});
if (report.mobileStudio.overflow > 3) errors.push(`Studio mobile: overflow ${report.mobileStudio.overflow}px.`);
if (report.mobileStudio.dialogWidth < report.mobileStudio.viewportWidth - 2) errors.push(`Studio mobile: configuration non plein écran (${report.mobileStudio.dialogWidth}/${report.mobileStudio.viewportWidth}).`);
await page.screenshot({ path: path.join(outputDir, 'media-configuration-mobile-390.png') });
await context.close();

const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const clientPage = await clientContext.newPage();
clientPage.on('pageerror', (error) => {
  if (!/fetch|network/iu.test(error.message)) errors.push(`client pageerror: ${error.message}`);
});
await clientPage.route('**/api/**', (route) => respond(route, { ok: true, authenticated: true, client, orders: [orderA], order: orderA, files: [], schedules: [] }));
await clientPage.route('**/api/public/media-catalog-v95', (route) => respond(route, { ok: true, formats }));
const clientResponse = await clientPage.goto(`${baseUrl}/espace-client/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
if (!clientResponse || clientResponse.status() >= 400) throw new Error(`Client HTTP ${clientResponse?.status() || 0}`);
await clientPage.addStyleTag({ url: `${baseUrl}/espace-client/media-catalog-v95.css?v=1` });
await clientPage.addScriptTag({ url: `${baseUrl}/espace-client/media-catalog-v95.js?v=1`, type: 'module' });
await clientPage.waitForSelector('[data-media-catalog-v95] .cmc95-card');
report.clientCatalog = await clientPage.evaluate(() => ({
  cards: document.querySelectorAll('[data-media-catalog-v95] .cmc95-card').length,
  overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
  buttons: [...document.querySelectorAll('.cmc95-footer a')].map((node) => ({ text: node.textContent.trim(), height: Math.round(node.getBoundingClientRect().height), width: Math.round(node.getBoundingClientRect().width) })),
}));
if (report.clientCatalog.cards !== 2) errors.push(`Espace client: ${report.clientCatalog.cards} formats au lieu de 2.`);
if (report.clientCatalog.overflow > 3) errors.push(`Espace client mobile: overflow ${report.clientCatalog.overflow}px.`);
if (report.clientCatalog.buttons.some((button) => button.height < 44 || !button.text.includes('Choisir'))) errors.push(`Espace client mobile: CTA non tactile ${JSON.stringify(report.clientCatalog.buttons)}.`);
await clientPage.screenshot({ path: path.join(outputDir, 'client-media-catalog-mobile-390.png'), fullPage: true });
await clientContext.close();
await browser.close();

report.errors = errors;
await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Studio operations v95 final visual audit passed: client account, no-reload dossier navigation, prefilled passage, supplier invoice workflow, configuration and client catalog are responsive.');
