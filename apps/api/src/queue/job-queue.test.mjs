import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJobQueueMessage } from './job-queue.mjs';

test('buildJobQueueMessage stores only routing data', () => {
  assert.deepEqual(
    buildJobQueueMessage({
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      pipelineType: 'model-optimization'
    }),
    {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      pipelineType: 'model-optimization'
    }
  );
});
