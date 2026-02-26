# Project Research Summary

**Project:** Worker C — yt-dlp URL Resolver
**Domain:** Vercel serverless worker pool for media URL resolution
**Researched:** 2026-02-26
**Confidence:** HIGH

## Executive Summary

Worker C is a stateless Vercel serverless function that wraps the yt-dlp binary and exposes a three-endpoint HTTP API: a status page, a health check, and the URL resolver. Research confirms the existing architecture is fundamentally sound — one Node.js file, no external dependencies, no persistent state. The primary work is not restructuring but hardening: the status page needs real diagnostic data (in-memory session stats, composite health headline, Server B connectivity check), and two outdated platform assumptions in the codebase must be corrected (Vercel Hobby now gets 300s via Fluid Compute, not 10s; Node.js 18.x is no longer supported on Vercel).

The recommended approach stays the course on zero-dependency Node.js CommonJS with module-level stats. All six table-stakes features for the improved status page require no npm packages — built-in `fetch`, `AbortController`, `URL`, and `child_process.execFile` cover everything. The only new env var needed is `SERVER_B_URL` (optional), which the status page uses for a connectivity check that degrades gracefully when absent. The self-contained single-file architecture is the correct choice for this use case; adding a framework or splitting into multiple files would create inter-file state-sharing complexity with no benefit.

The key risks are operator-confusion risks, not technical risks: (1) the current ONLINE/DEGRADED headline is a false positive because it only tests whether `yt-dlp --version` runs, not whether resolves actually succeed; (2) a cold start shows zeroed stats with no indication of how old the instance is; (3) cloned workers that omit `WORKER_SECRET` silently accept all requests. All three are mitigated by Phase 1 code changes and Phase 2 documentation hardening.

---

## Key Findings

### Recommended Stack

The stack is entirely Node.js 22.x built-ins on Vercel with zero external dependencies. Node.js 22 is the correct pin — 20.x predates stable built-in `fetch`, and 24.x (the new Vercel default) is newer than needed. CommonJS (`"type": "commonjs"`) should stay as-is; the existing `module.exports` handler pattern is idiomatic for Vercel and there is no reason to migrate to ESM for a single-file worker.

The critical platform correction: Vercel Fluid Compute has been the default for all new projects since April 23, 2025. With it enabled, Hobby tier gets 300s max duration — the old 10s cap no longer applies. `vercel.json` should be updated to `maxDuration: 60` (sufficient headroom for yt-dlp) and the `execFile` timeout adjusted to match.

**Core technologies:**
- Node.js 22.x: serverless runtime — stable LTS with built-in `fetch`, `URL`, and `AbortController` as globals; pin via `engines.node` in `package.json`
- Vercel Functions (Fluid Compute): execution platform — Hobby tier now supports 300s; set `maxDuration: 60` for yt-dlp safety
- Module-level plain object: in-memory stats — survives across requests within one warm instance lifetime, resets on cold start (acceptable)
- Global `fetch()` + `AbortController`: outbound HTTP for Server B ping — built-in since Node 21, no `node-fetch` or `axios` needed
- `child_process.execFile`: binary execution — already used correctly in existing code

### Expected Features

The status page currently shows a binary self-test result and static config info. Research identifies six table-stakes gaps, all achievable with zero new npm packages. The build order is strictly dependency-driven: session stats first (the foundation everything else reads from), then the error log and last-attempt tracking, then the composite headline, then the Server B connectivity check.

**Must have (table stakes):**
- Composite WORKING/DEGRADED headline — incorporates recent resolve outcomes, not just binary self-test; operators must be able to trust the headline
- Specific degraded reason — surface the actual error text from the recent errors log, not just "error"
- In-session request stats (count, avg response time, error count) — makes it immediately visible if a worker is receiving zero traffic
- Recent errors log (last 10, in-memory, URL-truncated to 60 chars for privacy) — distinguishes "same geo-block" from "varied failures"
- Last resolve attempt (timestamp, ok/fail, ms) — point-in-time signal alongside aggregate stats
- Server B connectivity check (3s timeout, parallel with self-test) — validates `SERVER_B_URL` config and network path from worker to coordinator

**Should have (differentiators, low effort):**
- Warm instance age (`const INSTANCE_START = Date.now()` at module load) — makes cold start freshness visible; directly mitigates P2
- Page render timestamp — prevents stale-read confusion
- Endpoint listing with curl examples — aids Server B setup

**Defer (v2+):**
- Response time percentiles (p50/p95/p99) — medium complexity; build only if tail latency becomes a diagnosed problem
- Persistent stats across cold starts — requires Redis; out of scope per PROJECT.md; session-only is sufficient

