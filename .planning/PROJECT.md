# Worker C — yt-dlp Resolver

## What This Is

A stateless yt-dlp worker deployed on Vercel. It receives a video URL, runs the yt-dlp binary, and returns the direct media stream URL. Multiple identical instances run in parallel and are managed by a central Server B. The codebase must be simple enough that its owner understands every line.

## Core Value

Any worker instance must resolve a video URL reliably and report its own health clearly — everything else supports that.

## Requirements

### Validated

<!-- What the current code already does. -->

- ✓ GET /resolve?url=X runs yt-dlp and returns a direct stream URL — existing
- ✓ Bearer token auth via WORKER_SECRET env var — existing
- ✓ GET /health returns JSON status (HTTP 200 ok / 503 error) — existing
- ✓ GET / returns an HTML status page with a self-test result — existing
- ✓ WORKER_ID included in every response — existing
- ✓ Error detail returned when yt-dlp fails — existing

### Active

- [ ] Worker C code is rebuilt cleanly so every line is understood and intentional
- [ ] Status page shows in-session stats: request count, avg response time, last resolve attempt (timestamp + success/fail)
- [ ] Status page shows recent errors log (last 10, in-memory, resets on cold start)
- [ ] Status page shows Worker C → Server B connectivity check (Worker C pings SERVER_B_URL)
- [ ] Status page shows clear WORKING / DEGRADED headline with specific error details
- [ ] SERVER_B_GUIDE.md rewritten as a step-by-step checklist with exact Vercel env var names and values
- [ ] SERVER_B_GUIDE.md covers how to add unlimited Worker C instances to B's pool
- [ ] README or CLONE.md documents exactly how to clone and deploy a new worker instance

### Out of Scope

- Server B implementation — separate repo/project
- Server A implementation — separate repo/project
- Persistent stats across cold starts — session-only is sufficient
- yt-dlp binary updates or self-update mechanism — binary is pre-compiled
- Per-worker secrets — all workers share one WORKER_SECRET

## Context

This is a brownfield project. The existing code in `api/resolve.js` is functional but was modified by AI without the owner's knowledge. The goal is a clean rebuild the owner can read and trust, not a feature overhaul. The yt-dlp binary lives at `bin/dlp-jipi` and works correctly.

System architecture:
- Server A → Server B → Worker C-1, C-2, C-3, ...
- Server B picks a worker (round-robin), calls /resolve, caches the result in Redis
- Workers are fully stateless — no DB, no sync between instances
- Everything runs on Vercel (free/hobby tier)

The status page connectivity check (Worker C → Server B) requires a `SERVER_B_URL` env var on each worker instance.

## Constraints

- **Platform**: Vercel serverless — no persistent memory between cold starts
- **Timeout**: Vercel hobby tier caps at 10s per function; yt-dlp can exceed that
- **Binary**: `bin/dlp-jipi` must exist; no Python source is present
- **Stats**: In-memory only — reset on cold starts, no external store

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| In-memory stats only | No budget for Redis on workers; session-only is sufficient for diagnostics | — Pending |
| Worker C pings Server B for connectivity | User wants each worker to verify B is reachable from its end | — Pending |
| Shared WORKER_SECRET across all workers | Simpler than per-worker secrets; B only needs one value | ✓ Good |
| Pre-compiled binary, no Python source | Dead weight removed; binary already works | ✓ Good |

---
*Last updated: 2026-02-26 after initialization*
