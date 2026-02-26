# Technology Stack

**Project:** Worker C — yt-dlp Resolver
**Researched:** 2026-02-26
**Scope:** Vercel serverless Node.js worker with in-memory stats, external connectivity check, and multi-content-type status page

---

## Recommended Stack

### Core Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22.x | Serverless function runtime | LTS, stable built-in `fetch`, stable `URL`, no deps needed. Default is 24.x but 22.x is the safer LTS choice until 24 stabilizes. Pin via `package.json` `engines.node`. |
| CommonJS (`"type": "commonjs"`) | — | Module format | Already used; Vercel's `module.exports` handler pattern works cleanly. No reason to switch to ESM for a single-file worker. |

**Confidence: HIGH** — verified against Vercel Node.js versions docs (2026-02-26). Available versions: 20.x, 22.x, 24.x (default).

### Vercel Platform

| Technology | Version / Setting | Purpose | Why |
|------------|-------------------|---------|-----|
| Vercel Functions (Node.js runtime) | current | HTTP request handling | Already deployed here; no migration cost |
| Fluid Compute | enabled (default since April 2025) | Warm instance concurrency, 300s timeout on Hobby | Changes the instance model — see Warm Instance Behavior below |
| `vercel.json` functions config | v2 | Set `maxDuration` | Set to 60 (safe for yt-dlp); fluid compute makes this workable on Hobby |

**Confidence: HIGH** — verified against Vercel Functions Limits and Fluid Compute docs (2026-02-26).

### In-Memory Stats

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Module-level plain object | Node.js built-in | Track request count, avg response time, recent errors per warm instance | Correct tool for session-scoped stats. No package needed. Survives across requests within one warm instance lifetime. Resets on cold start — which is the stated acceptable behavior. |

**Pattern:**
```javascript
// Module scope — initialized once per warm instance
const stats = {
  requests: 0,
  totalDurationMs: 0,
  lastResolveAt: null,       // ISO string or null
  lastResolveSuccess: null,  // true | false | null
  recentErrors: [],          // last 10 error strings, newest-first
};
```

**Why this works on Vercel fluid compute:** Fluid compute (enabled by default since April 2025) allows multiple requests to share a single function instance concurrently. The Node.js process and its module-level variables persist across requests within that instance's lifetime. Stats accumulate across all requests hitting that warm instance. On a cold start, stats reset to zero — which PROJECT.md explicitly lists as acceptable.

**Why NOT a class or singleton pattern:** Unnecessary abstraction for a single-file worker. A plain module-level object is simpler, readable, and serves the same purpose.

**Confidence: HIGH** — Vercel Fluid Compute docs explicitly state "multiple invocations can share the same physical instance (a global state/process) concurrently."

### Circular Buffer for Recent Errors

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Manual array slice (built-in) | Node.js built-in | Cap recent errors at 10 | No dependency. Two lines of code. |

**Pattern:**
```javascript
function recordError(message) {
  stats.recentErrors.unshift(String(message).slice(0, 300));
  if (stats.recentErrors.length > 10) {
    stats.recentErrors.length = 10;  // truncate in-place, no allocation
  }
}
```

### External Connectivity Check (Worker C pings Server B)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Global `fetch()` with `AbortController` | Node.js 22 built-in (stable since v21.0.0) | Ping `SERVER_B_URL` to verify connectivity | Built-in since Node 18+, stable since Node 21. No `node-fetch` package needed. `AbortController` provides clean timeout without extra deps. |

**Pattern:**
```javascript
async function checkServerB(serverBUrl) {
  if (!serverBUrl) return { reachable: false, error: "SERVER_B_URL not configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(serverBUrl + "/health", { signal: controller.signal });
    clearTimeout(timer);
    return { reachable: res.ok, statusCode: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { reachable: false, error: err.name === "AbortError" ? "timeout (3s)" : String(err.message) };
  }
}
```

**Why NOT node-fetch:** `node-fetch` v3 is ESM-only, causing friction with CommonJS. The built-in `fetch` eliminates the dependency entirely.

**Why NOT axios:** ~40KB + sub-deps for a single outbound ping. Overkill.

**Why NOT http.request:** Lower-level, more verbose, no built-in promise support. Global `fetch` is the 2026 idiomatic choice.

**Confidence: HIGH** — verified against Node.js globals documentation. `fetch()` added in v17.5/v16.15, stabilized (non-experimental) in v21.0.0.

### HTML + JSON from a Single File

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Inline template string (HTML) | Node.js built-in | Generate status page HTML | Already proven in existing code. No templating engine needed for a single-page status view. |
| `JSON.stringify()` | Node.js built-in | Generate all JSON responses | Sufficient. No serialization library needed. |
| Pathname-based dispatch | Node.js built-in `URL` | Route `/`, `/health`, `/resolve` to different response types | Already used in existing code. Correct pattern for a single-file multi-endpoint function. |

**Why NOT a framework (Express, Fastify, Hono):** A framework adds a dependency, a build step concern, and cognitive overhead for a single file with three routes. The existing `if (pathname === ...)` pattern is readable and correct. The owner explicitly wants to understand every line.