### Architecture Approach

Worker C's architecture is a single Vercel function file with three URL-dispatched endpoints, a module-level stats object, and a binary invocation via `execFile`. The coordinator (Server B, not yet built) owns all routing state in Upstash Redis — round-robin counter, URL cache, health status. Workers are identical clones that communicate exclusively with callers; they have no knowledge of each other. The "add a worker" operation requires only updating `WORKER_URLS` on Server B and redeploying B — no code changes anywhere.

**Major components:**
1. `api/resolve.js` — the entire Worker C implementation; three endpoints, module-level stats, binary execution, auth validation
2. `bin/dlp-jipi` — the pre-compiled yt-dlp binary; resolve.js invokes this via `execFile`
3. `vercel.json` — routes all paths to `api/resolve.js`, sets `maxDuration`
4. Server B (not yet built) — owns the worker registry (`WORKER_URLS` env var), Redis round-robin counter, URL cache, failover loop
5. Upstash Redis (on Server B) — the only persistent state in the system; atomic counter, URL cache, health cache

### Critical Pitfalls

1. **False WORKING headline (P3)** — `yt-dlp --version` succeeds even when every URL resolve fails due to geo-blocks or format changes. Fix: composite health logic that incorporates recent resolve outcomes from in-memory stats. The self-test result remains a separate visible row but must not be the sole input to the headline.

2. **Vercel timeout false confidence (P4, P10)** — `maxDuration: 20` and `execFile` timeout 20s suggest 20 seconds is available, but without Fluid Compute on Hobby the real limit is 10s. Fix: verify Fluid Compute is enabled, update `maxDuration` to 60, update `execFile` timeout to 55s, add an explanatory comment block. The existing code and config together mislead anyone reading them.

3. **Binary path breaks on Vercel (P6)** — `path.join(process.cwd(), "bin", "dlp-jipi")` is not reliable; Vercel's working directory during function execution may not be repo root. Fix: use `path.join(__dirname, "../bin/dlp-jipi")` — always relative to the executing file.

4. **Silent auth bypass on clone (P7)** — `WORKER_SECRET` unset means the worker accepts all requests from anyone. This is fail-open and affects every cloned instance where the operator omits the env var. Fix: status page must show a prominent warning when auth is disabled; CLONE documentation must flag this as mandatory.

5. **Stats are per-instance, not per-worker (P1)** — Under load, multiple Lambda instances run in parallel with isolated memory; the status page shows one instance's stats, not aggregate. Fix: label all stats "this instance, since last cold start" — this is a platform constraint, not fixable without external storage, but must be communicated clearly to prevent misinterpretation.

---

## Implications for Roadmap

Research points to a clean two-phase structure. All code changes are Phase 1; all documentation hardening is Phase 2. There is no architectural pivot required — the existing design is correct. The work is incremental improvement on a working foundation.

### Phase 1: Code Rebuild and Stats Hardening

**Rationale:** All critical pitfalls (P1–P4, P6, P9, P10) and all table-stakes feature gaps (F1–F6) are code changes in `api/resolve.js` and `vercel.json`. These are tightly coupled — the composite headline (F1) depends on session stats (F3) which depend on instrumentation at the same handler entry point. They belong in one phase.

**Delivers:** A fully working, honest status page with trustworthy health signals; correct platform config; reliable binary path; Server B connectivity check running in parallel with self-test.

**Addresses:** Features F1 (composite headline), F2 (degraded reason), F3 (session stats), F4 (recent errors), F5 (last attempt), F6 (Server B connectivity check), differentiators D2 (instance age) and D3 (page timestamp).

**Avoids:** P1 (label stats per-instance), P2 (add instance age), P3 (composite headline), P4 (update timeouts), P5 (parallelize self-test + B ping), P6 (fix binary path), P9 (B reachability informational only), P10 (fix `maxDuration` + add explanatory comment), P11 (error truncation), P12 (URL truncation in error log), P13 (warn on default WORKER_ID), P14 (cache self-test result for 30s).

**Required changes:**
- `api/resolve.js`: add module-level stats object, instrument resolve handler, composite headline logic, parallel self-test + B ping, cached self-test, fix binary path, add instance age, privacy-truncate URLs in error log
- `vercel.json`: `maxDuration: 60`
- `package.json`: pin `"engines": { "node": "22.x" }`, ensure `"dependencies": {}`

**Research flag:** No additional research needed — all patterns are verified, all technologies are built-in.

### Phase 2: Documentation Hardening

