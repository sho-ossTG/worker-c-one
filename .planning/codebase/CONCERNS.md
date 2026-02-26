# Codebase Concerns

**Analysis Date:** 2026-02-26

## Critical Issues

### 1. Vercel Free Tier Timeout Incompatibility

**Issue:** `vercel.json` specifies `maxDuration: 20` seconds, but Vercel's free (Hobby) tier caps at 10 seconds.

**Files:** `vercel.json`, `api/resolve.js` (timeout hardcoded at line 47)

**Impact:**
- Deployments on free tier will timeout regularly (10s < actual yt-dlp resolution time)
- Workers will become unusable without Pro upgrade
- Users experience failed resolves unpredictably

**Current Mitigation:** None enforced at code level

**Fix approach:**
1. Test actual resolution times on Vercel free tier
2. If timeout is real blocker, migrate Worker C to Netlify Functions (free tier allows 26s)
3. Or document requirement for Vercel Pro and automate billing setup in deployment guide
4. Consider async job queue pattern if resolution can be deferred

---

### 2. Missing Binary Causes Silent Failure

**Issue:** If `bin/dlp-jipi` is missing or corrupted, `/resolve` will hang or timeout rather than fail fast.

**Files:** `api/resolve.js` (line 4: `BINARY` path, line 36-57: `runYtDlp`)

**Impact:**
- Server B gets timeout on requests instead of immediate 500 error
- Wastes Vercel compute time waiting for process that can't execute
- Health check at `/health` will detect it, but `/resolve` doesn't pre-validate binary

**Evidence:**
- Binary size is 35MB — potential corruption during Vercel deployment
- `execFile` does not validate binary existence before spawning

**Fix approach:**
1. Add binary existence check on module initialization (warm start)
2. Return 503 immediately in `/resolve` if binary missing
3. Add file hash validation at startup to detect corruption
4. Implement health endpoint dependency check before answering `/resolve` requests

---

### 3. Subprocess Input Validation is Incomplete

**Issue:** URL validation only checks if it's a valid HTTP URL, but doesn't prevent injection or exploitation of yt-dlp flags.

**Files:** `api/resolve.js` (lines 10-17: `isHttpUrl`, lines 187-192: URL validation)

**Impact:**
- A malicious URL like `https://example.com`; followed by yt-dlp flags could be partially exploited
- URL passed directly to `execFile` array (line 45) — mitigates shell injection but not argument poisoning
- No rate limiting per worker — resource exhaustion possible if B doesn't enforce limits

**Example Attack:** `?url=https://youtube.com --extract-audio --audio-format mp3` (hypothetically)

**Fix approach:**
1. Document that URL must be exactly valid HTTP(s) URL with no special chars allowed
2. Add regex validation to ensure no control characters in URL
3. Implement per-worker rate limiting (e.g., max 10 concurrent requests, queue others)
4. Add timeout enforcement at HTTP level with explicit close on timeout
5. Log suspicious URLs for monitoring

---

## Performance Concerns

### 4. No Connection Timeouts or Pooling

**Issue:** Each `/resolve` request spawns a new yt-dlp process (fork cost) with no process reuse or pooling.

**Files:** `api/resolve.js` (lines 34-58: `runYtDlp` spawns new process every call)

**Impact:**
- Vercel cold starts trigger fork overhead
- No parallelism control — 100 concurrent requests = 100 processes spawned simultaneously
- Memory spikes possible with large `maxBuffer` (1MB per request)

**Current Settings:** `maxBuffer: 1024 * 1024` (1MB) — reasonable but could spike with concurrent requests

**Fix approach:**
1. Implement process pooling with `worker_threads` or dedicated child process manager
2. Add request queue (max 5-10 concurrent yt-dlp processes)
3. Return 429 when queue exceeds limit instead of spawning unbounded processes
4. Monitor memory usage and adjust `maxBuffer` based on testing

---

### 5. Status Page Self-Test Runs Every HTTP Request

**Issue:** `/` endpoint runs `runSelfTest()` which executes `yt-dlp --version` on every single page load/health check.

**Files:** `api/resolve.js` (lines 71-130: status page, 140-161: GET / route)

**Impact:**
- Every browser refresh triggers a process spawn
- Health checks fire frequently, causing unnecessary yt-dlp invocations
- Combined with cold starts, adds latency to status page loads

**Fix approach:**
1. Cache test result for 30-60 seconds (in-memory or via headers)
2. Separate `/health` from `/` — health can be lightweight JSON only
3. Consider lazy evaluation — only run test if requested, not on every load

---

### 6. Large Stdout Buffer with No Size Limit

**Issue:** `maxBuffer: 1024 * 1024` allows 1MB of output, but no check on actual output size.

**Files:** `api/resolve.js` (line 47: `maxBuffer`)

