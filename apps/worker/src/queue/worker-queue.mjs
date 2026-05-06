import { Worker } from 'bullmq';

export const JOB_QUEUE_NAME = 'model-processing-jobs';

export function createWorkerQueue({ connection, concurrency, processor }) {
  const worker = new Worker(
    JOB_QUEUE_NAME,
    async (job) => processor(job.data),
    {
      connection,
      concurrency,
      lockDuration: 30 * 60 * 1000
    }
  );

  return worker;
}
