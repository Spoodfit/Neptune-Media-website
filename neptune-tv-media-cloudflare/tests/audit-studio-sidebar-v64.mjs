import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.STUDIO_BASE_URL || 'https://neptune-media-webtv.neptunebusinessclub.workers.dev';
const outputDir = process.env.OUTPUT_DIR || 'test-results/studio-sidebar-v64';
await mkdir(outputDir, { recursive: true });

const fixtures = {
  clients: [
    { id: 'client-1', email: 'lea@example.com', fullName: 'Léa Martin', company: 'Capital Conseil' },
    { id: 'client-2', email: 'marc@example.com', fullName: 'Marc Durand', company: 'Atelier Horizon' },
  ],
  orders: [
    order('order-1', 'lea@example.com', 'Léa Martin', 'Capital Conseil', 'Hors Norme', 'appointment_confirmed'),
    order('order-2', 'marc@example.com', 'Marc Durand', 'Atelier Horizon', 'Concept Libre', 'videos_pending'),
  ],
  supplierPayments: [], refundRequests: [], deletionRequests: [], finance: {},
};

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();

    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/admin/control-room', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [], summary: {} }) }));
    await page.route('**/api/admin/client-feedback**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ feedback: [] }) }));
    await page.route('**/api/admin/clients', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures) }));
    await page.route('**/api/auth/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrfToken: 'test-csrf' }) }));

    await page.goto(`${baseURL}/studio/clients?sidebar_v64=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.studio-nav-link');
    await page.waitForTimeout(650);

    const metrics = await page.evaluate(() => {
      const box = (element) => {
        const rect = element?.getBoundingClientRect();
        return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
      };
      const visible = (element) => {
        if (!element || element.hidden) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const sidebar = document.querySelector('.studio-sidebar');
      const navigation = document.querySelector('.studio-nav');
      const account = document.querySelector('.studio-account');
      const links = [...document.querySelectorAll('.studio-nav-link')];
      const labels = [...document.querySelectorAll('.studio-nav-label')];
      return {
        bodyClass: document.body.className,
        sidebar: box(sidebar),
        navigation: box(navigation),
        account: box(account),
        visibleLinks: links.filter(visible).length,
        visibleLabels: labels.filter(visible).length,
        visibleLinkTexts: links.filter(visible).map((item) => item.textContent.trim().replace(/\s+/gu, ' ')),
        hiddenAttributes: links.filter((item) => item.hasAttribute('hidden')).length,
        legacyToggleCount: document.querySelectorAll('#studioSidebarToggle').length,
        mobileToggleDisplay: getComputedStyle(document.querySelector('#studioMenuToggle')).display,
        accountMetaDisplay: getComputedStyle(document.querySelector('.studio-account > span:nth-child(2)')).display,
      };
    });

    assert(metrics.legacyToggleCount === 0, `${viewport.name}: legacy collapse toggle remains`);
    assert(!metrics.bodyClass.includes('studio-sidebar-collapsed'), `${viewport.name}: legacy collapsed state remains`);
    assert(metrics.hiddenAttributes === 0, `${viewport.name}: navigation items still carry hidden attributes`);
    assert(metrics.visibleLinks >= 8, `${viewport.name}: incomplete Studio navigation (${metrics.visibleLinks}/8)`);
    assert(metrics.visibleLabels >= 3, `${viewport.name}: navigation groups are hidden`);

    if (viewport.width > 900) {
      assert(metrics.sidebar && metrics.sidebar.width >= 220 && metrics.sidebar.width <= 270, `${viewport.name}: sidebar width is ${metrics.sidebar?.width}`);
      assert(metrics.navigation && metrics.account && metrics.navigation.bottom <= metrics.account.top + 1, `${viewport.name}: navigation overlaps account card`);
      assert(metrics.mobileToggleDisplay === 'none', `${viewport.name}: mobile menu toggle is visible`);
      assert(metrics.accountMetaDisplay !== 'none', `${viewport.name}: account details are hidden`);
    } else {
      assert(metrics.mobileToggleDisplay === 'grid', `${viewport.name}: mobile menu toggle is hidden`);
      const toggle = page.locator('#studioMenuToggle');
      await toggle.click();
      await page.waitForFunction(() => document.body.classList.contains('is-studio-menu-open'));
      await page.waitForTimeout(320);
      const mobile = await page.evaluate(() => {
        const sidebar = document.querySelector('.studio-sidebar').getBoundingClientRect();
        const visibleLinks = [...document.querySelectorAll('.studio-nav-link')].filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return !element.hidden && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        }).length;
        return { left: sidebar.left, right: sidebar.right, width: sidebar.width, visibleLinks };
      });
      assert(mobile.left >= -1, `${viewport.name}: drawer did not open`);
      assert(mobile.width <= 345, `${viewport.name}: drawer is too wide`);
      assert(mobile.visibleLinks >= 8, `${viewport.name}: mobile drawer navigation incomplete`);
    }

    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-${viewport.width}x${viewport.height}.png`), fullPage: true });
    results.push({ viewport, metrics });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ ok: true, results }, null, 2));
console.log('Studio sidebar v64 audit passed on desktop, tablet and mobile.');

function order(id, email, fullName, company, format, status) {
  const now = new Date();
  return {
    id, email, fullName, company, title: 'Passage Neptune Media', format, status,
    nextAction: 'Valider la prochaine étape', createdAt: now.toISOString(), updatedAt: now.toISOString(),
    filmingAt: new Date(now.getTime() + 5 * 86400000).toISOString(), files: [], schedules: [],
    steps: [{ label: 'Réservation', state: 'done', completedAt: now.toISOString() }, { label: 'Préparation', state: 'current' }],
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
