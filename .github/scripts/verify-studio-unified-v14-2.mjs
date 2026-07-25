import fs from 'node:fs';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const consoleMessages = [];
const requests = [];
page.on('pageerror', (error) => pageErrors.push(String(error.message || error)));
page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
page.on('request', (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith('/api/')) requests.push(url.pathname);
});

await page.route('**/api/**', async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  const body = pathname === '/api/auth/status'
    ? { authenticated: true, csrfToken: 'verification-token', user: { email: 'contact@neptunebusiness.com', role: 'admin' } }
    : pathname === '/api/admin/clients'
      ? { clients: [], orders: [], supplierPayments: [], refundRequests: [], deletionRequests: [], finance: {} }
      : {};
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

let failure = '';
try {
  await page.goto('https://tv.neptunebusiness.com/studio/?behavior=unified-v14-2', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
} catch (error) {
  failure = String(error.stack || error.message || error);
}

const state = await page.evaluate(() => ({
  href: location.href,
  path: location.pathname,
  title: document.title,
  heading: document.querySelector('.clients-topbar h1')?.textContent?.trim() || '',
  rootHeading: document.querySelector('h1')?.textContent?.trim() || '',
  oldControlTitle: document.body.textContent?.includes('Contrôle automatique') || false,
  oldSecureCard: document.body.textContent?.includes('points à sécuriser') || false,
  loginGatewayVisible: Boolean(document.querySelector('.login-shell')),
  bodyStart: document.body.textContent?.trim().slice(0, 500) || '',
})).catch(() => ({}));

const report = { state, pageErrors, consoleMessages, requests, failure };
fs.writeFileSync('/tmp/studio-unified-v14-2.json', JSON.stringify(report, null, 2));
console.log(`STUDIO_DIAGNOSTIC=${JSON.stringify(report)}`);
await page.screenshot({ path: '/tmp/studio-unified-v14-2.png', fullPage: true }).catch(() => {});
await browser.close();
