import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.OUTPUT_DIR || 'test-results/studio-drive-upload-v94');
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const now = Date.now();
const orderId = 'order-drive-v94';
const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
const adminState = {
  clients: [{ id: 'client-drive-v94', email: 'test@neptunebusiness.com', fullName: 'Client Test Neptune', company: 'Neptune Business', active: true }],
  orders: [{
    id: orderId,
    clientId: 'client-drive-v94',
    email: 'test@neptunebusiness.com',
    fullName: 'Client Test Neptune',
    company: 'Neptune Business',
    title: 'Passage Hors Norme',
    format: 'Hors Norme',
    status: 'editing',
    paymentStatus: 'paid',
    amountTotal: 250000,
    currency: 'eur',
    appointmentAt: iso(-16 * 86400000),
    filmingAt: iso(-9 * 86400000),
    createdAt: iso(-40 * 86400000),
    updatedAt: iso(0),
    files: [], steps: [], schedules: [],
  }],
  supplierPayments: [], refundRequests: [], deletionRequests: [], finance: {},
};
const journey = {
  ok: true,
  order: {
    ...adminState.orders[0],
    orderReference: 'NM-V94',
    productCode: 'HORS-NORME',
    preparationUrl: 'https://meet.google.com/test-neptune',
    bookingUrl: '',
    nextAction: 'Montage en cours',
    supplierName: 'REC BOX Studio',
    supplierStatus: 'confirmed',
    supplierNote: '',
    preparationStatus: 'completed',
    sourceReceivedAt: iso(-3 * 86400000),
    sourceDeliveryDueAt: iso(-2 * 86400000),
    sourceQcStatus: 'complete',
    editingStartedAt: iso(-3 * 86400000),
    deliveryDueAt: iso(4 * 86400000),
    deliveredAt: null,
    formatSelected: true,
    canClientChangeDate: false,
    dateLocked: true,
    supplierWaitHours: 0,
    supplierRelaunchAvailable: false,
    preparationBookingUrl: 'https://calendar.app.google/X9q1T5JT9ngMfZY67',
    reservationUrl: 'https://media.neptunebusiness.com/reserver',
    inventory: { sourceCount: 3, finalCount: 0, shortCount: 0, hasSource: true, hasFinal: false, hasShort: false },
    sourceMailSent: true,
  },
  siblings: [{ ...adminState.orders[0] }],
  agenda: [],
  messages: [],
  preference: { status: 'applied', preferences: [], submittedAt: iso(-20 * 86400000) },
  stripe: { stripe: { state: 'paid_verified', options: [], candidates: [] } },
  fallbackPaymentLinks: [],
};
const driveTarget = {
  ok: true,
  release: 'neptune-studio-drive-upload-20260811-v94',
  ready: true,
  orderId,
  passageNumber: 2,
  passageFolderUrl: 'https://drive.google.com/drive/folders/neptune-test-v94',
  syncStatus: 'ready',
  lastScanAt: iso(-300000),
  title: 'Passage Hors Norme',
  format: 'Hors Norme',
  client: { email: 'test@neptunebusiness.com', fullName: 'Client Test Neptune', company: 'Neptune Business' },
  destinations: { long: 'Long format', short: 'Shorts' },
};

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(`console: ${message.text()}`);
});

const respond = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
await page.route('**/api/admin/**', (route) => respond(route, { ok: true }));
await page.route('**/api/admin/drive-upload-v94/target', (route) => respond(route, driveTarget));
await page.route('**/api/admin/journey-v92/context', (route) => respond(route, journey));
await page.route('**/api/admin/clients', (route) => respond(route, adminState));
await page.route('**/api/auth/status', (route) => respond(route, { authenticated: true, csrfToken: 'csrf-v94' }));