**Impact:**
- If yt-dlp returns large HTML or error output, could waste memory
- No validation that stdout is actually a single URL
- Error messages truncated to 1200 chars but stdout not checked before parse

**Fix approach:**
1. Reduce `maxBuffer` to 256KB (likely sufficient for URL output)
2. Validate that stdout is a valid URL before returning (already done at line 196)
3. Add timeout error message if buffer exceeded
4. Log warnings if output approaches buffer limit

---

## Security Concerns

### 7. Bearer Token Comparison Not Constant-Time

**Issue:** Line 22 uses string comparison `===` for Bearer token check.

**Files:** `api/resolve.js` (line 22: `auth === Bearer ${WORKER_SECRET}`)

**Impact:**
- Timing attack possible if attacker tries many bearer tokens
- Hypothetically allows statistical analysis of correct token length/prefix
- Risk is low given token should be random, but not best practice

**Fix approach:**
1. Use Node.js `crypto.timingSafeEqual()` for comparison
2. Compare token parts separately (scheme vs. value)
3. Add rate limiting to auth failures (max 10 per minute per IP)

---

### 8. No Rate Limiting or IP Tracking

**Issue:** No mechanism to limit requests per IP, per auth token, or globally.

**Files:** `api/resolve.js` (entire module lacks rate limit checks)

**Impact:**
- Attacker can hammer `/resolve` endpoint with malicious URLs
- Resource exhaustion: 1000 concurrent requests = 1000 processes on one worker
- Server B will be the gatekeeper (if built with limits), but this worker has none
- Public `/health` endpoint also has no limits

**Fix approach:**
1. Add rate limiting middleware using Redis or in-memory store
2. Limit: 100 requests/min per IP (public), 10/sec per auth token (private)
3. Return 429 Too Many Requests when limit exceeded
4. Log rate limit violations for monitoring
5. Document that Server B should also enforce limits upstream

---

### 9. Error Messages Leak Internal Details

**Issue:** Error responses include stderr output from yt-dlp, which may contain paths, versions, or system info.

**Files:** `api/resolve.js` (line 50: stderr in error, line 211: error.message in detail)

**Impact:**
- Error messages may leak `bin/dlp-jipi` path, version, or unusual system state
- Helps attackers fingerprint worker setup
- Truncated to 1200 chars but still leaks information

**Fix approach:**
1. Log full error to server logs (not returned to client)
2. Return generic error message to client: `"yt-dlp failed — video unavailable or unsupported"`
3. Include only `worker_id` in response for debugging
4. Add server-side logging for Server B to correlate worker_id with full error logs

---

### 10. No CORS or CSRF Protection

**Issue:** No `Access-Control-Allow-Origin` headers or CSRF token validation.

**Files:** `api/resolve.js` (entire module)

**Impact:**
- Status page can be embedded in third-party sites
- If Server A calls Worker C from browser context, vulnerable to CSRF
- Health check could be abused to generate unwanted traffic from other domains

**Fix approach:**
1. Add CORS headers restricting origin to Server B domain (once known)
2. For status page: add `X-Frame-Options: DENY` or whitelist Server A
3. For `/resolve`: require `Content-Type: application/json` or validate `Referer` header
4. Server B should communicate via backend (not browser), mitigating browser-based CSRF

---

## Reliability Concerns

### 11. No Request Timeout at HTTP Level

**Issue:** yt-dlp has 20s timeout internally, but HTTP request from Server B has no explicit timeout.

**Files:** `api/resolve.js` (line 47: `timeout: 20000` only applies to child process, not HTTP)

**Impact:**
- If yt-dlp process hangs (rare but possible), request ties up Vercel compute indefinitely
- Server B may wait forever unless it sets its own HTTP timeout
- No grace period after timeout to clean up resources

**Fix approach:**
1. Wrap `res.end()` calls to ensure response sent even if internal timeout
2. Add explicit HTTP timeout: `res.setTimeout(25000)` at request start
3. Clean up yt-dlp process if HTTP connection closes before response
4. Log warnings if timeout is near (18+ seconds)

---

### 12. Async Error in Module Export is Uncaught

**Issue:** Module exports an async function but errors in setup (e.g., env var read, path resolution) are not caught.

**Files:** `api/resolve.js` (line 134: `module.exports = async (req, res) => ...`)

**Impact:**
- If `runSelfTest()` throws during `/health` or `/`, error is unhandled
- Worker will crash rather than return 500
- Vercel will restart but user sees downtime

**Fix approach:**
1. Wrap handler body in try-catch that returns 500 if setup fails
2. Ensure no unhandled promise rejections from `runSelfTest()` or `runYtDlp()`
3. Add error handler for `res` object (e.g., `res.on('error', ...)`)

---

## Deployment & Configuration Concerns

### 13. No Environment Variable Validation at Startup

