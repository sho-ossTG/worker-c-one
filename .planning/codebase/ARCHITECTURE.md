# Architecture

**Analysis Date:** 2026-02-26

## Pattern Overview

**Overall:** Stateless HTTP API gateway wrapping a binary executable (yt-dlp).

**Key Characteristics:**
- Single-responsibility: receive URL → execute external binary → return result
- Completely stateless (no database, cache, or persistent state)
- Designed for horizontal scaling via cloning (multiple identical instances with different Worker IDs)
- Vercel Serverless Functions as deployment target
- Bearer token authentication for sensitive `/resolve` endpoint
- Public status/health monitoring endpoints for infrastructure visibility

## Layers

**Routing Layer:**
- Purpose: Distinguish request types and route to appropriate handler
- Location: `api/resolve.js` (lines 134-221)
- Contains: Request parsing, URL path matching, method validation
- Depends on: Node.js `http` module via Vercel Functions
- Used by: Vercel routing (via `vercel.json`)

**Authentication Layer:**
- Purpose: Validate Server B requests using Bearer token
- Location: `api/resolve.js` (lines 19-23, 166-171)
- Contains: `checkAuth()` helper, Bearer token validation logic
- Depends on: `WORKER_SECRET` environment variable
- Used by: `/resolve` endpoint handler

**Execution Layer:**
- Purpose: Invoke yt-dlp binary and capture output
- Location: `api/resolve.js` (lines 34-58)
- Contains: `runYtDlp()` function, child process spawning
- Depends on: `bin/dlp-jipi` binary (pre-compiled yt-dlp)
- Used by: Resolve endpoint, all URL resolution requests

**Validation Layer:**
- Purpose: Validate input before execution
- Location: `api/resolve.js` (lines 10-17, 180-192)
- Contains: URL validation (`isHttpUrl()`), parameter presence checks
- Depends on: Native URL API
- Used by: Resolve endpoint request handler

**Monitoring Layer:**
- Purpose: Health checks and status visibility for Server B
- Location: `api/resolve.js` (lines 60-67, 140-152, 156-161)
- Contains: `runSelfTest()` function, health endpoint, status page rendering
- Depends on: `/health` endpoint, `/` root endpoint
- Used by: Infrastructure monitoring, human status page

## Data Flow

**Successful Resolution:**

1. Server B sends: `GET https://worker-c1.vercel.app/resolve?url=https://youtube.com/watch?v=abc` with `Authorization: Bearer {secret}`
2. Vercel routes to `api/resolve.js` via `vercel.json` rewrite
3. Request handler (line 134) parses URL, extracts pathname and query params
4. Route matches `/resolve` or `/` with `url` param (line 165)
5. Auth check validates Bearer token (line 166)
6. Input validation ensures URL is valid HTTP(S) (lines 180-192)
7. `runYtDlp()` spawns `bin/dlp-jipi` with flags and video URL (lines 36-46)
8. Child process executes, yt-dlp outputs direct stream URL to stdout
9. Response captured and trimmed (line 53)
10. Return JSON: `{ "url": "https://cdn.example.com/video.mp4", "worker_id": "worker-c1" }`

**Health Check:**

1. Server B sends: `GET https://worker-c1.vercel.app/health`
2. Vercel routes to `api/resolve.js`
3. Route matches `/health` (line 140)
4. `runSelfTest()` executes `bin/dlp-jipi --version` (line 62)
5. Return JSON with status, version, worker ID, region, timestamp

**Status Page (Human Browser):**

1. User opens `https://worker-c1.vercel.app/` in browser (no query params)
2. Vercel routes to `api/resolve.js`
3. Route matches `/` without `url` param (line 156)
4. `runSelfTest()` executes self-test
5. `renderStatusPage()` generates styled HTML with worker info, binary status, auth status
6. Display shows live status: online/degraded, region, version, self-test result

**Error Paths:**

- **401 Unauthorized:** Missing/invalid Bearer token → early return with 401 status
- **400 Bad Request:** Missing `url` param or invalid URL format → 400 with error detail
- **405 Method Not Allowed:** Non-GET request to `/resolve` → 405 response
- **502 Bad Gateway:** yt-dlp returned empty/non-HTTP response → 502 with error
- **500 Internal Server Error:** yt-dlp process failed (stderr captured) → 500 with error detail
- **404 Not Found:** Unknown pathname → 404 response

