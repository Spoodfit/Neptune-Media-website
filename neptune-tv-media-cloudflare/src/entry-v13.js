import base from './entry-v12.js';
import { StudioStore } from './store-v9.js';

export { StudioStore };

const AUDIT_RELEASE = 'neptune-visual-functional-audit-fixes-20260730-v61';
const AUDIT_CSS = '/assets/audit-fixes-v61.css?v=1';
const AUDIT_JS = '/assets/audit-fixes-v61.js?v=1';

export default {
  async fetch(request, env, ctx) {
    const response = await base.fetch(request, env, ctx);
    return applyAuditFixes(request, response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};

async function applyAuditFixes(request, response) {
  const headers = new Headers(response.headers);
  headers.set('X-Neptune-Audit-Fixes', AUDIT_RELEASE);
  headers.set('Content-Security-Policy', allowCloudflareAnalytics(headers.get('Content-Security-Policy')));

  const contentType = headers.get('Content-Type') || '';
  if (request.method !== 'GET' || !contentType.includes('text/html')) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  let body = await response.text();
  if (!body.includes(AUDIT_CSS)) body = body.replace('</head>', `<link rel="stylesheet" href="${AUDIT_CSS}"></head>`);
  if (!body.includes(AUDIT_JS)) body = body.replace('</head>', `<script src="${AUDIT_JS}"></script></head>`);
  headers.delete('Content-Length');

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function allowCloudflareAnalytics(value = '') {
  const directives = String(value || "default-src 'self'")
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

  addSource(directives, 'script-src', "'self'", 'https://static.cloudflareinsights.com');
  addSource(directives, 'connect-src', "'self'", 'https://cloudflareinsights.com');
  return directives.join('; ');
}

function addSource(directives, name, fallback, source) {
  const index = directives.findIndex((item) => item === name || item.startsWith(`${name} `));
  if (index < 0) {
    directives.push(`${name} ${fallback} ${source}`);
    return;
  }
  const tokens = directives[index].split(/\s+/u);
  if (!tokens.includes(source)) tokens.push(source);
  directives[index] = tokens.join(' ');
}
