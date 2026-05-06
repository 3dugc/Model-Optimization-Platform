export function readConfig(env = process.env) {
  return {
    port: Number(env.API_PORT || env.PORT || 8080),
    databaseUrl: env.DATABASE_URL,
    queueUrl: env.QUEUE_URL || 'redis://redis:6379/0',
    cosBucket: env.COS_BUCKET,
    cosRegion: env.COS_REGION
  };
}
