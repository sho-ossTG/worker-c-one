# Worker C — yt-dlp Resolver

## What This Is

A stateless yt-dlp worker deployed on Vercel. It receives a video URL, runs the yt-dlp binary, and returns the direct media stream URL. Multiple identical instances run in parallel and are managed by a central Server B. The codebase must be simple enough that its owner understands every line.

## Core Value

Any worker instance must resolve a video URL reliably and report its own health clearly — everything else supports that.

## Current Milestone: v1.1 — Diagnostics and Connectivity

**Goal:** Operators can verify Server B is reachable from a worker instance, and Server B developers have a ready-made curl snippet to test /resolve.

**Target features:**
- Status page Server B connectivity check (pings SERVER_B_URL, shows reachable/unreachable/not configured)
- Status page curl snippet for /resolve with correct auth header format

## Requirements

### Validated

<!-- What shipped and was confirmed valuable. -->

- ✓ GET /resolve?url=X runs yt-dlp and returns a direct stream URL — v1.0
- ✓ Bearer token auth via WORKER_SECRET env var — v1.0
- ✓ GET /health returns JSON status (HTTP 200 ok / 503 error) — v1.0
- ✓ GET / returns HTML status page — v1.0
- ✓ WORKER_ID included in every response — v1.0
- ✓ Error detail returned when yt-dlp fails — v1.0
- ✓ Status page: WORKING/DEGRADED/BINARY ERROR headline driven by real resolve outcomes — v1.0
- ✓ Status page: session stats (requests, errors, avg response time, uptime) — v1.0
- ✓ Status page: recent errors log (last 10, in-memory) — v1.0
- ✓ Status page: last resolve attempt (timestamp, success/fail, duration) — v1.0
- ✓ Self-test result cached 30s on /health to avoid binary spawn on every poll — v1.0
- ✓ CLONE.md operator deployment checklist — v1.0
- ✓ SERVER_B_GUIDE.md step-by-step integration checklist — v1.0

### Active

- [ ] Status page shows Server B connectivity section (pings SERVER_B_URL, reachable/unreachable/not-configured)
- [ ] Status page shows curl snippet for /resolve with Authorization header
- [ ] .env.example and CLONE.md document SERVER_B_URL env var

### Out of Scope

- Server B implementation — separate repo/project
- Server A implementation — separate repo/project
- Persistent stats across cold starts — session-only is sufficient
- yt-dlp binary updates or self-update mechanism — binary is pre-compiled
- Per-worker secrets — all workers share one WORKER_SECRET

## Context

v1.0 delivered a clean worker rebuild with a full status page, operator documentation, and Server B integration guide. The codebase is now intentional and well-understood. v1.1 adds diagnostic features that make it easier for operators to verify the worker is correctly integrated with Server B.

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
| In-memory stats only | No budget for Redis on workers; session-only is sufficient for diagnostics | ✓ Good |
| Worker C pings Server B for connectivity | User wants each worker to verify B is reachable from its end | ✓ Good |
| Shared WORKER_SECRET across all workers | Simpler than per-worker secrets; B only needs one value | ✓ Good |
| Pre-compiled binary, no Python source | Dead weight removed; binary already works | ✓ Good |

---
*Last updated: 2026-02-26 after v1.0 completion — started v1.1 milestone*
