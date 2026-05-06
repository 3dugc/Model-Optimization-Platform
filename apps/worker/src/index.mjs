import IORedis from 'ioredis';
import { createMySqlPool } from './db/mysql.mjs';
import { createJobRepository } from './jobs/job-repository.mjs';
import { createWorkerQueue } from './queue/worker-queue.mjs';
import { runModelOptimizationJob } from './pipelines/model-optimization.mjs';
import { readWorkerConfig } from './config.mjs';

const config = readWorkerConfig();
const connection = new IORedis(config.queueUrl, { maxRetriesPerRequest: null });
const pool = createMySqlPool(config.databaseUrl);
const repository = createJobRepository(pool);

async function processMessage(message) {
  const job = await repository.getJob(message.jobId);
  if (!job) {
    return;
  }

  if (job.status === 'completed' || job.status === 'failed') {
    return;
  }

  const claimed = await repository.claimJob(job.id, config.workerId);
  if (!claimed) {
    return;
  }

  try {
    if (job.pipelineType !== 'model-optimization') {
      throw new Error(`Unsupported pipeline type: ${job.pipelineType}`);
    }

    const result = await runModelOptimizationJob({
      job,
      optimizerUrl: config.optimizerUrl,
      tempDir: config.tempDir
    });

    await repository.markCompleted(job.id, result);
  } catch (error) {
    await repository.markFailed(job.id, {
      errorCode: 'PIPELINE_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

const worker = createWorkerQueue({
  connection,
  concurrency: config.concurrency,
  processor: processMessage
});

worker.on('ready', () => {
  console.log(JSON.stringify({ level: 'info', message: 'Worker ready', config }));
});

worker.on('failed', (job, error) => {
  console.error(JSON.stringify({
    level: 'error',
    message: 'Queue job failed',
    queueJobId: job?.id,
    error: error.message
  }));
});
