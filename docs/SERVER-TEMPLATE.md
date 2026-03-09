# Server C Template (Canonical)

Canonical note: this file is the source template for C worker repositories.

## Server identity & role

- **Server:** C (worker)
- **Runtime:** Vercel serverless functions
- **Primary role:** Resolve input video URLs with yt-dlp and return direct stream URL
- **Out of scope:** Worker pool orchestration (B), request gateway validation (D), addon formatting (A)

## File & folder structure

- `api/resolve.js` - worker status page, health route, and resolve handler
- `bin/dlp-jipi` - yt-dlp executable used by resolve path
- `docs/SERVER-TEMPLATE.md` - canonical C baseline for all C repos
- `_archive/` - archived duplicate guides (`SERVER_B_GUIDE.md`)

## Contracts & dependencies

- **Inbound from B:** `GET /api/resolve?url=<encoded>`
- **Inbound health:** `GET /health` (consumed by B status)
- **Headers:** reads `x-correlation-id` and logs it; no hard auth gate currently enforced on resolve runtime path
- **Env contract:** worker identity via `WORKER_ID`; optional `WORKER_SECRET` may be set for future hard enforcement
- **B worker pool contract reference:** B discovers workers through `SERVER_C1_URL..SERVER_C9_URL` (not `WORKER_URLS`)
- **Cross-reference:** `.planning/phases/11-architecture-baseline-stubs-repo-cleanup/11-CONTRACT-MATRIX.md`

## Functional vs non-functional ideas

- ✅ Resolve endpoint executes yt-dlp with bounded timeout
- ✅ Status and health endpoints expose runtime state
- ✅ Structured JSON error logging with correlation ID
- 🚧 Future strict worker bearer enforcement can be scaffolded as a gated stub before activation

## Cross-server change impact

- Changes to resolve request/response shape impact B retry/orchestration logic
- Health response changes impact B dashboard parsing
- Use matrix change checklist before merging cross-server contract edits

## Verification notes

- `GET /health` returns `200` or `503` status payload with worker metadata
- `GET /api/resolve?url=<http(s)>` returns `200` and resolved url JSON on success
- Invalid or missing url returns 4xx with error payload
