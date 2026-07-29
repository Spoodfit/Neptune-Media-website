import base from './entry-v9.js';
import { StudioStore } from './store-v6.js';
import { runPortalScheduled } from './portal-scheduled.js';
import { flushWorkflowOutbox } from './portal-workflow-routes-v5.js';

export { StudioStore };

const STORAGE_RELEASE = 'rows-written-efficiency-20260729-v1';

export default {
  async fetch(request, env, ctx) {
    const response = await base.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('X-Neptune-Storage-Efficiency', STORAGE_RELEASE);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  async scheduled(controller, env, ctx) {
    const studio = env.STUDIO.get(env.STUDIO.idFromName('neptune-media-main'));
    ctx.waitUntil(runScheduled(env, studio).catch((error) => {
      console.error('storage_efficient_scheduler_failed', safeError(error));
    }));
  },
};

async function runScheduled(env, studio) {
  await callStore(studio, '/portal/autopilot-pulse', {
    key: 'scheduler',
    status: 'running',
    detail: 'Vérification en cours',
  });

  try {
    await runPortalScheduled(env, studio);
    const response = await callStore(studio, '/portal/workflow-reconcile', { system: true });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `workflow_reconcile_http_${response.status}`);

    await flushWorkflowOutbox(
      env,
      env.PUBLIC_ORIGIN || 'https://tv.neptunebusiness.com',
      studio,
    );

    await callStore(studio, '/portal/autopilot-pulse', {
      key: 'scheduler',
      status: 'ok',
      detail: `${(result.transitions || []).length} transition(s) automatique(s)`,
    });
  } catch (error) {
    await callStore(studio, '/portal/autopilot-pulse', {
      key: 'scheduler',
      status: 'error',
      detail: String(error?.message || 'Erreur inconnue').slice(0, 300),
    }).catch(() => {});
    throw error;
  }
}

function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function safeError(error) {
  return {
    name: error?.name || 'Error',
    message: String(error?.message || error || 'unknown').slice(0, 500),
  };
}
