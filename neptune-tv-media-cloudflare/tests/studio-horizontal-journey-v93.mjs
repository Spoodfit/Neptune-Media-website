import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.OUTPUT_DIR || 'test-results/studio-horizontal-journey-v93');
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'started.json'), JSON.stringify({ startedAt: new Date().toISOString() }, null, 2));

const orderId = 'order-v93';
const now = Date.now();
const isoAfter = (days, hour = 10) => {
  const d = new Date(now + days * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const adminState = {
  clients: [{ id: 'client-v93', email: 'lea@example.com', fullName: 'Léa Neptune', company: 'Neptune Business', active: true }],
  orders: [{
    id: orderId, clientId: 'client-v93', email: 'lea@example.com', fullName: 'Léa Neptune', company: 'Neptune Business',
    title: 'Passage stratégique', format: 'Hors Norme', status: 'reservation_confirmed', paymentStatus: 'paid', amountTotal: 250000,
    currency: 'eur', appointmentAt: null, filmingAt: null, createdAt: new Date(now - 86400000).toISOString(), updatedAt: new Date().toISOString(),
    files: [], steps: [], schedules: [],
  }],
  supplierPayments: [], refundRequests: [], deletionRequests: [], finance: {},
};
const journey = {
  ok: true,
  order: {
    ...adminState.orders[0], orderReference: 'NM-V93', productCode: 'HORS-NORME', preparationUrl: '', bookingUrl: '', nextAction: '',
    supplierName: 'REC BOX Studio', supplierStatus: 'not_required', supplierNote: '', preparationStatus: 'to_book', sourceReceivedAt: null,
    sourceDeliveryDueAt: null, sourceQcStatus: 'not_started', editingStartedAt: null, deliveryDueAt: null, deliveredAt: null,
    formatSelected: true, canClientChangeDate: false, dateLocked: false, supplierWaitHours: 0, supplierRelaunchAvailable: false,
    preparationBookingUrl: 'https://calendar.app.google/X9q1T5JT9ngMfZY67', reservationUrl: 'https://media.neptunebusiness.com/reserver',
    inventory: { sourceCount: 0, finalCount: 0, shortCount: 0, hasSource: false, hasFinal: false, hasShort: false }, sourceMailSent: false,
  },
  siblings: [{ ...adminState.orders[0] }],
  agenda: [],
  messages: [{ messageKey: 'passage_reminder_7d', recipientType: 'client', status: 'pending', scheduledAt: isoAfter(6), createdAt: new Date().toISOString() }],
  preference: { status: 'submitted', preferences: [isoAfter(18, 9), isoAfter(19, 14), isoAfter(21, 11)], submittedAt: new Date().toISOString() },
  stripe: { stripe: { state: 'paid_verified', options: [], candidates: [] } },
  fallbackPaymentLinks: [],
};

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(`console: ${message.text()}`);
});

const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
// Playwright prioritizes the most recently registered matching route.
await page.route('**/api/admin/**', (route) => json(route, { ok: true }));
await page.route('**/api/admin/journey-v92/context', (route) => json(route, journey));
await page.route('**/api/admin/clients', (route) => json(route, adminState));
await page.route('**/api/auth/status', (route) => json(route, { authenticated: true, csrfToken: 'csrf-v93' }));

