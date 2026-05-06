const config = {
  service: 'model-optimization-worker',
  queueUrl: process.env.QUEUE_URL || 'redis://redis:6379/0',
  optimizerUrl: process.env.OPTIMIZER_URL || 'http://optimizer:3000',
  concurrency: Number(process.env.WORKER_CONCURRENCY || 1)
};

console.log(JSON.stringify({
  level: 'info',
  message: 'Worker scaffold started',
  ...config
}));

console.log(JSON.stringify({
  level: 'info',
  message: 'Queue consumption is not implemented yet. Next milestone will claim jobs, download from COS, call the optimizer, and upload results.'
}));

setInterval(() => {
  console.log(JSON.stringify({
    level: 'debug',
    message: 'Worker scaffold heartbeat',
    service: config.service
  }));
}, 60_000);
