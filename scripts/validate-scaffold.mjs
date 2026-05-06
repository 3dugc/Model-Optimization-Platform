import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'README.md',
  '.env.example',
  'package.json',
  'docs/architecture.md',
  'docs/deployment.md',
  'docs/deployment.zh-CN.md',
  'docs/mysql-redis-job-queue.zh-CN.md',
  'docs/superpowers/plans/2026-05-07-mysql-redis-job-queue-implementation.md',
  'docs/superpowers/plans/2026-05-07-initial-platform-scaffold.md',
  'apps/api/src/db/migrations/001_create_jobs.sql',
  'apps/api/package.json',
  'apps/api/src/index.mjs',
  'apps/api/Dockerfile',
  'apps/api/README.md',
  'apps/worker/package.json',
  'apps/worker/src/index.mjs',
  'apps/worker/Dockerfile',
  'apps/worker/README.md',
  'packages/shared/package.json',
  'packages/shared/src/index.mjs',
  'infra/docker-compose.yml'
];

const requiredReadmePhrases = [
  '3D-Model-Optimizer',
  'Queue-driven platform layer',
  'Repository Layout'
];

async function assertFileExists(filePath) {
  await access(new URL(`../${filePath}`, import.meta.url));
}

async function assertReadmeContent() {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const missing = requiredReadmePhrases.filter((phrase) => !readme.includes(phrase));
  if (missing.length > 0) {
    throw new Error(`README.md is missing required phrases: ${missing.join(', ')}`);
  }
}

for (const filePath of requiredFiles) {
  await assertFileExists(filePath);
}

await assertReadmeContent();

console.log(`Scaffold validation passed (${requiredFiles.length} files checked).`);
