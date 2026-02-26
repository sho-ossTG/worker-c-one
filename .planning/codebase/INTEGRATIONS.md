# External Integrations

**Analysis Date:** 2026-02-26

## APIs & External Services

**Video URL Resolution:**
- yt-dlp - Open-source video downloader/extractor
  - Binary location: `bin/dlp-jipi` (pre-compiled executable)
  - Used for: Extracting direct media stream URLs from video provider links
  - Invocation: `execFile()` in `api/resolve.js` lines 36-57
  - Command args: `--no-playlist`, `--no-warnings`, format selection (`-f bv*+ba/b`), URL extraction (`-g`)
  - Timeout: 20 seconds (matches Vercel function timeout)

## Data Storage

**Databases:**
- None - Worker C is stateless

**File Storage:**
- Local filesystem only - `bin/dlp-jipi` binary stored locally
- No cloud storage integration

**Caching:**
- None at worker level - Cache responsibility delegated to Server B (uses Upstash Redis)

## Authentication & Identity

**Auth Provider:**
- Custom Bearer token authentication

**Implementation:**
- Location: `api/resolve.js` lines 19-23
- Method: Bearer token in `Authorization` header
- Token: Shared secret stored in `WORKER_SECRET` environment variable
- Behavior:
  - If `WORKER_SECRET` empty string → auth disabled (warning: not recommended in production)
  - If `WORKER_SECRET` set → requests to `/resolve` endpoint must include `Authorization: Bearer {WORKER_SECRET}`
  - Public endpoints (`/`, `/health`) always accessible without auth
  - Unauthorized requests return HTTP 401 with error message
- Consumers: Server B (central orchestrator) must send valid Bearer token with every `/resolve` request

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service integrated

**Logs:**
- None - No structured logging. Errors returned in response JSON payloads.
- Status/Health information available via `/health` endpoint for Server B to poll

**Status Endpoints:**
- `GET /health` - JSON health check endpoint (lines 140-153)
  - Returns: `status`, `worker_id`, `yt_dlp_version`, `error`, `region`, `timestamp`
  - HTTP 200 if healthy, HTTP 503 if degraded
  - Used by Server B for health polling (no auth required)

- `GET /` (no query params) - HTML status page with self-test (lines 156-162)
  - Displays: Worker ID, region, binary status, yt-dlp version, auth status, endpoints
  - Human-readable UI with visual indicators
  - Self-test runs `yt-dlp --version` to verify binary and get version string

## CI/CD & Deployment

**Hosting:**
- Vercel serverless platform (https://vercel.com)

**CI Pipeline:**
- Not configured - Manual or git-push deployment via Vercel

**Deployment Process:**
- Push to GitHub → Vercel auto-deploys (if connected)
- Or: Deploy via Vercel CLI (`vercel deploy`)
- Each worker deployment = new Vercel project with unique URL

## Environment Configuration

**Required env vars:**
- `WORKER_ID` (Required) - Unique identifier per worker (e.g., `worker-c1`, `worker-c2`)
  - Set in Vercel project dashboard
  - Included in all JSON responses for tracing

- `WORKER_SECRET` (Recommended) - Shared secret for Server B to send in Bearer token
  - Set in Vercel project dashboard
  - All workers share same secret
  - Leave empty to disable auth (not production-recommended)
  - Used by `checkAuth()` function at lines 19-23

**Auto-injected by Vercel:**
- `VERCEL_REGION` - Region identifier (e.g., `iad1`)
  - Automatically available in Vercel Functions
  - Included in health check and status page responses

**Secrets location:**
- Vercel project settings → Environment Variables
- Server B docs: `.planning/SERVER_B_GUIDE.md`

## Webhooks & Callbacks

**Incoming:**
- `/resolve?url={encoded_url}` - Webhook-like endpoint for Server B to call
  - Method: GET (could be adapted to POST with small changes)
  - Auth: Bearer token in header
  - Called by: Server B's load balancer (round-robin selection)

**Outgoing:**
- None - Worker C does not call external services except yt-dlp binary

## Server B Integration

**Expected by Server B:**

Server B will:
1. Store worker URLs in env var: `WORKER_URLS=https://c1.vercel.app,https://c2.vercel.app,...`
2. Pick worker via round-robin (atomic counter in Redis)
3. Call: `GET {worker_url}/resolve?url={encoded_url}` with `Authorization: Bearer {secret}`
4. Health check: Poll `GET {worker_url}/health` to check `status: "ok"` and HTTP 200
5. On worker failure: Retry with next worker (automatic failover)
6. Cache resolved URLs in Upstash Redis (~5 hour TTL)

See `.planning/SERVER_B_GUIDE.md` for full Server B implementation details.

---

*Integration audit: 2026-02-26*
