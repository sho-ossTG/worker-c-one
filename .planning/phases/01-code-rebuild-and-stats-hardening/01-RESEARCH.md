# Phase 1: Code Rebuild and Stats Hardening - Research

**Researched:** 2026-02-26
**Domain:** Vercel serverless Node.js — platform configuration, in-module state, HTML status page
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**WORKING/DEGRADED/IDLE logic**
- Three headline states: IDLE (no resolves yet this session), WORKING, DEGRADED
- IDLE: Binary self-test passed but zero resolve attempts — fresh cold start, no traffic yet
- WORKING: Binary self-test passed AND no resolve failures have occurred this session
- DEGRADED: Any resolve failure this session triggers DEGRADED immediately — stays DEGRADED until a successful resolve clears it (self-healing)
- Binary failure vs resolve failure are visually distinct: Different color/label — e.g. "BINARY ERROR" vs "RESOLVE ERROR" — not the same DEGRADED appearance
- Self-heals: A successful resolve after failures clears DEGRADED back to WORKING

**Stats display**
- Stats appear in a separate section with a header (e.g. "Session Stats") — not mixed into the static info rows
- Static info (worker ID, region, binary, version, auth) stays in the existing row format above
- Stats section is below the static info
- Instance uptime displays as human-readable duration (e.g. "4 min 12 sec since cold start")

**Error log**
- Collapsed by default — shows a count row (e.g. "Recent errors: 3") that expands on click
- Each error entry shows: timestamp, URL prefix (first 60 chars), error message (truncated ~300 chars)
- Response time NOT included per entry
- Error log section appears after the stats section

### Claude's Discretion
- Exact HTML/CSS for the collapsible error log (inline JS toggle is fine, no external deps)
- Spacing, typography, color choices within the existing dark theme
- Exact truncation display (e.g. "url..." suffix)
- Self-test cache duration (30s recommended by research)
- Comment style and density in the rebuilt code

### Deferred Ideas (OUT OF SCOPE)
- Server B connectivity check (Worker C pings SERVER_B_URL) — deferred to v2 per requirements scoping
- Code comments/explanatory annotations — user did not select this area; Claude has discretion
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONF-01 | `vercel.json` sets `maxDuration: 60` to use Fluid Compute headroom on Hobby tier | Platform timing section: with Fluid Compute enabled on Hobby, 60s is valid (max is 300s). Setting 60 explicitly is a conservative, safe choice. |
| CONF-02 | `execFile` timeout updated to match `vercel.json` — no silent mismatch between config and code | Platform timing section: execFile timeout must be strictly less than maxDuration (leave ~2-3s gap for response overhead). |
| CONF-03 | `package.json` pins `"engines": { "node": "22.x" }` so Vercel uses correct Node.js LTS version | Node.js versions section: `22.x` is fully supported; `engines` field in package.json overrides dashboard setting. |
| PAGE-01 | Status page shows WORKING/DEGRADED headline based on real resolve outcomes | In-module state section: module-level variables survive across requests on warm instances; state machine pattern documented. |
| PAGE-02 | When DEGRADED, status page shows specific reason with actual error text | In-module state section: store last error string in module-level variable; render it in HTML. |
| PAGE-03 | Status page shows in-session stats: total requests, error count, avg response time — labeled "this instance, since last cold start" | In-module state section: module-level counters; running sum for avg calculation. |
| PAGE-04 | Status page shows instance uptime / age since cold start | In-module state section: `Date.now()` at module load time; subtract on each page render. |
| PAGE-05 | Status page shows recent errors log: last 10 resolve failures with timestamp, truncated URL, error message | In-module state section: circular buffer (capped array) pattern; HTML rendering with collapsible section. |
| PAGE-06 | Status page shows last resolve attempt: timestamp, success/fail, response time in ms | In-module state section: store lastResolve object {timestamp, ok, durationMs} in module-level variable. |
</phase_requirements>

---

## Summary

