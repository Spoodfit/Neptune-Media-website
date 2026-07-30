import { StudioStore as LegacyStore } from './store-v9.js';
import { json, sanitizeText } from './security.js';
import { ensurePortalSchema } from './portal-schema.js';
import { ensureDriveSchema } from './portal-drive.js';

const VIDEO_AI_PATHS = new Set([
  '/portal/video-ai-bootstrap',
  '/portal/video-ai-job-create',
  '/portal/video-ai-job-get',
  '/portal/video-ai-job-set-upload',
  '/portal/video-ai-job-update',
  '/portal/video-ai-analysis-save',
  '/portal/video-ai-clip-action',
  '/portal/video-ai-export-context',
  '/portal/video-ai-export-mark',
  '/portal/video-ai-pending',
]);
const CONTROL_ROLES = new Set(['admin', 'editor']);
const JOB_STATUSES = new Set(['uploading', 'queued', 'processing', 'review_ready', 'approved', 'exporting', 'delivered', 'failed', 'cancelled']);
const CLIP_STATUSES = new Set(['generated', 'approved', 'rejected', 'exporting', 'delivered', 'failed']);
const FUNNELS = new Set(['TOFU', 'MOFU', 'BOFU']);

export class StudioStore extends LegacyStore {
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === 'POST' && VIDEO_AI_PATHS.has(url.pathname)) {
      ensurePortalSchema(this);
      ensureDriveSchema(this);
      this.ensureVideoAiSchema();
      const body = await request.clone().json().catch(() => ({}));
      try {
        if (url.pathname === '/portal/video-ai-bootstrap') return this.videoAiBootstrap(body);
        if (url.pathname === '/portal/video-ai-job-create') return this.videoAiJobCreate(body);
        if (url.pathname === '/portal/video-ai-job-get') return this.videoAiJobGet(body);
        if (url.pathname === '/portal/video-ai-job-set-upload') return this.videoAiJobSetUpload(body);
        if (url.pathname === '/portal/video-ai-job-update') return this.videoAiJobUpdate(body);
        if (url.pathname === '/portal/video-ai-analysis-save') return this.videoAiAnalysisSave(body);
        if (url.pathname === '/portal/video-ai-clip-action') return this.videoAiClipAction(body);
        if (url.pathname === '/portal/video-ai-export-context') return this.videoAiExportContext(body);
        if (url.pathname === '/portal/video-ai-export-mark') return this.videoAiExportMark(body);
        return this.videoAiPending(body);
      } catch (error) {
        console.error('video_ai_store_failed', {
          path: url.pathname,
          name: error?.name || 'Error',
          message: String(error?.message || error || 'unknown').slice(0, 500),
        });
        return json({ error: 'video_ai_store_failed' }, 500);
      }
    }
    return super.fetch(request);
  }

  ensureVideoAiSchema() {
    if (this.videoAiSchemaReady) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS video_ai_jobs(
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES portal_orders(id) ON DELETE CASCADE,
        source_key TEXT NOT NULL DEFAULT '',
        source_name TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT 'video/mp4',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        upload_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'uploading',
        stage TEXT NOT NULL DEFAULT 'upload',
        progress INTEGER NOT NULL DEFAULT 0,
        objective TEXT NOT NULL DEFAULT '',
        duration_seconds REAL NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        transcript TEXT NOT NULL DEFAULT '',
        transcript_vtt TEXT NOT NULL DEFAULT '',
        visual_profile TEXT NOT NULL DEFAULT '{}',
        ai_model TEXT NOT NULL DEFAULT '',
        prompt_version TEXT NOT NULL DEFAULT '',
        generation_status TEXT NOT NULL DEFAULT 'pending',
        error_code TEXT NOT NULL DEFAULT '',
        error_detail TEXT NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        notified_at TEXT,
        UNIQUE(order_id,source_fingerprint)
      );
      CREATE INDEX IF NOT EXISTS idx_video_ai_jobs_status ON video_ai_jobs(status,updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_video_ai_jobs_order ON video_ai_jobs(order_id,created_at DESC);

      CREATE TABLE IF NOT EXISTS video_ai_clips(
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES video_ai_jobs(id) ON DELETE CASCADE,
        rank INTEGER NOT NULL DEFAULT 0,
        start_seconds REAL NOT NULL,
        end_seconds REAL NOT NULL,
        duration_seconds REAL NOT NULL,
        title TEXT NOT NULL,
        funnel TEXT NOT NULL DEFAULT 'TOFU',
        score INTEGER NOT NULL DEFAULT 0,
        score_breakdown TEXT NOT NULL DEFAULT '{}',
        rationale TEXT NOT NULL DEFAULT '',
        hook_moment TEXT NOT NULL DEFAULT '',
        transcript TEXT NOT NULL DEFAULT '',
        transcript_segments TEXT NOT NULL DEFAULT '[]',
        caption_preset TEXT NOT NULL DEFAULT 'neptune-contrast',
        editorial_proposals TEXT NOT NULL DEFAULT '[]',
        selected_proposal_id TEXT NOT NULL DEFAULT 'direct',
        output_key TEXT NOT NULL DEFAULT '',
        output_size_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'generated',
        drive_file_id TEXT NOT NULL DEFAULT '',
        drive_web_view_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        exported_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_video_ai_clips_job ON video_ai_clips(job_id,rank ASC);
      CREATE INDEX IF NOT EXISTS idx_video_ai_clips_status ON video_ai_clips(status,updated_at DESC);
    `);
    this.videoAiSchemaReady = true;
  }

  async videoAiBootstrap(body) {
    const actor = await this.requireVideoAiActor(body);
    if (!actor) return json({ error: 'unauthorized' }, 401);
    const orders = this.sql.exec(`
      SELECT o.id,o.title,o.format,o.status,o.created_at AS createdAt,o.updated_at AS updatedAt,
             c.full_name AS fullName,c.company,c.email,
             dp.shorts_folder_id AS shortsFolderId,dp.sync_status AS driveSyncStatus
      FROM portal_orders o
      JOIN portal_clients c ON c.id=o.client_id
      LEFT JOIN portal_drive_passages dp ON dp.order_id=o.id
      WHERE o.status NOT IN ('cancelled','refunded')
      ORDER BY o.updated_at DESC LIMIT 250
    `).toArray();
    const jobs = this.sql.exec(`
      SELECT j.id,j.order_id AS orderId,j.source_name AS sourceName,j.mime_type AS mimeType,
             j.size_bytes AS sizeBytes,j.status,j.stage,j.progress,j.duration_seconds AS durationSeconds,
             j.generation_status AS generationStatus,j.error_code AS errorCode,j.error_detail AS errorDetail,
             j.created_at AS createdAt,j.updated_at AS updatedAt,j.completed_at AS completedAt,
             o.title AS orderTitle,c.full_name AS clientName,c.company,
             COUNT(vc.id) AS clipCount,
             SUM(CASE WHEN vc.status='approved' THEN 1 ELSE 0 END) AS approvedCount,
             SUM(CASE WHEN vc.status='delivered' THEN 1 ELSE 0 END) AS deliveredCount
      FROM video_ai_jobs j
      JOIN portal_orders o ON o.id=j.order_id
      JOIN portal_clients c ON c.id=o.client_id
      LEFT JOIN video_ai_clips vc ON vc.job_id=j.id
      GROUP BY j.id
      ORDER BY j.created_at DESC LIMIT 100
    `).toArray().map(normalizeJobSummary);
    return json({
      ok: true,
      viewer: { id: actor.id, email: actor.email, fullName: actor.fullName || '', role: actor.role },
      orders,
      jobs,
      policy: {
        minimumScore: 60,
        funnels: ['TOFU', 'MOFU', 'BOFU'],
        exactEditorialProposals: 3,
        automaticDriveExport: false,
        reviewRequired: true,
      },
    });
  }

  async videoAiJobCreate(body) {
    const actor = await this.requireVideoAiActor(body);
    if (!actor) return json({ error: 'unauthorized' }, 401);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
    const orderId = sanitizeText(payload.orderId, 100);
    const sourceName = cleanFilename(payload.sourceName);
    const sourceFingerprint = sanitizeText(payload.sourceFingerprint, 160);
    const mimeType = sanitizeText(payload.mimeType, 120).toLowerCase() || 'video/mp4';
    const sizeBytes = clampInt(payload.sizeBytes, 1, 80 * 1024 * 1024 * 1024);
    const objective = sanitizeMultiline(payload.objective, 1200);
    if (!orderId || !sourceName || !sourceFingerprint || !mimeType.startsWith('video/') || !sizeBytes) {
      return json({ error: 'invalid_video_ai_job' }, 400);
    }
    const order = this.sql.exec('SELECT id FROM portal_orders WHERE id=? LIMIT 1', orderId).toArray()[0];
    if (!order) return json({ error: 'order_not_found' }, 404);
    const duplicate = this.sql.exec(`
      SELECT id,status,source_key AS sourceKey,upload_id AS uploadId,created_at AS createdAt
      FROM video_ai_jobs WHERE order_id=? AND source_fingerprint=? LIMIT 1
    `, orderId, sourceFingerprint).toArray()[0];
    if (duplicate) return json({ ok: true, deduplicated: true, job: duplicate });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.sql.exec(`
      INSERT INTO video_ai_jobs(
        id,order_id,source_name,source_fingerprint,mime_type,size_bytes,status,stage,progress,objective,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,'uploading','upload',0,?,?,?)
    `, id, orderId, sourceName, sourceFingerprint, mimeType, sizeBytes, objective, now, now);
    return json({ ok: true, deduplicated: false, job: { id, orderId, sourceName, mimeType, sizeBytes, status: 'uploading', stage: 'upload', progress: 0, createdAt: now } });
  }

  async videoAiJobGet(body) {
    const actor = await this.requireVideoAiActor(body);
    if (!actor) return json({ error: 'unauthorized' }, 401);
    return this.readVideoAiJob(sanitizeText(body.jobId || body.id, 100));
  }

  async videoAiJobSetUpload(body) {
    const actor = await this.requireVideoAiActor(body);
    if (!actor) return json({ error: 'unauthorized' }, 401);
    const jobId = sanitizeText(body.jobId, 100);
    const sourceKey = sanitizeText(body.sourceKey, 900);
    const uploadId = sanitizeText(body.uploadId, 1000);
    if (!jobId || !sourceKey) return json({ error: 'invalid_upload_state' }, 400);
    const current = this.sql.exec('SELECT id FROM video_ai_jobs WHERE id=?', jobId).toArray()[0];
    if (!current) return json({ error: 'video_ai_job_not_found' }, 404);
    this.sql.exec(`UPDATE video_ai_jobs SET source_key=?,upload_id=?,updated_at=? WHERE id=?`, sourceKey, uploadId, new Date().toISOString(), jobId);
    return json({ ok: true, jobId, sourceKey, uploadId });
  }

  videoAiJobUpdate(body) {
    if (body.system !== true) return json({ error: 'forbidden' }, 403);
    const jobId = sanitizeText(body.jobId, 100);
    const current = this.sql.exec('SELECT id,status,attempts FROM video_ai_jobs WHERE id=?', jobId).toArray()[0];
    if (!current) return json({ error: 'video_ai_job_not_found' }, 404);
    const status = JOB_STATUSES.has(String(body.status || '')) ? String(body.status) : current.status;
    const stage = sanitizeText(body.stage, 80) || status;
    const progress = clampInt(body.progress, 0, 100);
    const errorCode = sanitizeText(body.errorCode, 120);
    const errorDetail = sanitizeMultiline(body.errorDetail, 1200);
    const now = new Date().toISOString();
    const attempts = body.incrementAttempt === true ? Number(current.attempts || 0) + 1 : Number(current.attempts || 0);
    this.sql.exec(`
      UPDATE video_ai_jobs SET status=?,stage=?,progress=?,error_code=?,error_detail=?,attempts=?,
        started_at=CASE WHEN ?='processing' THEN COALESCE(started_at,?) ELSE started_at END,
        completed_at=CASE WHEN ? IN ('review_ready','failed','cancelled','delivered') THEN ? ELSE completed_at END,
        updated_at=? WHERE id=?
    `, status, stage, progress, errorCode, errorDetail, attempts, status, now, status, now, now, jobId);
    return json({ ok: true, jobId, status, stage, progress, attempts });
  }

  videoAiAnalysisSave(body) {
    if (body.system !== true) return json({ error: 'forbidden' }, 403);
    const jobId = sanitizeText(body.jobId, 100);
    const job = this.sql.exec('SELECT id FROM video_ai_jobs WHERE id=?', jobId).toArray()[0];
    if (!job) return json({ error: 'video_ai_job_not_found' }, 404);
    const result = body.result && typeof body.result === 'object' ? body.result : {};
    const candidates = Array.isArray(result.candidates) ? result.candidates.filter((candidate) => Number(candidate?.score || 0) >= 60).slice(0, 48) : [];
    const now = new Date().toISOString();
    this.sql.exec('DELETE FROM video_ai_clips WHERE job_id=? AND status NOT IN (\'delivered\')', jobId);
    for (const [index, raw] of candidates.entries()) {
      const clip = normalizeClip(raw, index);
      this.sql.exec(`
        INSERT INTO video_ai_clips(
          id,job_id,rank,start_seconds,end_seconds,duration_seconds,title,funnel,score,score_breakdown,
          rationale,hook_moment,transcript,transcript_segments,caption_preset,editorial_proposals,
          selected_proposal_id,output_key,output_size_bytes,status,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'generated',?,?)
      `,
      clip.id, jobId, clip.rank, clip.startSeconds, clip.endSeconds, clip.durationSeconds, clip.title,
      clip.funnel, clip.score, JSON.stringify(clip.scoreBreakdown), clip.rationale, clip.hookMoment,
      clip.transcript, JSON.stringify(clip.transcriptSegments), clip.captionPreset,
      JSON.stringify(clip.editorialProposals), clip.selectedProposalId, clip.outputKey, clip.outputSizeBytes,
      now, now);
    }
    this.sql.exec(`
      UPDATE video_ai_jobs SET status='review_ready',stage='review',progress=100,duration_seconds=?,width=?,height=?,
        transcript=?,transcript_vtt=?,visual_profile=?,ai_model=?,prompt_version=?,generation_status=?,error_code='',error_detail='',
        completed_at=?,updated_at=? WHERE id=?
    `,
    positiveNumber(body.durationSeconds), clampInt(body.width, 0, 20000), clampInt(body.height, 0, 20000),
    sanitizeMultiline(result.transcript || body.transcript, 180000), sanitizeMultiline(body.transcriptVtt, 240000),
    JSON.stringify(safeObject(body.visualProfile)), sanitizeText(result.aiModel, 140), sanitizeText(result.promptVersion, 140),
    sanitizeText(result.generationStatus, 60) || 'generated', now, now, jobId);
    return json({ ok: true, jobId, clipCount: candidates.length, retainedMinimumScore: 60 });
  }

  async videoAiClipAction(body) {
    const actor = await this.requireVideoAiActor(body);
    if (!actor) return json({ error: 'unauthorized' }, 401);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
    const clipId = sanitizeText(payload.clipId, 100);
    const action = sanitizeText(payload.action, 40);
    const current = this.sql.exec('SELECT id,job_id AS jobId,status,editorial_proposals AS editorialProposals FROM video_ai_clips WHERE id=?', clipId).toArray()[0];
    if (!current) return json({ error: 'video_ai_clip_not_found' }, 404);
    const now = new Date().toISOString();
    if (action === 'approve' || action === 'reject') {
      const status = action === 'approve' ? 'approved' : 'rejected';
      this.sql.exec('UPDATE video_ai_clips SET status=?,updated_at=? WHERE id=?', status, now, clipId);
    } else if (action === 'select-proposal') {
      const proposalId = sanitizeText(payload.selectedProposalId, 80);
      const proposals = parseArray(current.editorialProposals);
      if (!proposals.some((proposal) => proposal.id === proposalId)) return json({ error: 'invalid_editorial_proposal' }, 400);
      this.sql.exec('UPDATE video_ai_clips SET selected_proposal_id=?,updated_at=? WHERE id=?', proposalId, now, clipId);
    } else if (action === 'update') {
      const title = sanitizeText(payload.title, 160);
      const captionPreset = sanitizeText(payload.captionPreset, 80) || 'neptune-contrast';
      const funnel = FUNNELS.has(String(payload.funnel || '').toUpperCase()) ? String(payload.funnel).toUpperCase() : 'TOFU';
      const proposals = normalizeProposalArray(payload.editorialProposals);
      if (!title || proposals.length !== 3) return json({ error: 'invalid_clip_update' }, 400);
      this.sql.exec(`UPDATE video_ai_clips SET title=?,funnel=?,caption_preset=?,editorial_proposals=?,updated_at=? WHERE id=?`, title, funnel, captionPreset, JSON.stringify(proposals), now, clipId);
    } else {
      return json({ error: 'invalid_clip_action' }, 400);
    }
    this.refreshJobReviewStatus(current.jobId, now);
    return this.readVideoAiJob(current.jobId);
  }

  async videoAiExportContext(body) {
    const actor = await this.requireVideoAiActor(body);
    if (!actor) return json({ error: 'unauthorized' }, 401);
    const clipId = sanitizeText(body.clipId, 100);
    const row = this.sql.exec(`
      SELECT vc.id,vc.job_id AS jobId,vc.title,vc.funnel,vc.score,vc.output_key AS outputKey,
             vc.output_size_bytes AS outputSizeBytes,vc.status,vc.editorial_proposals AS editorialProposals,
             vc.selected_proposal_id AS selectedProposalId,
             j.order_id AS orderId,j.source_name AS sourceName,o.title AS orderTitle,c.full_name AS clientName,c.company,
             dp.shorts_folder_id AS shortsFolderId,dp.folder_url AS passageFolderUrl
      FROM video_ai_clips vc
      JOIN video_ai_jobs j ON j.id=vc.job_id
      JOIN portal_orders o ON o.id=j.order_id
      JOIN portal_clients c ON c.id=o.client_id
      LEFT JOIN portal_drive_passages dp ON dp.order_id=j.order_id
      WHERE vc.id=? LIMIT 1
    `, clipId).toArray()[0];
    if (!row) return json({ error: 'video_ai_clip_not_found' }, 404);
    if (!['approved', 'exporting', 'delivered'].includes(row.status)) return json({ error: 'clip_not_approved' }, 409);
    return json({
      ok: true,
      clip: {
        ...row,
        score: Number(row.score || 0),
        outputSizeBytes: Number(row.outputSizeBytes || 0),
        editorialProposals: parseArray(row.editorialProposals),
      },
    });
  }

  videoAiExportMark(body) {
    if (body.system !== true) return json({ error: 'forbidden' }, 403);
    const clipId = sanitizeText(body.clipId, 100);
    const status = CLIP_STATUSES.has(String(body.status || '')) ? String(body.status) : 'delivered';
    const driveFileId = sanitizeText(body.driveFileId, 240);
    const driveWebViewUrl = sanitizeText(body.driveWebViewUrl, 1500);
    const row = this.sql.exec('SELECT job_id AS jobId FROM video_ai_clips WHERE id=?', clipId).toArray()[0];
    if (!row) return json({ error: 'video_ai_clip_not_found' }, 404);
    const now = new Date().toISOString();
    this.sql.exec(`
      UPDATE video_ai_clips SET status=?,drive_file_id=?,drive_web_view_url=?,exported_at=CASE WHEN ?='delivered' THEN ? ELSE exported_at END,updated_at=? WHERE id=?
    `, status, driveFileId, driveWebViewUrl, status, now, now, clipId);
    this.refreshJobReviewStatus(row.jobId, now);
    return json({ ok: true, clipId, status, driveFileId, driveWebViewUrl });
  }

  videoAiPending(body) {
    if (body.system !== true) return json({ error: 'forbidden' }, 403);
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const jobs = this.sql.exec(`
      SELECT id,status,stage,progress,source_key AS sourceKey,attempts,updated_at AS updatedAt
      FROM video_ai_jobs
      WHERE (status='queued') OR (status='processing' AND updated_at<?)
      ORDER BY created_at ASC LIMIT 20
    `, cutoff).toArray().map((row) => ({ ...row, progress: Number(row.progress || 0), attempts: Number(row.attempts || 0) }));
    return json({ ok: true, jobs, generatedAt: new Date().toISOString() });
  }

  async requireVideoAiActor(body) {
    const actor = await this.requireSession(body.token);
    if (!actor || !CONTROL_ROLES.has(actor.role)) return null;
    if (!body.csrfToken || body.csrfToken !== actor.csrfToken) return null;
    return actor;
  }

  readVideoAiJob(jobId) {
    const job = this.sql.exec(`
      SELECT j.id,j.order_id AS orderId,j.source_key AS sourceKey,j.source_name AS sourceName,j.source_fingerprint AS sourceFingerprint,
             j.mime_type AS mimeType,j.size_bytes AS sizeBytes,j.status,j.stage,j.progress,j.objective,
             j.duration_seconds AS durationSeconds,j.width,j.height,j.transcript,j.transcript_vtt AS transcriptVtt,
             j.visual_profile AS visualProfile,j.ai_model AS aiModel,j.prompt_version AS promptVersion,
             j.generation_status AS generationStatus,j.error_code AS errorCode,j.error_detail AS errorDetail,
             j.attempts,j.created_at AS createdAt,j.updated_at AS updatedAt,j.started_at AS startedAt,j.completed_at AS completedAt,
             o.title AS orderTitle,o.format,c.full_name AS clientName,c.company,c.email
      FROM video_ai_jobs j
      JOIN portal_orders o ON o.id=j.order_id
      JOIN portal_clients c ON c.id=o.client_id
      WHERE j.id=? LIMIT 1
    `, jobId).toArray()[0];
    if (!job) return json({ error: 'video_ai_job_not_found' }, 404);
    const clips = this.sql.exec(`
      SELECT id,job_id AS jobId,rank,start_seconds AS startSeconds,end_seconds AS endSeconds,duration_seconds AS durationSeconds,
             title,funnel,score,score_breakdown AS scoreBreakdown,rationale,hook_moment AS hookMoment,transcript,
             transcript_segments AS transcriptSegments,caption_preset AS captionPreset,editorial_proposals AS editorialProposals,
             selected_proposal_id AS selectedProposalId,output_key AS outputKey,output_size_bytes AS outputSizeBytes,
             status,drive_file_id AS driveFileId,drive_web_view_url AS driveWebViewUrl,created_at AS createdAt,updated_at AS updatedAt,exported_at AS exportedAt
      FROM video_ai_clips WHERE job_id=? ORDER BY rank ASC,score DESC
    `, jobId).toArray().map(normalizeClipRow);
    return json({ ok: true, job: normalizeJob(job), clips });
  }

  refreshJobReviewStatus(jobId, now = new Date().toISOString()) {
    const counts = this.sql.exec(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='generated' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status='exporting' THEN 1 ELSE 0 END) AS exporting,
        SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered
      FROM video_ai_clips WHERE job_id=?
    `, jobId).one();
    const total = Number(counts.total || 0);
    const pending = Number(counts.pending || 0);
    const approved = Number(counts.approved || 0);
    const exporting = Number(counts.exporting || 0);
    const delivered = Number(counts.delivered || 0);
    let status = 'review_ready';
    let stage = 'review';
    if (total > 0 && delivered === total) { status = 'delivered'; stage = 'delivered'; }
    else if (exporting > 0) { status = 'exporting'; stage = 'drive_export'; }
    else if (pending === 0 && approved > 0) { status = 'approved'; stage = 'approved'; }
    this.sql.exec('UPDATE video_ai_jobs SET status=?,stage=?,updated_at=? WHERE id=?', status, stage, now, jobId);
  }
}

