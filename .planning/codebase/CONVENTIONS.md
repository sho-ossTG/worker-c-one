# Coding Conventions

**Analysis Date:** 2026-02-26

## Naming Patterns

**Files:**
- kebab-case for module files: `resolve.js`
- Vercel handler convention: `api/[route].js` maps to endpoint paths

**Functions:**
- camelCase for function names: `isHttpUrl()`, `checkAuth()`, `escapeHtml()`, `runYtDlp()`, `runSelfTest()`, `renderStatusPage()`
- Helper functions grouped by purpose with comment separators

**Variables:**
- camelCase for local variables: `inputUrl`, `directUrl`, `authEnabled`, `reqUrl`, `pathname`
- UPPER_SNAKE_CASE for constants/environment: `BINARY`, `WORKER_ID`, `WORKER_SECRET`
- Descriptive names: `execFile`, `stdout`, `stderr`, `timeout`

**Types:**
- No TypeScript used — plain JavaScript
- Implicit types inferred from context (duck typing)

## Code Style

**Formatting:**
- No formatter enforced (no .prettier, .eslint, or similar config)
- Consistent 2-space indentation observed throughout
- Max line length appears flexible; no strict limit enforced
- String quotes: double quotes (`"`) used consistently

**Linting:**
- No linting config found (no .eslintrc)
- No build-time validation in package.json
- Code relies on runtime safety mechanisms and graceful error handling

## Import Organization

**Order:**
1. Node.js built-in modules: `require("child_process")`, `require("path")`
2. No third-party dependencies in this codebase
3. No local/relative imports (single-file module)

**Module Export:**
```javascript
module.exports = async (req, res) => { ... }
```

Vercel expects the default export to be an async request handler. This codebase follows that convention exactly.

## Error Handling

**Patterns:**
- **Try-catch blocks** for async operations: `try { await runYtDlp(...) } catch (e) { ... }`
- **Callback-style errors** in `execFile`: check `err` parameter, reject/resolve based on exit status
- **Graceful degradation**: missing env vars default to empty string or placeholder value
  - `WORKER_SECRET = process.env.WORKER_SECRET || ""` (auth optional)
  - `WORKER_ID = process.env.WORKER_ID || "worker"` (defaults to "worker")
- **Error truncation** for safety: limit error messages to 1200 characters
  - `String(stderr || err.message || err).trim().slice(0, 1200)`
  - Prevents leaking excessively long or sensitive output
- **Specific HTTP status codes** for different failure modes:
  - `400` — missing/invalid input (no URL, not HTTP)
  - `401` — auth failure
  - `405` — wrong HTTP method
  - `500` — internal execution error (yt-dlp crash)
  - `502` — yt-dlp returned invalid/empty result
  - `503` — health check failure (binary missing/broken)
- **JSON error responses** include `worker_id` for traceability in distributed setup

## Logging

**Framework:** `console` methods (implicit via Vercel runtime)

**Patterns:**
- No explicit logging in production paths
- Status page (`renderStatusPage()`) renders error details to HTML for human inspection
- Health check endpoint (`/health`) returns structured JSON including error details
- All responses tagged with `worker_id` for distributed debugging

## Comments

**When to Comment:**
- Section separators mark logical blocks:
  ```javascript
  // ─── Helpers ────────────────────────────────────────────────────────────────
  // ─── Core functions ──────────────────────────────────────────────────────────
  // ─── Status page (human-readable) ───────────────────────────────────────────
  // ─── Request handler ─────────────────────────────────────────────────────────
  ```
- Inline comments explain non-obvious logic (e.g., why status code chosen, error truncation reason)
- HTTP status comments explain endpoint purpose: `// GET /health — JSON status for Server B to poll`

**JSDoc/TSDoc:**
- Not used — code is single file, straightforward logic
- Function names are descriptive enough for intent

## Function Design

**Size:**
- Small, single-purpose functions: each 5-20 lines
- `isHttpUrl()` — 6 lines, pure validation
- `checkAuth()` — 3 lines, pure validation
- `runYtDlp()` — 20 lines, wraps execFile promise
- `runSelfTest()` — 6 lines, health check for binary

**Parameters:**
- Minimal parameters: most functions take 1-2 args
- Use shared constants (`BINARY`, `WORKER_ID`, `WORKER_SECRET`) rather than passing globals around
- Environment vars read once at module load time, not per-request

**Return Values:**
- Promises returned from `runYtDlp()` and `runSelfTest()` (wrapped `execFile` callbacks)
- Synchronous helpers return booleans or strings
- Error handling: always resolve/reject consistently, never throw from promise-wrapping functions

## Module Design

**Exports:**
- Single export: the async request handler
- Handler expects Node.js/Vercel API: `(req, res) => Promise<void>`

**File Structure:**
- Sequential organization: helpers first, then core logic, then request handler
- Clear dependency flow: helpers → core functions → handler
- No circular dependencies (single file)

## Safety & Security

**Input Validation:**
- Every user input validated before use:
  - URL parsed with `URL()` constructor, rejects invalid URLs
  - HTTP method checked: `req.method !== "GET"` → 405
  - Auth header validated against shared secret: `auth === \`Bearer ${WORKER_SECRET}\``
  - HTML output escaped: all dynamic content runs through `escapeHtml()`

**Process Execution:**
- Command args passed as array to `execFile()` (not string concatenation) — prevents shell injection
- Timeout enforced: `timeout: 20000` (20s) on yt-dlp, `5000` (5s) on version check
- Max buffer limited: `maxBuffer: 1024 * 1024` (1MB) to prevent OOM on large outputs

**Response Safety:**
- No stack traces returned; user-facing errors summarized
- Error details truncated to 1200 chars
- `Cache-Control: no-store` on resolve responses to prevent caching of CDN URLs

## Env Var Handling

**Required (for production):**
- `WORKER_ID` — Unique identifier, shown in all responses
- `WORKER_SECRET` — Shared auth token for Server B requests
- `VERCEL_REGION` — Auto-set by Vercel, used in status page

**Optional:**
- All vars have safe defaults if missing
- Empty `WORKER_SECRET` disables auth (auth check returns `true` if secret is falsy)

---

*Convention analysis: 2026-02-26*
