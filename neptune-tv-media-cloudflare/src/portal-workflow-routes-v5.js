import { adminAuth } from './portal-http-utils.js';
import { isSameOrigin, json } from './security.js';
import { sendWorkflowOutboxItem } from './portal-workflow-email-v6.js';

export async function handleWorkflowRoute(request, env, studio) {
  const url = new URL(request.url);

  if (url.pathname === '/api/workflow/supplier' && request.method === 'GET') {
    return callStore(studio, '/portal/workflow-supplier-context', { token: url.searchParams.get('token') || '' });
  }

  if (url.pathname === '/api/workflow/supplier' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    const response = await callStore(studio, '/portal/workflow-supplier-respond', payload);
    const result = await response.clone().json().catch(() => ({}));
    if (response.ok) await flushWorkflowOutbox(env, request.url, studio);
    return response.ok ? json(result, response.status) : response;
  }

  if (url.pathname === '/api/admin/workflow/action' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const payload = await request.json().catch(() => ({}));
    const response = await callStore(studio, '/portal/workflow-action', { ...adminAuth(request), payload });
    const result = await response.clone().json().catch(() => ({}));
    if (response.ok) {
      const emailDelivery = await flushWorkflowOutbox(env, request.url, studio);
      return json({
        ...result,
        emailDelivery,
        ...(emailDelivery.failed ? { emailWarning: `${emailDelivery.failed} envoi(s) à réessayer` } : {}),
      }, response.status);
    }
    return response;
  }

  if (url.pathname === '/api/admin/workflow/events' && request.method === 'GET') {
    return callStore(studio, '/portal/workflow-events', { ...adminAuth(request), orderId: url.searchParams.get('orderId') || '' });
  }

  if (url.pathname === '/api/admin/workflow/reconcile' && request.method === 'POST') {
    if (!isSameOrigin(request)) return json({ error: 'origin_forbidden' }, 403);
    const response = await callStore(studio, '/portal/workflow-reconcile', adminAuth(request));
    const result = await response.clone().json().catch(() => ({}));
    if (!response.ok) return response;
    const emailDelivery = await flushWorkflowOutbox(env, request.url, studio);
    return json({ ...result, emailDelivery });
  }

  return null;
}

export async function flushWorkflowOutbox(env, requestUrl, studio) {
  const response = await callStore(studio, '/portal/workflow-email-due', {});
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('workflow_outbox_read_failed', { status: response.status, result });
    return { sent: 0, failed: 1, processed: 0, sentItems: [], error: result.error || 'outbox_read_failed' };
  }

  let sent = 0;
  let failed = 0;
  const sentItems = [];
  for (const item of result.items || []) {
    const delivery = await sendWorkflowOutboxItem(env, requestUrl, item);
    const outcome = delivery.ok ? 'sent' : 'failed';
    const eventAt = new Date().toISOString();
    const mark = await callStore(studio, '/portal/workflow-email-mark', {
      id: item.id,
      outcome,
      emailId: delivery.id || '',
      error: delivery.error || delivery.providerMessage || '',
    });
    if (!mark.ok) console.error('workflow_outbox_mark_failed', { id: item.id, status: mark.status });

    const tracking = await callStore(studio, '/portal/email-track-sent-v82', {
      outboxId: item.id,
      orderId: item.orderId,
      messageKey: item.messageKey,
      recipientType: item.recipientType,
      toEmail: item.toEmail,
      payload: item.payload,
      emailId: delivery.id || '',
      subject: delivery.subject || '',
      outcome,
      sentAt: eventAt,
      error: delivery.error || delivery.providerMessage || '',
    });
    if (!tracking.ok && tracking.status !== 404) {
      console.error('workflow_email_tracking_failed', { id: item.id, status: tracking.status });
    }

    if (delivery.ok) {
      sent += 1;
      sentItems.push({
        emailId: delivery.id || '',
        orderId: item.orderId || '',
        recipientType: item.recipientType || '',
        toEmail: item.toEmail || '',
        subject: delivery.subject || '',
        messageKey: item.messageKey || '',
        sentAt: eventAt,
      });
    } else {
      failed += 1;
      console.error('workflow_email_delivery_failed', { id: item.id, messageKey: item.messageKey, to: item.toEmail, error: delivery.error });
    }
  }
  return { sent, failed, processed: sent + failed, sentItems };
}

async function callStore(studio, path, body) {
  return studio.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}
