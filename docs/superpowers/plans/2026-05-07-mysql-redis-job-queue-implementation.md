# MySQL Redis Job Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first production job system using MySQL as the durable source of truth and Redis/BullMQ as the queue.

**Architecture:** API writes durable job state to MySQL and enqueues only `jobId` after upload completion. Worker consumes BullMQ messages, reloads the full job from MySQL, conditionally claims it, runs the selected local pipeline, uploads deterministic COS results, and updates MySQL before acknowledging the queue.

**Tech Stack:** Node.js 20, npm workspaces, MySQL 8, Redis 7, BullMQ, mysql2, Vitest or Node test runner.

---

## File Structure

- Create `packages/shared/src/job-model.mjs`: shared status, pipeline, artifact, and job payload helpers.
- Create `packages/shared/src/job-model.test.mjs`: unit tests for job constants and queue payload helpers.
- Modify `packages/shared/src/index.mjs`: re-export shared job model.
- Create `apps/api/src/config.mjs`: reads `DATABASE_URL`, `QUEUE_URL`, COS settings, and API port.
- Create `apps/api/src/db/mysql.mjs`: MySQL pool factory and transaction helper.
- Create `apps/api/src/db/migrations/001_create_jobs.sql`: MySQL schema for `jobs` and `job_events`.
- Create `apps/api/src/jobs/job-repository.mjs`: MySQL job CRUD and state transitions.
- Create `apps/api/src/jobs/job-repository.test.mjs`: repository tests against a test MySQL database or a documented integration-test database URL.
- Create `apps/api/src/queue/job-queue.mjs`: BullMQ producer.
- Modify `apps/api/src/index.mjs`: replace placeholder job routes with real `POST /v1/jobs`, `POST /v1/jobs/:jobId/complete-upload`, `GET /v1/jobs/:jobId`, and `GET /v1/jobs/:jobId/result-url` handlers.
- Create `apps/worker/src/config.mjs`: reads worker, database, queue, COS, optimizer, and ATS settings.
- Create `apps/worker/src/db/mysql.mjs`: MySQL pool for worker.
- Create `apps/worker/src/jobs/job-repository.mjs`: worker-side claim, complete, retry, and fail transitions.
- Create `apps/worker/src/queue/worker-queue.mjs`: BullMQ worker consumer.
- Create `apps/worker/src/pipelines/model-optimization.mjs`: first pipeline wrapper for local 3D-Model-Optimizer.
- Modify `apps/worker/src/index.mjs`: start BullMQ worker instead of placeholder heartbeat.
- Modify `.env.example`: add MySQL and Redis settings.
- Modify `infra/docker-compose.yml`: add MySQL and wire API/worker `DATABASE_URL`.
- Modify `docs/mysql-redis-job-queue.zh-CN.md`: keep schema and queue behavior in sync with implementation.

## Task 1: Shared Job Model

**Files:**
- Create: `packages/shared/src/job-model.mjs`
- Create: `packages/shared/src/job-model.test.mjs`
- Modify: `packages/shared/src/index.mjs`
- Modify: `packages/shared/package.json`

- [x] **Step 1: Add the shared job model test**

Create `packages/shared/src/job-model.test.mjs`:

```js
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
```

- [x] **Step 2: Run the failing test**

Run:

```bash
node --test packages/shared/src/job-model.test.mjs
```

Expected: FAIL because `packages/shared/src/job-model.mjs` does not exist yet.

- [x] **Step 3: Implement the shared job model**

Create `packages/shared/src/job-model.mjs`:

