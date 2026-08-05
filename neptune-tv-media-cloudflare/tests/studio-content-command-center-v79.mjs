import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.OUTPUT_DIR || 'test-results/studio-content-command-center-v79');
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const orderId = 'order-v79';
const files = [
  ...Array.from({ length: 2 }, (_, index) => ({
    fileId: `long-${index + 1}`, name: `Emission_complete_${index + 1}.mp4`, fileType: 'final', kind: 'long', orientation: 'landscape',
    sizeLabel: `${420 + index * 30} Mo`, createdAt: `2026-08-0${index + 1}T09:00:00.000Z`, aiTitle: `Émission complète ${index + 1}`,
    aiDescription: 'Description longue', hashtags: ['business'], usageCount: index, scheduleStatus: index ? 'scheduled' : 'unscheduled',
    occurrenceId: index ? 'occ-long-2' : null, nextPublishAt: index ? '2026-08-20T09:00:00.000Z' : null,
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    fileId: `short-${index + 1}`, name: `Short_${index + 1}.mp4`, fileType: 'short', kind: 'short', orientation: 'portrait',
    sizeLabel: `${22 + index} Mo`, createdAt: `2026-08-${String(10 - index).padStart(2, '0')}T09:00:00.000Z`, aiTitle: `Conseil business numéro ${index + 1}`,
    aiDescription: 'Un conseil concret.', hashtags: ['entrepreneuriat', 'conseil'], usageCount: index < 2 ? 1 : 0,
    scheduleStatus: index === 0 ? 'published' : index === 1 ? 'scheduled' : 'unscheduled',
    occurrenceId: index < 2 ? `occ-short-${index + 1}` : null,
    nextPublishAt: index === 1 ? '2026-08-22T11:30:00.000Z' : null,
  })),
];
let occurrences = [
  { occurrenceId: 'occ-long-2', fileId: 'long-2', sourceScheduleId: 'sched-long-2', publishAt: '2026-08-20T09:00:00.000Z', networks: ['youtube'], status: 'ready', title: 'Émission complète 2', description: '', hashtags: [], publications: [] },
  { occurrenceId: 'occ-short-1', fileId: 'short-1', sourceScheduleId: 'sched-short-1', publishAt: '2026-08-12T09:00:00.000Z', networks: ['instagram', 'tiktok'], status: 'ready', title: 'Conseil business numéro 1', description: '', hashtags: [], publications: [{ platform: 'instagram', status: 'published' }] },
  { occurrenceId: 'occ-short-2', fileId: 'short-2', sourceScheduleId: 'sched-short-2', publishAt: '2026-08-22T11:30:00.000Z', networks: ['instagram', 'tiktok'], status: 'ready', title: 'Conseil business numéro 2', description: '', hashtags: [], publications: [] },
];

const adminState = {
  clients: [{ id: 'client-v79', email: 'lea@example.com', fullName: 'Léa Neptune', company: 'Neptune Business', active: true }],
  orders: [{ id: orderId, clientId: 'client-v79', email: 'lea@example.com', fullName: 'Léa Neptune', company: 'Neptune Business', title: 'Passage Neptune Media', format: 'Hors Norme', status: 'editing', createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-05T09:00:00.000Z', files: files.map((file) => ({ id: file.fileId, name: file.name, fileType: file.fileType, sizeLabel: file.sizeLabel, createdAt: file.createdAt })), schedules: [] }],
  supplierPayments: [], refundRequests: [], deletionRequests: [], finance: {},
};

const calendarData = () => ({
  ok: true,
  order: { id: orderId, clientId: 'client-v79', title: 'Passage Neptune Media', format: 'Hors Norme', clientName: 'Léa Neptune', company: 'Neptune Business' },
  files,
  occurrences,
  metrics: {
    total: files.length,
    unscheduled: files.filter((file) => file.scheduleStatus === 'unscheduled').length,
    scheduled: files.filter((file) => file.scheduleStatus === 'scheduled').length,
    published: files.filter((file) => file.scheduleStatus === 'published').length,
  },
  minimumReuseDays: 30,
  supportedNetworks: ['youtube', 'instagram', 'tiktok'],
});

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });

await page.route('**/api/auth/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrfToken: 'csrf-v79' }) }));
await page.route('**/api/admin/clients', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(adminState) }));
await page.route('**/api/admin/content-calendar**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(calendarData()) }));
await page.route('**/api/admin/content-thumbnail**', (route) => {
  const id = new URL(route.request().url()).searchParams.get('fileId') || '';
  const portrait = id.startsWith('short');
  const width = portrait ? 360 : 640;
  const height = portrait ? 640 : 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g"><stop stop-color="#1c2f69"/><stop offset="1" stop-color="#7a4be7"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="50%" cy="45%" r="18%" fill="#fff" opacity=".16"/><text x="50%" y="82%" text-anchor="middle" fill="white" font-size="28" font-family="Arial">${id}</text></svg>`;
  return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
});
await page.route('**/api/admin/content-schedule', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const occurrenceId = body.occurrenceId || `occ-${body.fileId}`;
  occurrences = occurrences.filter((item) => item.occurrenceId !== occurrenceId);
  occurrences.push({ occurrenceId, fileId: body.fileId, sourceScheduleId: `sched-${body.fileId}`, publishAt: body.publishAt, networks: body.networks, status: 'ready', title: body.title, description: body.description, hashtags: [], publications: [] });
  const file = files.find((item) => item.fileId === body.fileId);
  if (file) { file.scheduleStatus = 'scheduled'; file.occurrenceId = occurrenceId; file.nextPublishAt = body.publishAt; }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, occurrenceId, publishAt: body.publishAt }) });
});
await page.route('**/api/admin/content-schedule-delete', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

const response = await page.goto(`${baseUrl}/studio/clients.html#${orderId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() || 0}`);
await page.waitForSelector('#clientDialog[open]', { timeout: 10_000 });
await page.locator('[data-detail-tab="content"]').click();
await page.waitForSelector('.v79-command-center', { timeout: 10_000 });
await page.waitForFunction(() => document.querySelectorAll('.v79-media-card').length === 10);
await page.waitForFunction(() => [...document.querySelectorAll('[data-v79-thumb]')].some((image) => image.complete && image.naturalWidth > 0));

const contentAudit = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.v79-media-card')];
  const heights = cards.map((card) => Math.round(card.getBoundingClientRect().height));
  const portrait = document.querySelector('.v79-media-card--portrait .v79-media-frame')?.getBoundingClientRect();
  const landscape = document.querySelector('.v79-media-card--landscape .v79-media-frame')?.getBoundingClientRect();
  return {
    cards: cards.length,
    heightSpread: Math.max(...heights) - Math.min(...heights),
    portraitRatio: portrait ? portrait.width / portrait.height : 0,
    landscapeRatio: landscape ? landscape.width / landscape.height : 0,
    horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
    metrics: document.querySelectorAll('.v79-metrics button').length,
    primaryActions: document.querySelectorAll('[data-v79-schedule]').length,
  };
});
if (contentAudit.cards !== 10) errors.push(`${contentAudit.cards} cartes au lieu de 10.`);
if (contentAudit.heightSpread > 2) errors.push(`Écart de hauteur des cartes : ${contentAudit.heightSpread}px.`);
if (Math.abs(contentAudit.portraitRatio - 9 / 16) > .08) errors.push(`Ratio portrait incorrect : ${contentAudit.portraitRatio}.`);
if (contentAudit.landscapeRatio < 1.5) errors.push(`Ratio paysage incorrect : ${contentAudit.landscapeRatio}.`);
if (contentAudit.horizontalOverflow > 3) errors.push(`Débordement horizontal contenu : ${contentAudit.horizontalOverflow}px.`);
if (contentAudit.metrics !== 4) errors.push('Les quatre indicateurs de pilotage sont absents.');
if (contentAudit.primaryActions < 10) errors.push('Les actions rapides de programmation sont incomplètes.');
await page.screenshot({ path: path.join(outputDir, 'content-command-center-1440.png'), fullPage: true });

await page.locator('[data-v79-calendar]').click();
await page.waitForSelector('.v79-calendar-shell', { timeout: 10_000 });
const queueCard = page.locator('[data-v79-drag-file]').first();
const day = page.locator('[data-v79-drop-date="2026-08-25"]');
await queueCard.dragTo(day);
await page.waitForSelector('#v79ScheduleDialog[open]');
await page.locator('#v79ScheduleDialog input[name="title"]').fill('Conseil programmé simplement');
await page.locator('#v79ScheduleDialog button[type="submit"]').click();
await page.waitForFunction(() => document.querySelector('#v79ScheduleDialog')?.open === false);
await page.waitForSelector('.v79-calendar-shell');

const calendarAudit = await page.evaluate(() => ({
  layout: Boolean(document.querySelector('.v79-calendar-layout')),
  queue: document.querySelectorAll('.v79-queue-card').length,
  days: document.querySelectorAll('[data-v79-drop-date]').length,
  chips: document.querySelectorAll('.v79-calendar-chip').length,
  horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
}));
if (!calendarAudit.layout || calendarAudit.days < 28) errors.push('Le calendrier opérationnel n’est pas rendu.');
if (calendarAudit.chips < 4) errors.push('La nouvelle programmation n’est pas visible dans le calendrier.');
if (calendarAudit.horizontalOverflow > 3) errors.push(`Débordement horizontal calendrier : ${calendarAudit.horizontalOverflow}px.`);
await page.screenshot({ path: path.join(outputDir, 'calendar-command-center-1440.png'), fullPage: true });

await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ contentAudit, calendarAudit, errors }, null, 2));
await context.close();
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Studio v79 validé en session admin : miniatures visibles, ratios natifs, cartes uniformes, programmation directe et calendrier deux panneaux.');
