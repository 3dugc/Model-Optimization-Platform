import http from 'node:http';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { readConfig } from './config.mjs';
import { createMySqlPool } from './db/mysql.mjs';
import { createJobRepository } from './jobs/job-repository.mjs';
import { buildCreateJobResponse, buildJobStatusResponse } from './jobs/job-routes.mjs';
import { createJobQueue } from './queue/job-queue.mjs';

const config = readConfig();
const pool = createMySqlPool(config.databaseUrl);
const repository = createJobRepository(pool);
const redis = new IORedis(config.queueUrl);
const jobQueue = createJobQueue({ connection: redis });

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString('utf8').trim();
  return body ? JSON.parse(body) : {};
}

async function route(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, {
      status: 'ok',
      service: 'model-optimization-api',
      optimizerUrl: process.env.OPTIMIZER_URL || 'http://optimizer:3000'
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/jobs') {
    const body = await readJson(req);
    const jobId = randomUUID();
    const pipelineType = body.pipelineType || 'model-optimization';
    const extension = getExtension(body.filename || 'source.glb');
    const sourceKey = `uploads/${jobId}/source.${extension}`;

    await repository.createJob({
      id: jobId,
      pipelineType,
      sourceKey,
      options: body.options || {}
    });

    json(res, 201, buildCreateJobResponse({
      jobId,
      sourceKey,
      uploadUrl: buildUploadUrl(sourceKey)
    }));
    return;
  }

  if (
    req.method === 'POST'
    && pathParts.length === 4
    && pathParts[0] === 'v1'
    && pathParts[1] === 'jobs'
    && pathParts[3] === 'complete-upload'
  ) {
    const jobId = pathParts[2];
    const job = await repository.getJob(jobId);

    if (!job) {
      json(res, 404, {
        error: 'not_found',
        message: 'Job not found.'
      });
      return;
    }

    await repository.markQueued(jobId);
    await jobQueue.enqueueJob({ jobId, pipelineType: job.pipelineType });
    json(res, 202, {
      jobId,
      status: 'queued'
    });
    return;
  }

  if (
    req.method === 'GET'
    && pathParts.length === 4
    && pathParts[0] === 'v1'
    && pathParts[1] === 'jobs'
    && pathParts[3] === 'result-url'
  ) {
    const job = await repository.getJob(pathParts[2]);

    if (!job || !job.resultKey) {
      json(res, 404, {
        error: 'not_found',
        message: 'Job result not found.'
      });
      return;
    }

    json(res, 200, {
      jobId: job.id,
      resultKey: job.resultKey,
      downloadUrl: buildDownloadUrl(job.resultKey)
    });
    return;
  }

  if (req.method === 'GET' && pathParts.length === 3 && pathParts[0] === 'v1' && pathParts[1] === 'jobs') {
    const job = await repository.getJob(pathParts[2]);

    if (!job) {
      json(res, 404, {
        error: 'not_found',
        message: 'Job not found.'
      });
      return;
    }

    json(res, 200, buildJobStatusResponse(job));
    return;
  }

  json(res, 404, {
    error: 'not_found',
    message: 'Route not found.'
  });
}

function getExtension(filename) {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === filename.length - 1) {
    return 'bin';
  }

  return filename.slice(dotIndex + 1).toLowerCase();
}

function buildUploadUrl(sourceKey) {
  return `cos://signed-upload/${sourceKey}`;
}

function buildDownloadUrl(resultKey) {
  return `cos://signed-download/${resultKey}`;
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    json(res, 500, {
      error: 'internal_server_error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  });
});

server.listen(config.port, () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'model-optimization-api',
    message: 'API listening',
    port: config.port
  }));
});
