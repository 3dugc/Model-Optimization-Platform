# Deployment Guide

This document explains how the platform, elastic worker servers, 3D-Model-Optimizer, and Area-Target-Scanner should be deployed together.

## Deployment Goal

The platform is split into two layers:

- Control plane: public API, job database, queue, COS bucket, and frontend-facing status endpoints.
- Processing plane: elastic composite worker nodes. Each node can process both `model-optimization` and `area-target-processing` jobs.

The queue is the load balancer. If all worker nodes are busy, jobs remain queued until a node has capacity.

## Production Topology

```mermaid
flowchart TB
  Frontend["Frontend"]
  ApiLb["API Load Balancer"]
  Api["Platform API<br/>apps/api"]
  Db["Job Database"]
  Queue["Job Queue"]
  Cos["COS Bucket<br/>uploads/ and results/"]

  subgraph Asg["Elastic Worker Server Group"]
    Node1["Composite Worker Node 1"]
    Node2["Composite Worker Node 2"]
    NodeN["Composite Worker Node N"]
  end

  Frontend -->|"Create job / query status"| ApiLb
  ApiLb --> Api
  Api -->|"Create and update jobs"| Db
  Api -->|"Publish job messages"| Queue
  Api -->|"Issue signed upload/download URLs"| Cos
  Frontend -->|"Direct upload source assets"| Cos

  Queue -->|"Claim when capacity exists"| Node1
  Queue -->|"Claim when capacity exists"| Node2
  Queue -->|"Claim when capacity exists"| NodeN

  Node1 -->|"Download source / upload result"| Cos
  Node2 -->|"Download source / upload result"| Cos
  NodeN -->|"Download source / upload result"| Cos

  Node1 -->|"Update job state"| Db
  Node2 -->|"Update job state"| Db
  NodeN -->|"Update job state"| Db
```

## Composite Worker Node

Each elastic server should run all local processing dependencies needed by the worker agent.

```mermaid
flowchart TB
  subgraph Node["Elastic Worker Server"]
    Worker["Platform Worker Agent<br/>apps/worker"]
    Ats["Area-Target-Scanner<br/>processing service"]
    Optimizer["3D-Model-Optimizer<br/>optimization service"]
    Temp["Local Temp Workspace"]
  end

  Queue["Job Queue"] -->|"lease / ack message"| Worker
  Worker -->|"download source"| Cos["COS Bucket"]
  Worker -->|"pipelineType=model-optimization"| Optimizer
  Worker -->|"pipelineType=area-target-processing"| Ats
  Ats -->|"local model optimization dependency"| Optimizer
  Worker --> Temp
  Ats --> Temp
  Optimizer --> Temp
  Worker -->|"upload result artifact"| Cos
```

Recommended first production setting:

```text
WORKER_CONCURRENCY=1
```

One active job per server is safer for the first launch because both Area-Target-Scanner and 3D-Model-Optimizer may use significant CPU, memory, disk, and temporary workspace.

## Job Flow: Model Optimization

```mermaid
sequenceDiagram
  participant User as Frontend
  participant API as Platform API
  participant COS as COS
  participant Q as Queue
  participant W as Worker Node
  participant O as 3D-Model-Optimizer
  participant DB as Job DB

  User->>API: Create model-optimization job
  API->>DB: Create job: created
  API-->>User: Return signed upload URL
  User->>COS: Upload source model/archive
  API->>DB: Mark job queued
  API->>Q: Publish job message
  W->>Q: Claim message when capacity exists
  W->>DB: Mark job processing
  W->>COS: Download source
  W->>O: Optimize model locally
  O-->>W: optimized.glb
  W->>COS: Upload results/{jobId}/optimized.glb
  W->>DB: Mark job completed
  W->>Q: Ack message
  User->>API: Query job status/result URL
```

## Job Flow: Area Target Processing

```mermaid
sequenceDiagram
  participant User as Frontend
  participant API as Platform API
  participant COS as COS
  participant Q as Queue
  participant W as Worker Node
  participant ATS as Area-Target-Scanner
  participant O as 3D-Model-Optimizer
  participant DB as Job DB

  User->>API: Create area-target-processing job
  API->>DB: Create job: created
  API-->>User: Return signed upload URL
  User->>COS: Upload iOS LiDAR scan ZIP
  API->>DB: Mark job queued
  API->>Q: Publish job message
  W->>Q: Claim message when capacity exists
  W->>DB: Mark job processing
  W->>COS: Download scan ZIP
  W->>ATS: Process scan locally
  ATS->>O: Optimize model locally when needed
  O-->>ATS: Optimized model
  ATS-->>W: Area target asset bundle
  W->>COS: Upload results/{jobId}/asset-bundle.zip
  W->>DB: Mark job completed
  W->>Q: Ack message
  User->>API: Query job status/result URL
```

