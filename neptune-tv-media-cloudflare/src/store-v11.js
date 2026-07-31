import { StudioStore as LegacyStore } from './store-v10.js';
import { json, sanitizeText } from './security.js';
import { ensurePortalSchema } from './portal-schema.js';
import { ensureDriveSchema } from './portal-drive.js';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/portal/video-ai-job-system-get') {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      this.ensureVideoAiSchema();
      const body = await request.clone().json().catch(() => ({}));
      if (body.system !== true) return json({ error: 'forbidden' }, 403);
      return this.readVideoAiJob(sanitizeText(body.jobId, 100));
    }
    return super.fetch(request);
  }

  videoAiPending(body) {
    if (body.system !== true) return json({ error: 'forbidden' }, 403);
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const jobs = this.sql.exec(`
      SELECT j.id,j.status,j.stage,j.progress,j.source_key AS sourceKey,j.source_name AS sourceName,
             j.objective,j.attempts,j.updated_at AS updatedAt,o.title AS orderTitle,
             c.full_name AS clientName,c.company
      FROM video_ai_jobs j
      JOIN portal_orders o ON o.id=j.order_id
      JOIN portal_clients c ON c.id=o.client_id
      WHERE (j.status='queued')
         OR (j.status='processing' AND j.updated_at<?)
         OR (j.status='failed' AND j.error_code='video_processor_dispatch_failed')
      ORDER BY j.created_at ASC LIMIT 20
    `, cutoff).toArray().map((row) => ({
      ...row,
      progress: Number(row.progress || 0),
      attempts: Number(row.attempts || 0),
    }));
    return json({ ok: true, jobs, generatedAt: new Date().toISOString() });
  }
}