This phase rebuilds `api/resolve.js` to add honest health reporting and session statistics. The technical domain is narrow: a single-file Node.js serverless function on Vercel with no new dependencies. The two key knowledge areas are (1) Vercel platform configuration — specifically Fluid Compute's impact on `maxDuration` limits and how to pin the Node.js version — and (2) in-module state patterns, which are the correct mechanism for per-instance session stats in a serverless environment.

The most important platform finding is that **Fluid Compute is now enabled by default for new Vercel projects** (as of April 23, 2025). Under Fluid Compute on the Hobby tier, `maxDuration` can reach up to 300 seconds (default is also 300s). The requirement CONF-01 specifies 60 seconds, which is a valid conservative choice within this ceiling — it is not the maximum available. The current `vercel.json` has `maxDuration: 20` and the code has a 20s execFile timeout; both need updating.

The status page additions (session stats, error log, state machine) all use module-level JavaScript variables. In Vercel's Fluid Compute model, multiple concurrent requests share the same Node.js process instance, so module-level state IS shared across those requests — this is the intended and documented behavior. The key pattern is: initialize counters at module load time, update them inside the request handler, read them when rendering the status page.

**Primary recommendation:** Rebuild `api/resolve.js` in a single pass — add module-level state variables at the top, wrap `runYtDlp` calls with timing and state updates, then rewrite `renderStatusPage` to incorporate the three-section layout (static info, session stats, error log).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins only | 22.x | child_process, path, URL, Date | No new npm dependencies — locked decision |

No new npm packages are required or permitted for this phase. All features are implementable with the existing built-ins already used in `api/resolve.js`.

### Supporting (existing, already in codebase)
| API | Usage | Notes |
|-----|-------|-------|
| `child_process.execFile` | Run yt-dlp binary | Timeout must be updated to match vercel.json |
| `Date.now()` / `new Date()` | Timestamps, uptime | Module load time captured once at startup |
| `URL` | Parse incoming request URL | Already used in handler |
| HTML `<details>`/`<summary>` | Collapsible error log | Native browser element, zero JS required |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<details>`/`<summary>` | Inline JS toggle (onclick + style.display) | Either works. `<details>` is simpler, no JS. Inline JS gives more styling control. CONTEXT.md says inline JS is fine — either is acceptable. |
| Module-level array (capped at 10) | Circular buffer class | Simple capped array is sufficient for 10 entries; no need for a class. |

**Installation:** No packages to install. This phase has no new dependencies.

---

## Architecture Patterns

### Recommended File Structure (unchanged)
```
api/
└── resolve.js        # single file — all changes confined here
vercel.json           # maxDuration update
package.json          # engines field addition
```

All changes in this phase are confined to these three files. No new files are created.

### Pattern 1: Module-Level State Initialization

**What:** Declare all mutable session state as module-level `let` variables, initialized when the module first loads (cold start). The request handler mutates these variables.

**When to use:** Any data that must persist across multiple invocations on the same warm instance — counters, timestamps, recent error log.

**Why it works on Vercel:** With Fluid Compute enabled (default as of April 2025), Vercel keeps the Node.js process alive and may serve multiple requests from the same instance concurrently. Module-level variables persist for the lifetime of that instance, which is exactly the "since last cold start" scope required by the requirements.

**Example:**
```javascript
// At module top — runs once per cold start
const COLD_START = Date.now();

let totalRequests = 0;
let errorCount = 0;
let totalDurationMs = 0;

let lastResolve = null; // { timestamp, ok, durationMs }
let resolveErrors = []; // capped at 10 entries

// State machine: "idle" | "working" | "degraded"
let resolveState = "idle";
let lastResolveError = null; // error text when degraded
```

### Pattern 2: State Update Wrapper (Timing + State Machine)

**What:** Wrap the `runYtDlp` call with timing logic and state updates. Do NOT put state logic inside `runYtDlp` itself — keep the core function pure.

**Example:**
```javascript
// In the /resolve handler, replace: const directUrl = await runYtDlp(inputUrl);
// with:

