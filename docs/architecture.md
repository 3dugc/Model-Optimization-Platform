# Architecture

## Goal

Build an asynchronous 3D model optimization platform where clients upload source assets to object storage, workers process queued jobs with 3D-Model-Optimizer, and optimized GLB files are written back to object storage.

## Boundary

3D-Model-Optimizer should stay focused on model conversion and optimization. This platform owns job orchestration, user-facing APIs, queue semantics, object storage keys, retries, and operational scaling.

Other processing engines may be integrated later. Area-Target-Scanner is reserved as a future pipeline because it accepts iOS LiDAR scan exports and produces Unity area target asset bundles containing an optimized model, texture assets, feature database, and manifest.

## Data Flow

1. The frontend asks the API to create an optimization job.
2. The API creates a job record with status `created`.
3. The API returns a signed COS upload URL and source object key.
4. The frontend uploads the model directly to COS.
5. The API marks the job `queued` after upload confirmation and sends a queue message.
6. A worker claims the queue message only when it has local capacity and marks the job `processing`.
7. The worker downloads the source object to local temporary storage.
8. The worker routes the job to the local pipeline service selected by `pipelineType`.
9. The worker uploads the optimized GLB or asset bundle to COS.
10. The worker marks the job `completed` with result metadata, or `failed` with a structured error.

## Initial Job States

- `created`: job exists, waiting for source upload
- `queued`: source exists and a queue message has been published
- `processing`: a worker is actively processing the job
- `completed`: optimized output was uploaded successfully
- `failed`: processing reached a terminal error
- `retrying`: processing failed but retry budget remains

## Scaling Model

The queue is the load balancer. Add more worker containers to increase throughput. Keep worker concurrency conservative at first because 3D model conversion and texture compression can consume significant CPU, memory, and disk.

## Composite Worker Node Model

Each elastic server should be treated as a composite processing node. A node runs the platform worker agent together with the local processing services it can use.

```text
Elastic Worker Node
  - platform worker agent
  - Area-Target-Scanner processing service
  - 3D-Model-Optimizer service
  - local temporary workspace
```

The worker agent consumes queue jobs, downloads source objects from COS, and invokes the correct local pipeline. For `model-optimization`, it calls local 3D-Model-Optimizer. For `area-target-processing`, it calls local Area-Target-Scanner, and Area-Target-Scanner may call the same local 3D-Model-Optimizer during its own processing pipeline.

This keeps Area-Target-Scanner's dependency on 3D-Model-Optimizer inside the same server or container network, avoids cross-server coupling, and lets each elastic server handle either type of asset when it has capacity.

The node should expose one shared heavy-work capacity budget at first. Start with one active job per node so a long area target job cannot run beside another large model compression job and exhaust memory, disk, or CPU.

## Busy Worker Handling

All optimization servers may be occupied at the same time. The platform must treat that as a normal condition, not an error.

- API requests must not wait for an optimizer to become free.
- Jobs remain `queued` while all workers are busy.
- The frontend reads queue position, estimated wait, or a simple `queued` status from the API.
- Each composite worker node should use a small local concurrency limit, starting with `1`.
- Queue messages should use an acknowledgement or lease mechanism so a crashed worker releases the job back to the queue.
- Autoscaling should use queue depth, oldest queued job age, and worker CPU or memory pressure.
- If a job waits too long, the API should still report a clear waiting state instead of timing out.

## MVP Integration Choice

The MVP should call the existing 3D-Model-Optimizer HTTP API from the worker. A later phase can add a CLI or direct library entrypoint if HTTP overhead, timeout behavior, or progress reporting becomes limiting.

## Future Pipeline Integrations

The job model should not assume every task is a single model-to-GLB optimization. Future jobs should carry a pipeline identifier so the API and workers can route work to different processors.

Initial reserved pipeline identifiers:

- `model-optimization`: source model or archive to optimized GLB through local 3D-Model-Optimizer.
- `area-target-processing`: iOS LiDAR scan ZIP to area target asset bundle through local Area-Target-Scanner, which may depend on local 3D-Model-Optimizer.

Area target processing should use the same platform primitives: direct COS upload, durable job state, queue backpressure, worker capacity limits, retries, and COS result storage. Its result artifact is an asset bundle directory or archive rather than only `optimized.glb`.
