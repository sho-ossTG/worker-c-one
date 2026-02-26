# Pitfalls Research — Worker C Vercel Serverless yt-dlp Worker

**Project:** Worker C — yt-dlp Resolver
**Researched:** 2026-02-26
**Sources:** api/resolve.js, PROJECT.md, codebase/CONCERNS.md, codebase/ARCHITECTURE.md, research/FEATURES.md

---

## Critical Pitfalls (cause broken behavior)

### P1. In-memory stats are per-instance, not per-worker

**What goes wrong:** Multiple Vercel Lambda instances can run in parallel with completely isolated memory. Worker C-1 may have 3 warm instances at peak traffic — each with different stat counters. The status page shows only one instance's stats, not the worker's aggregate.

**Warning signs:** Stats seem low despite high traffic. Different page loads show different numbers for the same worker.

**Prevention:**
- Accept this as a platform constraint — it cannot be fixed without external storage
- Label all stats explicitly: "this instance, since last cold start"
- Never present stats as worker-wide aggregate figures

**Phase:** Phase 1 (code rebuild + stats)

---

### P2. Cold starts silently make the status page look "fresh"

**What goes wrong:** An instance that started 2 seconds ago shows zeroed stats and a WORKING headline. The operator can't tell whether "0 requests" means "healthy idle" or "brand new cold start that hasn't been tested yet."

**Warning signs:** Stats are always zero; WORKING headline appears immediately on deployment.

**Prevention:**
- Add a module-level `const INSTANCE_START = Date.now()` at the top of resolve.js
- Display instance uptime on the status page ("instance age: 42s" or "since: 14:32:00 UTC")
- This makes cold starts visible and gives stats context

**Phase:** Phase 1 (code rebuild + stats)

---

### P3. Binary self-test does not prove resolve actually works

**What goes wrong:** `yt-dlp --version` passes even when every URL resolution fails due to geo-blocks, format errors, or API changes. The current code uses the self-test result for the WORKING/DEGRADED headline — this is a false positive. The worker shows ONLINE while every resolve request is failing.

**Warning signs:** ONLINE headline, but Server B is getting consistent errors from this worker.

**Prevention:**
- WORKING headline must incorporate recent resolve history from in-memory stats
- Composite health: WORKING = binary ok AND (no resolves attempted OR last resolve succeeded)
- DEGRADED if: binary missing OR self-test failed OR last N resolves all failed
- Self-test remains a separate row — don't remove it, just don't use it alone for the headline

**Phase:** Phase 1 (code rebuild + stats)

---

### P4. Vercel Hobby 10s timeout silently kills slow resolves

**What goes wrong:** `vercel.json` has `maxDuration: 20`. The `execFile` timeout is `20000` ms. But on Vercel Hobby tier **without Fluid Compute**, the function is killed at 10s — before either limit is reached. The code and config together create false confidence that 20s is available.

**Warning signs:** Resolves for slow-loading videos fail with no error from yt-dlp — the process is killed by Vercel, not yt-dlp.

**Prevention (option A — Fluid Compute):** Verify Fluid Compute is enabled on the Vercel project. With Fluid Compute (default since April 2025), Hobby tier gets 300s. If enabled, set `maxDuration: 60` in vercel.json and `execFile` timeout to `55000`.

**Prevention (option B — conservative):** Set `execFile` timeout to `9000` ms so yt-dlp fails cleanly before Vercel kills the function. Return a clear error to Server B rather than a silent kill.

**Prevention (option C — Netlify fallback):** Netlify Functions free tier gives 26s. B can route to Netlify-hosted workers identically via the same `WORKER_URLS` env var pattern.

**Add a comment to the code** explaining the timeout situation regardless of which option is chosen.

**Phase:** Phase 1 (code rebuild)

---

## Moderate Pitfalls (cause confusion or documentation failures)

### P5. Server B connectivity check adds page load latency if not parallelized

**What goes wrong:** Sequential execution: self-test (up to 1s) → B ping (up to 3s) = status page can take 4s to load. On a cold start, this adds to the already-slow first request.

**Warning signs:** Status page is slow to load. Browser shows long wait before content.

**Prevention:**
- Run self-test and B connectivity check in parallel using `Promise.all`
- Set a hard 3-second timeout on the B fetch (`AbortController`)
- Total page render time = max(self-test, B ping) instead of sum

```js
const [selfTest, bCheck] = await Promise.all([runSelfTest(), checkServerB(SERVER_B_URL)]);
```

**Phase:** Phase 1 (code rebuild + stats)

---

### P6. `process.cwd()` binary path breaks on Vercel

**What goes wrong:** The current code uses `path.join(process.cwd(), "bin", "dlp-jipi")`. Vercel's working directory during function execution may not be the repo root — it depends on how Vercel mounts the function. This causes "binary not found" errors that are hard to diagnose.

**Warning signs:** Self-test fails with "ENOENT" or similar path error despite the binary being present in the repo.

**Prevention:** Use `__dirname` instead: `path.join(__dirname, "../bin/dlp-jipi")`. `__dirname` is always the directory of the currently executing file (`api/`), making the path relative and reliable.

**Phase:** Phase 1 (code rebuild)

---

### P7. WORKER_SECRET not set = silent auth bypass on cloned workers

**What goes wrong:** The current code treats an empty `WORKER_SECRET` as "auth disabled" (`if (!WORKER_SECRET) return true`). A worker cloned without setting this env var accepts any request from anyone — including unauthenticated public access to `/resolve`.

**Warning signs:** Worker responds to requests without an Authorization header.

