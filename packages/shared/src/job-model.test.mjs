import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JobStatus,
  PipelineType,
  ArtifactType,
  createQueuePayload
} from './job-model.mjs';

test('createQueuePayload keeps queue messages minimal', () => {
  const payload = createQueuePayload({
    jobId: '550e8400-e29b-41d4-a716-446655440000',
    pipelineType: PipelineType.MODEL_OPTIMIZATION
  });

  assert.deepEqual(payload, {
    jobId: '550e8400-e29b-41d4-a716-446655440000',
    pipelineType: 'model-optimization'
  });
});

test('createQueuePayload rejects missing jobId', () => {
  assert.throws(
    () => createQueuePayload({ pipelineType: PipelineType.MODEL_OPTIMIZATION }),
    /jobId is required/
  );
});

test('shared constants expose expected values', () => {
  assert.equal(JobStatus.CREATED, 'created');
  assert.equal(JobStatus.QUEUED, 'queued');
  assert.equal(ArtifactType.GLB, 'glb');
  assert.equal(ArtifactType.ASSET_BUNDLE, 'asset-bundle');
});
