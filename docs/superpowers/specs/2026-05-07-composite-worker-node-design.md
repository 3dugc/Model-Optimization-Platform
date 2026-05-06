# Composite Worker Node Design

## Goal

Define the approved deployment model for elastic servers that can process both normal 3D model optimization jobs and Area-Target-Scanner asset bundle jobs.

## Decision

Each elastic processing server is a composite worker node. It runs:

- the platform worker agent
- Area-Target-Scanner
- 3D-Model-Optimizer
- a local temporary workspace

The queue assigns jobs to available worker agents, not directly to the underlying processing services. The worker agent chooses the correct local service based on `pipelineType`.

## Pipeline Routing

`model-optimization` jobs:

1. Worker claims a queued job only when local capacity is available.
2. Worker downloads the source model or archive from COS.
3. Worker calls the local 3D-Model-Optimizer service.
4. Worker uploads `optimized.glb` to COS.
5. Worker updates job state and metadata.

`area-target-processing` jobs:

1. Worker claims a queued job only when local capacity is available.
2. Worker downloads the iOS LiDAR scan ZIP from COS.
3. Worker calls the local Area-Target-Scanner processing service.
4. Area-Target-Scanner calls the local 3D-Model-Optimizer when its processing pipeline needs model optimization.
5. Worker uploads the generated asset bundle to COS.
6. Worker updates job state and metadata.

## Capacity Model

All processing services on a node share the same heavy-work capacity budget. The initial production configuration should use `WORKER_CONCURRENCY=1` per elastic server.

This keeps a node from running an Area-Target-Scanner job and a large 3D-Model-Optimizer job at the same time, which could exhaust CPU, memory, disk, or temporary workspace capacity.

## Queue Behavior

All worker nodes may be busy at the same time. That is normal.

- API calls must return job state immediately and must not wait for a free processing server.
- Jobs stay `queued` until a worker node has capacity.
- Queue messages need acknowledgement or lease semantics so interrupted jobs return to the queue.
- Autoscaling should consider total queue depth, oldest queued job age, per-pipeline backlog, CPU pressure, memory pressure, and local disk pressure.

## Result Artifacts

`model-optimization` produces an optimized GLB result.

`area-target-processing` produces an area target asset bundle, which may contain a manifest, optimized model, texture assets, feature database, and related files. The platform should store result metadata that can describe either a single file or an archive/directory-style artifact.