## What The Current Repository Deploys

This repository currently contains a scaffold, not the complete production implementation.

| Path | Current role |
| --- | --- |
| `apps/api` | Placeholder API service with `GET /health` and future job route placeholders. |
| `apps/worker` | Placeholder worker process that reads runtime config and stays alive. |
| `packages/shared` | Shared job status and pipeline constants. |
| `infra/docker-compose.yml` | Local development example with API, worker, Redis, MinIO, and 3D-Model-Optimizer. |
| `docs/architecture.md` | Product architecture and composite worker node model. |

Area-Target-Scanner is reserved in the architecture but is not yet wired into `infra/docker-compose.yml`.

## Local Development Deployment

From the repository root:

```bash
docker compose -f infra/docker-compose.yml up --build
```

Local service map:

| Service | URL | Notes |
| --- | --- | --- |
| API | `http://localhost:8080/health` | Scaffold health check. |
| 3D-Model-Optimizer | `http://localhost:3000` | Optimizer sidecar for local development. |
| Redis | `localhost:6379` | Queue placeholder. |
| MinIO API | `http://localhost:9000` | COS-compatible local object storage. |
| MinIO Console | `http://localhost:9001` | Local object storage admin UI. |

## Production Deployment Order

1. Create COS buckets and object key conventions.
2. Deploy the job database.
3. Deploy the queue service with visibility timeout or lease support.
4. Deploy the Platform API behind a public or private load balancer.
5. Build the elastic worker server image or launch template.
6. On each worker server, run the worker agent, Area-Target-Scanner, 3D-Model-Optimizer, and a local temp volume.
7. Configure autoscaling from queue and node metrics.
8. Keep Area-Target-Scanner and 3D-Model-Optimizer private to the worker node network.

## Suggested Object Keys

```text
uploads/{jobId}/source.{ext}
results/{jobId}/optimized.glb
results/{jobId}/asset-bundle.zip
logs/{jobId}/worker.log
```

The API should store the exact source and result keys in the job database. Workers should not infer keys from filenames supplied by users.

## Environment Variables

Platform API:

```text
API_PORT=8080
QUEUE_URL=...
DATABASE_URL=...
COS_BUCKET=...
COS_REGION=...
COS_SECRET_ID=...
COS_SECRET_KEY=...
```

Worker node:

```text
WORKER_CONCURRENCY=1
QUEUE_URL=...
DATABASE_URL=...
COS_BUCKET=...
COS_REGION=...
COS_SECRET_ID=...
COS_SECRET_KEY=...
OPTIMIZER_URL=http://optimizer:3000
AREA_TARGET_SCANNER_URL=http://area-target-scanner:8080
WORKER_TEMP_DIR=/work/temp
```

3D-Model-Optimizer:

```text
PORT=3000
NODE_ENV=production
```

Area-Target-Scanner:

```text
PORT=8080
OPTIMIZER_URL=http://optimizer:3000
WORK_DIR=/work/temp/area-target-scanner
```

## Autoscaling Rules

Scale out when one or more conditions are true:

- total queued jobs exceeds the active worker count
- oldest queued job age exceeds the target wait time
- per-pipeline backlog grows for `model-optimization` or `area-target-processing`
- active nodes are CPU, memory, or disk constrained

Scale in only when:

- the queue is empty or below the idle threshold
- the node has no active job
- the worker has drained and stopped claiming new messages

Do not terminate a node that is processing a job unless the queue lease timeout and retry behavior are known to recover the job safely.

## Network And Security

- Only the Platform API should be reachable from the frontend.
- Worker node services should live on private networking.
- 3D-Model-Optimizer and Area-Target-Scanner should not expose public ports.
- COS credentials should be injected as secrets, not stored in the image.
- Workers should use a per-job temp directory and delete it after completion.
- Queue messages should carry `jobId`, `pipelineType`, source key, output prefix, preset/options, and retry metadata.

## Failure Behavior

If every worker node is busy, jobs remain `queued`.

If a worker crashes, the queue lease expires and another worker can retry the job.

If a pipeline fails, the worker records the error, retry count, and failed stage. Jobs with retry budget remaining move to `retrying`; exhausted jobs move to `failed`.

If COS upload succeeds but database update fails, the worker should retry the database update before acknowledging the queue message. The job result key should be deterministic so duplicate retries remain idempotent.