```js
export const JobStatus = Object.freeze({
  CREATED: 'created',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  RETRYING: 'retrying',
  COMPLETED: 'completed',
  FAILED: 'failed'
});

export const PipelineType = Object.freeze({
  MODEL_OPTIMIZATION: 'model-optimization',
  AREA_TARGET_PROCESSING: 'area-target-processing'
});

export const ArtifactType = Object.freeze({
  GLB: 'glb',
  ASSET_BUNDLE: 'asset-bundle'
});

export function createQueuePayload({ jobId, pipelineType }) {
  if (!jobId) {
    throw new Error('jobId is required');
  }

  if (!pipelineType) {
    throw new Error('pipelineType is required');
  }

  return {
    jobId,
    pipelineType
  };
}
```

Modify `packages/shared/src/index.mjs`:

```js
export * from './job-model.mjs';
```

Modify `packages/shared/package.json` scripts:

```json
{
  "name": "@3dugc/model-optimization-shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.mjs"
  },
  "scripts": {
    "test": "node --test src/*.test.mjs"
  }
}
```

- [x] **Step 4: Run the passing test**

Run:

```bash
npm --workspace packages/shared test
```

Expected: PASS.

- [x] **Step 5: Commit**

Run:

```bash
git add packages/shared
git commit -m "feat: add shared job model"
```

## Task 2: MySQL Schema

**Files:**
- Create: `apps/api/src/db/migrations/001_create_jobs.sql`
- Modify: `.env.example`
- Modify: `infra/docker-compose.yml`
- Modify: `scripts/validate-scaffold.mjs`

- [x] **Step 1: Add the migration SQL**

Create `apps/api/src/db/migrations/001_create_jobs.sql`:

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) PRIMARY KEY,
  pipeline_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  source_key VARCHAR(512) NOT NULL,
  result_key VARCHAR(512) NULL,
  artifact_type VARCHAR(64) NULL,
  options_json JSON NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_code VARCHAR(128) NULL,
  error_message TEXT NULL,
  locked_by VARCHAR(128) NULL,
  locked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  completed_at DATETIME NULL,

  INDEX idx_status_created_at (status, created_at),
  INDEX idx_pipeline_status (pipeline_type, status),
  INDEX idx_locked_at (locked_at)
);

CREATE TABLE IF NOT EXISTS job_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  message TEXT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL,

  INDEX idx_job_events_job_created (job_id, created_at),
  CONSTRAINT fk_job_events_job
    FOREIGN KEY (job_id) REFERENCES jobs(id)
    ON DELETE CASCADE
);
```

- [x] **Step 2: Add MySQL environment examples**

Add to `.env.example`:

```text
DATABASE_URL=mysql://model_platform:model_platform@mysql:3306/model_optimization_platform
MYSQL_DATABASE=model_optimization_platform
MYSQL_USER=model_platform
MYSQL_PASSWORD=model_platform
MYSQL_ROOT_PASSWORD=model_platform_root
```

- [x] **Step 3: Add MySQL to local compose**

Add this service to `infra/docker-compose.yml`:

```yaml
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: model_optimization_platform
      MYSQL_USER: model_platform
      MYSQL_PASSWORD: model_platform
      MYSQL_ROOT_PASSWORD: model_platform_root
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ../apps/api/src/db/migrations:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 10
```

Add `mysql-data:` under `volumes`.

Add `DATABASE_URL` to the `api` and `worker` environment sections:

```yaml
      DATABASE_URL: mysql://model_platform:model_platform@mysql:3306/model_optimization_platform