totalRequests++;
const t0 = Date.now();
let directUrl;
try {
  directUrl = await runYtDlp(inputUrl);
  const durationMs = Date.now() - t0;
  totalDurationMs += durationMs;
  lastResolve = { timestamp: new Date().toISOString(), ok: true, durationMs };
  // Self-heal: clear degraded state on success
  if (resolveState === "degraded") resolveState = "working";
  else if (resolveState === "idle") resolveState = "working";
} catch (e) {
  const durationMs = Date.now() - t0;
  totalDurationMs += durationMs;
  errorCount++;
  const errText = String(e && e.message ? e.message : e).slice(0, 1200);
  lastResolve = { timestamp: new Date().toISOString(), ok: false, durationMs };
  lastResolveError = errText;
  resolveState = "degraded";
  // Append to error log, cap at 10
  resolveErrors.push({
    timestamp: new Date().toISOString(),
    url: String(inputUrl).slice(0, 60),
    error: errText.slice(0, 300),
  });
  if (resolveErrors.length > 10) resolveErrors.shift();
  // Re-throw so the existing HTTP error response path still works
  throw e;
}
```

### Pattern 3: Human-Readable Uptime Duration

**What:** Convert milliseconds since cold start to a readable string.

**Example:**
```javascript
function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s since cold start`;
  if (m > 0) return `${m}m ${s}s since cold start`;
  return `${s}s since cold start`;
}

// Usage in renderStatusPage:
// const uptime = formatUptime(Date.now() - COLD_START);
```

### Pattern 4: Self-Test Cache

**What:** Cache the binary self-test result for 30 seconds so that `/health` polls and status page loads don't spawn a new yt-dlp process on every request.

**Why:** yt-dlp --version takes ~100-500ms. Without caching, each `/health` poll (polled frequently by Server B) spawns a new child process. 30s TTL is a safe balance between freshness and overhead.

**Example:**
```javascript
let selfTestCache = null;
let selfTestExpiry = 0;

async function runSelfTestCached() {
  if (selfTestCache && Date.now() < selfTestExpiry) return selfTestCache;
  const result = await runSelfTest();
  selfTestCache = result;
  selfTestExpiry = Date.now() + 30_000; // 30 seconds
  return result;
}
```

Note: Caching the self-test is listed in requirements as a v2 item (DIAG-01), but implementing it now is low-risk and prevents unnecessary child process spawning during this phase's testing. Claude has discretion on this.

### Pattern 5: Collapsible Error Log (Native HTML)

**What:** Use `<details>`/`<summary>` for zero-JS collapse behavior. The summary line shows the count; clicking expands the list.

**Example:**
```html
<details>
  <summary style="cursor:pointer; color:#555; font-size:0.85rem; padding:9px 0; border-bottom:1px solid #141414;">
    Recent errors: ${resolveErrors.length}
  </summary>
  <div class="error-log">
    ${resolveErrors.map(e => `
      <div class="error-entry">
        <span class="err-time">${escapeHtml(e.timestamp)}</span>
        <span class="err-url">${escapeHtml(e.url)}${e.url.length >= 60 ? '…' : ''}</span>
        <span class="err-msg">${escapeHtml(e.error)}${e.error.length >= 300 ? '…' : ''}</span>
      </div>
    `).reverse().join('')}
  </div>
</details>
```

Note: `.reverse()` shows newest error first without mutating the `resolveErrors` array.

### Pattern 6: Headline State Colors

**What:** Three visual states, each with a distinct color. The dot, card border, and title text all use this color.

| State | Color | Label | Dot animation |
|-------|-------|-------|---------------|
| IDLE | `#888888` (grey) | `WORKER_ID — IDLE` | none |
| WORKING | `#00ff5a` (green) | `WORKER_ID — WORKING` | blinking |
| DEGRADED (resolve failure) | `#ff4444` (red) | `WORKER_ID — DEGRADED` | none |
| BINARY ERROR | `#ff8800` (orange) | `WORKER_ID — BINARY ERROR` | none |

The existing code uses a binary ok/not-ok color derived from the self-test. The new code derives color from the composite state (self-test + resolve outcomes).

### Anti-Patterns to Avoid

