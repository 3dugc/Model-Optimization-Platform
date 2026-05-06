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
- [Composite Worker Node Design](docs/superpowers/specs/2026-05-07-composite-worker-node-design.md)

## Current Status

This is the initial platform scaffold. The first production milestone should add:

- persistent job storage
- queue producer and worker consumer
- COS signed upload/download integration
- optimizer call wrapper
- queue backpressure when every optimization worker is busy
- composite worker nodes running worker agent, Area-Target-Scanner, and 3D-Model-Optimizer together
- retry and dead-letter handling
- future pipeline routing for Area-Target-Scanner-style asset bundle jobs

## Local Scaffold Check

```bash
npm test
```

## Run Placeholders

```bash
npm run dev:api
npm run dev:worker
```

The API placeholder exposes `GET /health`. The worker placeholder prints its runtime configuration and stays alive.