**Issue:** Missing `WORKER_ID` or `WORKER_SECRET` silently defaults to empty string.

**Files:** `api/resolve.js` (lines 5-6: `WORKER_ID` defaults to `"worker"`, `WORKER_SECRET` defaults to `""`)

**Impact:**
- If env vars are not set, worker runs with default ID and **auth disabled**
- Multiple workers may have same ID, breaking observability
- Multiple workers sharing empty secret means auth is effectively off
- No warning logged — admin may not realize issue

**Fix approach:**
1. Require `WORKER_ID` via strict check; exit if missing
2. Log warning if `WORKER_SECRET` is empty, but allow (for dev)
3. Add validation function at module load that checks env vars
4. Return 500 on first request if required vars missing
5. Document env vars as required in `.env.example`

---

### 14. Binary Path is Hardcoded

**Issue:** `bin/dlp-jipi` path is hardcoded relative to `process.cwd()`.

**Files:** `api/resolve.js` (line 4: `BINARY` path)

**Impact:**
- If Vercel's working directory changes, binary won't be found
- Testing locally requires same directory structure
- Fragile to directory reorganization

**Fix approach:**
1. Use `__dirname` + relative path: `path.join(__dirname, '../bin/dlp-jipi')`
2. Add fallback check for multiple possible paths
3. Validate binary exists on first request, not just at import
4. Document expected file structure in deployment guide

---

### 15. No Version Pinning for yt-dlp Binary

**Issue:** `bin/dlp-jipi` binary is checked in but no version metadata or hash.

**Files:** `bin/dlp-jipi` (35MB binary, no version file)

**Impact:**
- No way to verify binary hasn't been corrupted
- No way to know which yt-dlp version is deployed
- Difficult to roll back to older version if new binary breaks
- Health check shows version but no way to audit commit history

**Fix approach:**
1. Add `bin/dlp-jipi.version` file containing: semantic version + SHA256 hash
2. On startup, validate binary hash matches expected
3. Document binary source: `wget https://github.com/yt-dlp/yt-dlp/releases/download/...`
4. Add deployment script to update binary atomically with version file

---

## Fragile Areas (Change With Care)

### 16. Status Page HTML Rendering Fragility

**Issue:** Status page HTML is built as string template with interpolated variables.

**Files:** `api/resolve.js` (lines 71-130: `renderStatusPage`)

**Impact:**
- HTML escaping is manual (`escapeHtml`) — easy to miss a variable
- No template engine validation
- Variables like `region` or `WORKER_ID` could break HTML if not escaped
- Currently all variables are escaped, but future changes risk XSS

**Fix approach:**
1. Use template engine (e.g., `ejs`, `nunjucks`) instead of string templates
2. Or use strict templating with no string concatenation
3. Add CSP headers to prevent inline script execution
4. Validate all user-derived variables before template rendering

---

### 17. URL Parsing Could Be More Robust

**Issue:** URL parsing at line 135-137 may fail silently if `req.url` or `req.headers.host` is malformed.

**Files:** `api/resolve.js` (lines 135-137: URL construction)

**Impact:**
- If host header is missing or contains invalid characters, `new URL()` could throw
- Error is not caught; would return 500
- Server B may interpret as worker failure when issue is client-side

