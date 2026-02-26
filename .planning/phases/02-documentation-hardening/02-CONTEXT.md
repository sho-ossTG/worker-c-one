# Phase 2: Documentation Hardening - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Create two operator-facing documents: `CLONE.md` (step-by-step checklist to deploy a worker from zero to verified-working) and an overhauled `SERVER_B_GUIDE.md` (step-by-step checklist for building Server B integration). Both are follow-and-succeed guides, not reference material. No new code, no new features — documentation only.

</domain>

<decisions>
## Implementation Decisions

### Reader profile
- Target reader: developer who knows code and git but has not used Vercel before
- Explanation depth: include Vercel-specific steps (e.g., where to set env vars in the dashboard) — don't assume Vercel familiarity
- "Verified working" = open the worker URL in a browser and see the status page showing IDLE or WORKING
- CLONE.md includes a one-paragraph summary of the system architecture (Worker C → Server B → Server A) so operators understand why each step matters
- Multi-worker: brief "Adding a second worker" section at the end of CLONE.md — same steps, different project name and WORKER_ID

### CLONE.md structure
- Main numbered flow: fork/clone → deploy to Vercel → set env vars → verify in browser
- Nothing added to the main flow beyond those four stages
- Env var table placed inline immediately after the "Set env vars in Vercel dashboard" step — not at the end
- Verification step: navigate to `https://{your-domain}.vercel.app`, describe exactly what to see (IDLE or WORKING in the status page header)
- After the checklist: compact endpoint reference table (/, /health, /resolve) so operators know what they deployed

### Warnings and mistakes format
- Critical callouts use blockquote style: `> **⚠ Label:** explanation`
- Three common mistakes to cover:
  1. WORKER_SECRET not set
  2. WORKER_ID not set or left as default (all workers report same ID)
  3. Fluid Compute not active on Vercel (yt-dlp silently times out at 10s on Hobby without it)
- Each mistake entry format: **Mistake** (what went wrong) + **Symptom** (what you observe) + **Fix** (what to do)
- WORKER_SECRET gets double-emphasis: blockquote warning inline in the env var table step AND entry in the Common Mistakes section

### SERVER_B_GUIDE.md
- Rewrite as numbered checklist — step-by-step, not a code dump — but keep code examples embedded in context (not stripped out)
- WORKER_URLS pattern: step with example value (`WORKER_URLS=https://c1.vercel.app,https://c2.vercel.app`) and explicit note "Add a worker: append its URL to the CSV and redeploy Server B. No code changes."
- Same audience as CLONE.md: Vercel-beginner developer building Server B for the first time
- Move from `.planning/SERVER_B_GUIDE.md` to repo root (`SERVER_B_GUIDE.md`) alongside CLONE.md

### Claude's Discretion
- Exact Markdown formatting beyond the specified callout style
- Number of steps within each section
- Whether to use headers or bold labels for Mistake/Symptom/Fix within each entry

</decisions>

<specifics>
## Specific Ideas

- WORKER_SECRET callout: `> **⚠ Required for security:** Without this, anyone who knows your worker URL can use it. Set this before sharing the URL with Server B.`
- Fluid Compute mistake: symptom is yt-dlp calls returning after ~10s with a timeout error; fix is to confirm Fluid Compute is enabled in the Vercel project dashboard
- The "Adding a second worker" note at the end: "Same steps above. Use a new Vercel project name and set WORKER_ID=worker-c2. No code changes."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-documentation-hardening*
*Context gathered: 2026-02-26*
