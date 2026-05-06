import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMySqlPool } from '../db/mysql.mjs';
import { createJobRepository } from './job-repository.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

test('job repository creates and transitions a job', async (t) => {
  if (!databaseUrl) {
    t.skip('DATABASE_URL or TEST_DATABASE_URL is required');
    return;
  }

  const pool = createMySqlPool(databaseUrl);
  t.after(async () => pool.end());

  const repository = createJobRepository(pool);
  const jobId = randomUUID();

  await repository.createJob({
    id: jobId,
    pipelineType: 'model-optimization',
    sourceKey: `uploads/${jobId}/source.glb`,
    options: { preset: 'balanced' }
  });

  let job = await repository.getJob(jobId);
  assert.equal(job.status, 'created');

  await repository.markQueued(jobId);
  job = await repository.getJob(jobId);
  assert.equal(job.status, 'queued');

  const claimed = await repository.claimJob(jobId, 'test-worker');
  assert.equal(claimed, true);

  job = await repository.getJob(jobId);
  assert.equal(job.status, 'processing');
  assert.equal(job.attempts, 1);

  await repository.markCompleted(jobId, {
    resultKey: `results/${jobId}/optimized.glb`,
    artifactType: 'glb'
  });

  job = await repository.getJob(jobId);
  assert.equal(job.status, 'completed');
  assert.equal(job.resultKey, `results/${jobId}/optimized.glb`);
});