**Fix approach:**
1. Wrap URL parsing in try-catch, return 400 with clear message
2. Validate `req.headers.host` before using
3. Add default host if missing (shouldn't happen in Vercel but defensive)

---

## Test Coverage Gaps

### 18. No Test Suite

**Issue:** Zero test files in project.

**Files:** No `*.test.js` or `*.spec.js` files

**Impact:**
- Auth logic not tested; could be broken by typos
- URL validation not tested; edge cases unknown
- Status page rendering not tested; could break with HTML changes
- yt-dlp subprocess handling not tested; timeout behavior unknown
- Changes risk regression with no safety net

**Risk Areas (high priority to test):**
1. Auth header validation (correct/incorrect tokens)
2. URL validation (valid URLs, edge cases, special characters)
3. Error responses (malformed input, subprocess failure, timeout)
4. Status page rendering (HTML validity, variable escaping)
5. Health check JSON structure (required fields, types)

**Fix approach:**
1. Create `api/resolve.test.js` using Jest or Vitest
2. Mock `execFile` to avoid spawning real processes
3. Test all endpoints: `/`, `/health`, `/resolve`
4. Test auth success/failure paths
5. Test error responses and status codes
6. Achieve minimum 80% coverage

---

### 19. No Integration Tests with Server B

**Issue:** No tests verify Worker C contract matches Server B expectations.

**Files:** No integration test suite

**Impact:**
- Server B built without knowing if workers actually conform
- Response schema could change unexpectedly
- Auth flow may have subtle mismatches

**Fix approach:**
1. Create integration tests that simulate Server B calling Worker C
2. Verify response schema: `{ url, worker_id }` or `{ error, detail, worker_id }`
3. Test all HTTP status codes returned
4. Mock Redis in tests to verify auth/health flows
5. Run tests on every commit before deployment

---

## Dependencies & Maintenance

### 20. No Dependencies Tracked (But Not a Problem)

**Issue:** `package.json` has zero dependencies — everything uses Node.js built-ins.

**Files:** `package.json` (empty `dependencies: {}`)

**Impact:**
- Actually a **strength** — no npm security vulnerabilities, no supply-chain risk
- Zero upgrade maintenance needed
- Pure Node.js makes code portable and stable
- Tradeoff: can't use convenience libraries

**No action needed** — this is a good constraint for a simple worker.

---

## Scaling Limits

### 21. Single Worker Cannot Handle High Load

**Issue:** One Worker C instance can only handle as many concurrent yt-dlp processes as Vercel allows.

**Files:** `api/resolve.js` (entire module, no queue)

**Impact:**
- Free tier Vercel likely caps at a few concurrent functions
- All requests beyond capacity are rejected or queued by Vercel
- No graceful queue or backpressure mechanism in worker
- Server B will see timeouts/failures without knowing if it's worker limit or real error

**Current Mitigation:** Server B's job to do round-robin across multiple workers

**Fix approach:**
1. Document max concurrent load per worker (requires testing on Vercel)
2. Implement in-memory queue to smooth spikes (optional)
3. Return 429 when queue full instead of spawning unlimited processes
4. Coordinate with Server B: B must distribute load across workers
5. Add telemetry: log queue depth, process count, avg response time

---

## Operational Concerns

### 22. No Graceful Shutdown

**Issue:** Worker has no shutdown handler; in-flight requests may be killed.

**Files:** `api/resolve.js` (no signal handlers)

**Impact:**
- If Vercel redeploys, in-flight `/resolve` requests get aborted mid-execution
- yt-dlp processes may be orphaned (unlikely on Vercel but possible)
- Server B sees timeout/error and may retry on different worker

**Fix approach:**
1. Add `SIGTERM` handler to finish in-flight requests before exit
2. Stop accepting new requests after SIGTERM
3. Wait max 5 seconds for in-flight requests to complete
4. Log shutdown events for debugging
5. Document graceful shutdown behavior in integration guide

---

### 23. No Monitoring or Observability

**Issue:** No logs, metrics, or observability hooks in worker code.

**Files:** `api/resolve.js` (no logging, no metrics)

**Impact:**
- Can't debug failures — no logs to see what failed
- Can't monitor health — no metrics on request rate, latency, errors
- Can't scale intelligently — don't know actual load
- Server B can't correlate its logs with worker behavior

**Fix approach:**
1. Add structured logging (JSON format) for:
   - Request arrival (method, path, worker_id)
   - Auth success/failure
   - yt-dlp process start/end/timeout
   - Response status and latency
   - Errors with full context
2. Log to stdout (Vercel logs automatically)
3. Add response headers with timing info: `X-Response-Time`, `X-Process-Duration`
4. Implement Prometheus metrics endpoint (e.g., `/metrics`) if load monitoring needed

---

## Summary Table

| Issue | Severity | Category | Fix Effort | Impact |
|-------|----------|----------|-----------|--------|
| Vercel timeout incompatibility | Critical | Deployment | High | Workers unusable on free tier |
| Missing binary silent failure | High | Reliability | Medium | Wastes compute, confuses B |
| Incomplete input validation | High | Security | Low | Resource exhaustion risk |
| No subprocess pooling | High | Performance | Medium | Memory spikes under load |
| Self-test on every request | Medium | Performance | Low | Unnecessary process spawns |
| Bearer token timing attack | Medium | Security | Low | Timing side-channel |
| No rate limiting | Medium | Security | Medium | Resource exhaustion, DDoS |
| Error message info leakage | Medium | Security | Low | Fingerprinting aid |
| No CORS/CSRF protection | Medium | Security | Low | Minimal risk if B is backend |
| HTTP request timeout missing | Medium | Reliability | Low | Resource leaks on hang |
| Env var validation missing | Medium | Reliability | Low | Silent auth bypass |
| Binary path hardcoded | Low | Maintainability | Low | Fragile to changes |
| No binary version tracking | Low | Maintainability | Low | Hard to debug/rollback |
| Status page HTML fragility | Low | Security | Low | XSS risk in future changes |
| No test suite | High | Quality | High | No regression safety |
| No integration tests | High | Quality | High | Contract mismatches possible |
| No graceful shutdown | Low | Reliability | Low | In-flight requests dropped |
| No monitoring/logs | Medium | Ops | Medium | Blind to failures |

---

*Concerns audit: 2026-02-26*
