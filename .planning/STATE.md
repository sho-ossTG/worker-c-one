---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: diagnostics-and-connectivity
status: not_started
last_updated: "2026-02-26"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Any worker instance must resolve a video URL reliably and report its own health clearly
**Current focus:** Milestone v1.1 — Diagnostics and Connectivity

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-26 — Milestone v1.1 started

## Accumulated Context

### Decisions

- [v1.0 Roadmap]: Two phases derived from natural code vs. docs split — Phase 1 is all code changes, Phase 2 is all documentation.
- [Phase 1]: CONN-01 (Server B connectivity check) was deferred to v1.1 along with DIAG-01 curl examples.
- [Phase 1]: Verify Fluid Compute is enabled in the Vercel dashboard before setting maxDuration: 60.
- [01-01]: maxDuration set to 60s; execFile timeout in api/resolve.js is 57s (3s less for response overhead).
- [01-01]: Node.js 22.x pinned — Vercel defaults to 24.x as of 2026; 22.x is current LTS.
- [01-02]: Status page headline driven by resolveState (resolve outcomes), not binary self-test. Binary error is a separate visual state (orange vs red).
- [01-02]: Self-heal is unconditional — any successful resolve clears degraded state to working.
- [01-02]: selfTestCache 30s TTL prevents spawning binary on every /health poll — ALREADY IMPLEMENTED in api/resolve.js.
- [v1.1]: SERVER_B_URL is optional — worker functions without it. When set, enables connectivity check on status page.
- [v1.1]: Connectivity section shows "not configured" (neutral) when SERVER_B_URL missing, not a warning or error.
- [v1.1]: Curl snippet shows /resolve only with Authorization: Bearer header and ?url= param. /health excluded from curl section.

### Pending Todos

None.

### Blockers/Concerns

- [Phase 1]: Fluid Compute enablement must be verified in Vercel dashboard before deploying the maxDuration: 60 change. If not enabled, effective cap is 10s regardless of vercel.json.
