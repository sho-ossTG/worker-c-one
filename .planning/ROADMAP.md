# Roadmap: Worker C — yt-dlp Resolver

## Overview

Worker C is a working but untrustworthy codebase — the status page lies, the platform config is wrong, and the clone documentation is missing. This roadmap delivers two things: a clean, honest implementation the owner can read and trust (Phase 1), followed by airtight documentation so any clone of the worker is configured correctly from day one (Phase 2). Phase 1 fixes the code; Phase 2 hardens the operational story.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Code Rebuild and Stats Hardening** - Rebuild api/resolve.js with correct platform config, honest status page, and in-session diagnostics
- [x] **Phase 2: Documentation Hardening** - Write CLONE.md and rewrite SERVER_B_GUIDE.md so operators can't misconfigure a worker (completed 2026-02-26)

## Phase Details

### Phase 1: Code Rebuild and Stats Hardening
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

### Phase 2: Documentation Hardening
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
- [ ] 02-02-PLAN.md — Rewrite SERVER_B_GUIDE.md as numbered checklist at repo root + update .env.example

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Code Rebuild and Stats Hardening | 2/2 | Complete | 2026-02-26 |
| 2. Documentation Hardening | 2/2 | Complete   | 2026-02-26 |
