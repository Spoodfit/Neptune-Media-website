import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve('test-results/client-dashboard');
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 1000 },
  { name: 'laptop-1024', width: 1024, height: 900 },
  { name: 'tablet-834', width: 834, height: 1112 },
  { name: 'mobile-390', width: 390, height: 844 },
];

const mockState = {
  client: {
    id: 'client-lea',
    fullName: 'Léa Neptune',
    email: 'lea@example.com',
    referralCode: 'LDLBE2HZ',
  },
  orders: [{
    id: 'order-hors-norme',
    status: 'appointment_confirmed',
    format: 'Hors Norme',
    appointmentAt: '2026-07-28T14:00:00.000Z',
    filmingAt: '2026-08-12T09:00:00.000Z',
    preparationUrl: 'https://media.neptunebusiness.com/preparation',
    bookingUrl: 'https://media.neptunebusiness.com',
    amountTotal: 79000,
    currency: 'EUR',
    files: [],
    schedules: [{ id: 'publication-1', channel: 'Instagram', scheduledAt: '2026-08-20T10:00:00.000Z' }],
  }],
};

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const report = { generatedAt: new Date().toISOString(), viewports: [], errors: [] };

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.route('**/api/client/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: pathname === '/api/client/session' ? JSON.stringify(mockState) : '{}',
    });
  });

  const response = await page.goto(`${baseUrl}/espace-client/?dashboard_test=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  if (!response || response.status() >= 400) throw new Error(`${viewport.name}: HTTP ${response?.status() || 0}`);

  await page.waitForSelector('#dashboard:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(350);

  const diagnostics = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const root = document.querySelector('#dashboard');
    const doc = document.documentElement;
    const targetSelector = [
      '.metric-card', '.production-shortcut', '.inline-action', '.header-booking',
      '.primary-dashboard-action', '.secondary-dashboard-action', '.format-card a',
      '.utility-action', '.referral-code', '.social', '.logout-button',
    ].join(',');
    const smallTargets = [...root.querySelectorAll(targetSelector)]
      .filter(visible)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44)
      .map(({ element, rect }) => ({
        selector: element.id ? `#${element.id}` : element.className,
        size: [Math.round(rect.width), Math.round(rect.height)],
      }));
    const clippedCriticalText = [...root.querySelectorAll('h1,h2,.metric-copy strong,.format-card strong,.primary-dashboard-action,.secondary-dashboard-action')]
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)
      .map((element) => ({ selector: element.id ? `#${element.id}` : element.className, text: element.textContent.trim() }));
    return {
      horizontalOverflow: Math.max(doc.scrollWidth, document.body.scrollWidth) - innerWidth,
      smallTargets,
      clippedCriticalText,
      metricCount: root.querySelectorAll('.metric-card').length,
      formatCount: root.querySelectorAll('.format-card').length,
      hasProductionCard: Boolean(root.querySelector('.production-card')),
      hasShowCard: Boolean(root.querySelector('.show-card')),
      visibleDashboard: visible(root),
      authHidden: document.querySelector('#auth').hidden,
      bodyText: root.innerText,
      overviewColumns: getComputedStyle(root.querySelector('.overview-grid')).gridTemplateColumns,
    };
  });

  if (!diagnostics.visibleDashboard || !diagnostics.authHidden) report.errors.push(`${viewport.name}: état connecté incorrect`);
  if (!diagnostics.hasProductionCard || !diagnostics.hasShowCard) report.errors.push(`${viewport.name}: cartes principales absentes`);
  if (diagnostics.metricCount !== 4) report.errors.push(`${viewport.name}: ${diagnostics.metricCount} indicateurs au lieu de 4`);
  if (diagnostics.formatCount !== 3) report.errors.push(`${viewport.name}: ${diagnostics.formatCount} formats au lieu de 3`);
  if (diagnostics.horizontalOverflow > 3) report.errors.push(`${viewport.name}: débordement horizontal de ${diagnostics.horizontalOverflow}px`);
  if (diagnostics.smallTargets.length) report.errors.push(`${viewport.name}: petites zones tactiles ${JSON.stringify(diagnostics.smallTargets)}`);
  if (diagnostics.clippedCriticalText.length) report.errors.push(`${viewport.name}: texte critique coupé ${JSON.stringify(diagnostics.clippedCriticalText)}`);
  if (/BOOK NOW/i.test(diagnostics.bodyText)) report.errors.push(`${viewport.name}: CTA anglais encore présent`);
  if (viewport.width >= 980 && diagnostics.overviewColumns.trim().split(/\s+/).length < 2) report.errors.push(`${viewport.name}: grille desktop non déployée`);

  for (const panel of ['appointments', 'tracking', 'billing']) {
    const trigger = page.locator(`[data-open-panel="${panel}"]`).first();
    await trigger.click();
    try {
      await page.waitForFunction(() => document.querySelector('#detailPanel')?.hidden === false, null, { timeout: 5_000 });
      const title = (await page.locator('#detailTitle').textContent())?.trim();
      if (!title) report.errors.push(`${viewport.name}: panneau ${panel} sans titre`);
      await page.locator('#closePanel').click();
      await page.waitForFunction(() => document.querySelector('#detailPanel')?.hidden === true);
    } catch {
      report.errors.push(`${viewport.name}: panneau ${panel} ne s’ouvre pas`);
    }
  }

  for (const [panel, pathname] of [['content', '/espace-client/videos/'], ['calendar', '/espace-client/calendrier/']]) {
    await page.locator(`[data-open-panel="${panel}"]`).first().click();
    try {
      await page.waitForURL((url) => url.pathname === pathname, { timeout: 5_000 });
    } catch {
      report.errors.push(`${viewport.name}: navigation ${panel} incorrecte`);
    }
    await page.goto(`${baseUrl}/espace-client/?dashboard_test=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#dashboard:not([hidden])', { timeout: 20_000 });
  }

  if (pageErrors.length) report.errors.push(`${viewport.name}: erreurs navigateur ${JSON.stringify(pageErrors)}`);

  await page.screenshot({
    path: path.join(outputDir, `${viewport.name}.png`),
    fullPage: true,
  });
  report.viewports.push({ viewport, diagnostics, pageErrors });
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
await fs.writeFile(
  path.join(outputDir, 'README.md'),
  `# Validation dashboard client\n\n- Écrans contrôlés : ${viewports.length}\n- Erreurs : ${report.errors.length}\n\n${report.errors.map((error) => `- ${error}`).join('\n') || 'Aucune erreur détectée.'}\n`,
);

if (report.errors.length) {
  console.error(report.errors.join('\n'));
  process.exit(1);
}

console.log(`Dashboard validé sur ${viewports.length} largeurs.`);
