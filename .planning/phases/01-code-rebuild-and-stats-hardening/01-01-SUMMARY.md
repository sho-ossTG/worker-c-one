---
phase: 01-code-rebuild-and-stats-hardening
plan: "01"
subsystem: infra
tags: [vercel, fluid-compute, nodejs, platform-config]

# Dependency graph
requires: []
provides:
  - "vercel.json with fluid: true and maxDuration: 60 for Fluid Compute support"
  - "package.json engines field pinning Node.js 22.x LTS"
affects:
  - 01-02
  - 01-03

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fluid Compute enabled explicitly via fluid: true in vercel.json"
    - "maxDuration set to 60s; execFile timeout in api/resolve.js must be 57s (3s less for overhead)"

key-files:
  created: []
  modified:
    - vercel.json
    - package.json

key-decisions:
  - "maxDuration set to 60s (conservative); Fluid Compute on Hobby allows up to 300s — can raise if yt-dlp still times out"
  - "Node.js 22.x pinned because Vercel defaults to 24.x as of 2026; 22.x is current LTS"
  - "fluid: true added explicitly to ensure Fluid Compute is active regardless of project creation date"

patterns-established:
  - "execFile timeout must always be maxDuration - 3s to leave room for response overhead"

requirements-completed: [CONF-01, CONF-03]

# Metrics
duration: 1min
completed: 2026-02-26
---

# Phase 1 Plan 01: Platform Config — Fluid Compute and Node.js Pin Summary

**vercel.json updated with fluid: true and maxDuration: 60; package.json pinned to Node.js 22.x LTS via engines field**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-26T17:54:19Z
- **Completed:** 2026-02-26T17:55:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- vercel.json now explicitly enables Fluid Compute and sets a 60s function budget (up from 20s)
- package.json pins Node.js 22.x LTS, preventing Vercel from silently upgrading to 24.x
- Both files verified as valid JSON with correct field values before committing

## Task Commits

Each task was committed atomically:

1. **Task 1: Update vercel.json — add Fluid Compute and correct maxDuration** - `6bbb71925` (chore)
2. **Task 2: Update package.json — pin Node.js 22.x via engines field** - `80b108e0a` (chore)

**Plan metadata:** (docs commit, see below)

## Files Created/Modified
- `vercel.json` - Added fluid: true, changed maxDuration from 20 to 60
- `package.json` - Added engines.node: "22.x"

## Decisions Made
- maxDuration set to 60s conservatively — Fluid Compute Hobby tier allows 300s but 60s is a safe starting point. If yt-dlp exceeds 60s in production, raise this value.
- The execFile timeout in api/resolve.js (plan 02) must be set to 57s — 3s less than maxDuration to allow response overhead.
- Node.js 22.x pinned explicitly because Vercel's 2026 default is 24.x; 22.x is the stable LTS.
- fluid: true added at the top level of vercel.json (safe even if already enabled at dashboard level).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Shell escape: bash was escaping `!` in the plan's inline verification command (`!==`). Used an alternative node invocation (checking truthiness directly) for the same logical check. Verification still confirmed both fields correctly. Not a code issue.

## User Setup Required
None - no external service configuration required.

Note: The STATE.md blocker "Verify Fluid Compute is enabled in the Vercel dashboard" still stands. This plan sets `fluid: true` in vercel.json, which is the correct code-side configuration. However, you should confirm Fluid Compute is enabled for this specific Vercel project in the dashboard before deploying. If it is not enabled, the maxDuration cap will be 10s on Hobby tier.

## Next Phase Readiness
- Platform config is locked. Plan 02 can now target execFile timeout of 57s with confidence.
- vercel.json and package.json are stable; no further changes expected to these files.
- Blocker: Verify Fluid Compute is active in Vercel dashboard before deploying plan 02 changes.

---
*Phase: 01-code-rebuild-and-stats-hardening*
*Completed: 2026-02-26*

## Self-Check: PASSED

- FOUND: vercel.json
- FOUND: package.json
- FOUND: .planning/phases/01-code-rebuild-and-stats-hardening/01-01-SUMMARY.md
- FOUND commit: 6bbb71925 (Task 1)
- FOUND commit: 80b108e0a (Task 2)