**Why NOT separate files per endpoint:** Splitting would require inter-file state sharing for in-memory stats. Keeping everything in one file keeps the stats object simple and guarantees all requests hit the same module scope.

**Confidence: HIGH** — the existing code already demonstrates this working correctly.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP fetch | Built-in `fetch()` + `AbortController` | `node-fetch` v3 | ESM-only in v3, breaks CommonJS without config |
| HTTP fetch | Built-in `fetch()` + `AbortController` | `axios` | ~40KB + sub-deps for a single outbound ping |
| Stats store | Module-level plain object | Upstash Redis | Out of scope per PROJECT.md; stats are session-only by design |
| Stats store | Module-level plain object | `lru-cache` npm package | Unnecessary; a 10-item array capped manually is simpler |
| Routing | Pathname if/else | Express | Adds a dep; unnecessary for 3 routes |
| Routing | Pathname if/else | Hono | Modern but still a dep; same problem |
| HTML rendering | Template literal | Handlebars / EJS | Overkill for one status page |
| Node.js version | 22.x | 24.x (Vercel default) | Newer major may have minor ecosystem rough edges; 22.x is stable LTS |
| Node.js version | 22.x | 20.x | Works but misses stable built-in `fetch` (unflagged in 21) |

---

## Critical Platform Corrections

The existing `STACK.md` in `.planning/codebase/` contains two outdated claims:

### 1. The 10-second timeout is outdated

**Old claim:** "Vercel free tier caps at 10 seconds; Pro tier required for 20s"

**Current reality (verified 2026-02-26):**
- Fluid compute is **enabled by default** for all new Vercel projects since April 23, 2025.
- With fluid compute enabled, Hobby tier gets **300s (5 minutes)** default and max duration.
- Without fluid compute: Hobby default is 10s, max is 60s.
- The current `vercel.json` `maxDuration: 20` does NOT require Pro. It is within Hobby limits.
- Recommend updating to `maxDuration: 60` for yt-dlp safety margin.

**Confidence: HIGH** — verified against Vercel duration limits docs (2026-02-26).

### 2. Node.js version is outdated

**Old claim:** "Node.js 18+ (implied by Vercel serverless functions)"

**Current reality (verified 2026-02-26):**
- Vercel currently supports: 20.x, 22.x, 24.x (default). Node.js 18.x is no longer listed.
- Pin explicitly: add `"engines": { "node": "22.x" }` to `package.json`.

**Confidence: HIGH** — verified against Vercel Node.js versions docs (2026-02-26).

---

## Warm Instance Behavior (Critical for Stats Design)

With fluid compute enabled (the 2026 default):

- A single physical instance can serve **multiple concurrent requests**.
- Module-level variables persist for the **lifetime of that instance**.
- Instance lifetime is unpredictable — Vercel scales up and down based on traffic.
- A cold start → module re-initializes → stats reset to zero (acceptable per PROJECT.md).
- JavaScript's single-threaded event loop prevents actual data races on counter increments (no mutex needed). Averages are approximations across async gaps, not exact atomic values.

**Implication for stats tracking:**
- Use simple integer counters and running totals.
- Calculate averages at read time (divide total by count), not at write time.
- Label stats clearly as "since last cold start."

**Confidence: HIGH** — Vercel Fluid Compute docs: "multiple invocations can share the same physical instance (a global state/process) concurrently."

---

## New Environment Variable Required

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `SERVER_B_URL` | No | `https://server-b.vercel.app` | Base URL for Worker C to Server B connectivity check. If unset, status page shows "not configured." |

Existing variables (`WORKER_ID`, `WORKER_SECRET`) unchanged.

---

## Zero External Dependencies

This project should remain at `"dependencies": {}`. Every capability needed is available in Node.js 22 built-ins:

| Need | Built-in |
|------|---------|
| Child process (yt-dlp) | `child_process.execFile` |
| URL parsing | `URL` global |
| Outbound HTTP | `fetch()` global |
| Timeout/abort | `AbortController` global |
| Path resolution | `path` built-in |
| HTML escaping | Manual replace chain |
| JSON | `JSON.stringify` built-in |

---

## Required Changes to vercel.json

```json
{
  "functions": {
    "api/*.js": {
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/resolve" }
  ]
}
```

## Required Changes to package.json

```json
{
  "name": "worker-c",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "engines": { "node": "22.x" },
  "dependencies": {}
}
```

---

## Sources

| Source | URL | Confidence |
|--------|-----|-----------|
| Vercel Node.js runtime docs | https://vercel.com/docs/functions/runtimes/node-js | HIGH |
| Vercel Node.js version docs | https://vercel.com/docs/functions/runtimes/node-js/node-js-versions | HIGH |
| Vercel Function Limits | https://vercel.com/docs/functions/limitations | HIGH |
| Vercel Max Duration Config | https://vercel.com/docs/functions/configuring-functions/duration | HIGH |
| Vercel Fluid Compute | https://vercel.com/docs/fluid-compute | HIGH |
| Node.js Globals — fetch() | https://nodejs.org/api/globals.html#fetch | HIGH |
