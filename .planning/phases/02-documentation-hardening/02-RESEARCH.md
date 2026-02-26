# Phase 2: Documentation Hardening - Research

**Researched:** 2026-02-26
**Domain:** Operator documentation — deployment checklist and integration guide
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Reader profile:**
- Target reader: developer who knows code and git but has not used Vercel before
- Explanation depth: include Vercel-specific steps (e.g., where to set env vars in the dashboard) — don't assume Vercel familiarity
- "Verified working" = open the worker URL in a browser and see the status page showing IDLE or WORKING
- CLONE.md includes a one-paragraph summary of the system architecture (Worker C → Server B → Server A) so operators understand why each step matters
- Multi-worker: brief "Adding a second worker" section at the end of CLONE.md — same steps, different project name and WORKER_ID

**CLONE.md structure:**
- Main numbered flow: fork/clone → deploy to Vercel → set env vars → verify in browser
- Nothing added to the main flow beyond those four stages
- Env var table placed inline immediately after the "Set env vars in Vercel dashboard" step — not at the end
- Verification step: navigate to `https://{your-domain}.vercel.app`, describe exactly what to see (IDLE or WORKING in the status page header)
- After the checklist: compact endpoint reference table (/, /health, /resolve) so operators know what they deployed

**Warnings and mistakes format:**
- Critical callouts use blockquote style: `> **⚠ Label:** explanation`
- Three common mistakes to cover:
  1. WORKER_SECRET not set
  2. WORKER_ID not set or left as default (all workers report same ID)
  3. Fluid Compute not active on Vercel (yt-dlp silently times out at 10s on Hobby without it)
- Each mistake entry format: **Mistake** (what went wrong) + **Symptom** (what you observe) + **Fix** (what to do)
- WORKER_SECRET gets double-emphasis: blockquote warning inline in the env var table step AND entry in the Common Mistakes section

**SERVER_B_GUIDE.md:**
- Rewrite as numbered checklist — step-by-step, not a code dump — but keep code examples embedded in context (not stripped out)
- WORKER_URLS pattern: step with example value (`WORKER_URLS=https://c1.vercel.app,https://c2.vercel.app`) and explicit note "Add a worker: append its URL to the CSV and redeploy Server B. No code changes."
- Same audience as CLONE.md: Vercel-beginner developer building Server B for the first time
- Move from `.planning/SERVER_B_GUIDE.md` to repo root (`SERVER_B_GUIDE.md`) alongside CLONE.md

### Claude's Discretion
- Exact Markdown formatting beyond the specified callout style
- Number of steps within each section
- Whether to use headers or bold labels for Mistake/Symptom/Fix within each entry

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOC-01 | `CLONE.md` exists as a numbered checklist covering: clone → deploy → set env vars → verify status page → register with Server B → verify routing | Checklist structure, all steps, and terminal verification criteria documented below |
| DOC-02 | `CLONE.md` includes an env var table with exact names, example values, and what happens if each is missing | Exact env var names/values extracted from source; consequence analysis documented below |
| DOC-03 | `CLONE.md` includes a "Common mistakes" section | Three mistakes with exact symptom/fix pairs documented below |
| DOC-04 | `SERVER_B_GUIDE.md` is rewritten with exact Vercel environment variable names and values for Server B | Current guide analyzed; gaps, outdated values, and restructuring needs documented below |
| DOC-05 | `SERVER_B_GUIDE.md` explains how to add unlimited Worker C instances to Server B's pool using the `WORKER_URLS` CSV env var | Pattern already in existing guide; just needs checklist formatting and the explicit "no code changes" note |
| DOC-06 | `SERVER_B_GUIDE.md` is structured as a step-by-step checklist, not just code snippets | Restructuring plan documented below |
| DOC-07 | `.env.example` documents all required env vars (`WORKER_ID`, `WORKER_SECRET`) with a prominent warning when `WORKER_SECRET` is not set | Current `.env.example` analyzed; gap: missing "what breaks" warnings |
</phase_requirements>

---

## Summary