```

Add `mysql` to the `depends_on` list for `api` and `worker`.

- [x] **Step 4: Add schema file to scaffold validation**

Add this path to `requiredFiles` in `scripts/validate-scaffold.mjs`:

```js
'apps/api/src/db/migrations/001_create_jobs.sql',
```

- [x] **Step 5: Verify compose starts MySQL**

Run:

```bash
docker compose -f infra/docker-compose.yml up -d mysql
docker compose -f infra/docker-compose.yml exec mysql mysql -umodel_platform -pmodel_platform model_optimization_platform -e "SHOW TABLES;"
```

Expected output includes:

```text
jobs
job_events
```

Local verification note: ran with `MYSQL_HOST_PORT=3310` because another local Docker stack already occupied host port `3306`; the compose default remains `3306`.

- [x] **Step 6: Commit**

Run:

```bash
git add .env.example infra/docker-compose.yml scripts/validate-scaffold.mjs apps/api/src/db/migrations/001_create_jobs.sql
git commit -m "feat: add mysql job schema"
```

## Task 3: API Job Repository

**Files:**
- Create: `apps/api/src/config.mjs`
- Create: `apps/api/src/db/mysql.mjs`
- Create: `apps/api/src/jobs/job-repository.mjs`
- Create: `apps/api/src/jobs/job-repository.test.mjs`
- Modify: `apps/api/package.json`

- [x] **Step 1: Install API dependencies**

Run:

```bash
npm --workspace apps/api install mysql2
```

Expected: `apps/api/package.json` includes `mysql2`.

- [x] **Step 2: Add repository integration test**

Create `apps/api/src/jobs/job-repository.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMySqlPool } from '../db/mysql.mjs';
import { createJobRepository } from './job-repository.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

test('job repository creates and transitions a job', async (t) => {
  if (!databaseUrl) {
    t.skip('DATABASE_URL or TEST_DATABASE_URL is required');
    return;
  }

  const pool = createMySqlPool(databaseUrl);
  t.after(async () => pool.end());

  const repository = createJobRepository(pool);
  const jobId = randomUUID();

  await repository.createJob({
    id: jobId,
    pipelineType: 'model-optimization',
    sourceKey: `uploads/${jobId}/source.glb`,
    options: { preset: 'balanced' }
  });

  let job = await repository.getJob(jobId);
  assert.equal(job.status, 'created');

  await repository.markQueued(jobId);
  job = await repository.getJob(jobId);
  assert.equal(job.status, 'queued');

  const claimed = await repository.claimJob(jobId, 'test-worker');
  assert.equal(claimed, true);

  job = await repository.getJob(jobId);
  assert.equal(job.status, 'processing');
  assert.equal(job.attempts, 1);

  await repository.markCompleted(jobId, {
    resultKey: `results/${jobId}/optimized.glb`,
    artifactType: 'glb'
  });

  job = await repository.getJob(jobId);
  assert.equal(job.status, 'completed');
  assert.equal(job.resultKey, `results/${jobId}/optimized.glb`);
});
```

- [x] **Step 3: Add config and MySQL pool**

Create `apps/api/src/config.mjs`:

```js
export function readConfig(env = process.env) {
  return {
    port: Number(env.API_PORT || env.PORT || 8080),
    databaseUrl: env.DATABASE_URL,
    queueUrl: env.QUEUE_URL || 'redis://redis:6379/0',
    cosBucket: env.COS_BUCKET,
    cosRegion: env.COS_REGION
  };
}
```

Create `apps/api/src/db/mysql.mjs`:

```js
import mysql from 'mysql2/promise';

