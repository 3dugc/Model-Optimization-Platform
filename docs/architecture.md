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
8. The worker calls 3D-Model-Optimizer with the selected preset or custom options.
9. The worker uploads the optimized GLB to COS.
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

## Busy Worker Handling

All optimization servers may be occupied at the same time. The platform must treat that as a normal condition, not an error.

- API requests must not wait for an optimizer to become free.
- Jobs remain `queued` while all workers are busy.
- The frontend reads queue position, estimated wait, or a simple `queued` status from the API.
- Each worker should use a small local concurrency limit, starting with `1`.
- Queue messages should use an acknowledgement or lease mechanism so a crashed worker releases the job back to the queue.
- Autoscaling should use queue depth, oldest queued job age, and worker CPU or memory pressure.
- If a job waits too long, the API should still report a clear waiting state instead of timing out.

## MVP Integration Choice

The MVP should call the existing 3D-Model-Optimizer HTTP API from the worker. A later phase can add a CLI or direct library entrypoint if HTTP overhead, timeout behavior, or progress reporting becomes limiting.

## Future Pipeline Integrations

The job model should not assume every task is a single model-to-GLB optimization. Future jobs should carry a pipeline identifier so the API and workers can route work to different processors.

Initial reserved pipeline identifiers:

- `model-optimization`: source model or archive to optimized GLB through 3D-Model-Optimizer.
- `area-target-processing`: iOS LiDAR scan ZIP to area target asset bundle through Area-Target-Scanner.

Area target processing should use the same platform primitives: direct COS upload, durable job state, queue backpressure, worker capacity limits, retries, and COS result storage. Its result artifact is an asset bundle directory or archive rather than only `optimized.glb`.
