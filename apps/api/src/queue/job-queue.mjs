import { Queue } from 'bullmq';

export const JOB_QUEUE_NAME = 'model-processing-jobs';

export function buildJobQueueMessage({ jobId, pipelineType }) {
  if (!jobId) {
    throw new Error('jobId is required');
  }

  if (!pipelineType) {
    throw new Error('pipelineType is required');
  }

  return { jobId, pipelineType };
}

export function createJobQueue({ connection }) {
  const queue = new Queue(JOB_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10_000
      },
      removeOnComplete: 1000,
      removeOnFail: false
    }
  });

  return {
    async enqueueJob({ jobId, pipelineType }) {
      const message = buildJobQueueMessage({ jobId, pipelineType });
      await queue.add(pipelineType, message, { jobId });
    },
    async close() {
      await queue.close();
    }
  };
}
