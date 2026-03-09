# Server C Template (Canonical)

C canonical template: this file (`worker-c-one/docs/SERVER-TEMPLATE.md`) is the canonical source for every Server C repository; copy from there when updating any other C repo template.

## Server identity & role

- **Server:** C (worker)
- **Runtime:** Vercel serverless functions
- **Primary role:** Resolve input URLs with yt-dlp and return direct stream URLs to B
- **Out of scope:** Worker pool orchestration and failure drain logic (B), ingress normalization/rate controls (D), addon rendering (A)

## File & folder structure

- `api/resolve.js` - main worker handler for `/`, `/health`, `/resolve`, and `/api/resolve`
- `bin/dlp-jipi` - yt-dlp binary used for stream URL extraction
- `docs/SERVER-TEMPLATE.md` - canonical C template under mandatory sync governance
- `.env.example` - documented worker env contract hints (`WORKER_ID`, `SERVER_B_URL`)
- `_archive/` - non-runtime archived docs/artifacts

## Contracts & dependencies

- **Inbound B -> C resolve:** `GET /api/resolve?url=<encoded>` (also supports `/resolve?url=` and `/?url=` paths)
- **Inbound B -> C health:** `GET /health` for worker reachability checks
- **Headers:** consumes `x-correlation-id` when present and generates UUID fallback for logs when missing
- **Response contracts:** success `200 { url, worker_id }`; invalid input `400`; execution failure `500`/`502` with JSON error payload
- **Env vars (runtime):** `WORKER_ID`, `VERCEL_REGION` (platform), optional `WORKER_SECRET` (not enforced in current resolve runtime)
- **B worker URL convention:** B discovers workers via indexed `SERVER_C1_URL`..`SERVER_C9_URL` contract
- **Cross-reference:** `.planning/phases/11-architecture-baseline-stubs-repo-cleanup/11-CONTRACT-MATRIX.md` rows `B -> C` and `C -> B`

## Functional vs non-functional ideas

- ✅ Functional - yt-dlp execution path with bounded timeout in `api/resolve.js`
- ✅ Functional - `/health` status payload and `/` status page for runtime visibility
- ✅ Functional - structured JSON logs including correlation ID and event names
- 🚧 Non-functional (stub) - strict bearer enforcement on resolve ingress; insert behind `const STUB_ENABLED = false` in `api/resolve.js`
- 🚧 Non-functional (stub) - richer worker metrics export endpoint; insert behind `const STUB_ENABLED = false` in `api/resolve.js`
- 🚧 Non-functional (stub) - STUB-K-01 curl snippet helper for `/api/resolve`; insert behind `const STUB_ENABLED = false` in `worker-c-one/api/resolve.js` `renderStatusPage()`

## Cross-server change impact

- Resolve response changes impact B retry logic and payload validation behavior
- Health payload shape changes impact B dashboard/reachability interpretation
- Execute Change Propagation Checklist in `11-CONTRACT-MATRIX.md` for any B <-> C contract updates

## Verification notes

- `GET /health` returns `200` or `503` JSON with `worker_id`, `yt_dlp_version`, and timestamp fields
- `GET /api/resolve?url=<http(s)>` returns `200` with `{ url, worker_id }` on success
- Missing `url` query returns `400`; malformed/non-http(s) URL also returns `400`
