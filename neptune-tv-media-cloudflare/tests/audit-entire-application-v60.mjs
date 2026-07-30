import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const publicRoot = path.resolve('neptune-tv-media-cloudflare/public');
const outputRoot = path.resolve('test-results/entire-application-v60');
const localBase = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:4173';
const liveBase = process.env.LIVE_BASE_URL || 'https://tv.neptunebusiness.com';
const trustedClientEmail = 'contact@neptunebusiness.com';

const viewports = [
  { name: 'wide', width: 1860, height: 780 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];

const failures = [];
const warnings = [];
const reports = [];
const discoveredLinks = new Map();

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

function fail(scope, message, details = null) {
  failures.push({ scope, message, details });
}

function warn(scope, message, details = null) {
  warnings.push({ scope, message, details });
}

function slug(value) {
  return String(value || 'page')
    .replace(/^https?:\/\//u, '')
    .replace(/[^a-z0-9]+/giu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 140) || 'page';
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

const allPublicFiles = await walk(publicRoot);
const htmlFiles = allPublicFiles
  .filter((file) => file.endsWith('.html'))
  .sort((a, b) => a.localeCompare(b));
const publicFileSet = new Set(allPublicFiles.map((file) => `/${path.relative(publicRoot, file).split(path.sep).join('/')}`));

function staticUrlFor(file) {
  return `${localBase}/${path.relative(publicRoot, file).split(path.sep).join('/')}`;
}

function deployedPathFor(file) {
  const relative = path.relative(publicRoot, file).split(path.sep).join('/');
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'index.html'.length)}`;
  return `/${relative}`;
}

const deployedRoutes = new Map(htmlFiles.map((file) => [deployedPathFor(file), file]));
for (const [route, file] of [...deployedRoutes]) {
  if (route.endsWith('.html')) deployedRoutes.set(route.slice(0, -5), file);
  if (route.endsWith('/')) deployedRoutes.set(route.slice(0, -1) || '/', file);
}

function isExpectedApiStatus(url, status) {
  if (status < 400) return true;
  const pathname = new URL(url).pathname;
  if (pathname.startsWith('/api/client/') && [401, 403, 404].includes(status)) return true;
  if (pathname.startsWith('/api/studio/') && [401, 403].includes(status)) return true;
  if (pathname === '/api/public/email-health' && status === 405) return true;
  return false;
}

function shouldIgnoreConsole(text) {
  return /ResizeObserver loop|favicon\.ico|ERR_ABORTED|play\(\) request was interrupted|Failed to load resource/i.test(text);
}

async function collectDocumentState(page) {
  return page.evaluate(() => {
    const scrolling = document.scrollingElement;
    const viewport = { width: innerWidth, height: innerHeight };
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > .05
        && rect.width > 1
        && rect.height > 1;
    };
    const accessibleName = (element) => String(
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.textContent
      || element.getAttribute('alt')
      || element.getAttribute('name')
      || '',
    ).trim();
    const selectorFor = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join('');
      return `${element.tagName.toLowerCase()}${classes}`;
    };

    const interactive = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="tab"]')]
      .filter(visible);
    const unlabeledControls = interactive
      .filter((element) => !accessibleName(element))
      .map(selectorFor)
      .slice(0, 20);

    const unlabeledFields = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')]
      .filter(visible)
      .filter((field) => {
        const id = field.id;
        return !field.closest('label')
          && !(id && document.querySelector(`label[for="${CSS.escape(id)}"]`))
          && !field.getAttribute('aria-label')
          && !field.getAttribute('aria-labelledby')
          && !field.getAttribute('placeholder');
      })
      .map(selectorFor)
      .slice(0, 20);

    const missingAlt = [...document.querySelectorAll('img:not([alt])')]
      .filter(visible)
      .map(selectorFor)
      .slice(0, 20);

    const tinyTargets = interactive
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width < 28 || rect.height < 28)
      .map(({ element, rect }) => ({ selector: selectorFor(element), width: Math.round(rect.width), height: Math.round(rect.height) }))
      .slice(0, 20);

    const clippedText = [...document.querySelectorAll('h1,h2,h3,h4,p,li,a,button,label,strong,span')]
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.webkitLineClamp && style.webkitLineClamp !== 'none') return false;
        if (style.textOverflow === 'ellipsis') return false;
        if (!['hidden', 'clip'].includes(style.overflow) && !['hidden', 'clip'].includes(style.overflowY)) return false;
        return element.scrollHeight > element.clientHeight + 4 || element.scrollWidth > element.clientWidth + 4;
      })
      .map((element) => ({ selector: selectorFor(element), text: String(element.textContent || '').trim().slice(0, 100) }))
      .slice(0, 20);

    const fixedElements = [...document.querySelectorAll('body *')]
      .filter(visible)
      .filter((element) => ['fixed', 'sticky'].includes(getComputedStyle(element).position))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { selector: selectorFor(element), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      })
      .slice(0, 40);

    const internalLinks = [...document.querySelectorAll('a[href]')]
      .map((link) => link.getAttribute('href'))
      .filter(Boolean)
      .filter((href) => !href.startsWith('#') && !/^(mailto:|tel:|javascript:)/i.test(href));

    return {
      title: document.title,
      lang: document.documentElement.lang,
      viewport,
      document: {
        scrollWidth: scrolling?.scrollWidth || 0,
        clientWidth: scrolling?.clientWidth || 0,
        scrollHeight: scrolling?.scrollHeight || 0,
        clientHeight: scrolling?.clientHeight || 0,
      },
      headings: [...document.querySelectorAll('h1')].filter(visible).length,
      landmarks: {
        main: [...document.querySelectorAll('main,[role="main"]')].filter(visible).length,
        nav: [...document.querySelectorAll('nav,[role="navigation"]')].filter(visible).length,
      },
      unlabeledControls,
      unlabeledFields,
      missingAlt,
      tinyTargets,
      clippedText,
      fixedElements,
      internalLinks,
      visibleTextLength: String(document.body?.innerText || '').trim().length,
    };
  });
}

function evaluateState(scope, state) {
  if (!state.title) fail(scope, 'Titre de page absent.');
  if (!state.lang) fail(scope, 'Attribut lang absent sur le document.');
  if (state.document.scrollWidth > state.document.clientWidth + 4) {
    fail(scope, `Débordement horizontal du document (${state.document.scrollWidth}/${state.document.clientWidth}).`);
  }
  if (state.headings !== 1) warn(scope, `Nombre de H1 visibles inhabituel : ${state.headings}.`);
  if (!state.landmarks.main) warn(scope, 'Aucun landmark main visible.');
  if (state.unlabeledControls.length) fail(scope, 'Contrôles visibles sans nom accessible.', state.unlabeledControls);
  if (state.unlabeledFields.length) fail(scope, 'Champs visibles sans étiquette exploitable.', state.unlabeledFields);
  if (state.missingAlt.length) fail(scope, 'Images visibles sans attribut alt.', state.missingAlt);
  if (state.tinyTargets.length) warn(scope, 'Cibles interactives inférieures à 28 px.', state.tinyTargets);
  if (state.clippedText.length) warn(scope, 'Textes potentiellement coupés.', state.clippedText);
  if (state.visibleTextLength < 20) warn(scope, 'Écran presque vide après chargement.');
}

async function exerciseSafeInteractions(page, scope) {
  const menuToggle = page.locator('[data-menu-toggle],.menu-toggle').first();
  if (await menuToggle.count() && await menuToggle.isVisible().catch(() => false)) {
    const before = await menuToggle.getAttribute('aria-expanded');
    await menuToggle.click({ timeout: 3000 }).catch((error) => warn(scope, `Menu mobile non actionnable : ${error.message}`));
    const after = await menuToggle.getAttribute('aria-expanded');
    if (before === after) warn(scope, 'Le bouton de menu ne modifie pas aria-expanded.');
    await menuToggle.click({ timeout: 3000 }).catch(() => {});
  }

  const videoTrigger = page.locator('[data-video-src]').first();
  if (await videoTrigger.count() && await videoTrigger.isVisible().catch(() => false)) {
    await videoTrigger.click({ timeout: 4000 }).catch((error) => warn(scope, `Déclencheur vidéo non actionnable : ${error.message}`));
    await page.waitForTimeout(250);
    const visibleDialog = await page.locator('dialog[open],[role="dialog"]:visible,.video-modal:visible,.modal:visible').count();
    if (!visibleDialog) warn(scope, 'Le déclencheur vidéo n’ouvre aucun dialogue visible.');
    await page.keyboard.press('Escape').catch(() => {});
  }

  const tabs = page.locator('[role="tab"]:visible');
  if (await tabs.count() > 1) {
    const second = tabs.nth(1);
    await second.click({ timeout: 3000 }).catch((error) => warn(scope, `Onglet non actionnable : ${error.message}`));
    const selected = await second.getAttribute('aria-selected');
    if (selected !== 'true') warn(scope, 'Le changement d’onglet ne met pas aria-selected à true.');
  }
}

async function auditPage(context, { url, scope, screenshot = true, exercise = true, allowExpectedAuth = false }) {
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const badResponses = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !shouldIgnoreConsole(message.text())) consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    const request = response.request();
    const resourceType = request.resourceType();
    if (response.status() < 400) return;
    if (allowExpectedAuth && isExpectedApiStatus(response.url(), response.status())) return;
    if (['document', 'script', 'stylesheet', 'image', 'font', 'media'].includes(resourceType)) {
      badResponses.push({ status: response.status(), type: resourceType, url: response.url() });
    }
  });

  let navigationStatus = 0;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    navigationStatus = response?.status() || 0;
    await page.waitForTimeout(700);
  } catch (error) {
    fail(scope, `Navigation impossible : ${error.message}`);
    await page.close();
    return null;
  }

  if (navigationStatus >= 400) fail(scope, `Réponse document HTTP ${navigationStatus}.`);
  const state = await collectDocumentState(page);
  evaluateState(scope, state);

  if (pageErrors.length) fail(scope, 'Erreurs JavaScript non interceptées.', pageErrors.slice(0, 20));
  if (consoleErrors.length) warn(scope, 'Erreurs console.', consoleErrors.slice(0, 20));
  if (badResponses.length) fail(scope, 'Ressources visuelles ou scripts en erreur.', badResponses.slice(0, 20));

  for (const href of state.internalLinks) {
    if (!discoveredLinks.has(href)) discoveredLinks.set(href, new Set());
    discoveredLinks.get(href).add(scope);
  }

  if (exercise) await exerciseSafeInteractions(page, scope);
  if (screenshot) {
    await page.screenshot({ path: path.join(outputRoot, `${slug(scope)}.png`), fullPage: true });
  }

  reports.push({ scope, url, navigationStatus, state, pageErrors, consoleErrors, badResponses });
  await page.close();
  return state;
}

function resolveStaticTarget(href) {
  let url;
  try { url = new URL(href, localBase); } catch { return { kind: 'invalid' }; }
  if (url.origin !== new URL(localBase).origin) return { kind: 'external' };
  const pathname = decodeURIComponent(url.pathname);
  if (deployedRoutes.has(pathname)) return { kind: 'html', file: deployedRoutes.get(pathname) };
  if (publicFileSet.has(pathname)) return { kind: 'asset', file: path.join(publicRoot, pathname.slice(1)) };
  if (publicFileSet.has(`${pathname}/index.html`)) return { kind: 'html', file: path.join(publicRoot, `${pathname}/index.html`) };
  if (publicFileSet.has(`${pathname}.html`)) return { kind: 'html', file: path.join(publicRoot, `${pathname}.html`) };
  if (pathname.startsWith('/api/')) return { kind: 'dynamic' };
  return { kind: 'missing', pathname };
}

async function auditStaticApplication(browser) {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', acceptDownloads: true });
    for (const file of htmlFiles) {
      const relative = path.relative(publicRoot, file).split(path.sep).join('/');
      await auditPage(context, {
        url: staticUrlFor(file),
        scope: `local-${viewport.name}-${relative}`,
        screenshot: ['wide', 'laptop', 'mobile'].includes(viewport.name),
        exercise: true,
        allowExpectedAuth: true,
      });
    }
    await context.close();
  }
}

async function auditDiscoveredLinks() {
  for (const [href, scopes] of discoveredLinks) {
    const target = resolveStaticTarget(href);
    if (target.kind === 'invalid') fail('internal-links', `Lien invalide : ${href}`, [...scopes].slice(0, 5));
    if (target.kind === 'missing') fail('internal-links', `Cible interne absente : ${target.pathname}`, [...scopes].slice(0, 5));
  }
}

async function auditProductionPublic(browser) {
  const canonicalRoutes = new Set(['/']);
  try {
    const sitemap = await fs.readFile(path.join(publicRoot, 'sitemap.xml'), 'utf8');
    for (const match of sitemap.matchAll(/<loc>https:\/\/tv\.neptunebusiness\.com([^<]*)<\/loc>/gu)) canonicalRoutes.add(match[1] || '/');
  } catch {}
  for (const route of deployedRoutes.keys()) {
    if (!route.includes('.html') && !route.startsWith('/studio') && !route.startsWith('/espace-client')) canonicalRoutes.add(route || '/');
  }

  for (const viewport of [viewports[0], viewports[2], viewports[4]]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    for (const route of [...canonicalRoutes].sort()) {
      await auditPage(context, {
        url: `${liveBase}${route}`,
        scope: `live-public-${viewport.name}-${route}`,
        screenshot: ['wide', 'mobile'].includes(viewport.name),
        exercise: true,
        allowExpectedAuth: true,
      });
    }
    await context.close();
  }
}

async function openTrustedClientSession(page, scope) {
  await page.goto(`${liveBase}/espace-client/?full_audit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(500);
  if (await page.locator('#dashboard:not([hidden])').count()) return true;
  const email = page.locator('#email');
  const send = page.locator('#sendCode');
  if (!await email.count() || !await send.count()) {
    fail(scope, 'Formulaire de connexion client introuvable.');
    return false;
  }
  await email.fill(trustedClientEmail);
  await send.click();
  try {
    await page.waitForSelector('#dashboard:not([hidden])', { timeout: 30_000 });
    return true;
  } catch {
    fail(scope, 'La connexion de test client n’ouvre pas le dashboard.');
    return false;
  }
}

async function auditAuthenticatedClient(browser) {
  for (const viewport of [viewports[0], viewports[2], viewports[4]]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', acceptDownloads: true });
    const bootstrap = await context.newPage();
    const scope = `live-client-${viewport.name}`;
    const authenticated = await openTrustedClientSession(bootstrap, scope);
    await bootstrap.close();
    if (!authenticated) {
      await context.close();
      continue;
    }

    for (const route of ['/espace-client/', '/espace-client/videos/', '/espace-client/calendrier/']) {
      const page = await context.newPage();
      const pageScope = `${scope}-${route}`;
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(`${liveBase}${route}?full_audit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
      if (!response || response.status() >= 400) fail(pageScope, `Navigation authentifiée en erreur (${response?.status() || 'aucune réponse'}).`);
      await page.waitForTimeout(1400);
      const state = await collectDocumentState(page);
      evaluateState(pageScope, state);
      if (errors.length) fail(pageScope, 'Erreurs JavaScript authentifiées.', errors);

      if (route.includes('/videos')) {
        const mediaTrigger = page.locator('[data-open-video],[data-snapshot-file]').first();
        if (await mediaTrigger.count() && await mediaTrigger.isVisible().catch(() => false)) {
          await mediaTrigger.click({ timeout: 5000 });
          await page.waitForSelector('#neptuneMediaProxyDialog[open]', { timeout: 5000 }).catch(() => fail(pageScope, 'Le lecteur Drive ne s’ouvre pas.'));
          const player = page.locator('#neptuneMediaProxyDialog[open] video');
          if (!await player.count()) fail(pageScope, 'Le dialogue média ne contient pas de lecteur vidéo.');
          await page.locator('#neptuneMediaProxyDialog .neptune-media-close').click().catch(() => page.keyboard.press('Escape'));
        } else {
          warn(pageScope, 'Aucun média ouvrable trouvé pour le test fonctionnel.');
        }

        const download = page.locator('a[href*="/api/client/files/"]').first();
        if (await download.count() && await download.isVisible().catch(() => false)) {
          await page.route('**/api/client/files/**', (routeRequest) => routeRequest.abort('blockedbyclient'));
          await download.click({ noWaitAfter: true }).catch(() => {});
          await page.waitForTimeout(120);
          const busy = await download.getAttribute('aria-busy');
          if (busy !== 'true') fail(pageScope, 'Le bouton Télécharger n’indique pas la préparation en cours.');
        }
      }

      if (route.includes('/calendrier')) {
        const event = page.locator('[data-content-id],.calendar-item,.calendar-content,.content-chip').first();
        if (await event.count() && await event.isVisible().catch(() => false)) {
          await event.click({ timeout: 5000 }).catch((error) => warn(pageScope, `Élément calendrier non actionnable : ${error.message}`));
          await page.waitForTimeout(250);
          const details = await page.locator('dialog[open],[role="dialog"]:visible,.drawer:visible,.content-detail:visible,.editorial-workspace:visible').count();
          if (!details) warn(pageScope, 'Le clic calendrier n’ouvre aucun détail visible.');
        } else {
          warn(pageScope, 'Aucun contenu calendrier disponible pour tester l’ouverture du détail.');
        }
      }

      await page.screenshot({ path: path.join(outputRoot, `${slug(pageScope)}.png`), fullPage: true });
      reports.push({ scope: pageScope, url: page.url(), navigationStatus: response?.status() || 0, state, pageErrors: errors });
      await page.close();
    }
    await context.close();
  }
}

async function auditStudioStates(browser) {
  for (const viewport of [viewports[0], viewports[2], viewports[4]]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await auditPage(context, {
      url: `${liveBase}/studio/`,
      scope: `live-studio-login-${viewport.name}`,
      screenshot: true,
      exercise: false,
      allowExpectedAuth: true,
    });

    const studioFiles = htmlFiles.filter((file) => path.relative(publicRoot, file).split(path.sep)[0] === 'studio');
    for (const file of studioFiles) {
      const page = await context.newPage();
      const relative = path.relative(publicRoot, file).split(path.sep).join('/');
      const scope = `local-studio-state-${viewport.name}-${relative}`;
      await page.goto(staticUrlFor(file), { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error) => fail(scope, error.message));
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const auth = document.querySelector('#auth,.login-shell');
        const app = document.querySelector('#app,.studio-app,.clients-app');
        if (auth && app && auth !== app) auth.setAttribute('hidden', '');
        if (app) app.removeAttribute('hidden');
      }).catch(() => {});
      await page.waitForTimeout(250);
      const state = await collectDocumentState(page);
      evaluateState(scope, state);
      const sidebarOverlap = await page.evaluate(() => {
        const navItems = [...document.querySelectorAll('.sidebar .nav-btn,.studio-sidebar a,.studio-sidebar button')]
          .filter((item) => {
            const rect = item.getBoundingClientRect();
            const style = getComputedStyle(item);
            return rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          });
        const bottom = document.querySelector('.sidebar-bottom,.studio-sidebar-bottom');
        const last = navItems.at(-1)?.getBoundingClientRect();
        const account = bottom?.getBoundingClientRect();
        return last && account ? last.bottom > account.top - 4 : false;
      });
      if (sidebarOverlap) fail(scope, 'La navigation Studio chevauche la zone de compte.');
      await exerciseSafeInteractions(page, scope);
      await page.screenshot({ path: path.join(outputRoot, `${slug(scope)}.png`), fullPage: true });
      reports.push({ scope, url: page.url(), navigationStatus: 200, state });
      await page.close();
    }
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});

await auditStaticApplication(browser);
await auditDiscoveredLinks();
await auditProductionPublic(browser);
await auditAuthenticatedClient(browser);
await auditStudioStates(browser);
await browser.close();

const summary = {
  generatedAt: new Date().toISOString(),
  publicRoot,
  htmlFiles: htmlFiles.map((file) => path.relative(publicRoot, file).split(path.sep).join('/')),
  auditedScreens: reports.length,
  failures,
  warnings,
  reports,
};

await fs.writeFile(path.join(outputRoot, 'report.json'), JSON.stringify(summary, null, 2));
await fs.writeFile(path.join(outputRoot, 'summary.md'), [
  '# Audit visuel et fonctionnel complet — Neptune Media',
  '',
  `- Écrans audités : ${reports.length}`,
  `- Fichiers HTML découverts : ${htmlFiles.length}`,
  `- Échecs : ${failures.length}`,
  `- Avertissements : ${warnings.length}`,
  '',
  '## Échecs',
  ...(failures.length ? failures.map((item) => `- **${item.scope}** — ${item.message}`) : ['- Aucun']),
  '',
  '## Avertissements',
  ...(warnings.length ? warnings.slice(0, 200).map((item) => `- **${item.scope}** — ${item.message}`) : ['- Aucun']),
].join('\n'));

console.log(JSON.stringify({ auditedScreens: reports.length, htmlFiles: htmlFiles.length, failures: failures.length, warnings: warnings.length }, null, 2));
if (failures.length) process.exit(1);