function normalizeJobSummary(row) {
  return {
    ...row,
    sizeBytes: Number(row.sizeBytes || 0),
    progress: Number(row.progress || 0),
    durationSeconds: Number(row.durationSeconds || 0),
    clipCount: Number(row.clipCount || 0),
    approvedCount: Number(row.approvedCount || 0),
    deliveredCount: Number(row.deliveredCount || 0),
  };
}

function normalizeJob(row) {
  return {
    ...row,
    sizeBytes: Number(row.sizeBytes || 0),
    progress: Number(row.progress || 0),
    durationSeconds: Number(row.durationSeconds || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    attempts: Number(row.attempts || 0),
    visualProfile: safeObject(row.visualProfile),
  };
}

function normalizeClip(raw, index) {
  const start = positiveNumber(raw.startSeconds);
  const end = Math.max(start + 0.1, positiveNumber(raw.endSeconds));
  const score = clampInt(raw.score, 60, 100);
  const proposals = normalizeProposalArray(raw.editorialProposals);
  return {
    id: sanitizeText(raw.id, 100) || crypto.randomUUID(),
    rank: clampInt(raw.rank || index + 1, 1, 999),
    startSeconds: start,
    endSeconds: end,
    durationSeconds: positiveNumber(raw.durationSeconds) || end - start,
    title: sanitizeText(raw.title, 160) || `Short ${index + 1}`,
    funnel: FUNNELS.has(String(raw.funnel || '').toUpperCase()) ? String(raw.funnel).toUpperCase() : 'TOFU',
    score,
    scoreBreakdown: safeObject(raw.scoreBreakdown),
    rationale: sanitizeMultiline(raw.rationale, 900),
    hookMoment: sanitizeText(raw.hookMoment, 300),
    transcript: sanitizeMultiline(raw.transcript, 18000),
    transcriptSegments: Array.isArray(raw.transcriptSegments) ? raw.transcriptSegments.slice(0, 500) : [],
    captionPreset: sanitizeText(raw.captionPreset, 80) || 'neptune-contrast',
    editorialProposals: proposals,
    selectedProposalId: proposals[0]?.id || 'direct',
    outputKey: sanitizeText(raw.outputKey, 900),
    outputSizeBytes: clampInt(raw.outputSizeBytes, 0, 10 * 1024 * 1024 * 1024),
  };
}

function normalizeClipRow(row) {
  return {
    ...row,
    rank: Number(row.rank || 0),
    startSeconds: Number(row.startSeconds || 0),
    endSeconds: Number(row.endSeconds || 0),
    durationSeconds: Number(row.durationSeconds || 0),
    score: Number(row.score || 0),
    scoreBreakdown: safeObject(row.scoreBreakdown),
    transcriptSegments: parseArray(row.transcriptSegments),
    editorialProposals: parseArray(row.editorialProposals),
    outputSizeBytes: Number(row.outputSizeBytes || 0),
  };
}

function normalizeProposalArray(value) {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 3).map((item, index) => ({
    id: sanitizeText(item?.id, 80) || ['direct', 'humour', 'expertise'][index] || `proposal-${index + 1}`,
    label: sanitizeText(item?.label, 120),
    hook: sanitizeText(item?.hook, 240),
    description: sanitizeMultiline(item?.description, 2200),
    cta: ensureQuestion(sanitizeText(item?.cta, 320)),
    hashtags: normalizeHashtags(item?.hashtags),
    fullPost: sanitizeMultiline(item?.fullPost, 3200),
  })).filter((item) => item.hook && item.description && item.cta && item.hashtags.length >= 3);
}

function ensureQuestion(value) {
  const text = String(value || '').trim().replace(/[.!…]+$/u, '');
  return text ? `${text} ?`.replace(/\s+\?/u, ' ?') : '';
}

function normalizeHashtags(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/u);
  return [...new Set(raw.map((item) => `#${String(item || '').replace(/^#+/u, '').replace(/[^\p{L}\p{N}_]/gu, '')}`).filter((item) => item.length > 2))].slice(0, 6);
}

function cleanFilename(value) {
  return sanitizeText(value, 240).replace(/[\r\n"\\/]/gu, '_');
}

function sanitizeMultiline(value, max) {
  return String(value || '').replace(/\r/gu, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '').trim().slice(0, max);
}

function safeObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function clampInt(value, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? Math.round(number) : min));
}
