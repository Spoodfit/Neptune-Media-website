import { StudioStore as LegacyStore } from './store-v12.js';
import { json, sanitizeText } from './security.js';
import { ensurePortalSchema } from './portal-schema.js';
import { ensureDriveSchema } from './portal-drive.js';

const PROCESSING_STALE_MS = 2 * 60 * 1000;
const LEGACY_RECOVERY_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const CLOUD_SOURCE_PREFIX = 'video-ai/sources/%';
const CLOUD_RETIRED_CODE = 'cloud_engine_retired_use_local';

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/portal/video-ai-job-reset') {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      this.ensureVideoAiSchema();
      const body = await request.clone().json().catch(() => ({}));
      if (body.system !== true) return json({ error: 'forbidden' }, 403);
      const jobId = sanitizeText(body.jobId, 100);
      const current = this.sql.exec('SELECT id FROM video_ai_jobs WHERE id=? LIMIT 1', jobId).toArray()[0];
      if (!current) return json({ error: 'video_ai_job_not_found' }, 404);
      const now = new Date().toISOString();
      this.sql.exec(`
        UPDATE video_ai_jobs
        SET status='queued',stage='queued',progress=5,attempts=0,error_code='',error_detail='',completed_at=NULL,updated_at=?
        WHERE id=?
      `, now, jobId);
      return json({ ok: true, jobId, status: 'queued', stage: 'queued', progress: 5, attempts: 0, updatedAt: now });
    }

    if (request.method === 'POST' && url.pathname === '/portal/video-ai-retire-cloud-jobs') {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      this.ensureVideoAiSchema();
      const body = await request.clone().json().catch(() => ({}));
      if (body.system !== true) return json({ error: 'forbidden' }, 403);
      return this.retireCloudVideoJobs();
    }

    return super.fetch(request);
  }

  retireCloudVideoJobs() {
    const pending = this.sql.exec(`
      SELECT COUNT(*) AS total
      FROM video_ai_jobs
      WHERE source_key LIKE ?
        AND status IN ('uploading','queued','processing')
    `, CLOUD_SOURCE_PREFIX).one();
    const total = Number(pending?.total || 0);
    if (!total) return json({ ok: true, retired: 0, errorCode: CLOUD_RETIRED_CODE });

    const now = new Date().toISOString();
    this.sql.exec(`
      UPDATE video_ai_jobs
      SET status='failed',
          stage='cloud_engine_retired',
          error_code=?,
          error_detail='Le moteur Cloudflare Containers a été retiré. Sélectionnez à nouveau le fichier sur cet ordinateur : la vidéo sera traitée localement et ne sera pas téléversée.',
          completed_at=?,
          updated_at=?
      WHERE source_key LIKE ?
        AND status IN ('uploading','queued','processing')
    `, CLOUD_RETIRED_CODE, now, now, CLOUD_SOURCE_PREFIX);

    return json({ ok: true, retired: total, errorCode: CLOUD_RETIRED_CODE, updatedAt: now });
  }

  videoAiPending(body) {
    if (body.system !== true) return json({ error: 'forbidden' }, 403);
    const cutoff = new Date(Date.now() - PROCESSING_STALE_MS).toISOString();
    const jobs = this.sql.exec(`
      SELECT j.id,j.status,j.stage,j.progress,j.source_key AS sourceKey,j.source_name AS sourceName,
             j.objective,j.attempts,j.error_code AS errorCode,j.error_detail AS errorDetail,
             CASE
               WHEN j.stage='restarting' AND COALESCE(j.error_code,'')='' THEN ?
               ELSE j.updated_at
             END AS updatedAt,
             o.title AS orderTitle,c.full_name AS clientName,c.company
      FROM video_ai_jobs j
      JOIN portal_orders o ON o.id=j.order_id
      JOIN portal_clients c ON c.id=o.client_id
      WHERE (j.status='queued')
         OR (j.stage='restarting' AND COALESCE(j.error_code,'')='')
         OR (j.status='processing' AND j.updated_at<?)
         OR (j.status='failed' AND j.error_code='video_processor_dispatch_failed')
      ORDER BY j.created_at ASC LIMIT 20
    `, LEGACY_RECOVERY_TIMESTAMP, cutoff).toArray().map((row) => ({
      ...row,
      progress: Number(row.progress || 0),
      attempts: Number(row.attempts || 0),
    }));
    return json({ ok: true, jobs, generatedAt: new Date().toISOString() });
  }
}
