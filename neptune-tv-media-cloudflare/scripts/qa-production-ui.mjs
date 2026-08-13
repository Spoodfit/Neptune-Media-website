import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.PUBLIC_URL || 'https://neptune-media-webtv.neptunebusinessclub.workers.dev').replace(/\/$/, '');
const outputDir = path.resolve('artifacts/ui-qa');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { baseUrl, checkedAt: new Date().toISOString(), pages: [], issues: [] };

const cases = [
  { name: 'home-desktop', route: '/', width: 1440, height: 1100, home: true },
  { name: 'home-tablet', route: '/', width: 834, height: 1112, home: true },
  { name: 'home-mobile', route: '/', width: 390, height: 844, home: true },
  { name: 'emissions-desktop', route: '/emissions/', width: 1440, height: 1000 },
  { name: 'emissions-mobile', route: '/emissions/', width: 390, height: 844 },
  { name: 'direct-desktop', route: '/direct/', width: 1440, height: 1000 },
];

for (const testCase of cases) {
  const page = await browser.newPage({ viewport: { width: testCase.width, height: testCase.height }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15000);
  const url = `${baseUrl}${testCase.route}?ui-qa=${Date.now()}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response || !response.ok()) report.issues.push(`${testCase.name}: HTTP ${response?.status() || 'sans réponse'}`);
  await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const step = Math.max(280, Math.floor(innerHeight * .72));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(450);

  const audit = await page.evaluate(({ mobile, home }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 1 && rect.height > 1;
    };
    const isAssistiveOnly = (element) => Boolean(element.closest('.sr-only,[aria-hidden="true"]'));
    const issues = [];
    const root = document.documentElement;
    if (root.scrollWidth > innerWidth + 2) issues.push(`débordement horizontal ${root.scrollWidth}px pour ${innerWidth}px`);

    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicateIds.length) issues.push(`identifiants dupliqués: ${duplicateIds.join(', ')}`);

    const brokenImages = [...document.images]
      .filter((image) => visible(image) && image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);
    if (brokenImages.length) issues.push(`images non chargées: ${brokenImages.slice(0, 4).join(', ')}`);

    const criticalText = [...document.querySelectorAll('h1,.section-head h2,.desire-hero h2,.faq-intro h2,.cta-card h2,.btn,.nav-cta')]
      .filter((element) => visible(element) && !isAssistiveOnly(element));
    const clipped = criticalText.filter((element) => {
      const style = getComputedStyle(element);
      const actuallyClips = ['hidden', 'clip'].includes(style.overflow) || ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY);
      return actuallyClips && (element.scrollWidth > element.clientWidth + 3 || element.scrollHeight > element.clientHeight + 3);
    }).map((element) => element.textContent.trim().slice(0, 70));
    if (clipped.length) issues.push(`texte critique coupé: ${clipped.slice(0, 6).join(' | ')}`);

    if (mobile) {
      const isNavigationArrow = (element) => {
        const label = String(element.getAttribute('aria-label') || '').toLowerCase();
        const text = String(element.textContent || '').trim();
        return element.matches('.rail-control,.media-filter') || /précéd|suivant|défiler/.test(label) || /^[‹›←→]$/.test(text);
      };
      const smallTargets = [...document.querySelectorAll('a.btn,button,[data-format-choice]')]
        .filter((element) => visible(element) && !isAssistiveOnly(element) && !isNavigationArrow(element))
        .map((element) => ({ text: element.textContent.trim().slice(0, 50) || element.getAttribute('aria-label') || element.tagName, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width < 40 || rect.height < 40);
      if (smallTargets.length) issues.push(`cibles tactiles trop petites: ${smallTargets.slice(0, 5).map((item) => item.text).join(' | ')}`);
    }

    if (home) {
      if (document.body.dataset.finalUx !== 'v12') issues.push('expérience finale v12 absente');
      if (!document.body.dataset.homeStructure) issues.push('architecture d’accueil non déclarée');
      if (!document.querySelector('#a-voir.visibility-showcase [data-showcase-video]')) issues.push('showcase éditorial absent');
      if (!document.querySelector('[data-funnel]')) issues.push('accès au tunnel de réservation absent');
      if (!document.querySelector('#formats')) issues.push('section formats absente');
    }
    return { issues, width: innerWidth, height: innerHeight, scrollHeight: root.scrollHeight };
  }, { mobile: testCase.width <= 760, home: Boolean(testCase.home) });

  if (testCase.home) {
    const firstChoice = page.locator('[data-format-choice]').first();
    if (await firstChoice.count()) {
      await firstChoice.click();
      const pressed = await firstChoice.getAttribute('aria-pressed');
      const result = await page.locator('[data-format-result]').textContent().catch(() => '');
      if (pressed !== 'true' || !String(result || '').trim()) audit.issues.push('sélecteur de format présent mais non fonctionnel');
    }

    const firstShowcaseVideo = page.locator('#a-voir.visibility-showcase [data-showcase-video]').first();
    if (await firstShowcaseVideo.count()) {
      const hasSource = await firstShowcaseVideo.evaluate((element) => Boolean(element.dataset.src || element.currentSrc || element.src));
      if (!hasSource) audit.issues.push('showcase vidéo présent sans source');
    }
  }

  await page.screenshot({ path: path.join(outputDir, `${testCase.name}.png`), fullPage: true });
  report.pages.push({ name: testCase.name, route: testCase.route, ...audit });
  audit.issues.forEach((issue) => report.issues.push(`${testCase.name}: ${issue}`));
  await page.close();
}

await browser.close();
report.status = report.issues.length ? 'failed' : 'success';
await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (report.issues.length) {
  console.error(report.issues.join('\n'));
  process.exit(1);
}
console.log(`UI quality gate passed for ${report.pages.length} viewport/page combinations.`);