**State Management:**

- **None.** Worker is completely stateless. All state is transient (per-request):
  - `inputUrl`: parsed from request, discarded after response
  - `directUrl`: result from yt-dlp, included in response, not persisted
  - Environment variables are read at startup (`WORKER_ID`, `WORKER_SECRET`)
  - No database, cache, or cross-request memory
  - Multiple instances can run identically in parallel; Server B chooses which one to use

## Key Abstractions

**URL Validation (`isHttpUrl`):**
- Purpose: Prevent injection of non-HTTP schemes (file://, gopher://, etc.)
- Examples: `api/resolve.js` line 10-17
- Pattern: Try-catch around `new URL()` constructor, protocol whitelist

**yt-dlp Execution (`runYtDlp`):**
- Purpose: Encapsulate binary invocation with standardized flags and error handling
- Examples: `api/resolve.js` line 34-58
- Pattern: Promise-based wrapper around `execFile()`, captures stderr as error message, slices long errors to 1200 chars

**Self-Test (`runSelfTest`):**
- Purpose: Non-blocking health check for status page and `/health` endpoint
- Examples: `api/resolve.js` line 60-67
- Pattern: Lightweight version-only check, always resolves (never rejects), returns object with `ok` boolean

**Bearer Token Auth (`checkAuth`):**
- Purpose: Simple shared-secret authentication for Server B
- Examples: `api/resolve.js` line 19-23
- Pattern: Compare `Authorization: Bearer X` header against environment variable; allow if secret not set (graceful degradation)

**Status Page Rendering (`renderStatusPage`):**
- Purpose: Human-friendly diagnostic interface
- Examples: `api/resolve.js` line 71-130
- Pattern: Generates inline HTML/CSS with real-time self-test results, status indicator with animation, region and version info

## Entry Points

**HTTP Request Handler:**
- Location: `api/resolve.js` line 134-221
- Triggers: All HTTP requests (Vercel routes all paths via `vercel.json`)
- Responsibilities:
  - Parse incoming request (method, URL, headers)
  - Dispatch to correct endpoint handler
  - Validate all inputs before execution
  - Return appropriate HTTP response (JSON or HTML)
  - Include `worker_id` in all responses for Server B tracing

**Binary Entry:**
- Location: `bin/dlp-jipi` (pre-compiled executable)
- Triggers: Called via `execFile()` from `runYtDlp()`
- Responsibilities: Execute yt-dlp extraction logic, output direct stream URL or error to stderr

## Error Handling

**Strategy:** Fail fast with clear error responses; include error detail in JSON for Server B debugging.

**Patterns:**

- **Validation Errors (400):** Input validation fails (missing param, invalid format) → immediate 400 with error message
- **Auth Errors (401):** Bearer token missing or incorrect → 401 with generic "Unauthorized" message
- **Process Timeout:** yt-dlp takes >20 seconds → killed by Vercel, propagates as error to client
- **Stderr Capture:** yt-dlp writes error to stderr (e.g., "Video unavailable") → captured, trimmed to 1200 chars, returned in `detail` field
- **Exception Handling:** Uncaught exceptions in `runYtDlp()` caught with try-catch, returned as 500 with error detail

All errors include `worker_id` in response for Server B to identify which worker failed (enables failover/retry logic).

## Cross-Cutting Concerns

**Logging:** None. Worker intentionally has zero logging (stateless, Vercel discards logs). Debugging relies on:
- Status page (`/`) for operator inspection
- Health endpoint (`/health`) for Server B monitoring
- Error responses include error detail for Server B to log

**Validation:** Tiered approach:
1. Request parsing (method, path, headers)
2. Parameter presence check (`url` param required)
3. URL format validation (`isHttpUrl()`)
4. HTTP status validation (yt-dlp response must start with `http`)

**Authentication:** Single shared Bearer token (`WORKER_SECRET`) validates all Server B requests. Graceful if disabled (allows requests without auth, suitable for testing but not production).

---

*Architecture analysis: 2026-02-26*
