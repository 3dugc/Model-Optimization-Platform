export function createJobRepository(pool) {
  return {
    async getJob(id) {
      const [rows] = await pool.execute('SELECT * FROM jobs WHERE id = ?', [id]);
      const row = rows[0];
      return row ? mapJob(row) : null;
    },

    async claimJob(id, workerId) {
      const now = new Date();
      const [result] = await pool.execute(
        `UPDATE jobs
         SET status = 'processing',
             attempts = attempts + 1,
             locked_by = ?,
             locked_at = ?,
             updated_at = ?
         WHERE id = ?
           AND status IN ('queued', 'retrying')
           AND attempts < max_attempts`,
        [workerId, now, now, id]
      );

      if (result.affectedRows === 1) {
        await insertEvent(pool, id, 'processing', 'Worker claimed job', { workerId });
        return true;
      }

      return false;
    },

    async markCompleted(id, { resultKey, artifactType }) {
      const now = new Date();
      await pool.execute(
        `UPDATE jobs
         SET status = 'completed',
             result_key = ?,
             artifact_type = ?,
             locked_by = NULL,
             locked_at = NULL,
             updated_at = ?,
             completed_at = ?
         WHERE id = ?`,
        [resultKey, artifactType, now, now, id]
      );
      await insertEvent(pool, id, 'completed', 'Job completed', { resultKey, artifactType });
    },

    async markFailed(id, { errorCode, errorMessage }) {
      const now = new Date();
      await pool.execute(
        `UPDATE jobs
         SET status = 'failed',
             error_code = ?,
             error_message = ?,
             locked_by = NULL,
             locked_at = NULL,
             updated_at = ?,
             completed_at = ?
         WHERE id = ?`,
        [errorCode, errorMessage, now, now, id]
      );
      await insertEvent(pool, id, 'failed', errorMessage, { errorCode });
    }
  };
}

async function insertEvent(pool, jobId, eventType, message, metadata = {}) {
  await pool.execute(
    `INSERT INTO job_events (job_id, event_type, message, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [jobId, eventType, message, JSON.stringify(metadata), new Date()]
  );
}

function mapJob(row) {
  return {
    id: row.id,
    pipelineType: row.pipeline_type,
    status: row.status,
    sourceKey: row.source_key,
    resultKey: row.result_key,
    artifactType: row.artifact_type,
    options: typeof row.options_json === 'string' ? JSON.parse(row.options_json) : row.options_json,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}
