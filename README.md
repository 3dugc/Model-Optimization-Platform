# Model Optimization Platform

Queue-driven platform layer for 3D model optimization.

This repository owns the service orchestration around [3D-Model-Optimizer](https://github.com/3dugc/3D-Model-Optimizer): upload flow, job state, queue dispatch, COS result storage, worker scaling, and API boundaries. The optimizer remains a separate processing engine.

The platform should also leave room for future model-processing pipelines, including [Area-Target-Scanner](https://github.com/3dugc/Area-Target-Scanner), whose processing pipeline turns LiDAR scan exports into Unity-ready area target asset bundles.

## Architecture

```text
Frontend
  -> API: create job and request upload URL
  -> COS: upload source model directly
API
  -> DB: store job state
  -> Queue: enqueue optimization job
Worker
  -> Queue: claim job when capacity is available
  -> COS: download source model
  -> Local pipeline service: 3D-Model-Optimizer or Area-Target-Scanner
  -> COS: upload optimized GLB or asset bundle
  -> DB: update job result
Frontend
  -> API: query status and result URL
```

## Repository Layout

```text
apps/
  api/       Public business API scaffold
  worker/    Queue consumer scaffold
packages/
  shared/    Shared job constants and payload helpers
infra/       Local orchestration examples
docs/        Architecture and implementation notes
```

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment Guide](docs/deployment.md)
- [部署说明（中文）](docs/deployment.zh-CN.md)
- [MySQL + Redis 任务系统设计](docs/mysql-redis-job-queue.zh-CN.md)
- [Composite Worker Node Design](docs/superpowers/specs/2026-05-07-composite-worker-node-design.md)

## Current Status

The first MySQL + Redis/BullMQ production job-system milestone is implemented. It includes:

- MySQL job and job event schema
- API job repository and BullMQ producer
- `POST /v1/jobs`, `POST /v1/jobs/:jobId/complete-upload`, `GET /v1/jobs/:jobId`, and `GET /v1/jobs/:jobId/result-url`
- worker BullMQ consumer with conditional MySQL claim/update behavior
- deterministic `model-optimization` wrapper that writes `results/{jobId}/optimized.glb`
- docker compose wiring for MySQL, Redis, API, worker, MinIO, and optimizer sidecar

Still pending: real COS signed URL integration, actual optimizer HTTP/COS pipeline body, Area-Target-Scanner routing, and production-grade retry/dead-letter handling.

## Local Checks

```bash
npm test
npm --workspace packages/shared test
npm --workspace apps/api test
```

## Local Smoke

```bash
docker compose -f infra/docker-compose.yml up --build
npm run smoke:mysql-redis
```

If default local ports are already occupied, override host ports while keeping container-internal service URLs unchanged:

```bash
API_HOST_PORT=8085 REDIS_HOST_PORT=6381 MYSQL_HOST_PORT=3310 \
docker compose -f infra/docker-compose.yml up --build

API_HOST_PORT=8085 npm run smoke:mysql-redis
```
