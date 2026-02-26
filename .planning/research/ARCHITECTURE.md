# Architecture Patterns

**Domain:** Vercel serverless worker pool — yt-dlp URL resolver
**Researched:** 2026-02-26
**Confidence:** HIGH (derived from existing working code, Vercel platform constraints, and established stateless patterns)

---

## Recommended Architecture

```
Stremio client
      |
      v
  Server A                         (not built — minimal Stremio-facing API, forwards requests)
      |
      v
  Server B                         (not built — brain, load balancer, cache)
   - Vercel serverless (stateless)
   - Upstash Redis (persistent state)
   - WORKER_URLS env var (worker registry)
      |
      +------+------+------+
      |      |      |      |
      v      v      v      v
    C-1    C-2    C-3   C-N...     (THIS REPO — identical clones)
   Vercel  Vercel  Vercel  Vercel
```

Each Worker C:
- Runs as a Vercel serverless function (one file: `api/resolve.js`)
- Is completely stateless — no DB, no connection to other workers
- Exposes three endpoints: `/` (status), `/health` (JSON), `/resolve` (main)
- Pings Server B URL on status page load to verify connectivity from its end

---

## Component Boundaries

| Component | Responsibility | Owns | Does NOT own |
|-----------|---------------|------|--------------|
| Worker C | Run yt-dlp binary against a URL; return direct stream URL | Binary execution, request auth, response format | State, caching, routing decisions |
| Server B | Route requests to workers, cache results, failover | Worker registry, Redis cache, round-robin counter | yt-dlp logic |
| Server A | Stremio-facing API surface | Stremio addon protocol | Any logic — just forwards |
| Upstash Redis (on B) | Persistent state for a stateless B | Round-robin counter, resolved URL cache, health status | Anything worker-side |

---

## Worker Registry: How Server B Stores the Worker List

**Decision: Env var (CSV string). Not Redis, not a config file.**

Rationale:
- Env vars survive Vercel redeployments without code changes
- Adding a worker = update one env var on B's Vercel project dashboard, redeploy
- Zero infrastructure cost (no additional store needed just for the list)
- CSV is trivially parsed; order determines round-robin sequence

```
WORKER_URLS=https://worker-c1.vercel.app,https://worker-c2.vercel.app,https://worker-c3.vercel.app
WORKER_SECRET=shared-secret-all-workers-use
```

Parse at function startup:

```js
const workers = process.env.WORKER_URLS.split(",").map(u => u.trim()).filter(Boolean);
```

**Alternative considered: Redis-stored worker list.** Rejected because it adds a write step when adding a worker (have to insert into Redis, not just update a Vercel env var), and the list rarely changes — it does not need real-time mutability.

---

## Data Flow

### Happy path (cache hit)

```
Server B receives request
  → Check Redis: resolve:{videoUrl}
  → Cache hit → return cached URL immediately
  → Worker never contacted
```

### Happy path (cache miss)

```
Server B receives request
  → Check Redis: miss
  → Increment Redis counter (atomic INCR)
  → Pick worker: workers[counter % workers.length]
  → GET {workerUrl}/resolve?url={encoded} + Authorization: Bearer {secret}
  → Worker runs yt-dlp binary (up to 20s)
  → Worker returns { url, worker_id }
  → B writes to Redis: SET resolve:{videoUrl} {directUrl} EX 18000 (5 hours)
  → B returns directUrl to Server A / Stremio
```

### Failover path

```
Server B picks worker at index N
  → Worker fails (timeout, 5xx, network error)
  → B tries worker at index N+1 (same loop, no re-roll of counter)
  → Repeat until one succeeds or all exhausted
  → If all fail: return error to caller
```

### Health check flow

```
Server B (periodic, e.g. every 60s via cron or on-demand)
  → GET {workerUrl}/health for each worker
  → Parse: { status: "ok" | "error", worker_id, yt_dlp_version, region, timestamp }
  → HTTP 200 = healthy, HTTP 503 = degraded
  → Write result to Redis: SET health:{workerUrl} {ok|fail} EX 120
  → On routing: skip workers with known fail status; treat unknown as healthy
```

### Worker → Server B connectivity check flow

```
Worker C status page requested (GET /)
  → Worker reads SERVER_B_URL env var
  → Worker makes GET {SERVER_B_URL}/health (or any lightweight B endpoint)
  → Displays "Server B: reachable" or "Server B: unreachable — {error}" on status page
  → Diagnostic only — no effect on routing behavior
```

---

## Component: Worker C

### Endpoints

