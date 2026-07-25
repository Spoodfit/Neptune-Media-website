import base from './entry-v7.js';
import { StudioStore } from './store-v5.js';
import { emailHealthResponse } from './email-service.js';
import { handleClientCodeRequest } from './portal-code-login.js';
import { handleDriveRoute } from './portal-drive-routes.js';
import { json, securityHeaders } from './security.js';
import { flushWorkflowOutbox, handleWorkflowRoute } from './portal-workflow-routes-v5.js';

export { StudioStore };

const REQUEST_CODE_PATH = '/api/client/request-code';
const EMAIL_HEALTH_PATH = '/api/public/email-health';
const PROSPECT_START_PATH = '/api/public/prospect/start';
const PROSPECT_CONTEXT_PATH = '/api/public/prospect/context';
const FLUSH_AFTER = new Set([
  '/api/webhooks/client-order',
  '/api/webhooks/conversion',
  '/api/webhooks/client-appointment',
  '/api/admin/client-update',
  '/api/admin/client-file',
  '/api/admin/client-upload',
]);
const TUNNEL_ORIGINS = new Set([
  'https://media.neptunebusiness.com',
  'https://www.media.neptunebusiness.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS' && [PROSPECT_START_PATH, PROSPECT_CONTEXT_PATH].includes(url.pathname)) {
        return secure(corsResponse(request, new Response(null, { status: 204 })));
      }
      if (request.method === 'GET' && url.pathname === EMAIL_HEALTH_PATH) return secure(await emailHealthResponse(env));
      if (request.method === 'POST' && url.pathname === REQUEST_CODE_PATH) return secure(await handleClientCodeRequest(request, env));
      if (request.method === 'POST' && url.pathname === PROSPECT_START_PATH) return secure(await startPublicProspect(request, env));
      if (request.method === 'GET' && url.pathname === PROSPECT_CONTEXT_PATH) return secure(await getPublicProspectContext(request, env));

      const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
      const drive = await handleDriveRoute(request, env, studio);
      if (drive) return secure(drive);
      const workflow = await handleWorkflowRoute(request, env, studio);
      if (workflow) return secure(workflow);

      let response = await base.fetch(request, env, ctx);
      if (shouldInjectProspectCapture(request, response)) response = await injectProspectCapture(response);
      if (request.method === 'GET' && (response.headers.get('Content-Type') || '').includes('text/html')) {
        response = await injectWorkflowAssets(response, url.pathname);
      }
      if (response.ok && FLUSH_AFTER.has(url.pathname)) {
        ctx.waitUntil(flushWorkflowOutbox(env, request.url, studio).catch((error) => console.error('workflow_immediate_flush_failed', safeError(error))));
      }
      return response;
    } catch (error) {
      console.error('entry_v8_failed', safeError(error));
      return secure(json({ error: 'internal_error' }, 500));
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') await base.scheduled(controller, env, ctx);
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    ctx.waitUntil(runWorkflowScheduled(env, studio).catch((error) => console.error('workflow_scheduled_failed', safeError(error))));
  },
};

async function startPublicProspect(request, env) {
  if (!allowedProspectOrigin(request)) return corsResponse(request, json({ error: 'origin_forbidden' }, 403));
  const payload = await request.json().catch(() => ({}));
  const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const response = await callStore(studio, '/portal/prospect-start', payload);
  const result = await response.json().catch(() => ({}));
  return corsResponse(request, json(result, response.status));
}

async function getPublicProspectContext(request, env) {
  if (!allowedProspectOrigin(request)) return corsResponse(request, json({ error: 'origin_forbidden' }, 403));
  const token = new URL(request.url).searchParams.get('token') || '';
  const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
  const response = await callStore(studio, '/portal/prospect-context', { token });
  const result = await response.json().catch(() => ({}));
  return corsResponse(request, json(result, response.status));
}