export function createMySqlPool(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return mysql.createPool(databaseUrl);
}
```

- [x] **Step 4: Implement job repository**

Create `apps/api/src/jobs/job-repository.mjs`:

```js
export function createJobRepository(pool) {
  return {
    async createJob({ id, pipelineType, sourceKey, options = {}, maxAttempts = 3 }) {
      const now = new Date();
      await pool.execute(
        `INSERT INTO jobs
          (id, pipeline_type, status, source_key, options_json, max_attempts, created_at, updated_at)
         VALUES (?, ?, 'created', ?, CAST(? AS JSON), ?, ?, ?)`,
        [id, pipelineType, sourceKey, JSON.stringify(options), maxAttempts, now, now]
      );
      await insertEvent(pool, id, 'created', 'Job created', { pipelineType, sourceKey });
    },

    async getJob(id) {
      const [rows] = await pool.execute('SELECT * FROM jobs WHERE id = ?', [id]);
      const row = rows[0];
      return row ? mapJob(row) : null;
    },

    async markQueued(id) {
      const now = new Date();
      await pool.execute(
        `UPDATE jobs SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'created'`,
        [now, id]
      );
      await insertEvent(pool, id, 'queued', 'Upload completed and job queued', {});
    },

    async claimJob(id, workerId) {
      const now = new Date();
      const [result] = await pool.execute(
        `UPDATE jobs
         SET status = 'processing',
             attempts = attempts + 1,
             locked_by = ?,
             locked_at = ?,
             updated_at = ?
         WHERE id = ?
           AND status IN ('queued', 'retrying')
           AND attempts < max_attempts`,
        [workerId, now, now, id]
      );

      if (result.affectedRows === 1) {
        await insertEvent(pool, id, 'processing', 'Worker claimed job', { workerId });
        return true;
      }

      return false;
    },

    async markCompleted(id, { resultKey, artifactType }) {
      const now = new Date();
      await pool.execute(
        `UPDATE jobs
         SET status = 'completed',
             result_key = ?,
             artifact_type = ?,
             locked_by = NULL,
             locked_at = NULL,
             updated_at = ?,
             completed_at = ?
         WHERE id = ?`,
        [resultKey, artifactType, now, now, id]
      );
      await insertEvent(pool, id, 'completed', 'Job completed', { resultKey, artifactType });
    },

    async markFailed(id, { errorCode, errorMessage }) {
      const now = new Date();
      await pool.execute(
        `UPDATE jobs
         SET status = 'failed',
             error_code = ?,
             error_message = ?,
             locked_by = NULL,
             locked_at = NULL,
             updated_at = ?,
             completed_at = ?
         WHERE id = ?`,
        [errorCode, errorMessage, now, now, id]
      );
      await insertEvent(pool, id, 'failed', errorMessage, { errorCode });
    }
  };
}

async function insertEvent(pool, jobId, eventType, message, metadata = {}) {
  await pool.execute(
    `INSERT INTO job_events (job_id, event_type, message, metadata_json, created_at)
     VALUES (?, ?, ?, CAST(? AS JSON), ?)`,
    [jobId, eventType, message, JSON.stringify(metadata), new Date()]
  );
}

