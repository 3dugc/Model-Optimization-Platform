export function readWorkerConfig(env = process.env) {
  return {
    workerId: env.WORKER_ID || `${process.pid}`,
    concurrency: Number(env.WORKER_CONCURRENCY || 1),
    databaseUrl: env.DATABASE_URL,
    queueUrl: env.QUEUE_URL || 'redis://redis:6379/0',
    optimizerUrl: env.OPTIMIZER_URL || 'http://optimizer:3000',
    tempDir: env.WORKER_TEMP_DIR || '/tmp/model-optimization-platform'
  };
}
