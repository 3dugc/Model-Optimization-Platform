import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreateJobResponse, buildJobStatusResponse } from './job-routes.mjs';

test('buildCreateJobResponse returns signed upload contract', () => {
  const response = buildCreateJobResponse({
    jobId: 'job-1',
    sourceKey: 'uploads/job-1/source.glb',
    uploadUrl: 'https://cos.example/upload'
  });

  assert.deepEqual(response, {
    jobId: 'job-1',
    sourceKey: 'uploads/job-1/source.glb',
    uploadUrl: 'https://cos.example/upload'
  });
});

test('buildJobStatusResponse hides internal lock fields', () => {
  const response = buildJobStatusResponse({
    id: 'job-1',
    pipelineType: 'model-optimization',
    status: 'queued',
    sourceKey: 'uploads/job-1/source.glb',
    resultKey: null,
    artifactType: null,
    attempts: 0,
    errorCode: null,
    errorMessage: null
  });

  assert.equal(response.jobId, 'job-1');
  assert.equal(response.status, 'queued');
  assert.equal(response.lockedBy, undefined);
});
