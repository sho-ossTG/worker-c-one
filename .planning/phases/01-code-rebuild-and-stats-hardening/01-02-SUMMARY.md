---
phase: 01-code-rebuild-and-stats-hardening
plan: "02"
subsystem: api
tags: [nodejs, yt-dlp, status-page, diagnostics, state-machine, vercel]

# Dependency graph
requires:
  - phase: 01-01
    provides: "vercel.json with maxDuration: 60 — establishes 57s execFile timeout budget"
provides:
  - "api/resolve.js with module-level session state and instrumented resolve handler"
  - "Four-state status page: IDLE / WORKING / DEGRADED / BINARY ERROR"
  - "Session Stats: uptime, total requests, error count, avg response time"
  - "Last Resolve row: timestamp, success/fail, duration in ms"
  - "Collapsible Recent Errors section: last 10 failures, newest first"
  - "Self-heal: successful resolve after DEGRADED returns to WORKING"
  - "Self-test cache (30s TTL) to avoid spawning yt-dlp on every /health poll"
affects:
  - 01-03

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level state in serverless function survives within a warm instance (cold start resets all counters)"
    - "resolveState state machine: idle -> working on first success, working -> degraded on error, degraded -> working on self-heal"
    - "Self-test cache with 30s TTL avoids spawning yt-dlp binary on every /health poll"
    - "execFile timeout at 57000ms (maxDuration 60s minus 3s response buffer)"

key-files:
  created: []
  modified:
    - api/resolve.js

key-decisions:
  - "Status page headline driven by resolveState (idle/working/degraded), not binary self-test — binary self-test only drives binary_error state"
  - "Self-heal is unconditional: any successful resolve clears degraded state to working"
  - "BINARY ERROR uses orange (#ff8800), DEGRADED uses red (#ff4444) — distinct colors and distinct error box labels prevent operator confusion"
  - "resolveErrors capped at 10 entries (shift oldest) to avoid unbounded memory growth in long-lived warm instances"
  - "selfTestCache 30s TTL chosen to balance freshness against unnecessary binary spawns on heavily-polled /health endpoints"

patterns-established:
  - "State machine pattern: idle | working | degraded — all status-driven UI reads from resolveState"
  - "Timing wrapper pattern: t0 = Date.now() before await, durationMs after, both success and error paths update totals"

requirements-completed: [CONF-02, PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06]

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 1 Plan 02: State Machine, Session Stats, and Rewritten Status Page Summary

**In-module state machine (idle/working/degraded/binary_error) replacing binary-only health check, with session stats, last resolve row, and collapsible recent errors log**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-26T17:54:22Z
- **Completed:** 2026-02-26T17:59:00Z
- **Tasks:** 2 (implemented together as one coherent rewrite)
- **Files modified:** 1

## Accomplishments
- execFile timeout updated from 20s to 57s, matching the 60s maxDuration budget from plan 01 with a 3s response buffer
- Module-level session state (COLD_START, totalRequests, errorCount, totalDurationMs, lastResolve, resolveErrors, resolveState, lastResolveError, selfTestCache) added at top of file
- Status page now shows honest operator state: IDLE (grey, no blink), WORKING (green, blink), DEGRADED (red), BINARY ERROR (orange)
- Self-heal works: a successful resolve after DEGRADED transitions resolveState back to "working"
- /health and / now use runSelfTestCached (30s TTL) — avoids spawning binary on every poll
- Session Stats section shows uptime since cold start, total requests, error count, avg response time
- Last Resolve row shows timestamp, success/fail, duration in ms
- Collapsible Recent Errors expands to show last 10 failures newest-first with timestamp, truncated URL, truncated error message

## Task Commits

Both tasks were implemented together in one atomic commit (same file, tightly coupled state additions and handler instrumentation):

1. **Tasks 1+2: State machine, session stats, instrumented handler, rewritten status page** - `214916e67` (feat)

**Plan metadata:** (docs commit, see below)

## Files Created/Modified
- `api/resolve.js` - Complete rebuild: timeout, state vars, cached self-test, formatUptime, instrumented resolve handler, rewritten renderStatusPage

## Decisions Made
- Tasks 1 and 2 were committed as a single unit because the state variables added in Task 1 are directly consumed in the handler instrumentation and renderStatusPage added in Task 2 — splitting them would have left an intermediate uncommitted state where state vars are declared but unused.
- Status page headline is derived from resolveState (not test.ok), so operators see resolve-level health, not just binary availability.
- BINARY ERROR is treated as a distinct visual state (orange) separate from DEGRADED (red) because they require different operator responses: binary error = deployment issue, degraded = runtime/network issue.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Shell bash escaping `!` in inline `-e` node commands. Worked around by restructuring checks to avoid `!` in bash strings (using `includes(v) ? 'OK' : 'MISSING'` instead of negated assertions). Not a code issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- api/resolve.js is now the canonical rebuilt worker. All PAGE and CONF-02 requirements satisfied.
- Plan 03 (documentation) can reference the final API contract and status page behavior.
- Blocker from plan 01 still stands: verify Fluid Compute is enabled in Vercel dashboard before deploying.

---
*Phase: 01-code-rebuild-and-stats-hardening*
*Completed: 2026-02-26*

## Self-Check: PASSED

- FOUND: api/resolve.js
- FOUND: .planning/phases/01-code-rebuild-and-stats-hardening/01-02-SUMMARY.md
- FOUND commit: 214916e67 (feat(01-02): add session state, instrumented resolve handler, rewritten status page)
