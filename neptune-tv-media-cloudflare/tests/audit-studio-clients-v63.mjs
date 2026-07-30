import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = process.env.OUTPUT_DIR || 'test-results/studio-clients-v63';
await mkdir(outputDir, { recursive: true });

const fixtures = {
  clients: [
    { id: 'client-1', email: 'lea@example.com', fullName: 'Léa Martin', company: 'Capital Conseil' },
    { id: 'client-2', email: 'marc@example.com', fullName: 'Marc Durand', company: 'Atelier Horizon' },
    { id: 'client-3', email: 'sarah@example.com', fullName: 'Sarah Petit', company: 'Maison Nova' },
  ],
  orders: [
    order('order-1', 'lea@example.com', 'Léa Martin', 'Capital Conseil', 'Hors Norme', 'appointment_confirmed'),
    order('order-2', 'marc@example.com', 'Marc Durand', 'Atelier Horizon', 'Concept Libre', 'preparation_complete'),
    order('order-3', 'sarah@example.com', 'Sarah Petit', 'Maison Nova', 'Hors Norme', 'videos_pending'),
    order('order-4', 'lea@example.com', 'Léa Martin', 'Capital Conseil', 'Hors Norme', 'editing'),
    order('order-5', 'marc@example.com', 'Marc Durand', 'Atelier Horizon', 'Concept Libre', 'delivered'),
  ],
  supplierPayments: [], refundRequests: [], deletionRequests: [], finance: {},
};

const viewports = [
  { name: 'wide', width: 1860, height: 780 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`); });

    // Playwright gives the most recently registered matching route priority.
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/admin/client-feedback**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ feedback: [] }) }));
    await page.route('**/api/admin/clients', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures) }));
    await page.route('**/api/auth/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, csrfToken: 'test-csrf' }) }));

    await page.goto(`${baseURL}/studio/clients.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.column.is-visible', { state: 'visible' });
    await page.waitForTimeout(150);

    const metrics = await page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height } : null;
      };
      const compactRect = (element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      };
      const refresh = document.querySelector('#refresh')?.getBoundingClientRect();
      return {
        bodyWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        sidebar: rect('.studio-sidebar'), nav: rect('.studio-nav'), account: rect('.studio-account'),
        main: rect('.clients-main'), topbar: rect('.clients-topbar'), controls: rect('.controls'),
        refresh: refresh ? { width: refresh.width, height: refresh.height } : null,
        columns: [...document.querySelectorAll('.column')].map(compactRect),
        cards: [...document.querySelectorAll('.client-card')].map(compactRect),
        menuToggleDisplay: getComputedStyle(document.querySelector('#studioMenuToggle')).display,
        activeNavigationCount: document.querySelectorAll('.studio-nav-link.active,[aria-current="page"].studio-nav-link').length,
        reducedMotionRulePresent: [...document.styleSheets].some((sheet) => {
          try { return [...sheet.cssRules].some((rule) => rule.cssText.includes('prefers-reduced-motion')); } catch { return false; }
        }),
      };
    });

    assert(metrics.bodyWidth <= metrics.viewportWidth + 1, `${viewport.name}: document horizontal overflow`);
    assert(metrics.main && metrics.main.left >= 0 && metrics.main.right <= metrics.viewportWidth + 1, `${viewport.name}: main content leaves viewport`);
    assert(metrics.topbar?.height >= 60, `${viewport.name}: topbar too small`);
    assert(metrics.controls?.width > 250, `${viewport.name}: controls collapsed`);
    assert(metrics.refresh && metrics.refresh.width <= 44 && metrics.refresh.height <= 44, `${viewport.name}: refresh utility rendered as a KPI card`);
    assert(metrics.columns.length === 6, `${viewport.name}: expected six workflow columns`);
    assert(metrics.columns.every((column) => column.width >= 250), `${viewport.name}: workflow column below 250px`);
    assert(metrics.cards.every((card) => card.width >= 220), `${viewport.name}: client card below 220px`);
    assert(metrics.activeNavigationCount >= 1, `${viewport.name}: no active navigation state`);
    assert(metrics.reducedMotionRulePresent, `${viewport.name}: reduced motion rule missing`);

    if (viewport.width > 900) {
      assert(metrics.sidebar?.width >= 200, `${viewport.name}: desktop sidebar invalid`);
      assert(metrics.nav && metrics.account && metrics.nav.bottom <= metrics.account.top + 1, `${viewport.name}: navigation overlaps account card`);
      assert(metrics.menuToggleDisplay === 'none', `${viewport.name}: mobile toggle visible on desktop`);
      const active = page.locator('.studio-nav-link.active').first();
      const before = await active.boundingBox();
      await active.hover();
      const after = await active.boundingBox();
      if (before && after) assert(Math.abs(before.x - after.x) < 1, `${viewport.name}: menu shifts on hover`);
    } else {
      assert(metrics.menuToggleDisplay === 'grid', `${viewport.name}: mobile toggle hidden`);
      const toggle = page.locator('#studioMenuToggle');
      await toggle.click();
      await page.waitForTimeout(80);
      assert(await toggle.getAttribute('aria-expanded') === 'true', `${viewport.name}: menu did not open`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
      assert(await toggle.getAttribute('aria-expanded') === 'false', `${viewport.name}: Escape did not close menu`);
    }

    // Capture the actual populated interface before exercising the loading state.
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-${viewport.width}x${viewport.height}.png`), fullPage: true });

    const refresh = page.locator('#refresh');
    await refresh.click();
    assert(await refresh.getAttribute('aria-busy') === 'true', `${viewport.name}: refresh progress not exposed`);
    await page.waitForSelector('.column.is-visible', { state: 'visible' });

    results.push({ viewport, metrics, errors });
    await context.close();
  }
} finally { await browser.close(); }

const blockingErrors = results.flatMap((result) => result.errors.filter((error) => !error.includes('favicon')));
assert(blockingErrors.length === 0, `Browser errors: ${blockingErrors.join(' | ')}`);
await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ ok: true, results }, null, 2));
console.log(`Studio clients v63 visual audit passed for ${viewports.length} viewports.`);

function order(id, email, fullName, company, format, status) {
  const now = new Date();
  return { id, email, fullName, company, title: 'Passage Neptune Media', format, status, nextAction: 'Valider la prochaine étape', createdAt: now.toISOString(), updatedAt: now.toISOString(), filmingAt: new Date(now.getTime() + 5 * 86400000).toISOString(), files: [], schedules: [], steps: [{ label: 'Réservation', state: 'done', completedAt: now.toISOString() }, { label: 'Préparation', state: 'current' }, { label: 'Passage studio', state: 'upcoming' }, { label: 'Livraison', state: 'upcoming' }] };
}
function assert(condition, message) { if (!condition) throw new Error(message); }
