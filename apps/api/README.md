# API App

Public business API for the model optimization platform.

Responsibilities:

- create optimization jobs
- issue signed object-storage upload URLs
- persist and expose job status
- enqueue ready jobs for workers
- return result metadata and signed download URLs

The current scaffold exposes `GET /health` and explicit `501` responses for the future job endpoints.
