# Features Research — Worker C Status Page

**Question:** What features do good worker/service status pages have? What is table stakes vs differentiating for a status page showing a serverless worker's health?

**Milestone:** Improving the existing status page to show in-memory session stats, a Server B connectivity check, and a clear WORKING/DEGRADED headline.

**Date:** 2026-02-26

---

## Context: What the Current Page Already Does

The existing `api/resolve.js` status page (`GET /`) runs `yt-dlp --version` as a live self-test and renders an HTML card showing: ONLINE/DEGRADED headline, worker ID, Vercel region, binary found/not found, yt-dlp version, self-test pass/fail, auth enabled/disabled, and an error box on failure.

Gaps: no stats on actual usage, no visibility into whether Server B is reachable, and the headline only reflects the binary self-test — not real resolve activity.

---

## Table Stakes

### 1. Clear pass/fail headline — composite WORKING/DEGRADED

**What it is:** The headline must reflect the actual health of the resolve function, not just whether the binary runs. WORKING = binary ok AND recent resolves not all failing. DEGRADED = binary missing OR self-test failed OR recent resolves all erroring.

**Why table stakes:** The current headline shows "ONLINE" even if every recent resolve failed (binary runs, resolves fail). That is a false positive. The operator must be able to trust the headline.

**Complexity:** Low — logic change, no new dependencies. Derives from stats (feature 3) + error log (feature 4).

**Depends on:** Features 3 and 4.

---

### 2. Specific reason when degraded

**What it is:** When DEGRADED, show exactly why. Not just "error" — the actual error text from yt-dlp or the failed resolve.

**Why table stakes:** "DEGRADED" without a reason forces the operator to dig into logs. The status page's job is to prevent that.

**Current state:** Done for self-test failures. Gap: resolve failures are not surfaced on the page.

**Complexity:** Low — plumb resolve errors from the error log into the existing error-box renderer.

**Depends on:** Feature 4 (recent errors log).

---

### 3. In-session request stats (request count, avg response time, error count)

**What it is:** Module-level counters tracking requests handled, total ms, and errors since last cold start. Displayed as: requests this session, avg response time ms, error count.

**Why table stakes:** Without this, there is no way to know if the worker is actually receiving traffic. A worker can show binary ok while handling zero requests because Server B stopped routing to it. Request count makes that visible immediately.

**Serverless caveat:** Stats reset on cold start. Must be labeled "this session / since last cold start" to avoid confusion. This is correct behavior, not a deficiency.

**Complexity:** Low — three module-level variables, incremented in the request handler.

**Depends on:** Nothing. This is the foundation for features 1, 4, 5.

---

### 4. Recent errors log (last 10, in-memory)

**What it is:** A capped array of the 10 most recent resolve failures: timestamp, URL prefix (first 60 chars for privacy), error message (first 300 chars).

**Why table stakes:** An aggregate error count says something is wrong. The error log says what. Knowing whether 3 errors are all the same geo-block message vs 3 different failures is the difference between "expected" and "needs investigation."

**Serverless caveat:** Resets on cold start. Labeled accordingly.

**Complexity:** Low — push-and-cap array, no external dependencies.

**Depends on:** Feature 3 (same instrumentation point in the handler).

---

### 5. Last resolve attempt (timestamp + success/fail + ms)

**What it is:** One module-level object capturing the most recent resolve: timestamp, ok/fail, response time ms, error message if failed.

**Why table stakes:** Stats give aggregate views. Last attempt gives the most recent point-in-time signal. "Last attempt was 30 min ago, failed" vs "5 seconds ago, succeeded" are very different situations.

**Complexity:** Minimal — one assignment per resolve.

**Depends on:** Feature 3 instrumentation being in place.

---

### 6. Server B connectivity check

**What it is:** When the status page loads, the worker pings `${SERVER_B_URL}/health` with a 3s timeout and reports: reachable/unreachable, HTTP status code, response time ms. Shows a warning row (not error) when `SERVER_B_URL` env var is not set.

**Why table stakes for this system:** Worker C only matters if Server B can reach it — but the reverse matters too. If Worker C cannot reach Server B, that is a network or config problem. This also validates that `SERVER_B_URL` is set correctly.

