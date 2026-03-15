# Server C Codebase Walkthrough

This document complements `worker-c-one/docs/SERVER-TEMPLATE.md` with implementation-level detail: exact runtime file behavior, full function inventory, request flow, and concrete insertion points for future ideas.

## Runtime Topology

- Entrypoints: `api/resolve.js` (primary handler for `/`, `/health`, `/resolve`, `/api/resolve`) and `api/index.js` (status UI with B connectivity check).
- Binary dependency: `bin/dlp-jipi` is the bundled yt-dlp executable used by `runYtDlp(inputUrl)` and `runSelfTest()`.
- Telemetry dependency: optional Turso (`@libsql/client`) persists hourly records in `hourly_records` when `TURSO_DATABASE_URL` is set.
- Note on historical names: references to `index.js` and `resolve.js` in older notes now map to `api/index.js` and `api/resolve.js`.

## Request Path Flow

1. `GET /health` -> `runSelfTestCached()` in `api/resolve.js` -> JSON readiness for B health probes.
2. `GET /` without `url` -> `renderStatusPage(test)` in `api/resolve.js` -> human status HTML.
3. `GET /resolve?url=...` and `GET /api/resolve?url=...` -> input validation -> `runYtDlp(inputUrl)` -> `{ url, worker_id }` JSON.
4. `GET /` with `url` follows the same resolve path as `/resolve`.
5. `api/index.js` POST "Check B Connectivity" -> `checkServerB(serverBUrl)` probes B `/api/health`.

### B Connectivity Implications

- B relies on C `/health` for worker dashboard and availability polling.
- B relies on C `/api/resolve` response shape (`{ url, worker_id }`) for stream resolution; malformed/empty URL produces 5xx and contributes to retry/failover behavior in B.
- C status page check in `api/index.js` is diagnostic-only and does not alter resolve runtime state.

## File-by-File Function Inventory

### `api/resolve.js`

- Purpose: worker resolve runtime, self-test, health/status responses, in-memory runtime stats.
- `isHttpUrl(value)`
  - Behavior: validates input string by constructing `URL` and allowing only `http:`/`https:`.
  - Returns: `true` or `false`.
  - Side effects/gotchas: catches parser errors and returns `false` silently.
- `escapeHtml(str)`
  - Behavior: escapes `&`, `<`, `>` for status page safety.
  - Returns: escaped string.
  - Side effects/gotchas: coerces non-string values with `String(...)`.
- `runYtDlp(inputUrl)`
  - Behavior: executes `bin/dlp-jipi` via `execFile`, requests direct media URL (`-g`), first non-empty stdout line wins.
  - Returns: `Promise<string>` with resolved stream URL.
  - Side effects/gotchas: 57s timeout, 1MB stdout/stderr cap, truncates error detail before rejecting.
- `runSelfTest()`
  - Behavior: executes `dlp-jipi --version` as health probe.
  - Returns: `Promise<{ ok: true, version } | { ok: false, error }>`.
  - Side effects/gotchas: logs structured JSON on failure with generated correlation ID.
- `runSelfTestCached()`
  - Behavior: memoizes self-test result for 30 seconds.
  - Returns: cached or fresh self-test object.
  - Side effects/gotchas: stale failures persist until TTL expiry.
- `formatUptime(ms)`
  - Behavior: formats milliseconds since cold start into `h/m/s` human text.
  - Returns: uptime label.
- `getResolveRuntimeStats()`
  - Behavior: exposes mutable in-memory counters/state.
  - Returns: `{ totalRequests, errorCount, resolveState, lastResolve }`.
- `getHourlyDbClient()` / `incrementHourlyRecord(requestDelta, errorDelta)` / `readCurrentHourStatsFromDb()`
  - Behavior: lazily initializes Turso client, ensures `hourly_records` table exists, upserts per-request/per-error counters, and serves DB-backed current-hour stats.
  - Returns: DB client or current-hour `{ hour, requestCount, errorCount }` when Turso is configured.
  - Side effects/gotchas: if Turso is missing/unreachable, logs structured errors and falls back to in-memory counters for `/api/stats`.
- `renderStatusPage(test)`
  - Behavior: renders full HTML status document with headline, session stats, recent errors, and optional stubbed curl section.
  - Returns: HTML string.
  - Side effects/gotchas: local `STUB_ENABLED=false` gates STUB-K-01 section.
