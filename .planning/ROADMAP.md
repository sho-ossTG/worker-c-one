# Roadmap: Worker C — yt-dlp Resolver

## Overview

This roadmap covers the active milestone (v1.1 — Diagnostics and Connectivity). Completed v1.0 history is preserved below.

## Active Milestone: v1.1 — Diagnostics and Connectivity

**Goal:** Operators can verify Server B is reachable from a worker instance, and Server B developers have a ready-made curl snippet to test /resolve.

### Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (3.1, 3.2): Urgent insertions if needed (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 3: Server B Connectivity Check** - Status page pings SERVER_B_URL and shows reachable/unreachable/not-configured, docs updated for the new env var
- [ ] **Phase 4: Resolve Curl Snippet** - Status page displays a ready-made curl command for /resolve with correct auth header

### Phase Details

#### Phase 3: Server B Connectivity Check
**Goal**: Operators can verify whether their worker instance can reach Server B directly from the status page — with neutral display when connectivity check is not configured
**Depends on**: Nothing (first v1.1 phase; v1.0 already complete)
**Requirements**: CONN-01, CONN-02, CONN-03
**Success Criteria** (what must be TRUE):
  1. Status page shows a "Server B Connectivity" section that displays "Reachable" with response time in ms when SERVER_B_URL is set and the Server B /health endpoint responds
  2. Status page shows "Unreachable" with an error indicator when SERVER_B_URL is set but Server B /health endpoint does not respond (any error — timeout, DNS failure, non-200)
  3. Status page shows "Not configured" in neutral styling (no warning color, no error indicator) when SERVER_B_URL env var is absent
  4. CLONE.md env var table includes SERVER_B_URL listed as optional, with a note explaining it enables the status page connectivity check
  5. .env.example includes SERVER_B_URL with a comment marking it optional and explaining its purpose
**Plans**: TBD

#### Phase 4: Resolve Curl Snippet
**Goal**: Server B developers can copy a ready-made curl command from the worker's status page and immediately test the /resolve endpoint without constructing the request manually
**Depends on**: Phase 3 (builds on the status page work)
**Requirements**: DIAG-01
**Success Criteria** (what must be TRUE):
  1. Status page shows a curl snippet for GET /resolve?url=<video_url> that includes the Authorization: Bearer <WORKER_SECRET> header in the correct format
  2. The curl snippet uses the worker's own domain/URL so the host portion is pre-filled and the command is immediately runnable
  3. The curl snippet is visible on the status page in all worker states (WORKING, DEGRADED, BINARY ERROR)
**Plans**: TBD

### Progress

**Execution Order:**
Phases execute in numeric order: 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 3. Server B Connectivity Check | 0/? | Not started | - |
| 4. Resolve Curl Snippet | 0/? | Not started | - |

---

## Completed: v1.0 — Worker C Foundation

**Completed:** 2026-02-26
**Phases:** 2

### Phases (v1.0)

- [x] **Phase 1: Code Rebuild and Stats Hardening** - Rebuild api/resolve.js with correct platform config, honest status page, and in-session diagnostics (completed 2026-02-26)
- [x] **Phase 2: Documentation Hardening** - Write CLONE.md and rewrite SERVER_B_GUIDE.md so operators can't misconfigure a worker (completed 2026-02-26)

### Phase Details (v1.0)

#### Phase 1: Code Rebuild and Stats Hardening
**Goal**: The worker is honest — platform config is correct, the status page reflects real resolve outcomes, and operators get actionable diagnostics
**Depends on**: Nothing (first phase)
**Requirements**: CONF-01, CONF-02, CONF-03, PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06
**Success Criteria** (what must be TRUE):
  1. Opening the worker's status page in a browser shows WORKING or DEGRADED based on actual recent resolve outcomes — not just whether the binary runs
  2. When DEGRADED, the status page shows the exact error text from the last failure so the operator knows what went wrong without reading logs
  3. The status page shows total requests, error count, and avg response time labeled "this instance, since last cold start" so it is clear the stats are per-instance
  4. The status page shows the last 10 resolve failures with timestamp, truncated URL, and error message
  5. `vercel.json` and `execFile` timeout are consistent with each other and reflect the correct Vercel Fluid Compute timeout values
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Update vercel.json (fluid + maxDuration:60) and package.json (engines: node 22.x)
- [x] 01-02-PLAN.md — Rebuild api/resolve.js: in-module state machine, instrumented resolve handler, rewritten status page

#### Phase 2: Documentation Hardening
**Goal**: Any operator who clones the worker and follows CLONE.md ends up with a correctly configured, registered instance — with zero misconfiguration possible if they complete the checklist
**Depends on**: Phase 1
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07
**Success Criteria** (what must be TRUE):
  1. CLONE.md exists as a numbered checklist that a first-time operator can follow from clone to verified-working worker without needing to read any other file
  2. CLONE.md includes an env var table listing every variable, an example value, and what breaks if that variable is missing — WORKER_SECRET absence is flagged prominently
  3. CLONE.md includes a "Common mistakes" section covering the failure modes that produce silent misconfiguration
  4. SERVER_B_GUIDE.md is a step-by-step checklist (not a code dump) with exact Vercel env var names and explains how to add unlimited workers via the WORKER_URLS CSV var
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Write CLONE.md: operator deployment checklist (clone, deploy, env vars, verify)
- [x] 02-02-PLAN.md — Rewrite SERVER_B_GUIDE.md as numbered checklist at repo root + update .env.example

### Progress (v1.0)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Code Rebuild and Stats Hardening | 2/2 | Complete | 2026-02-26 |
| 2. Documentation Hardening | 2/2 | Complete | 2026-02-26 |