- **Putting state updates inside `runYtDlp`:** Keep the core function pure. State updates belong in the handler where context (inputUrl) is available.
- **Using the self-test result as the headline status:** The self-test only checks the binary, not whether resolves actually succeed. WORKING/DEGRADED must be based on resolve outcomes.
- **Making `resolveErrors` grow unbounded:** Always cap at 10 entries with `.shift()` when length exceeds 10.
- **Calling `runSelfTest()` on every `/health` request:** Without caching, high-frequency health polls spawn many child processes. Cache for 30s.
- **Computing uptime inside the HTML template string:** Extract to a named function for readability.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible UI | Custom JS accordion | Native `<details>`/`<summary>` | Zero JS, cross-browser, accessible |
| Uptime formatting | Date-fns or moment | 10-line custom `formatUptime()` | No new deps; the problem is simple enough |
| Circular buffer | Ring buffer class | Array with `.shift()` when length > 10 | 10 entries maximum; a class is overkill |
| Self-test caching | External cache/Redis | Module-level variable with expiry timestamp | In-memory is sufficient; 30s TTL covers the need |

**Key insight:** This is a single-file, no-dependency serverless function. Every "library" answer should be a few lines of vanilla JS. The complexity ceiling is low.

---

## Common Pitfalls

### Pitfall 1: Setting maxDuration Without Fluid Compute Enabled

**What goes wrong:** If the Vercel project was created before April 23, 2025 and Fluid Compute was not manually enabled, setting `maxDuration: 60` in vercel.json will work — because without Fluid Compute, Hobby tier allows up to 60s. But if Fluid Compute IS enabled (default for new projects), 60s is fine (ceiling is 300s). The risk is the inverse: if someone reads the requirement as "set to 60 because that's the Fluid Compute limit," that's wrong — 60 is just the conservative chosen value.

**Why it happens:** The requirements say "maxDuration: 60 to use Fluid Compute headroom" — this phrasing implies 60 is a Fluid Compute value. It is not. Fluid Compute on Hobby allows 300s. 60s was chosen as a reasonable upper bound for yt-dlp runs.

**How to avoid:** Set `maxDuration: 60` and also set `"fluid": true` in vercel.json to explicitly declare Fluid Compute intent. The execFile timeout should be 57s (3s less than maxDuration for response overhead).

**Warning signs:** yt-dlp calls timing out at exactly 10s (Fluid Compute not enabled, falling back to default without explicit configuration).

### Pitfall 2: execFile Timeout Greater Than or Equal to maxDuration

**What goes wrong:** If `execFile` timeout >= `maxDuration`, the Vercel platform kills the function before Node.js can return the timeout error. The caller gets a 504, not a clean JSON error. The function appears to hang rather than fail cleanly.

**Why it happens:** Developers set both to the same value thinking they match. They don't account for the overhead between execFile completion and response write.

**How to avoid:** Set execFile timeout to `maxDuration - 3000ms` (3 second buffer). With `maxDuration: 60`, set execFile to `57000` ms.

**Warning signs:** Requests that take exactly 60s returning 504 FUNCTION_INVOCATION_TIMEOUT instead of a JSON error body.

### Pitfall 3: Module-Level State Not Resetting on Cold Start

**What goes wrong:** Developer assumes state persists between deployments or is somehow global across all instances. It is not — state is per-instance, reset on each cold start (new process). This is correct behavior for "since last cold start" stats.

**Why it happens:** Confusion about Vercel's execution model. With Fluid Compute, multiple requests share one instance (state persists). But each cold start (new instance) begins fresh.

**How to avoid:** The code is already correct as long as state variables are declared at module scope (not inside the handler). The label "since last cold start" accurately describes what users will see.

**Warning signs:** N/A — this is the intended behavior.

### Pitfall 4: Self-Test Result Driving Headline State

**What goes wrong:** The existing code uses the binary self-test result (`test.ok`) as the only signal for ONLINE/DEGRADED. If the binary runs fine but yt-dlp consistently fails to resolve URLs (e.g., cookies expired, rate-limited, site changed), the page shows ONLINE.

**Why it happens:** Original design only checked binary presence, not actual resolve success.

**How to avoid:** The headline state machine uses `resolveState` (derived from real resolve outcomes), NOT the self-test. The self-test result still appears as its own row in the static info section ("Self-test: pass/fail"). Only the composite headline changes based on resolves.

