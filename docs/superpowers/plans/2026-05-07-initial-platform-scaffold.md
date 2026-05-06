# Initial Platform Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the initial repository scaffold for a queue-driven 3D model optimization platform.

**Architecture:** Use a monorepo with separate API, worker, shared package, infra, and docs areas. Keep 3D-Model-Optimizer external for the MVP and integrate it through a worker-side HTTP call later.

**Tech Stack:** Node.js 20, npm workspaces, Docker Compose for local infrastructure examples.

---

### Task 1: Repository Structure

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `scripts/validate-scaffold.mjs`

- [x] **Step 1: Create the root workspace files**

Add root metadata, ignored files, environment examples, and a validation script that verifies the scaffold is complete.

- [x] **Step 2: Run validation**

Run: `npm test`
Expected: scaffold validation passes.

### Task 2: API, Worker, Shared, Infra, and Docs

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/src/index.mjs`
- Create: `apps/api/Dockerfile`
- Create: `apps/api/README.md`
- Create: `apps/worker/package.json`
- Create: `apps/worker/src/index.mjs`
- Create: `apps/worker/Dockerfile`
- Create: `apps/worker/README.md`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.mjs`
- Create: `infra/docker-compose.yml`
- Create: `docs/architecture.md`

- [x] **Step 1: Add the placeholder API service**

Create a dependency-free Node HTTP server with `GET /health` and explicit 501 responses for future job endpoints.

- [x] **Step 2: Add the placeholder worker service**

Create a dependency-free worker process that prints queue, optimizer, and concurrency configuration, then stays alive.

- [x] **Step 3: Add shared job constants**

Create shared status and preset constants for future API and worker code.

- [x] **Step 4: Add local infrastructure example**

Create a Docker Compose file for API, worker, Redis, MinIO, and the external optimizer image.

- [x] **Step 5: Run validation**

Run: `npm test`
Expected: scaffold validation passes.

### Self-Review

- Spec coverage: The scaffold includes the platform boundary, API and worker areas, shared package, infra example, and architecture documentation.
- Placeholder scan: Runtime placeholder endpoints intentionally return 501 with explicit future contracts; no unknown implementation details are hidden.
- Type consistency: Job statuses and preset names match across docs and shared constants.
