# Technology Stack

**Analysis Date:** 2026-02-26

## Languages

**Primary:**
- JavaScript (Node.js) - All application logic and request handlers in `api/resolve.js`

**Binary:**
- yt-dlp binary (`bin/dlp-jipi`) - Pre-compiled executable for video URL resolution

## Runtime

**Environment:**
- Node.js 18+ (implied by Vercel serverless functions)

**Package Manager:**
- npm

**Lockfile:**
- Missing (minimal dependencies, no lock file needed)

## Frameworks

**Core:**
- Vercel Functions (Serverless) - Request handling and routing in `api/*.js` files

**Testing:**
- Not detected

**Build/Dev:**
- Vercel CLI (implicit) - Deployment configuration

## Key Dependencies

**Critical:**
- Node.js `child_process` (built-in) - Used to spawn yt-dlp binary process in `api/resolve.js`
- Node.js `path` (built-in) - Path resolution for binary location
- Node.js `URL` (built-in) - URL parsing and validation

**Note:** `package.json` shows `"dependencies": {}` - no third-party npm packages. Application relies entirely on Node.js built-in modules.

## Configuration

**Environment:**

All configuration via environment variables (no config files):
- `WORKER_ID` - Unique identifier for this worker instance (e.g., `worker-c1`)
- `WORKER_SECRET` - Bearer token for authentication; if empty, auth is disabled
- `VERCEL_REGION` - Auto-injected by Vercel (e.g., `iad1`); used in status page and health responses

**Deployment:**
- `vercel.json` - Vercel-specific configuration:
  - API routes: `api/*.js` mapped to serverless functions
  - Max function duration: 20 seconds (requires Vercel Pro tier)
  - URL rewriting: all paths routed to `/api/resolve`

**.env Example:**
- `.env.example` documents `WORKER_ID` and `WORKER_SECRET` for local/deployment setup

## Platform Requirements

**Development:**
- Node.js runtime for local testing
- Vercel CLI (optional, for local simulation)
- `bin/dlp-jipi` binary must be present for worker to function

**Production:**
- Vercel serverless platform (or compatible platform: Netlify Functions, AWS Lambda, etc.)
- Environment variables set in Vercel project dashboard
- Binary `bin/dlp-jipi` included in deployment package

## Server Specifications

**Function Timeout:**
- 20 seconds (set in `vercel.json`)
- Note: Vercel free tier caps at 10 seconds; Pro tier required for 20s

**Memory Allocation:**
- Vercel serverless default (typically 1024MB, non-configurable on free tier)

**Concurrency:**
- Vercel auto-scales based on request volume
- Each worker instance is independent

---

*Stack analysis: 2026-02-26*