- `handler(req, res)`
  - Behavior: route multiplexer for `/health`, `/`, `/resolve`, `/api/resolve`, validates method/input, executes yt-dlp, emits JSON/HTML responses.
  - Returns: async response lifecycle through Node `res`.
  - Side effects/gotchas: mutates process-memory counters; logs structured events; resolve path is GET-only.

### `api/index.js`

- Purpose: separate operator page for B connectivity and current resolve runtime snapshot.
- `escapeHtml(str)`
  - Behavior: HTML-escapes text for UI rendering.
  - Returns: escaped string.
- `maskUrl(url)`
  - Behavior: returns hostname if parseable URL, otherwise truncated fallback.
  - Returns: safe display string.
- `checkServerB(serverBUrl)`
  - Behavior: probes `new URL('/api/health', serverBUrl)` with 5s abort timeout.
  - Returns: `{ ok, ms, error? }` or warning if `SERVER_B_URL` missing.
  - Side effects/gotchas: classifies timeout explicitly; always clears timer.
- `renderPage(state)`
  - Behavior: builds status HTML including health check action, runtime stats from `getResolveRuntimeStats()`, and connections section.
  - Returns: HTML string.
- `statusPageHandler(req, res)`
  - Behavior: exported as `module.exports = async (req, res) => { ... }`; runs connectivity check on POST and renders page.
  - Returns: async response via `res.end(...)`.

### `bin/dlp-jipi`

- Purpose: executable yt-dlp binary consumed by resolve and self-test paths.
- Function inventory: binary executable (no inspectable JS functions in repo).
- Side effects/gotchas: missing/invalid binary makes `/health` degrade and resolve requests fail.

## Templates

Mapped from `.planning/templates/HELIX-TEMPLATE-MAP.md` (worker-c-one column):

- `HELIX-WEBSITE-DESIGN-TEMPLATE.md` -> `api/resolve.js`, `api/index.js` (status page visual language).
- `HELIX-CHECK-BUTTON-TEMPLATE.md` -> `api/index.js` (manual "Check B Connectivity" action).
- `HELIX-HOURLY-RECORDS-TEMPLATE.md` -> future integration point in `api/resolve.js` request lifecycle.
- `HELIX-API-CONTRACTS-TEMPLATE.md` -> `api/resolve.js` (`GET /api/resolve` success/error payload contract).
- `HELIX-ERROR-LOGGING-TEMPLATE.md` -> `api/resolve.js` structured `console.error(...)` events.
- `HELIX-HEALTH-CHECK-TEMPLATE.md` -> `api/resolve.js` `/health` response.
- `sections/SECTION-API-DOCS.md` -> docs index references for C endpoints.
- `sections/SECTION-CONNECTIONS.md` -> `api/index.js` Connections card.
- `sections/SECTION-CURL-SNIPPET.md` -> stubbed area in `renderStatusPage(test)`.
- `sections/SECTION-ENDPOINTS.md` -> endpoint rows in `renderStatusPage(test)`.
- `sections/SECTION-HEALTH-CHECKS.md` -> `/health` and B probe sections across both handlers.
- `sections/SECTION-RUNTIME-STATS.md` -> runtime counter display in both status pages.
- `sections/SECTION-STATUS-PAGE-CARD-HEADER.md` -> shared card header shape in HTML renderers.
- `stubs/STUB-K-01.md` -> `api/resolve.js` `renderStatusPage(test)` stub gate.

## Future Ideas Placement

- Hourly Records (cross-server idea)
  - Insert in `api/resolve.js` near successful and failed resolve branches in `handler(req, res)` after final outcome is known.
  - Wire to: shared telemetry writer abstraction (future DB choice), include `worker_id`, duration, status.
- Shared DB (cross-server idea)
  - Insert in `api/resolve.js` startup/config section to initialize client once per runtime; reuse inside resolve/health flows.
  - Wire to: hourly records and potential richer worker status snapshots.
- Partial Sync Mechanism (cross-server process idea)
  - Insert in docs/process, not runtime code; use this file as C canonical mapping source when template deltas apply.
- Check button expansion / richer diagnostics
  - Insert in `api/index.js` around `checkServerB(serverBUrl)` and `renderPage(state)` to add additional dependency probes.

### Stub Hooks

- `STUB-K-01` lives in `api/resolve.js` inside `renderStatusPage(test)` (`STUB_ENABLED=false` gate).
- Canonical activation contract: `.planning/templates/stubs/STUB-K-01.md`.
