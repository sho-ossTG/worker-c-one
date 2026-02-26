# Phase 1: Code Rebuild and Stats Hardening - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild `api/resolve.js` with correct platform config (vercel.json maxDuration, execFile timeout, Node.js version pin), an honest WORKING/DEGRADED/IDLE headline, in-session stats section, and a collapsible recent errors log. All changes confined to `api/resolve.js`, `vercel.json`, and `package.json`. No new npm dependencies.

</domain>

<decisions>
## Implementation Decisions

### WORKING/DEGRADED/IDLE logic

- **Three headline states:** IDLE (no resolves yet this session), WORKING, DEGRADED
- **IDLE:** Binary self-test passed but zero resolve attempts — fresh cold start, no traffic yet
- **WORKING:** Binary self-test passed AND no resolve failures have occurred this session
- **DEGRADED:** Any resolve failure this session triggers DEGRADED immediately — stays DEGRADED until a successful resolve clears it (self-healing)
- **Binary failure vs resolve failure are visually distinct:** Different color/label — e.g. "BINARY ERROR" vs "RESOLVE ERROR" — not the same DEGRADED appearance
- **Self-heals:** A successful resolve after failures clears DEGRADED back to WORKING

### Stats display

- Stats appear in a **separate section with a header** (e.g. "Session Stats") — not mixed into the static info rows
- Static info (worker ID, region, binary, version, auth) stays in the existing row format above
- Stats section is below the static info
- Instance uptime displays as **human-readable duration** (e.g. "4 min 12 sec since cold start")

### Error log

- **Collapsed by default** — shows a count row (e.g. "Recent errors: 3") that expands on click
- Each error entry shows: **timestamp**, **URL prefix (first 60 chars)**, **error message (truncated ~300 chars)**
- Response time NOT included per entry
- Error log section appears after the stats section

### Claude's Discretion

- Exact HTML/CSS for the collapsible error log (inline JS toggle is fine, no external deps)
- Spacing, typography, color choices within the existing dark theme
- Exact truncation display (e.g. "url..." suffix)
- Self-test cache duration (30s recommended by research)
- Comment style and density in the rebuilt code

</decisions>

<specifics>
## Specific Ideas

- The user wants to understand every line — keep the code clean and linear, avoid clever abstractions
- The existing dark theme (#0a0a0a background, monospace font) should be preserved
- Binary self-test failure vs resolve failure should be visually distinct so the operator immediately knows which kind of problem they have

</specifics>

<deferred>
## Deferred Ideas

- Server B connectivity check (Worker C pings SERVER_B_URL) — deferred to v2 per requirements scoping
- Code comments/explanatory annotations — user did not select this area; Claude has discretion

</deferred>

---

*Phase: 01-code-rebuild-and-stats-hardening*
*Context gathered: 2026-02-26*
