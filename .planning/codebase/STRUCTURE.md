# Codebase Structure

**Analysis Date:** 2026-02-26

## Directory Layout

```
yt-dlp/
├── api/                    # HTTP request handlers (Vercel Functions)
│   └── resolve.js          # Single entry point for all requests
├── bin/                    # Pre-compiled binaries
│   └── dlp-jipi            # yt-dlp binary (executable, 36MB)
├── .planning/              # Documentation
│   ├── codebase/           # Codebase analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
│   └── SERVER_B_GUIDE.md   # Integration guide for Server B
├── package.json            # Node.js project metadata
├── vercel.json             # Vercel deployment configuration
├── .env.example            # Environment variable template
└── favicon.ico             # Favicon
```

## Directory Purposes

**api/:**
- Purpose: Vercel Functions entry point. Contains all request handling logic.
- Contains: HTTP route handlers, helper functions, validation, error responses
- Key files: `api/resolve.js`

**bin/:**
- Purpose: Pre-compiled yt-dlp binary (cross-platform executable)
- Contains: Single binary `dlp-jipi` (~36 MB, pre-built)
- Deployed as-is; no build step needed
- Must exist for worker to function; status page will show clear error if missing

**.planning/:**
- Purpose: Project documentation and guides
- Contains: Architecture analysis, structure map, integration guide
- Key files: `SERVER_B_GUIDE.md` (how to build/integrate Server B), `codebase/` folder (GSD-generated analysis)

## Key File Locations

**Entry Points:**
- `api/resolve.js`: Main HTTP handler, routes all requests, defines all endpoints (`/`, `/health`, `/resolve`)

**Configuration:**
- `vercel.json`: Routes all incoming requests to `api/resolve.js`, sets 20-second timeout
- `package.json`: Declares project name (`worker-c`), CommonJS module type
- `.env.example`: Documents required environment variables (`WORKER_ID`, `WORKER_SECRET`)

**Core Logic:**
- `api/resolve.js`: Contains all business logic:
  - Helper functions: `isHttpUrl()`, `checkAuth()`, `escapeHtml()`
  - Core functions: `runYtDlp()`, `runSelfTest()`
  - Rendering: `renderStatusPage()`
  - Request handler: Main module.exports function

**Binaries:**
- `bin/dlp-jipi`: Pre-compiled yt-dlp executable (called via `execFile()` from `api/resolve.js`)

## Naming Conventions

**Files:**
- `resolve.js`: Request handler module, named for primary function (resolve video URLs)
- `dlp-jipi`: Executable name (custom binary name for clarity, distinct from generic `yt-dlp`)
- `api/*.js`: Vercel Functions convention — all files in `api/` become serverless functions

**Directories:**
- `api/`: Vercel standard directory for Functions
- `bin/`: Standard Unix convention for binaries

**Environment Variables:**
- `WORKER_ID`: Unique identifier per deployment (e.g., `worker-c1`, `worker-c2`)
- `WORKER_SECRET`: Shared Bearer token for authentication (same across all workers)
- `VERCEL_REGION`: Set by Vercel runtime (e.g., `iad1`), used for status page

**Variables/Functions (in `api/resolve.js`):**
- `BINARY`: Path to executable
- `WORKER_ID`: Environment variable for worker identity
- `WORKER_SECRET`: Environment variable for shared secret
- `isHttpUrl()`: URL validation helper
- `checkAuth()`: Bearer token validation
- `escapeHtml()`: HTML escaping for status page
- `runYtDlp()`: Core video resolution function
- `runSelfTest()`: Health check function
- `renderStatusPage()`: Status page HTML generator

## Where to Add New Code

**New Feature (e.g., new endpoint):**
- Primary code: `api/resolve.js`
- Edit the main request handler (line 134) to add another `if (pathname === "/new-path")` block
- Add helper functions above the request handler as needed
- All endpoints return JSON with `worker_id` included for tracing

**New Utility Function (e.g., logging, formatting):**
- Location: `api/resolve.js` → add to helpers section (around line 8-30)
- Keep stateless; no database or persistent state
- Ensure pure functions where possible (no side effects except console output)

**Tests:**
- No test suite currently. If adding tests:
  - Location: `api/resolve.test.js` (co-located with handler)
  - Mock `execFile` for `runYtDlp()` tests
  - Mock `WORKER_SECRET` for auth tests
  - Mock `VERCEL_REGION` for status page tests

**Configuration (e.g., new env var):**
- Add variable to `.env.example` with documentation comment
- Read in `api/resolve.js` using `process.env.VAR_NAME`
- Default to sensible value if possible (e.g., `process.env.WORKER_ID || "worker"`)

## Special Directories

**.planning/:**
- Purpose: Documentation only (not deployed)
- Generated: Mixed (contains both hand-written and GSD-generated documents)
- Committed: Yes (part of git repo)

**.git/:**
- Purpose: Git version control
- Generated: Yes (standard git directory)
- Committed: Yes

**node_modules/ (if created):**
- Purpose: Installed npm dependencies
- Generated: Yes (from `npm install`)
- Committed: No (listed in `.gitignore`)

## Project Size and Scope

**Code Volume:**
- Main handler: `api/resolve.js` = 223 lines (single file, includes HTML, all logic, helpers)
- Package metadata: ~10 lines
- Configuration: ~10 lines
- Total source: ~23 KB

**Production Package:**
- Binary: `bin/dlp-jipi` = 36 MB (pre-compiled, no build needed)
- Source code: <1 MB
- Total deployed: ~36 MB

**Deployment Model:**
- Vercel Serverless Functions (stateless, auto-scaling)
- Each deployment is independent (own URL, own env vars)
- No inter-worker communication or shared state
- Server B handles load balancing and failover

---

*Structure analysis: 2026-02-26*