async function runWorkflowScheduled(env, studio) {
  const response = await callStore(studio, '/portal/workflow-reconcile', { system: true });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `workflow_reconcile_http_${response.status}`);
  }
  return flushWorkflowOutbox(env, env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com', studio);
}

function allowedProspectOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  if (origin === new URL(request.url).origin) return true;
  return TUNNEL_ORIGINS.has(origin);
}

function corsResponse(request, response) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin');
  if (origin && allowedProspectOrigin(request)) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function shouldInjectProspectCapture(request, response) {
  if (request.method !== 'GET' || !response.ok) return false;
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/studio') || path.startsWith('/espace-client')) return false;
  return (response.headers.get('Content-Type') || '').includes('text/html');
}

async function injectProspectCapture(response) {
  let body = await response.text();
  const css = '/styles/prospect-capture-v1.css?v=1';
  const js = '/prospect-capture-v1.js?v=1';
  if (!body.includes(css)) body = body.replace('</head>', `<link rel="stylesheet" href="${css}"></head>`);
  if (!body.includes(js)) body = body.replace('</body>', `<script src="${js}" defer></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function injectWorkflowAssets(response, pathname) {
  const clientPaths = new Set(['/espace-client', '/espace-client/', '/espace-client/index.html']);
  const studioPaths = new Set(['/studio/clients', '/studio/clients/', '/studio/clients.html']);
  if (!clientPaths.has(pathname) && !studioPaths.has(pathname)) return response;
  let body = await response.text();
  const sharedCss = '/assets/neptune-premium-icons-v46.css?v=1';
  const sharedJs = '/assets/neptune-premium-icons-v46.js?v=1';
  if (!body.includes(sharedCss)) body = body.replace('</head>', `<link rel="stylesheet" href="${sharedCss}"></head>`);
  if (clientPaths.has(pathname)) {
    if (!body.includes('/espace-client/workflow-v45.css')) body = body.replace('</head>', '<link rel="stylesheet" href="/espace-client/workflow-v45.css?v=7"></head>');
    if (!body.includes('/espace-client/client-premium-v46.css')) body = body.replace('</head>', '<link rel="stylesheet" href="/espace-client/client-premium-v46.css?v=1"></head>');
    if (!body.includes('/espace-client/workflow-v45.js')) body = body.replace('</body>', '<script type="module" src="/espace-client/workflow-v45.js?v=7"></script></body>');
  }
  if (studioPaths.has(pathname)) {
    if (!body.includes('/studio/clients-workflow-v37.css')) body = body.replace('</head>', '<link rel="stylesheet" href="/studio/clients-workflow-v37.css?v=6"></head>');
    if (!body.includes('/studio/workspace-v42.css')) body = body.replace('</head>', '<link rel="stylesheet" href="/studio/workspace-v42.css?v=3"></head>');
    if (!body.includes('/studio/workflow-runtime-v44.css')) body = body.replace('</head>', '<link rel="stylesheet" href="/studio/workflow-runtime-v44.css?v=1"></head>');
    if (!body.includes('/studio/drive-sync-v47.css')) body = body.replace('</head>', '<link rel="stylesheet" href="/studio/drive-sync-v47.css?v=1"></head>');
    if (!body.includes('/studio/clients-workflow-v37.js')) body = body.replace('</body>', '<script type="module" src="/studio/clients-workflow-v37.js?v=6"></script></body>');
    if (!body.includes('/studio/workspace-v42.js')) body = body.replace('</body>', '<script type="module" src="/studio/workspace-v42.js?v=3"></script></body>');
    if (!body.includes('/studio/drive-sync-v47.js')) body = body.replace('</body>', '<script type="module" src="/studio/drive-sync-v47.js?v=1"></script></body>');
  }
  if (!body.includes(sharedJs)) body = body.replace('</body>', `<script type="module" src="${sharedJs}"></script></body>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function safeError(error) {
  return { name: error?.name || 'Error', message: String(error?.message || error || 'unknown').slice(0, 500) };
}