Phase 2 is pure documentation — no code changes. The entire phase produces three files: `CLONE.md` (new, at repo root), `SERVER_B_GUIDE.md` (rewrite and move from `.planning/` to repo root), and an updated `.env.example` (add prominent warning for `WORKER_SECRET`). All information needed to write these documents already exists in the codebase; this is a authoring and structural task, not an engineering task.

The worker API contract is fully locked by Phase 1. Every endpoint, env var, response format, and timeout value can be read directly from `api/resolve.js`. The existing `.planning/SERVER_B_GUIDE.md` contains correct content but wrong structure (code dump, not checklist) and one stale timeout value (25000ms vs. the Phase 1 value of 57000ms execFile timeout with 60s maxDuration). All content gaps are known; no discovery work is needed during planning.

**Primary recommendation:** One plan, three file deliverables. Write CLONE.md from scratch, rewrite SERVER_B_GUIDE.md as a checklist with embedded code, update .env.example with prominent warnings.

---

## Standard Stack

This phase has no runtime dependencies, frameworks, or libraries. It is Markdown authoring only.

### Document Authoring Facts (HIGH confidence, verified from source)

| Document | Status | Action |
|----------|--------|--------|
| `CLONE.md` | Does not exist | Create at repo root |
| `SERVER_B_GUIDE.md` (repo root) | Does not exist | Create at repo root |
| `.planning/SERVER_B_GUIDE.md` | Exists (code dump format) | Source material for rewrite; delete after move |
| `.env.example` | Exists (minimal) | Update with prominent WORKER_SECRET warning |

**No npm install, no library choices, no configuration files.** The only tooling is the Markdown renderer (GitHub).

---

## Architecture Patterns

### Document Hierarchy

```
repo root/
├── CLONE.md              # New — operator deployment checklist (DOC-01, DOC-02, DOC-03)
├── SERVER_B_GUIDE.md     # New — Server B integration checklist (DOC-04, DOC-05, DOC-06)
├── .env.example          # Updated — env var warnings (DOC-07)
├── api/resolve.js        # Source of truth for all API details (DO NOT MODIFY)
├── vercel.json           # Source of truth for platform config (DO NOT MODIFY)
└── package.json          # Source of truth for Node version (DO NOT MODIFY)
```

### Pattern 1: Follow-and-Succeed Checklist
**What:** Every step has a concrete, observable outcome — the operator knows when they are done with each step.
**When to use:** For deployment guides aimed at Vercel beginners.
**Example structure:**
```markdown
## Step 3: Set environment variables

In your Vercel project dashboard:
1. Go to **Settings → Environment Variables**
2. Add the following variables:

| Variable | Example value | Required |
|----------|---------------|----------|
| `WORKER_ID` | `worker-c1` | Yes |
| `WORKER_SECRET` | `abc123...` | Yes |

> **⚠ Required for security:** Without this, anyone who knows your worker URL
> can use it. Set this before sharing the URL with Server B.

3. Click **Save** after adding each variable.
```

### Pattern 2: Mistake Entry Format
**What:** Each common mistake is a named entry with three components: what happened, what you see, and how to fix it.
**When to use:** "Common mistakes" section.
**Example:**
```markdown
**Mistake: WORKER_SECRET not set**
- **Symptom:** Anyone can call `/resolve` without authentication. The status page
  shows "Auth: disabled" in yellow.
- **Fix:** Add `WORKER_SECRET` to your Vercel environment variables and redeploy.
```

### Pattern 3: Inline Code with Step Context
**What:** Code snippets appear inside the step that needs them — not in a separate code-only section.
**When to use:** SERVER_B_GUIDE.md — keep code but wrap it in checklist steps.
**Example:**
```markdown
## Step 4: Parse the worker list

At B startup, split the CSV string into an array:

```js
const workers = process.env.WORKER_URLS.split(",").map(u => u.trim());
```

This runs once per cold start and builds the pool from whatever URLs are in the env var.
```

### Anti-Patterns to Avoid
- **Reference format, not procedural format:** Don't organize by "here are all the env vars" at the top. Env var table goes inline, at the step where it's needed.
- **Assuming Vercel knowledge:** Name the exact dashboard menu path (Settings → Environment Variables) — don't say "in your Vercel config."
- **Vague verification:** "Check that it works" is not a verification step. Specify exactly what to open and exactly what to read.
- **Code dump without context:** CODE blocks without surrounding prose that explains which step they belong to and why they exist.

