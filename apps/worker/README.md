# Worker App

Queue consumer for optimization jobs.

Responsibilities:

- claim queued jobs
- download source models from object storage
- call 3D-Model-Optimizer
- upload optimized GLB results
- update job status
- retry transient failures and send exhausted jobs to a dead-letter queue

The current scaffold prints runtime configuration and stays alive for container smoke testing.