const response = await page.goto(`${baseUrl}/studio/clients.html`, { waitUntil: 'networkidle', timeout: 60_000 });
if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() || 0}`);
await page.locator(`[data-order-card="${orderId}"]`).click();
await page.waitForSelector('#clientDialog[open]', { timeout: 10_000 });
await page.addStyleTag({ url: `${baseUrl}/studio/simple-journey-v92.css?v=3` });
await page.addScriptTag({ url: `${baseUrl}/studio/simple-journey-v92.js?v=1`, type: 'module' });
await page.waitForSelector('.v93-journey-rail', { timeout: 10_000 });
await page.locator('[role="tab"][data-v93-step="6"]').click();
await page.waitForTimeout(100);
await page.addStyleTag({ url: `${baseUrl}/studio/drive-upload-v94.css?v=1` });
await page.addScriptTag({ url: `${baseUrl}/studio/drive-upload-v94.js?v=1`, type: 'module' });
await page.waitForSelector('[data-drive-upload-v94]', { timeout: 10_000 });
await page.waitForSelector('[data-v94-zone="long"]', { state: 'visible', timeout: 10_000 });
await page.waitForSelector('[data-v94-zone="short"]', { state: 'visible', timeout: 10_000 });

const desktop = await page.evaluate(() => {
  const uploader = document.querySelector('[data-drive-upload-v94]');
  const long = document.querySelector('[data-v94-zone="long"]');
  const short = document.querySelector('[data-v94-zone="short"]');
  const link = document.querySelector('.v94-drive-link');
  const uploaderRect = uploader?.getBoundingClientRect();
  const longRect = long?.getBoundingClientRect();
  const shortRect = short?.getBoundingClientRect();
  return {
    zones: document.querySelectorAll('[data-v94-zone]').length,
    bodyOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    uploaderInsideViewport: Boolean(uploaderRect && uploaderRect.left >= 0 && uploaderRect.right <= innerWidth),
    twoColumns: Boolean(longRect && shortRect && Math.abs(longRect.top - shortRect.top) <= 3 && shortRect.left > longRect.left + 80),
    zoneHeightDifference: longRect && shortRect ? Math.abs(Math.round(longRect.height - shortRect.height)) : 999,
    driveLink: link?.textContent?.trim() || '',
    driveHref: link?.getAttribute('href') || '',
    legacyUploadInsideMontage: Boolean(document.querySelector('.v93-step-panel > .v92-step:not([hidden]) #uploadForm')),
  };
});
if (desktop.zones !== 2) errors.push(`Desktop: ${desktop.zones} destinations au lieu de 2.`);
if (desktop.bodyOverflow > 3) errors.push(`Desktop: débordement global ${desktop.bodyOverflow}px.`);
if (!desktop.uploaderInsideViewport) errors.push('Desktop: uploader hors viewport.');
if (!desktop.twoColumns) errors.push('Desktop: Long format et Shorts ne sont pas disposés sur deux colonnes lisibles.');
if (desktop.zoneHeightDifference > 3) errors.push(`Desktop: hauteur des zones déséquilibrée (${desktop.zoneHeightDifference}px).`);
if (!desktop.driveLink.includes('Ouvrir le Drive') || !desktop.driveHref.includes('drive.google.com')) errors.push('Desktop: lien vers le Drive du passage absent.');
if (desktop.legacyUploadInsideMontage) errors.push('Desktop: ancien dépôt Cloudflare présent dans Montage.');
await page.screenshot({ path: path.join(outputDir, 'montage-drive-upload-desktop-1440.png') });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(180);
const mobile = await page.evaluate(() => {
  const uploader = document.querySelector('[data-drive-upload-v94]');
  const zones = [...document.querySelectorAll('[data-v94-zone]')];
  const uploaderRect = uploader?.getBoundingClientRect();
  const rects = zones.map((node) => node.getBoundingClientRect());
  const buttons = zones.map((node) => node.querySelector('button')?.getBoundingClientRect()).filter(Boolean);
  const buttonMetrics = buttons.map((rect, index) => ({
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    zoneWidth: Math.round(rects[index]?.width || 0),
    widthRatio: rects[index]?.width ? Number((rect.width / rects[index].width).toFixed(3)) : 0,
  }));
  return {
    zones: zones.length,
    bodyOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    uploaderInsideViewport: Boolean(uploaderRect && uploaderRect.left >= -2 && uploaderRect.right <= innerWidth + 2),
    oneColumn: rects.length === 2 && rects[1].top > rects[0].bottom - 2 && Math.abs(rects[0].left - rects[1].left) <= 3,
    buttonsTouchSafe: buttonMetrics.every((metric) => metric.height >= 44 && metric.widthRatio >= 0.8),
    buttonMetrics,
    buttonTexts: zones.map((node) => node.querySelector('button')?.textContent?.trim() || ''),
  };
});
if (mobile.zones !== 2) errors.push(`Mobile: ${mobile.zones} destinations au lieu de 2.`);
if (mobile.bodyOverflow > 3) errors.push(`Mobile: débordement global ${mobile.bodyOverflow}px.`);
if (!mobile.uploaderInsideViewport) errors.push('Mobile: uploader hors viewport.');
if (!mobile.oneColumn) errors.push('Mobile: les deux destinations ne passent pas proprement sur une colonne.');
if (!mobile.buttonsTouchSafe) errors.push(`Mobile: boutons non tactiles ou trop étroits (${JSON.stringify(mobile.buttonMetrics)}).`);
if (mobile.buttonTexts.some((text) => !text.includes('Choisir les fichiers'))) errors.push('Mobile: libellé des boutons de dépôt ambigu.');
await page.screenshot({ path: path.join(outputDir, 'montage-drive-upload-mobile-390.png') });

await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ desktop, mobile, errors }, null, 2));
await context.close();
await browser.close();

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Studio Drive upload v94 visual audit passed: explicit Long/Short destinations, clean desktop two-column layout, one-column mobile layout, touch-safe full-card actions, no global overflow and direct passage Drive access.');
