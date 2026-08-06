import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.OUTPUT_DIR || 'test-results/studio-passage-editor-v80');
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const orderId = 'order-v80';
let updatedPayload = null;
const adminState = {
  clients: [{ id: 'client-v80', email: 'lea@example.com', fullName: 'Léa Neptune', company: 'Neptune Business', active: true }],
  orders: [{
    id: orderId,
    clientId: 'client-v80',
    email: 'lea@example.com',
    fullName: 'Léa Neptune',
    company: 'Neptune Business',
    title: 'Passage initial',
    format: 'Hors Norme',
    status: 'appointment_confirmed',
    appointmentAt: '2026-08-10T08:00:00.000Z',
    filmingAt: '2026-08-25T12:00:00.000Z',
    preparationUrl: 'https://example.com/preparation',
    bookingUrl: 'https://example.com/reservation',
    nextAction: 'Préparer le passage',
    orderReference: 'NM-001',
    productCode: 'HORS-NORME',
    paymentStatus: 'paid',
    amountTotal: 250000,
    currency: 'eur',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-05T09:00:00.000Z',
    steps: [],
    files: [],
    schedules: [],
  }],
  supplierPayments: [],
  refundRequests: [],
  deletionRequests: [],
  finance: {},
};

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
});

await page.route('**/api/auth/status', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ authenticated: true, csrfToken: 'csrf-v80' }),
}));
await page.route('**/api/admin/clients', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(adminState),
}));
await page.route('**/api/admin/passage-update', async (route) => {
  updatedPayload = JSON.parse(route.request().postData() || '{}');
  Object.assign(adminState.orders[0], updatedPayload, {
    amountTotal: Number(updatedPayload.amountTotal || 0),
    updatedAt: '2026-08-06T12:00:00.000Z',
  });
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, order: adminState.orders[0] }),
  });
});
await page.route('**/api/admin/client-update', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ ok: true }),
}));

const response = await page.goto(`${baseUrl}/studio/clients.html#${orderId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() || 0}`);
await page.waitForSelector('#clientDialog[open]', { timeout: 10_000 });
await page.waitForSelector('[data-passage-tab-v80]', { timeout: 10_000 });
await page.locator('[data-passage-tab-v80]').click();
await page.waitForSelector('#passageEditorFormV80', { timeout: 10_000 });

const initialAudit = await page.evaluate(() => {
  const form = document.querySelector('#passageEditorFormV80');
  return {
    snapshotCards: document.querySelectorAll('.passage-v80-snapshot-card').length,
    sections: document.querySelectorAll('.passage-v80-card').length,
    requiredTitle: form?.querySelector('input[name="title"]')?.required || false,
    requiredFormat: form?.querySelector('input[name="format"]')?.required || false,
    hasAppointment: Boolean(form?.querySelector('input[name="appointmentAt"]')),
    hasFilming: Boolean(form?.querySelector('input[name="filmingAt"]')),
    hasPayment: Boolean(form?.querySelector('input[name="amountEuros"]')),
    horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
  };
});

if (initialAudit.snapshotCards !== 4) errors.push('Le résumé du passage doit contenir quatre cartes.');
if (initialAudit.sections !== 4) errors.push('La fiche du passage doit contenir quatre sections principales.');
if (!initialAudit.requiredTitle || !initialAudit.requiredFormat) errors.push('Le nom et le format doivent être obligatoires.');
if (!initialAudit.hasAppointment || !initialAudit.hasFilming) errors.push('Les deux dates opérationnelles sont absentes.');
if (!initialAudit.hasPayment) errors.push('Les informations de paiement sont absentes.');
if (initialAudit.horizontalOverflow > 3) errors.push(`Débordement horizontal desktop : ${initialAudit.horizontalOverflow}px.`);

const form = page.locator('#passageEditorFormV80');
await form.locator('input[name="title"]').fill('Passage stratégique septembre');
await form.locator('input[name="format"]').fill('Concept Libre');
await form.locator('select[name="status"]').selectOption('filming_scheduled');
await form.locator('input[name="appointmentAt"]').fill('2026-08-18T10:00');
await form.locator('input[name="filmingAt"]').fill('2026-09-02T14:30');
await form.locator('input[name="nextAction"]').fill('Se présenter au studio avec les éléments validés');
await form.locator('input[name="amountEuros"]').fill('3200,00');

const saveResponse = page.waitForResponse((item) => item.url().includes('/api/admin/passage-update') && item.request().method() === 'POST');
await form.locator('button[type="submit"]').click();
const saved = await saveResponse;
if (!saved.ok()) errors.push(`La mutation du passage a répondu HTTP ${saved.status()}.`);
await page.waitForTimeout(850);
await page.waitForSelector('#passageEditorFormV80', { timeout: 10_000 });

if (!updatedPayload) errors.push('La mutation du passage n’a pas été envoyée.');
if (updatedPayload?.title !== 'Passage stratégique septembre') errors.push('Le nouveau nom du passage n’a pas été transmis.');
if (updatedPayload?.format !== 'Concept Libre') errors.push('Le nouveau format n’a pas été transmis.');
if (updatedPayload?.status !== 'filming_scheduled') errors.push('Le nouveau statut n’a pas été transmis.');
if (updatedPayload?.amountTotal !== 320000) errors.push(`Montant incorrect : ${updatedPayload?.amountTotal}.`);
if (!updatedPayload?.expectedUpdatedAt) errors.push('Le verrou optimiste updatedAt est absent.');

const persistedAudit = await page.evaluate(() => {
  const form = document.querySelector('#passageEditorFormV80');
  return {
    title: form?.querySelector('input[name="title"]')?.value || '',
    format: form?.querySelector('input[name="format"]')?.value || '',
    status: form?.querySelector('select[name="status"]')?.value || '',
    amount: form?.querySelector('input[name="amountEuros"]')?.value || '',
  };
});
if (persistedAudit.title !== 'Passage stratégique septembre') errors.push('Le nom enregistré n’est pas rechargé dans la fiche.');
if (persistedAudit.format !== 'Concept Libre') errors.push('Le format enregistré n’est pas rechargé dans la fiche.');
if (persistedAudit.status !== 'filming_scheduled') errors.push('Le statut enregistré n’est pas rechargé dans la fiche.');

await page.screenshot({ path: path.join(outputDir, 'passage-editor-desktop-1440.png'), fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(150);
const mobileAudit = await page.evaluate(() => ({
  horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
  footerVisible: Boolean(document.querySelector('.passage-v80-footer')),
  submitVisible: Boolean(document.querySelector('.passage-v80-footer button[type="submit"]')),
}));
if (mobileAudit.horizontalOverflow > 3) errors.push(`Débordement horizontal mobile : ${mobileAudit.horizontalOverflow}px.`);
if (!mobileAudit.footerVisible || !mobileAudit.submitVisible) errors.push('L’action d’enregistrement mobile est absente.');
await page.screenshot({ path: path.join(outputDir, 'passage-editor-mobile-390.png'), fullPage: true });

await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ initialAudit, persistedAudit, mobileAudit, updatedPayload, errors }, null, 2));
await context.close();
await browser.close();

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Studio passage editor v80 validé : champs essentiels, mutation complète, verrou anti-écrasement et responsive mobile.');