---

## Don't Hand-Roll

This phase is pure documentation authoring. There are no libraries or custom implementations involved.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API endpoint docs | Writing from memory | Read from `api/resolve.js` source | Source is authoritative; memory introduces drift |
| Env var descriptions | Writing from memory | Read from `.env.example` and source | Phase 1 locked these values |
| Timeout values | Guessing | Read from `vercel.json` (maxDuration: 60) and `api/resolve.js` (57000ms) | Phase 1 changed the original 20s value |

---

## Common Pitfalls

### Pitfall 1: Stale timeout value in SERVER_B_GUIDE.md
**What goes wrong:** The existing `.planning/SERVER_B_GUIDE.md` has `AbortSignal.timeout(25000)` with comment "slightly above yt-dlp's 20s timeout." Phase 1 changed `maxDuration` to 60s and execFile timeout to 57000ms. The guide's value is now stale.
**Why it happens:** Guide was written before Phase 1 changed the timeout values.
**How to avoid:** Server B's fetch timeout should be 63000ms (57s worker execFile + 3s response overhead + a margin), or simply "slightly above 60s." The rewritten guide must update this value.
**Warning signs:** Comment says "20s" — Phase 1 changed this.

### Pitfall 2: Fluid Compute condition not fully explained
**What goes wrong:** Operators enable `maxDuration: 60` in `vercel.json` (already done in Phase 1) but don't know they also need to enable Fluid Compute in the Vercel project dashboard. The setting in `vercel.json` (`"fluid": true`) alone is not sufficient if the project-level dashboard toggle is off.
**Why it happens:** Vercel requires BOTH `"fluid": true` in `vercel.json` AND the Fluid Compute setting enabled per-project in the dashboard.
**How to avoid:** CLONE.md must explicitly say: after deploying, go to project Settings and confirm Fluid Compute is enabled. This is the mistake #3 documented in CONTEXT.md.
**Warning signs:** yt-dlp calls silently time out at 10s even though `vercel.json` says 60s.

### Pitfall 3: WORKER_ID collision across clones
**What goes wrong:** Operator clones the repo but doesn't change `WORKER_ID`. Both workers report the same ID in every response. Server B cannot distinguish which worker handled a request or failed.
**Why it happens:** `WORKER_ID` has a default fallback in code (`|| "worker"`) but `.env.example` has `WORKER_ID=worker-c1`. If two workers both use `worker-c1`, responses look identical.
**How to avoid:** CLONE.md must make WORKER_ID feel as mandatory as WORKER_SECRET. The "Adding a second worker" section must explicitly say "set WORKER_ID=worker-c2" (or any unique name).
**Warning signs:** `/health` from two different worker URLs both show the same `worker_id` value.

### Pitfall 4: Moving SERVER_B_GUIDE.md without removing the old copy
**What goes wrong:** New `SERVER_B_GUIDE.md` created at repo root but old `.planning/SERVER_B_GUIDE.md` left in place. Operators who discover the `.planning/` copy get outdated information.
**Why it happens:** File move requires both creating the new file AND deleting the old one.
**How to avoid:** Plan must explicitly include deleting `.planning/SERVER_B_GUIDE.md`.

---

## Code Examples

Authoritative values extracted from Phase 1 deliverables:

### Exact Env Vars (from `api/resolve.js`)
```
WORKER_ID     — process.env.WORKER_ID || "worker"   (default "worker" if not set)
WORKER_SECRET — process.env.WORKER_SECRET || ""      (default empty = auth disabled)
```

### Exact Timeout Values (from Phase 1)
```
vercel.json:     "maxDuration": 60    (60-second function limit)
api/resolve.js:  timeout: 57000       (execFile timeout, 3s less than maxDuration)
Server B should: AbortSignal.timeout(63000)  (slightly above 60s to let worker complete)
```

### Endpoints (from `api/resolve.js` and `vercel.json`)
```
GET /           — HTML status page (public, no auth)
GET /health     — JSON health check (public, no auth)
GET /resolve?url=X  — Resolve video URL (requires Authorization: Bearer <WORKER_SECRET>)
GET /?url=X         — Also resolves (rewrites route all to api/resolve.js)
```