const response = await page.goto(`${baseUrl}/studio/clients.html`, { waitUntil: 'networkidle', timeout: 60_000 });
if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() || 0}`);
const card = page.locator(`[data-order-card="${orderId}"]`);
await card.waitFor({ state: 'visible', timeout: 10_000 });
await card.click();
await page.waitForSelector('#clientDialog[open]', { timeout: 10_000 });
await page.addStyleTag({ url: `${baseUrl}/studio/simple-journey-v92.css?v=3` });
await page.addScriptTag({ url: `${baseUrl}/studio/simple-journey-v92.js?v=1`, type: 'module' });
await page.waitForSelector('.v93-journey-rail', { timeout: 10_000 });
await page.waitForSelector('.v93-tab.is-selected', { timeout: 10_000 });

const desktop = await page.evaluate(() => {
  const root = document.querySelector('#clientDetail');
  const rail = document.querySelector('.v93-rail-scroll');
  const railSection = document.querySelector('.v93-journey-rail');
  const summary = document.querySelector('.v92-summary');
  const tabs = [...document.querySelectorAll('.v93-tab')];
  const panels = [...document.querySelectorAll('.v93-step-panel > .v92-step')];
  const visiblePanels = panels.filter((node) => !node.hidden && getComputedStyle(node).display !== 'none');
  const selected = document.querySelector('.v93-tab.is-selected');
  const selectedRect = selected?.getBoundingClientRect();
  const rootRect = root?.getBoundingClientRect();
  const summaryRect = summary?.getBoundingClientRect();
  const railRect = railSection?.getBoundingClientRect();
  return {
    tabs: tabs.length,
    visiblePanels: visiblePanels.length,
    selectedText: selected?.innerText || '',
    bodyOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    railOverflow: rail ? rail.scrollWidth - rail.clientWidth : 999,
    verticalGap: summaryRect && railRect ? Math.round(railRect.top - summaryRect.bottom) : 999,
    selectedInsideViewport: Boolean(selectedRect && selectedRect.left >= 0 && selectedRect.right <= innerWidth),
    rootInsideViewport: Boolean(rootRect && rootRect.left >= 0 && rootRect.right <= innerWidth),
  };
});
if (desktop.tabs !== 8) errors.push(`Desktop: ${desktop.tabs} étapes au lieu de 8.`);
if (desktop.visiblePanels !== 1) errors.push(`Desktop: ${desktop.visiblePanels} panneaux détaillés visibles.`);
if (desktop.bodyOverflow > 3) errors.push(`Desktop: débordement global ${desktop.bodyOverflow}px.`);
if (desktop.railOverflow > 3) errors.push(`Desktop: les 8 étapes ne tiennent pas sur la largeur (${desktop.railOverflow}px).`);
if (desktop.verticalGap < 0 || desktop.verticalGap > 35) errors.push(`Desktop: espace résumé → rail anormal (${desktop.verticalGap}px).`);
if (!desktop.selectedInsideViewport || !desktop.rootInsideViewport) errors.push('Desktop: rail ou dossier hors viewport.');

await page.locator('[role="tab"][data-v93-step="4"]').click();
await page.waitForTimeout(100);
const availability = await page.locator('[data-v93-client-availability="true"]').textContent().catch(() => '');
if (!availability || !availability.includes('Disponibilités client')) errors.push('Les disponibilités client ne sont pas visibles dans l’étape Passage.');
await page.screenshot({ path: path.join(outputDir, 'horizontal-journey-desktop-1440.png') });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(180);
await page.locator('[role="tab"][data-v93-step="2"]').click();
await page.waitForTimeout(80);
const mobile = await page.evaluate(() => {
  const rail = document.querySelector('.v93-rail-scroll');
  const railSection = document.querySelector('.v93-journey-rail');
  const summary = document.querySelector('.v92-summary');
  const selected = document.querySelector('.v93-tab.is-selected');
  const detail = document.querySelector('.v93-selected-step');
  const selectedRect = selected?.getBoundingClientRect();
  const detailRect = detail?.getBoundingClientRect();
  const summaryRect = summary?.getBoundingClientRect();
  const railRect = railSection?.getBoundingClientRect();
  return {
    bodyOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    railScrollable: Boolean(rail && rail.scrollWidth > rail.clientWidth + 20),
    verticalGap: summaryRect && railRect ? Math.round(railRect.top - summaryRect.bottom) : 999,
    selectedInsideViewport: Boolean(selectedRect && selectedRect.left >= -2 && selectedRect.right <= innerWidth + 2),
    detailInsideViewport: Boolean(detailRect && detailRect.left >= -2 && detailRect.right <= innerWidth + 2),
    visiblePanels: [...document.querySelectorAll('.v93-step-panel > .v92-step')].filter((node) => !node.hidden && getComputedStyle(node).display !== 'none').length,
  };
});
if (mobile.bodyOverflow > 3) errors.push(`Mobile: débordement global ${mobile.bodyOverflow}px.`);
if (!mobile.railScrollable) errors.push('Mobile: le rail n’est pas horizontalement scrollable.');
if (mobile.verticalGap < 0 || mobile.verticalGap > 28) errors.push(`Mobile: espace résumé → rail anormal (${mobile.verticalGap}px).`);
if (!mobile.selectedInsideViewport || !mobile.detailInsideViewport) errors.push('Mobile: étape sélectionnée ou détail hors viewport.');
if (mobile.visiblePanels !== 1) errors.push(`Mobile: ${mobile.visiblePanels} panneaux détaillés visibles.`);
await page.screenshot({ path: path.join(outputDir, 'horizontal-journey-mobile-390.png') });

await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ desktop, mobile, availability, errors }, null, 2));
await context.close();
await browser.close();

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Horizontal journey v93 visual audit passed: 8-step desktop rail, single detail panel, compact spacing, exact availability and mobile horizontal navigation.');