| Path | Auth | Returns | Notes |
|------|------|---------|-------|
| `GET /` | None | HTML status page | Runs self-test; shows in-memory stats, B connectivity |
| `GET /health` | None | JSON `{status, worker_id, yt_dlp_version, region, timestamp}` | HTTP 200 or 503 |
| `GET /resolve?url=X` | Bearer token | JSON `{url, worker_id}` or `{error, detail, worker_id}` | HTTP 200 or 4xx/5xx |

### In-memory stats (session-only, resets on cold start)

Stored as module-level variables in `api/resolve.js` — persist for the lifetime of the warm Lambda:

```js
let stats = {
  requestCount: 0,
  successCount: 0,
  failCount: 0,
  totalDurationMs: 0,
  lastAttempt: null,   // { timestamp, url, success, durationMs }
  recentErrors: [],    // last 10 errors: [{ timestamp, url, detail }]
};
```

These are displayed on the status page. They are not sent to Server B. They are not cached anywhere. Cold start resets them to zero — acceptable per PROJECT.md ("session-only is sufficient for diagnostics").

### Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `WORKER_ID` | Yes | `"worker"` | Unique name in all responses |
| `WORKER_SECRET` | Recommended | `""` (auth disabled) | Shared Bearer token |
| `SERVER_B_URL` | For connectivity check | `""` (check skipped) | B's base URL, used in status page only |

---

## Component: Server B

Server B is not in this repo, but the architecture decisions made in Worker C constrain what B must do. These are documented here to inform SERVER_B_GUIDE.md.

### What B must implement

| Concern | Storage | Complexity | Notes |
|---------|---------|------------|-------|
| Worker list | Env var `WORKER_URLS` | Trivial | CSV, split at startup |
| Round-robin counter | Upstash Redis `INCR worker:counter` | Easy | Atomic — safe on stateless B |
| URL cache | Upstash Redis `GET/SET resolve:{url}` | Easy | TTL = 5 hours (18000s) |
| Auth forwarding | Header `Authorization: Bearer {WORKER_SECRET}` | Trivial | Same secret all workers share |
| Failover | Loop in `resolveWithFallback()` | Easy | Try next on any error |
| Health cache (optional) | Upstash Redis `GET/SET health:{url}` | Medium | Periodic cron or lazy check |

### What B explicitly does NOT need to do

- Know anything about yt-dlp — workers own that entirely
- Store per-worker state — workers are identical and interchangeable
- Maintain a worker count or version — not needed for routing
- Implement per-worker secrets — one shared secret is sufficient

---

## Patterns to Follow

### Pattern 1: Stateless Worker, Stateful Coordinator

Workers hold zero state between requests. All routing intelligence (counter, health status, cache) lives in the coordinator (Server B + Redis). This is the correct pattern for Vercel serverless workers.

Consequence: Workers can be added, removed, or replaced without any coordination protocol. B just updates its env var list.

### Pattern 2: Fail-forward Failover

B's failover loop starts at the round-robin index and walks forward through the worker array. The worker that was picked first gets an honest attempt before fallback. If worker N is persistently broken, it will still be tried first on its turns — until health cache marks it unhealthy.

This is acceptable. The alternative (pre-filtering unhealthy workers before picking) requires the health cache to be warm, adding complexity on a cold-start B.

### Pattern 3: Optimistic Health Status

Treat unknown health status as "healthy, try it." Only skip a worker if Redis has an explicit `fail` record for it. A fresh B deployment will try all workers without waiting for a health scan — the correct default.

### Pattern 4: Module-level Stats in Serverless

In Node.js Vercel functions, module-level variables persist for the duration of a warm Lambda instance. They survive multiple requests to the same warm instance but reset on cold start. This is reliable enough for diagnostic stats — not reliable for anything that must persist.

```js
// Top of api/resolve.js — module scope
const stats = { requestCount: 0, ... };

// In handler
stats.requestCount++;
```

Correct and simplest implementation. No external store needed.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Worker-side Caching

**What goes wrong:** Worker C caches resolved URLs in its own memory.
**Why it happens:** Seems like an optimization to avoid repeated yt-dlp calls.
**Consequences:** Workers are stateless replicas. Cached data on worker-c1 is invisible to worker-c2. Cold starts drop the cache entirely.
**Prevention:** Cache exclusively in Server B's Redis layer. Workers never cache.
**Detection:** If you see Redis or any persistent store initialized inside resolve.js, it's wrong.

### Anti-Pattern 2: Redis-stored Worker Registry