function mapJob(row) {
  return {
    id: row.id,
    pipelineType: row.pipeline_type,
    status: row.status,
    sourceKey: row.source_key,
    resultKey: row.result_key,
    artifactType: row.artifact_type,
    options: typeof row.options_json === 'string' ? JSON.parse(row.options_json) : row.options_json,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}
```

- [x] **Step 5: Add API test script**

Modify `apps/api/package.json`:

```json
"scripts": {
  "dev": "node src/index.mjs",
  "start": "node src/index.mjs",
  "test": "node --test src/**/*.test.mjs"
}
```

- [x] **Step 6: Run repository test**

Run:

```bash
DATABASE_URL=mysql://model_platform:model_platform@127.0.0.1:3306/model_optimization_platform npm --workspace apps/api test
```

Expected: PASS when local MySQL from Docker Compose is running.

Local verification note: ran against `127.0.0.1:3310` because host `3306` is occupied by another local Docker stack.

- [x] **Step 7: Commit**

Run:

```bash
git add apps/api package-lock.json package.json
git commit -m "feat: add mysql job repository"
```

## Task 4: Redis BullMQ Producer

**Files:**
- Create: `apps/api/src/queue/job-queue.mjs`
- Create: `apps/api/src/queue/job-queue.test.mjs`
- Modify: `apps/api/package.json`

- [x] **Step 1: Install queue dependencies**

Run:

```bash
npm --workspace apps/api install bullmq ioredis
```

Expected: `apps/api/package.json` includes `bullmq` and `ioredis`.

- [x] **Step 2: Add queue unit test**

Create `apps/api/src/queue/job-queue.test.mjs`:

```js
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
```

- [x] **Step 3: Implement BullMQ producer**

Create `apps/api/src/queue/job-queue.mjs`:

```js
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
```

- [x] **Step 4: Run queue unit test**

Run:

```bash
npm --workspace apps/api test
```

Expected: PASS.

- [x] **Step 5: Commit**

Run:

```bash
git add apps/api package-lock.json package.json
git commit -m "feat: add redis job queue producer"
```

## Task 5: API Job Routes

**Files:**
- Modify: `apps/api/src/index.mjs`
- Create: `apps/api/src/jobs/job-routes.mjs`
- Create: `apps/api/src/jobs/job-routes.test.mjs`

- [x] **Step 1: Add route behavior tests**

Create `apps/api/src/jobs/job-routes.test.mjs`:

```js
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
```

- [x] **Step 2: Implement route helpers**

Create `apps/api/src/jobs/job-routes.mjs`:

```js
export function buildCreateJobResponse({ jobId, sourceKey, uploadUrl }) {
  return { jobId, sourceKey, uploadUrl };
}

export function buildJobStatusResponse(job) {
  return {
    jobId: job.id,
    pipelineType: job.pipelineType,
    status: job.status,
    sourceKey: job.sourceKey,
    resultKey: job.resultKey,
    artifactType: job.artifactType,
    attempts: job.attempts,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt
  };
}
```

- [x] **Step 3: Wire API endpoints**

Modify `apps/api/src/index.mjs` so these routes exist:

```text
POST /v1/jobs
POST /v1/jobs/:jobId/complete-upload
GET /v1/jobs/:jobId
GET /v1/jobs/:jobId/result-url
```

For this task, COS signing can use a small placeholder function that returns deterministic local values until the COS client task is implemented:

```js
function buildUploadUrl(sourceKey) {
  return `cos://signed-upload/${sourceKey}`;
}

function buildDownloadUrl(resultKey) {
  return `cos://signed-download/${resultKey}`;
}
```

Use `randomUUID()` for `jobId`. Use deterministic source keys:

```js
const sourceKey = `uploads/${jobId}/source.${extension}`;
```

Use `repository.markQueued(jobId)` and `jobQueue.enqueueJob({ jobId, pipelineType })` only in `complete-upload`.

- [x] **Step 4: Run API tests**

Run:

```bash
npm --workspace apps/api test
npm test
```

Expected: PASS.

- [x] **Step 5: Commit**

Run:

```bash
git add apps/api scripts package-lock.json package.json
git commit -m "feat: add job api routes"
```

## Task 6: Worker Queue Consumer

**Files:**
- Create: `apps/worker/src/config.mjs`
- Create: `apps/worker/src/db/mysql.mjs`
- Create: `apps/worker/src/jobs/job-repository.mjs`
- Create: `apps/worker/src/queue/worker-queue.mjs`
- Create: `apps/worker/src/pipelines/model-optimization.mjs`
- Modify: `apps/worker/src/index.mjs`
- Modify: `apps/worker/package.json`

- [x] **Step 1: Install worker dependencies**

Run:

```bash
npm --workspace apps/worker install bullmq ioredis mysql2
```

Expected: `apps/worker/package.json` includes `bullmq`, `ioredis`, and `mysql2`.

- [x] **Step 2: Add model optimization pipeline wrapper**

Create `apps/worker/src/pipelines/model-optimization.mjs`:

```js
export async function runModelOptimizationJob({ job, optimizerUrl, tempDir }) {
  if (!job.sourceKey) {
    throw new Error('job.sourceKey is required');
  }

  return {
    resultKey: `results/${job.id}/optimized.glb`,
    artifactType: 'glb',
    metadata: {
      optimizerUrl,
      tempDir
    }
  };
}
```

This is a deterministic wrapper contract. The next pipeline task can replace the body with COS download, HTTP upload to 3D-Model-Optimizer, and COS result upload.

- [x] **Step 3: Add worker config**

Create `apps/worker/src/config.mjs`:

```js
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
```

- [x] **Step 4: Implement worker queue**

Create `apps/worker/src/queue/worker-queue.mjs`:

```js
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
```

- [x] **Step 5: Implement worker startup**

Modify `apps/worker/src/index.mjs`:

```js
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
```

Also create `apps/worker/src/db/mysql.mjs` and `apps/worker/src/jobs/job-repository.mjs` by reusing the API pool/repository implementation. Keep worker-side repository focused on `getJob`, `claimJob`, `markCompleted`, and `markFailed`.

- [x] **Step 6: Run worker syntax checks**

Run:

```bash
node --check apps/worker/src/index.mjs
npm test
```

Expected: PASS.

- [x] **Step 7: Commit**

Run:

```bash
git add apps/worker package-lock.json package.json
git commit -m "feat: add redis worker consumer"
```

## Task 7: End-to-End Local Smoke Test

**Files:**
- Create: `scripts/smoke-mysql-redis-job.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add smoke script**

Create `scripts/smoke-mysql-redis-job.mjs`:

```js
import { request } from 'node:http';

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port: 8080,
      path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1',
      port: 8080,
      path,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const created = await postJson('/v1/jobs', {
  pipelineType: 'model-optimization',
  filename: 'source.glb',
  options: { preset: 'balanced' }
});

if (created.statusCode !== 201) {
  throw new Error(`Expected create status 201, received ${created.statusCode}`);
}

await postJson(`/v1/jobs/${created.body.jobId}/complete-upload`, {});

const status = await getJson(`/v1/jobs/${created.body.jobId}`);
if (!['queued', 'processing', 'completed'].includes(status.body.status)) {
  throw new Error(`Unexpected status ${status.body.status}`);
}

console.log(JSON.stringify({
  ok: true,
  jobId: created.body.jobId,
  status: status.body.status
}));
```

- [ ] **Step 2: Add npm script**

Modify root `package.json`:

```json
"smoke:mysql-redis": "node scripts/smoke-mysql-redis-job.mjs"
```

- [ ] **Step 3: Run local stack**

Run:

```bash
docker compose -f infra/docker-compose.yml up --build
```

In another terminal, run:

```bash
npm run smoke:mysql-redis
```

Expected output:

```json
{"ok":true,"jobId":"...","status":"queued"}
```

When the worker placeholder pipeline is active, status may become `completed`.

- [ ] **Step 4: Commit**

Run:

```bash
git add package.json scripts/smoke-mysql-redis-job.mjs
git commit -m "test: add mysql redis smoke test"
```

## Task 8: Documentation Sync

**Files:**
- Modify: `docs/mysql-redis-job-queue.zh-CN.md`
- Modify: `docs/deployment.zh-CN.md`
- Modify: `README.md`

- [ ] **Step 1: Verify deployment documentation**

Confirm `docs/deployment.zh-CN.md` production topology and local service map mention MySQL and Redis/BullMQ. The service map should include:

```markdown
| MySQL | `localhost:3306` | 任务事实表和状态存储。 |
```

- [ ] **Step 2: Verify the MySQL Redis design link**

Confirm README documentation list includes:

```markdown
- [MySQL + Redis 任务系统设计](docs/mysql-redis-job-queue.zh-CN.md)
```

- [ ] **Step 3: Run validation**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add README.md docs/mysql-redis-job-queue.zh-CN.md docs/deployment.zh-CN.md
git commit -m "docs: document mysql redis job system"
```

## Final Verification

Run:

```bash
npm test
npm --workspace packages/shared test
npm --workspace apps/api test
node --check apps/worker/src/index.mjs
```

Expected: all commands exit with code `0`.

Then run local smoke verification with MySQL and Redis started:

```bash
docker compose -f infra/docker-compose.yml up --build
npm run smoke:mysql-redis
```

Expected: a job can be created, queued, consumed by the worker, and observed through the API.
