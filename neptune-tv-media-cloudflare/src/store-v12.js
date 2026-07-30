import { StudioStore as LegacyStore } from './store-v11.js';

export class StudioStore extends LegacyStore {
  refreshJobReviewStatus(jobId, now = new Date().toISOString()) {
    const counts = this.sql.exec(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='generated' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected,
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
    if (exporting > 0) { status = 'exporting'; stage = 'drive_export'; }
    else if (pending === 0 && approved > 0) { status = 'approved'; stage = 'approved'; }
    else if (total > 0 && pending === 0 && approved === 0 && delivered > 0) { status = 'delivered'; stage = 'delivered'; }
    this.sql.exec('UPDATE video_ai_jobs SET status=?,stage=?,updated_at=? WHERE id=?', status, stage, now, jobId);
  }
}