### WORKER_SECRET callout (verbatim from CONTEXT.md specifics)
```markdown
> **⚠ Required for security:** Without this, anyone who knows your worker URL
> can use it. Set this before sharing the URL with Server B.
```

### Health response schema (from `api/resolve.js`)
```json
{
  "status": "ok",
  "worker_id": "worker-c1",
  "yt_dlp_version": "2024.xx.xx",
  "error": null,
  "region": "iad1",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```
HTTP 200 = healthy, HTTP 503 = degraded.

### Resolve success response
```json
{ "url": "https://cdn.example.com/video.mp4", "worker_id": "worker-c1" }
```

### Resolve failure response
```json
{ "error": "yt-dlp failed", "detail": "...", "worker_id": "worker-c1" }
```
HTTP status: 400 (bad input), 401 (auth fail), 500 (yt-dlp fail), 502 (empty URL returned).

### .env.example — current content
```
# Worker identity — set a unique value per deployment (e.g. worker-c1, worker-c2)
WORKER_ID=worker-c1

# Shared secret — Server B must send this in the Authorization header
# Leave empty to disable auth (not recommended in production)
WORKER_SECRET=change-this-to-a-random-secret
```
DOC-07 requires adding a prominent warning when WORKER_SECRET is not set. The update should add a `> **⚠ WARNING:**` style comment block above the `WORKER_SECRET` line.

---

## State of the Art

This is internal documentation. No ecosystem trends apply. The content standards that matter:

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Reference-style doc: all info, no sequence | Follow-and-succeed checklist: numbered steps, verifiable outcomes | Eliminates misconfiguration |
| Timeout: 25000ms (Phase 0 default) | Timeout: 60s maxDuration / 57s execFile (Phase 1) | Server B timeout must be updated |
| SERVER_B_GUIDE.md in `.planning/` | SERVER_B_GUIDE.md at repo root | Move + delete old copy required |

---

## Open Questions

1. **`.env.example` format for prominent WORKER_SECRET warning**
   - What we know: File is plain text; Markdown doesn't render in `.env.example` files
   - What's unclear: How to make the warning "prominent" in a plain-text format
   - Recommendation: Use comment-based warning block with ALL-CAPS, e.g., `# WARNING: If WORKER_SECRET is empty, the /resolve endpoint has no authentication.` — leave actual Markdown-style callouts to CLONE.md

2. **Server B's fetch timeout exact value**
   - What we know: Worker execFile timeout is 57s; maxDuration is 60s
   - What's unclear: Whether to document 63s (adds 6s buffer) or 65s (adds 8s buffer)
   - Recommendation: Document 63000ms (3s above maxDuration) — consistent with Phase 1's 3s response-overhead buffer pattern

---

## Sources

### Primary (HIGH confidence)
- `api/resolve.js` (Phase 1 deliverable) — all endpoint behavior, env var defaults, timeout values, response schemas
- `vercel.json` (Phase 1 deliverable) — maxDuration: 60, fluid: true
- `.planning/phases/02-documentation-hardening/02-CONTEXT.md` — locked decisions, structure, callout text, common mistakes
- `.planning/REQUIREMENTS.md` — DOC-01 through DOC-07 definitions
- `.env.example` — current content of the file to update

### Secondary (MEDIUM confidence)
- `.planning/SERVER_B_GUIDE.md` — content basis for rewrite (structure will change; content is largely valid, timeout stale)
- `.planning/STATE.md` — confirms Phase 1 complete and all code changes locked

### Tertiary (LOW confidence)
None.

---

## Metadata

**Confidence breakdown:**
- Deliverables scope: HIGH — fully defined in CONTEXT.md and REQUIREMENTS.md
- API contract details: HIGH — extracted directly from Phase 1 source files
- Content to author: HIGH — all source material exists; this is a writing task, not a research task
- Stale timeout in SERVER_B_GUIDE.md: HIGH — confirmed by comparing guide vs. api/resolve.js

**Research date:** 2026-02-26
**Valid until:** Stable — this phase references locked Phase 1 outputs. No external dependencies.