**What goes wrong:** The list of worker URLs stored in Redis instead of as an env var.
**Prevention:** Env vars are the Vercel-native mechanism for deployment config. CSV env var on Server B. Redeploy B to apply changes.

### Anti-Pattern 3: Per-worker Health Polling from Workers

**What goes wrong:** Each Worker C polls the others to detect failures.
**Prevention:** Workers have no knowledge of each other. Health polling belongs exclusively in Server B.

### Anti-Pattern 4: Blocking Stats via Full Resolve Test

**What goes wrong:** The status page runs a full yt-dlp resolve against a live video URL.
**Prevention:** Run `yt-dlp --version` only (fast, < 1s). The existing `runSelfTest()` already does this correctly. Never hit a live video URL from the status page.

### Anti-Pattern 5: Unchecked SERVER_B_URL on Worker Side

**What goes wrong:** Worker C pings `SERVER_B_URL` without checking if the env var is set — produces "unreachable" error when B just is not configured yet.
**Prevention:** If `SERVER_B_URL` is not set or not a valid HTTP(S) URL, show "Server B: not configured" on the status page (neutral, not error).

---

## "Add a New Worker" Checklist

The definitive sequence. No step can be skipped.

**On Worker C side (the new clone):**

- [ ] Clone the Worker C repo (or fork it) to a new directory
- [ ] Deploy as a **new Vercel project** (different project name = different URL; same repo is fine)
- [ ] Set these env vars in the new Vercel project's settings:
  - `WORKER_ID` = `worker-c{N}` — unique, no two workers share an ID
  - `WORKER_SECRET` = same value as all existing workers
  - `SERVER_B_URL` = Server B's base URL (for the connectivity check on the status page)
- [ ] Open the new worker's URL in a browser
- [ ] Confirm: green dot, ONLINE headline, self-test pass, yt-dlp version shown
- [ ] Note the new worker's deployment URL (e.g. `https://worker-c3-abc123.vercel.app`)

**On Server B side:**

- [ ] Go to Server B's Vercel project → Settings → Environment Variables
- [ ] Find `WORKER_URLS` and append the new URL (comma-separated, no spaces):
  ```
  WORKER_URLS=https://worker-c1.vercel.app,https://worker-c2.vercel.app,https://worker-c3-abc123.vercel.app
  ```
- [ ] Save the env var
- [ ] Redeploy Server B (env var changes do not apply to live deployments without a redeploy)
- [ ] Confirm: send a test request and observe `worker_id` in the response to verify the new worker is being routed to

No code changes in any repo.

---

## Build Order Implications

```
Worker C (this repo)  →  Server B  →  Server A
```

**Worker C's API contract must be stable before Server B is built.** The three endpoint shapes, the auth scheme, and the `worker_id` field in all responses must be locked in.

**Current milestone (this repo only) — all items are self-contained:**

1. Rebuild `api/resolve.js` cleanly — no external dependencies
2. Add in-memory stats to status page — no external dependencies
3. Add Server B connectivity check on status page — requires `SERVER_B_URL` env var, but degrades gracefully to "not configured" if absent
4. Rewrite `SERVER_B_GUIDE.md` — pure documentation, no code dependencies

All four items can be developed and tested without Server B running.

**Server A can be built in parallel with Server B** but cannot be fully tested until B is running.

---

## Scalability Considerations

| Constraint | Limit | Impact | Mitigation |
|------------|-------|--------|------------|
| Vercel hobby timeout | 10s per function | yt-dlp can exceed 10s on slow sites | Add Netlify Function workers (free, 26s limit); B routes to them identically |
| Vercel concurrent executions | Undisclosed, limited on hobby | Queue buildup under burst traffic | Add more Worker C clones; B distributes load automatically |
| Upstash Redis free tier | 10,000 commands/day | Fine for personal use | 5-hour URL cache dramatically reduces Redis calls |
| Cold starts | Every ~5–15min idle | First request after idle is slow | Acceptable for personal/hobby use |

At the scale this system targets (personal Stremio use), these limits are not binding.

---

## Sources

- `api/resolve.js` (HIGH confidence — running production code)
- `.planning/SERVER_B_GUIDE.md` (HIGH confidence — existing integration contract for this project)
- `.planning/PROJECT.md` (HIGH confidence — project owner's stated requirements)
- Vercel Node.js serverless: module-level variable persistence in warm Lambdas (HIGH confidence — established serverless platform behavior)
- Upstash Redis INCR for atomic counters on stateless servers (HIGH confidence — standard documented pattern)