**Warning signs:** Status page shows WORKING while `/resolve` calls are returning errors.

### Pitfall 5: State Update Race Condition on Concurrent Requests

**What goes wrong:** With Fluid Compute's in-function concurrency, two resolve requests can run simultaneously. Both read `totalRequests`, both add 1, both write back — result is `totalRequests` incremented by 1 instead of 2.

**Why it happens:** JavaScript is single-threaded but `await` yields. Two requests both `await runYtDlp()` simultaneously. The `totalRequests++` before the await is safe (synchronous). The state updates after the await could interleave.

**How to avoid:** In practice this is low-risk for a worker with low concurrency. The stats are labeled "approximate" if needed. For correctness: all state mutations are synchronous (no `await` between read and write of counters), so they are effectively atomic within a single JS tick. The `totalRequests++` executes synchronously before the `await`, which is safe.

**Warning signs:** Counter values that seem slightly off under high concurrency load. Acceptable for diagnostic stats.

---

## Code Examples

Verified patterns for this implementation:

### vercel.json After Update
```json
{
  "version": 2,
  "fluid": true,
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

Source: https://vercel.com/docs/fluid-compute (fluid property), https://vercel.com/docs/functions/configuring-functions/duration (maxDuration in vercel.json)

### package.json After Update
```json
{
  "name": "worker-c",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "engines": {
    "node": "22.x"
  },
  "dependencies": {}
}
```

Source: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

### execFile Timeout Calculation
```javascript
// maxDuration in vercel.json: 60 seconds
// Leave 3 seconds of buffer for response overhead
// execFile timeout: 57 seconds = 57000 ms
execFile(BINARY, [...args], { timeout: 57000, maxBuffer: 1024 * 1024 }, callback);
```

### Full Module-Level State Block (top of resolve.js)
```javascript
// ─── Session state (reset on each cold start) ────────────────────────────────
const COLD_START = Date.now();

let totalRequests  = 0;
let errorCount     = 0;
let totalDurationMs = 0;

let lastResolve    = null; // { timestamp, ok, durationMs }
let resolveErrors  = [];   // last 10 failures, oldest first

// resolveState: "idle" | "working" | "degraded"
let resolveState     = "idle";
let lastResolveError = null;

// Self-test cache (30 second TTL)
let selfTestCache  = null;
let selfTestExpiry = 0;
```

### Stats Section HTML Pattern
```javascript
// In renderStatusPage — stats section below static info rows:
const avgMs = totalRequests > 0
  ? Math.round(totalDurationMs / totalRequests)
  : null;

const statsHtml = `
<div class="section-header">Session Stats</div>
<div class="row">
  <span class="label">Uptime</span>
  <span class="val">${escapeHtml(formatUptime(Date.now() - COLD_START))}</span>
</div>
<div class="row">
  <span class="label">Total requests</span>
  <span class="val">${totalRequests} this instance, since last cold start</span>
</div>
<div class="row">
  <span class="label">Errors</span>
  <span class="${errorCount > 0 ? 'err' : 'val'}">${errorCount}</span>
</div>
<div class="row">
  <span class="label">Avg response time</span>
  <span class="val">${avgMs !== null ? avgMs + ' ms' : '—'}</span>
</div>`;
```

### Last Resolve Row
```javascript
const lastResolveHtml = lastResolve ? `
<div class="row">
  <span class="label">Last resolve</span>
  <span class="${lastResolve.ok ? 'ok' : 'err'}">
    ${lastResolve.ok ? 'success' : 'failed'} · ${lastResolve.durationMs}ms · ${escapeHtml(lastResolve.timestamp)}
  </span>
</div>` : `
<div class="row">
  <span class="label">Last resolve</span>
  <span class="val">no resolves yet</span>
</div>`;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel Hobby maxDuration cap: 10s default, 60s hard max | Fluid Compute enabled by default: 300s default, 300s max on Hobby | April 23, 2025 | maxDuration: 20 was well under the old 60s cap; now we have 300s available. Requirement CONF-01 targets 60s — valid but conservative. |
| Node.js 20.x default on Vercel | Node.js 24.x is now the default | Sometime in 2025 | Pinning `"node": "22.x"` explicitly protects against future default bumps. 22.x is LTS and available. |
| `maxDuration: 20` in current vercel.json | Target: `maxDuration: 60` | This phase | Old timeout was 20s for execFile and 20s for maxDuration — consistent but too short for slow sites. |

