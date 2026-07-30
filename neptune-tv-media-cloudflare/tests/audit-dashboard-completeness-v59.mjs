import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'https://tv.neptunebusiness.com';
const output = path.resolve('test-results/dashboard-completeness-v59');
const failures = [];

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });

function overlaps(a, b, tolerance = 2) {
  return a.left < b.right - tolerance
    && a.right > b.left + tolerance
    && a.top < b.bottom - tolerance
    && a.bottom > b.top + tolerance;
}

for (const viewport of [
  { width: 1860, height: 780 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
]) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(`${base}/espace-client/?dashboard_completeness=${viewport.width}x${viewport.height}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForSelector('#auth:not([hidden])', { timeout: 20_000 });
  await page.locator('#email').fill('contact@neptunebusiness.com');
  await page.locator('#sendCode').click();
  await page.waitForSelector('#dashboard:not([hidden])', { timeout: 30_000 });
  await page.waitForSelector('.referral-panel.referral-challenge', { timeout: 20_000 });
  await page.waitForTimeout(1500);

  const report = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        display: style.display,
        visibility: style.visibility,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    };

    const visibleCards = [...document.querySelectorAll('.format-card')]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      });

    const scrolling = document.scrollingElement;
    return {
      document: {
        scrollWidth: scrolling?.scrollWidth || 0,
        clientWidth: scrolling?.clientWidth || 0,
      },
      contentGrid: rect('.dashboard-content-grid'),
      formats: rect('.formats-panel'),
      utility: rect('.utility-column'),
      referral: rect('.referral-panel.referral-challenge'),
      support: rect('.support-card'),
      referralTitle: rect('.referral-panel.referral-challenge h2'),
      visibleCards,
    };
  });

  const label = `${viewport.width}x${viewport.height}`;
  const required = ['contentGrid', 'formats', 'utility', 'referral', 'support'];
  for (const key of required) {
    if (!report[key]) failures.push(`${label}: élément absent ${key}.`);
  }

  if (report.document.scrollWidth > report.document.clientWidth + 3) {
    failures.push(`${label}: débordement horizontal global (${report.document.scrollWidth}/${report.document.clientWidth}).`);
  }

  if (report.contentGrid && report.formats) {
    if (report.formats.width < report.contentGrid.width - 4) {
      failures.push(`${label}: le catalogue de formats n'occupe pas sa ligne (${report.formats.width}/${report.contentGrid.width}).`);
    }
  }

  if (report.formats && report.utility && report.utility.top < report.formats.bottom - 2) {
    failures.push(`${label}: les utilitaires sont encore comprimés à côté du catalogue (${report.utility.top}/${report.formats.bottom}).`);
  }

  if (report.utility && report.referral && report.support) {
    if (report.referral.width < report.utility.width * 0.58) {
      failures.push(`${label}: la recommandation reste trop étroite (${report.referral.width}/${report.utility.width}).`);
    }
    if (report.support.width < 300) {
      failures.push(`${label}: le support reste trop étroit (${report.support.width}px).`);
    }
    if (overlaps(report.referral, report.support)) {
      failures.push(`${label}: recommandation et support se chevauchent.`);
    }
  }

  if (!report.visibleCards.length) {
    failures.push(`${label}: aucun format visible.`);
  }
  for (const [index, card] of report.visibleCards.entries()) {
    if (card.width < 270 || card.width > 380) {
      failures.push(`${label}: carte format ${index + 1} mal dimensionnée (${card.width}px).`);
    }
  }

  if (report.referralTitle && report.referralTitle.scrollWidth > report.referralTitle.clientWidth + 3) {
    failures.push(`${label}: titre de recommandation tronqué horizontalement.`);
  }

  if (browserErrors.length) failures.push(`${label}: erreurs navigateur ${browserErrors.join(' | ')}`);

  await page.screenshot({
    path: path.join(output, `dashboard-${label}.png`),
    fullPage: true,
  });
  await fs.writeFile(path.join(output, `report-${label}.json`), JSON.stringify(report, null, 2));
  await context.close();
}

await browser.close();

if (failures.length) {
  await fs.writeFile(path.join(output, 'failures.txt'), failures.join('\n'));
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Dashboard completeness v59.1 validated at 1860x780, 1440x900 and 1366x768.');