**Prevention:**
- CLONE.md must list `WORKER_SECRET` as a **mandatory** step with explicit warning language
- Consider making the worker refuse to start (return 503 on all requests) if `WORKER_SECRET` is not set — fail-closed instead of fail-open
- Status page should show "⚠ AUTH DISABLED — set WORKER_SECRET" prominently

**Phase:** Phase 2 (documentation)

---

### P8. CLONE.md gaps produce misconfigured worker instances

**What goes wrong:** If the clone guide omits steps, operators end up with:
- ID collisions (`WORKER_ID` defaults to "worker" — two workers with the same ID)
- Workers deployed but not added to Server B's `WORKER_URLS`
- Wrong or missing `WORKER_SECRET`
- `SERVER_B_URL` not set (connectivity check shows "not configured")

**Warning signs:** `worker_id: "worker"` in Server B logs; B routing to only N-1 workers after adding one.

**Prevention:**
- CLONE.md must be a **numbered checklist** with verification steps after each group
- Include: clone → deploy → set env vars → verify status page → add to Server B → verify routing
- Add a "Common mistakes" section at the bottom
- Every env var must have example values and an explanation of what happens if it's missing

**Phase:** Phase 2 (documentation)

---

### P9. "Reachable" conflated with "healthy" in the connectivity UI

**What goes wrong:** If the status page shows Server B connectivity as part of the WORKING/DEGRADED headline, a B outage makes every Worker C show DEGRADED — even though the workers themselves are fine and could serve requests if B comes back.

**Warning signs:** All workers show DEGRADED simultaneously for the same reason.

**Prevention:**
- Server B connectivity row is **informational only** — never feeds the headline
- Label the row: "Server B: reachable" (not "Server B: OK" or "Server B: healthy")
- WORKING/DEGRADED headline = worker's own health only (binary + recent resolves)

**Phase:** Phase 1 (code rebuild + stats)

---

### P10. `maxDuration: 20` in vercel.json creates false confidence

**What goes wrong:** Both the code (`timeout: 20000`) and vercel.json (`maxDuration: 20`) suggest 20 seconds is available. On Hobby without Fluid Compute, it isn't. Developers reading the code believe they have 20s headroom.

**Prevention:**
- Add a comment block at the top of vercel.json and near the `execFile` call explaining the actual timeout situation
- Document which Vercel tier is required for which timeout limit

**Phase:** Phase 1 (code rebuild)

---

## Minor Pitfalls (friction or maintenance debt)

### P11. Error truncation at 1200 chars may cut identifying context

**What goes wrong:** yt-dlp error messages sometimes have the identifying information at the end (after a long stack trace or warning list). Truncating at 1200 chars can remove the actual error cause.

**Prevention:** Consider truncating from both ends — keep first 600 chars and last 600 chars — or use 2000 chars. Low priority.

**Phase:** Phase 1 (code rebuild)

---

### P12. Full URL in error log leaks user privacy

**What goes wrong:** If recent errors are shown on the status page with full video URLs, any user who opens the worker's status page can see what URLs other users tried to resolve.

**Prevention:** Store only the first 60 characters of the URL in the error log (per FEATURES.md spec). Enough to identify the platform, not enough to reconstruct the full URL.

**Phase:** Phase 1 (code rebuild + stats)

---

### P13. WORKER_ID defaults to "worker" without warning

**What goes wrong:** If `WORKER_ID` is not set, the default is `"worker"`. Two cloned workers without their own IDs are indistinguishable in Server B logs and responses.

**Prevention:**
- Status page should show a visible warning if `WORKER_ID` is the default value
- CLONE.md must make `WORKER_ID` a required step with examples

**Phase:** Phase 1 (code rebuild) + Phase 2 (documentation)

---

### P14. Self-test runs on every `/health` poll

**What goes wrong:** Server B polls `/health` every 60 seconds. Each poll runs `yt-dlp --version` — a child process spawn. Under frequent polling this adds unnecessary overhead to every health check.

**Prevention:** Cache the self-test result for 30 seconds. If a cached result exists and is fresh, return it without re-running yt-dlp. Invalidate the cache on cold start.

```js
let selfTestCache = { result: null, at: 0 };

async function runSelfTestCached() {
  if (selfTestCache.result && Date.now() - selfTestCache.at < 30000) {
    return selfTestCache.result;
  }
  selfTestCache.result = await runSelfTest();
  selfTestCache.at = Date.now();
  return selfTestCache.result;
}
```

**Phase:** Phase 1 (code rebuild)

---

## Pitfall → Phase Mapping

| # | Pitfall | Severity | Phase |
|---|---------|----------|-------|
| P1 | Stats are per-instance, not per-worker | Critical | Phase 1 |
| P2 | Cold starts hide instance age | Critical | Phase 1 |
| P3 | Self-test doesn't prove resolves work | Critical | Phase 1 |
| P4 | 10s timeout kills slow resolves | Critical | Phase 1 |
| P5 | Sequential self-test + B ping = slow page | Moderate | Phase 1 |
| P6 | `process.cwd()` breaks on Vercel | Moderate | Phase 1 |
| P7 | Missing WORKER_SECRET = open endpoint | Moderate | Phase 2 |
| P8 | CLONE.md gaps = misconfigured workers | Moderate | Phase 2 |
| P9 | B reachability conflated with headline | Moderate | Phase 1 |
| P10 | `maxDuration: 20` misleads developers | Moderate | Phase 1 |
| P11 | Error truncation cuts identifying context | Minor | Phase 1 |
| P12 | Full URL in error log leaks privacy | Minor | Phase 1 |
| P13 | WORKER_ID defaults silently | Minor | Phase 1 + 2 |
| P14 | Self-test runs on every /health poll | Minor | Phase 1 |