**Complexity:** Low-medium. Uses `fetch` (built-in Node 18). Must handle timeout and DNS failures gracefully. Runs concurrently with self-test via `Promise.all` to avoid adding latency.

**Depends on:** `SERVER_B_URL` env var. No npm dependencies.

---

## Differentiators

### D1. Response time percentiles (p50/p95/p99)

**Value:** Averages hide tail latency. If 95% of resolves take 2s but 5% hit the 10s timeout, the average looks fine. p95 reveals the problem.

**Complexity:** Medium — fixed-size circular buffer (last 100 response times), sort + index. No library needed.

**When to build:** Only if timeout-specific issues emerge. Avg is sufficient for initial diagnostics.

---

### D2. Warm instance age

**Value:** "10 requests" means something different for a 5-minute-old vs 3-hour-old instance. Puts session stats in context.

**Complexity:** Trivial — `const START_TIME = Date.now()` at module load.

---

### D3. Page render timestamp

**Value:** Prevents confusion when the page is viewed later — the operator can see when the stats were captured.

**Complexity:** Trivial — add `new Date().toISOString()` to the page footer.

---

### D4. Endpoint listing with curl examples

**Value:** When setting up Server B, the operator can copy-paste from the status page directly.

**Complexity:** Low — render the worker's own hostname (from `Host` request header) in the HTML.

---

## Anti-Features

### X1. Persistent stats across cold starts

**Why not:** Requires Redis or external store. Workers are explicitly stateless. Session-only stats are sufficient.

**Instead:** Label all stats "this session / since last cold start."

---

### X2. Graphs or charts

**Why not:** Chart libraries add weight and complexity. The status page is a diagnostic tool for one operator. A table of numbers is faster to read and requires zero dependencies.

**Instead:** Clean numeric table with inline CSS.

---

### X3. Alert/notification system

**Why not:** That is a monitoring system, not a status page. Server B polls `/health` and owns alerting.

**Instead:** Keep Worker C dumb. Server B decides whether to alert.

---

### X4. Auth on the status page

**Why not:** Adds friction when debugging. The info shown (worker ID, region, yt-dlp version) is not sensitive. `/resolve` is already protected.

**Instead:** Status page and `/health` are always public.

---

### X5. Multi-worker pool overview

**Why not:** Each Worker C only knows about itself. Pool-wide views belong in Server B.

**Instead:** Each worker shows its own state only.

---

### X6. External monitoring service integrations

**Why not:** Third-party beacons or scripts create external dependencies and can slow page load. The status page must work even when external services are down.

**Instead:** Zero external dependencies. Pure HTML + inline CSS + inline JS only.

---

## Feature Dependencies

```
Feature 3: Session stats  (no deps — build first)
  └─ Feature 4: Recent errors log
  └─ Feature 5: Last resolve attempt
  └─ Feature 1: Composite headline  ← needs 3 + 4 + 5
  └─ Feature 2: Specific degraded reason  ← needs 4 + 5

Feature 6: Server B connectivity check  (independent, concurrent with self-test)

Differentiators (all independent, build after table stakes):
  D1 extends Feature 3 | D2, D3, D4 are independent
```

---

## Build Order

1. Feature 3 — add module-level stat counters
2. Features 4 + 5 — instrument the same handler entry point
3. Features 1 + 2 — update headline logic using real data
4. Feature 6 — add concurrent connectivity check to page render
5. D2 + D3 — trivial, add alongside step 4
6. D4 — if wanted, low effort
7. D1 — only if tail latency becomes an issue to investigate

---

## Complexity Summary

| Feature | Complexity | New npm deps |
|---|---|---|
| 1. Composite headline | Low | None |
| 2. Specific degraded reason | Low | None |
| 3. Session stats | Low | None |
| 4. Recent errors log | Low | None |
| 5. Last resolve attempt | Minimal | None |
| 6. Server B connectivity check | Low-medium | None (fetch built-in Node 18) |
| D1. Response time percentiles | Medium | None |
| D2. Warm instance age | Trivial | None |
| D3. Page timestamp | Trivial | None |
| D4. Endpoint examples | Low | None |

**All table stakes features: zero new npm dependencies.**
