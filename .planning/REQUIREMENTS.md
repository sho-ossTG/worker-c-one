# Requirements: Worker C — yt-dlp Resolver

**Defined:** 2026-02-26
**Core Value:** Any worker instance must resolve a video URL reliably and report its own health clearly

## v1.0 Requirements (Complete)

All shipped in v1.0. See `.planning/MILESTONES.md` for full details.

### Platform Config

- [x] **CONF-01**: `vercel.json` sets `maxDuration: 60` to use Fluid Compute headroom on Hobby tier
- [x] **CONF-02**: `execFile` timeout is updated to match `vercel.json` (no silent mismatch between config and code)
- [x] **CONF-03**: `package.json` pins `"engines": { "node": "22.x" }` so Vercel uses the correct Node.js LTS version

### Status Page

- [x] **PAGE-01**: Status page shows a composite WORKING/DEGRADED headline based on real resolve outcomes (not just yt-dlp --version self-test)
- [x] **PAGE-02**: When DEGRADED, status page shows the specific reason with the actual error text
- [x] **PAGE-03**: Status page shows in-session request stats: total requests, error count, avg response time — labeled "this instance, since last cold start"
- [x] **PAGE-04**: Status page shows instance uptime / age since last cold start
- [x] **PAGE-05**: Status page shows recent errors log: last 10 resolve failures with timestamp, truncated URL (60 chars max), and error message
- [x] **PAGE-06**: Status page shows last resolve attempt: timestamp, success/fail, and response time in ms

### Documentation

- [x] **DOC-01**: `CLONE.md` exists as a numbered checklist covering: clone → deploy → set env vars → verify status page → register with Server B → verify routing
- [x] **DOC-02**: `CLONE.md` includes an env var table with exact names, example values, and what happens if each is missing
- [x] **DOC-03**: `CLONE.md` includes a "Common mistakes" section
- [x] **DOC-04**: `SERVER_B_GUIDE.md` is rewritten with exact Vercel environment variable names and values for Server B
- [x] **DOC-05**: `SERVER_B_GUIDE.md` explains how to add unlimited Worker C instances to Server B's pool using the `WORKER_URLS` CSV env var
- [x] **DOC-06**: `SERVER_B_GUIDE.md` is structured as a step-by-step checklist, not just code snippets
- [x] **DOC-07**: `.env.example` documents all required env vars (`WORKER_ID`, `WORKER_SECRET`) with a prominent warning when `WORKER_SECRET` is not set

## v1.1 Requirements

Requirements for v1.1 milestone.

### Connectivity

- [ ] **CONN-01**: Status page shows a Server B connectivity section that pings `SERVER_B_URL/health` on each page load and displays reachable or unreachable with response time in ms
- [ ] **CONN-02**: When `SERVER_B_URL` is not set, the connectivity section shows "not configured" (neutral display — no error, no warning color)
- [ ] **CONN-03**: `.env.example` and `CLONE.md` are updated to document the `SERVER_B_URL` env var as optional (worker functions without it; enables connectivity check when set)

### Diagnostics

- [ ] **DIAG-01**: Status page shows a curl snippet for the `/resolve` endpoint with `Authorization: Bearer <WORKER_SECRET>` header and `?url=<video_url>` parameter, using the worker's own URL

## v2 Requirements

Deferred to future release.

### Diagnostics

- **DIAG-02**: Status page shows endpoint listing with curl examples for /health (no-auth variant)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Persistent stats across cold starts | Requires Redis on workers; session-only is sufficient per project decision |
| Response time percentiles (p50/p95/p99) | Medium complexity; build only if tail latency becomes a diagnosed production problem |
| Server B implementation | Separate repo/project |
| Server A implementation | Separate repo/project |
| Per-worker secrets | Shared WORKER_SECRET is sufficient; all workers are identical clones |
| Self-test cache (DIAG-01 old) | Already implemented in v1.0 — selfTestCache with 30s TTL in api/resolve.js |
| Multi-worker pool overview on status page | Workers only know about themselves; pool views belong in Server B |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### v1.0 (Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| CONF-03 | Phase 1 | Complete |
| PAGE-01 | Phase 1 | Complete |
| PAGE-02 | Phase 1 | Complete |
| PAGE-03 | Phase 1 | Complete |
| PAGE-04 | Phase 1 | Complete |
| PAGE-05 | Phase 1 | Complete |
| PAGE-06 | Phase 1 | Complete |
| DOC-01 | Phase 2 | Complete |
| DOC-02 | Phase 2 | Complete |
| DOC-03 | Phase 2 | Complete |
| DOC-04 | Phase 2 | Complete |
| DOC-05 | Phase 2 | Complete |
| DOC-06 | Phase 2 | Complete |
| DOC-07 | Phase 2 | Complete |

### v1.1 (Pending)

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | TBD | Pending |
| CONN-02 | TBD | Pending |
| CONN-03 | TBD | Pending |
| DIAG-01 | TBD | Pending |

**Coverage:**
- v1.1 requirements: 4 total
- Mapped to phases: 0
- Unmapped: 4 ⚠️

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 — v1.1 requirements added*