**Rationale:** The CLONE workflow is a separate concern from code correctness. P7 and P8 are documentation failures that produce misconfigured workers, not code bugs. CLONE.md and the updated SERVER_B_GUIDE.md belong in their own phase, after Phase 1 stabilizes the API contract.

**Delivers:** A numbered checklist CLONE.md with mandatory env var steps, verification checkpoints, and a "Common mistakes" section; an updated SERVER_B_GUIDE.md reflecting the corrected timeout and Fluid Compute reality; `.env.example` updated to include `SERVER_B_URL`.

**Addresses:** P7 (WORKER_SECRET mandatory with warning language), P8 (CLONE.md gaps), P13 (WORKER_ID required with examples).

**Required changes:**
- Create/rewrite `CLONE.md`: numbered checklist, env var table with consequences-if-missing, verification steps, common mistakes
- Update `SERVER_B_GUIDE.md`: reflect `maxDuration: 60`, Fluid Compute, `SERVER_B_URL` connectivity check, corrected timeout values
- Update `.env.example`: add `SERVER_B_URL`

**Research flag:** No additional research needed — patterns are well-defined from architecture research.

### Phase Ordering Rationale

- Phase 1 before Phase 2: documentation references the final API contract (endpoint shapes, response format, env vars). Writing CLONE.md before the code is stable risks describing behavior that changes.
- All Phase 1 items are self-contained: the stats instrumentation, binary path fix, and timeout corrections are non-breaking changes to a single file. No Server B dependency.
- Differentiator D4 (endpoint curl examples on status page) is low effort and could slot into Phase 1 or Phase 2 depending on scheduling preference — it is not a prerequisite for anything.
- D1 (response time percentiles) is explicitly deferred: only build if tail latency emerges as a diagnosed operational problem.

### Research Flags

Phases with standard patterns (skip additional research-phase):
- **Phase 1:** All technologies are Node.js built-ins already in use. Vercel platform behavior verified against official docs. Zero unknowns.
- **Phase 2:** Pure documentation work. Patterns for runbook-style checklists are well-established. No research needed.

No phases require a `gsd:research-phase` step. The research corpus already covers every implementation decision.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All claims verified against official Vercel and Node.js docs as of 2026-02-26. Fluid Compute default since April 2025 is confirmed. Node.js version support matrix is confirmed. |
| Features | HIGH | Features derived from existing working code + clear operator-facing gaps. No speculative features; every item has a concrete "why" tied to a real diagnostic need. |
| Architecture | HIGH | Architecture derived from running production code (`api/resolve.js`) and the existing `SERVER_B_GUIDE.md`. Component boundaries are already established and working. |
| Pitfalls | HIGH | P1–P6, P9–P10 are reproducible from platform constraints and code inspection. P7–P8 are observable from the current auth logic and missing docs. All have concrete prevention strategies. |

**Overall confidence:** HIGH

### Gaps to Address

- **Fluid Compute enablement per-project:** Research confirms Fluid Compute is the default for new projects since April 2025, but it should be explicitly verified in the Vercel dashboard for this specific project before setting `maxDuration: 60`. If it is not enabled, the safe fallback is `maxDuration: 10` with `execFile` timeout at 9s (option B from P4 prevention strategies).
- **Netlify fallback workers:** Research identifies Netlify Functions (free, 26s limit) as a viable fallback platform for workers where Vercel timeouts are too short. If yt-dlp regularly exceeds 10s for certain video sources, building a Netlify-hosted Worker C variant is the mitigation. This is not in scope for Phases 1-2 but should be flagged for Phase 3 if timeout issues emerge in production.
- **Server B and Server A:** Neither is built. Worker C's API contract is the dependency. Once Phase 1 is complete and the contract is stable, Server B can be built independently using the patterns documented in `SERVER_B_GUIDE.md`.

---

## Sources

### Primary (HIGH confidence)
- `api/resolve.js` — existing production code; confirms working patterns
- `.planning/SERVER_B_GUIDE.md` — existing integration contract
- `.planning/PROJECT.md` — project owner's stated requirements and acceptable tradeoffs
- Vercel Functions Limits — https://vercel.com/docs/functions/limitations
- Vercel Fluid Compute — https://vercel.com/docs/fluid-compute
- Vercel Node.js versions — https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel Max Duration Config — https://vercel.com/docs/functions/configuring-functions/duration
- Node.js Globals (fetch) — https://nodejs.org/api/globals.html#fetch

### Secondary (MEDIUM confidence)
- Established serverless pattern: module-level variable persistence in warm Lambda instances — well-documented behavior, multiple sources confirm

### Tertiary (LOW confidence)
- None — no findings in this research rely on single or low-confidence sources

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