**Deprecated/outdated in existing code:**
- `maxDuration: 20` in vercel.json — will be updated to 60
- `timeout: 20000` in execFile call — will be updated to 57000
- Missing `engines` field in package.json — will be added
- Missing `"fluid": true` in vercel.json — will be added to declare Fluid Compute intent
- No `package.json` engines field — Node version currently depends on Vercel dashboard setting only

---

## Open Questions

1. **Is Fluid Compute already enabled for this specific project?**
   - What we know: Fluid Compute is enabled by default for projects created after April 23, 2025. This project may predate that date.
   - What's unclear: Whether the project existed before the cutoff.
   - Recommendation: Add `"fluid": true` to vercel.json explicitly. This ensures Fluid Compute is active regardless of project age and dashboard state. Safe to add even if already enabled.

2. **Does `VERCEL_REGION` remain available under Fluid Compute?**
   - What we know: The limitations page lists many AWS Lambda env vars that are NOT available under Fluid Compute. `VERCEL_REGION` is not on that list — it is a Vercel env var, not an AWS one.
   - What's unclear: Not explicitly confirmed in docs, but absence from the blocked list is a strong signal.
   - Recommendation: Keep using `process.env.VERCEL_REGION` — it should continue to work. If it reads `undefined` post-deploy, add a fallback (e.g. `VERCEL_REGION || process.env.VERCEL_DEPLOYMENT_ID?.slice(0,5) || "unknown"`).

3. **The requirement says maxDuration: 60 "to use Fluid Compute headroom." Is 60 the right value?**
   - What we know: With Fluid Compute on Hobby, max is 300s. Without Fluid Compute on Hobby, max is 60s. 60 was chosen as a practical limit for yt-dlp.
   - What's unclear: Whether the intent was 60 specifically (yt-dlp budget) or 60 because it was believed to be the Fluid Compute ceiling.
   - Recommendation: Honor CONF-01 as written — set `maxDuration: 60`. This is a locked decision. The plan should note in a comment that 300s is available if needed.

---

## Sources

### Primary (HIGH confidence)
- https://vercel.com/docs/functions/configuring-functions/duration — maxDuration limits table for Hobby/Pro/Enterprise with and without Fluid Compute; vercel.json syntax
- https://vercel.com/docs/fluid-compute — Fluid Compute enabled by default April 23 2025; `"fluid": true` in vercel.json; isolation boundaries and global state documentation (confirms module-level state is shared across concurrent requests on same instance)
- https://vercel.com/docs/functions/limitations — confirmed maxDuration 300s/300s for Hobby with Fluid Compute; AWS env vars not available (VERCEL_REGION not on blocked list)
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions — `engines.node` field in package.json overrides dashboard setting; 22.x available; 24.x is current default

### Secondary (MEDIUM confidence)
- Existing `api/resolve.js` code analysis — confirmed current timeouts (20000ms execFile, maxDuration: 20), existing HTML theme (dark #0a0a0a, monospace), existing helper functions available for reuse

### Tertiary (LOW confidence)
- None — all critical claims are verified against official Vercel documentation.

---

## Metadata

**Confidence breakdown:**
- Platform config (CONF-01/02/03): HIGH — verified directly against official Vercel docs (maxDuration limits, engines field, fluid property)
- In-module state pattern (PAGE-01 through PAGE-06): HIGH — confirmed by Fluid Compute isolation boundary documentation; pattern is standard Node.js
- HTML/CSS patterns: HIGH — native browser APIs, no library dependency
- VERCEL_REGION availability under Fluid Compute: MEDIUM — not on the blocked list in official docs, but not explicitly confirmed as available

**Research date:** 2026-02-26
**Valid until:** 2026-08-26 (stable platform docs — Vercel rarely changes these limits without major announcements)
