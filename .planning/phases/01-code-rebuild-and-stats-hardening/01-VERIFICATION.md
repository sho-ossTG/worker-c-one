---
phase: 01-code-rebuild-and-stats-hardening
verified: 2026-02-26T18:03:52Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 1: Code Rebuild and Stats Hardening — Verification Report

**Phase Goal:** The worker is honest — platform config is correct, the status page reflects real resolve outcomes, and operators get actionable diagnostics
**Verified:** 2026-02-26T18:03:52Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `vercel.json` declares Fluid Compute (`"fluid": true`) and sets `maxDuration: 60` | VERIFIED | `vercel.json` line 3: `"fluid": true`; line 6: `"maxDuration": 60` — confirmed by JSON parse |
| 2 | `package.json` pins Node.js to 22.x via the `engines` field | VERIFIED | `package.json` line 6-8: `"engines": { "node": "22.x" }` — confirmed by JSON parse |
| 3 | `execFile` timeout is 57000ms — 3 seconds under the 60s `maxDuration` cap | VERIFIED | `api/resolve.js` line 66: `{ timeout: 57000, maxBuffer: 1024 * 1024 }` |
| 4 | Status page headline shows IDLE / WORKING / DEGRADED based on real resolve outcomes, not the binary self-test | VERIFIED | `renderStatusPage` reads `resolveState` (set by resolve handler) to derive label; `!test.ok` only triggers BINARY ERROR — resolve state and binary state are independent branches |
| 5 | BINARY ERROR is visually distinct from DEGRADED (orange `#ff8800` vs red `#ff4444`) | VERIFIED | `api/resolve.js` lines 111-133: BINARY ERROR → color `#ff8800`, DEGRADED → color `#ff4444`; separate `dotBlink` logic; distinct error box labels "BINARY ERROR" vs "LAST RESOLVE ERROR" |
| 6 | When DEGRADED, the last resolve error text is shown on the status page | VERIFIED | Lines 172-178: `headlineState === "degraded" && lastResolveError` renders error box with `escapeHtml(lastResolveError)`; `lastResolveError` is set in both failure paths (empty URL and catch block) |
| 7 | Status page has a Session Stats section: uptime, total requests, error count, avg response time labeled "since last cold start" | VERIFIED | Lines 234-238: `<div class="section-header">Session Stats</div>` followed by Uptime, Total requests, Errors, Avg response time rows; total requests row text includes "since last cold start" |
| 8 | Status page shows the last resolve attempt: timestamp, success/fail, duration in ms | VERIFIED | Line 239: Last Resolve row renders `lastResolveHtml` which shows "success/failed · {durationMs}ms · {timestamp}" |
| 9 | Status page has a collapsed Recent Errors section (last 10 failures, newest first, with timestamp, truncated URL, error message) | VERIFIED | Lines 241-246: `<details>/<summary>` element shows `resolveErrors.length`; errors rendered via `.slice().reverse()` (newest first); each entry has `err-time`, `err-url`, `err-url` (60-char truncation), `err-msg` (300-char truncation) |
| 10 | A successful resolve after DEGRADED clears the state back to WORKING (self-heal) | VERIFIED | Lines 324-327: `if (directUrl && directUrl.startsWith("http")) { if (resolveState === "degraded" \|\| resolveState === "idle") resolveState = "working"; }` — condition is guarded to only fire on valid HTTP URLs |

**Score:** 10/10 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vercel.json` | Vercel platform config with Fluid Compute and correct timeout | VERIFIED | 12 lines, valid JSON; `fluid: true`, `maxDuration: 60`, `version: 2`, rewrites block intact |
| `package.json` | Node.js version pin | VERIFIED | 10 lines, valid JSON; `engines.node: "22.x"`, minimal fields as specified |
| `api/resolve.js` | Complete rebuilt worker with in-module state, instrumented resolve handler, rewritten status page | VERIFIED | 380 lines (well above 200-line minimum); exports `module.exports` request handler; no syntax errors (`node --check` passes) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `resolveState` module variable | `renderStatusPage` headline | `resolveState` is read inside `renderStatusPage` to derive `label` and `color` | WIRED | `renderStatusPage` body reads `resolveState` at lines 119/124/129; handler writes `resolveState` at lines 326/333/356 |
| `runYtDlp` call in handler | Module-level state variables | Timing wrapper updates `totalRequests`, `errorCount`, `totalDurationMs`, `lastResolve`, `resolveErrors`, `resolveState` | WIRED | `totalRequests++` at line 316; `t0 = Date.now()` at line 317; all six state vars updated in both success and error paths |
| `resolveErrors` array | Error log HTML section | `renderStatusPage` reads `resolveErrors` to render collapsible `<details>` block | WIRED | Line 153: `const errorsReversed = resolveErrors.slice().reverse()`; rendered into `errorEntriesHtml` at lines 154-162; injected into `<details>` at lines 241-246 |
| `vercel.json` `maxDuration: 60` | `api/resolve.js` `execFile` timeout | 60s function budget; `execFile` timeout is 57s (3s less for overhead) | WIRED | `maxDuration: 60` in vercel.json; `timeout: 57000` in resolve.js line 66 — 3s buffer maintained |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CONF-01 | 01-01 | `vercel.json` sets `maxDuration: 60` and enables Fluid Compute | SATISFIED | `vercel.json`: `"fluid": true`, `"maxDuration": 60` — confirmed by JSON.parse |
| CONF-02 | 01-02 | `execFile` timeout matches `vercel.json` (no silent mismatch) | SATISFIED | `timeout: 57000` in `runYtDlp` — 57s is 3s under the 60s cap, intentional buffer |
| CONF-03 | 01-01 | `package.json` pins `"engines": { "node": "22.x" }` | SATISFIED | `package.json` `engines.node: "22.x"` — confirmed by JSON.parse |
| PAGE-01 | 01-02 | Status page shows composite WORKING/DEGRADED headline based on real resolve outcomes | SATISFIED | `resolveState` drives headline; binary self-test only contributes `binary_error` state; four distinct visual states implemented |
| PAGE-02 | 01-02 | When DEGRADED, status page shows actual error text | SATISFIED | `lastResolveError` set in both failure paths; rendered in error box labeled "LAST RESOLVE ERROR" when `headlineState === "degraded"` |
| PAGE-03 | 01-02 | Session Stats: total requests, error count, avg response time, labeled "this instance, since last cold start" | SATISFIED | Session Stats section present; "since last cold start" appears in Total requests row; avg computed as `totalDurationMs / totalRequests` |
| PAGE-04 | 01-02 | Status page shows uptime/age since last cold start | SATISFIED | `COLD_START = Date.now()` at module init; `formatUptime(Date.now() - COLD_START)` called in `renderStatusPage`; output includes "since cold start" string |
| PAGE-05 | 01-02 | Recent errors log: last 10 failures, timestamp, truncated URL (60 chars), error message | SATISFIED | `resolveErrors` capped at 10 via `shift()`; URL truncated at 60 chars (`slice(0, 60)`); error truncated at 300 chars; displayed newest-first via `.slice().reverse()` |
| PAGE-06 | 01-02 | Last resolve attempt: timestamp, success/fail, response time in ms | SATISFIED | `lastResolve = { timestamp, ok, durationMs }` set in all paths; rendered as "success/failed · {durationMs}ms · {timestamp}" |

**Orphaned requirements check:** REQUIREMENTS.md maps DOC-01 through DOC-07 to Phase 2 (not Phase 1). No Phase 1 requirements are orphaned — all 9 IDs (CONF-01, CONF-02, CONF-03, PAGE-01 through PAGE-06) are claimed by plans 01-01 and 01-02 and verified above.

---

### Anti-Patterns Found

None. Full scan of `api/resolve.js` found:
- Zero TODO/FIXME/XXX/HACK/PLACEHOLDER comments
- Zero placeholder text patterns
- Zero `return null` / `return {}` / `return []` empty returns
- Zero `console.log` statements

---

### Human Verification Required

#### 1. Vercel Dashboard — Fluid Compute Active

**Test:** Log into Vercel dashboard, open this project's settings, confirm Fluid Compute is enabled for the project
**Expected:** Fluid Compute toggle is on; function duration cap shows 60s or higher
**Why human:** `fluid: true` in `vercel.json` is the code-side declaration, but Fluid Compute must also be enabled at the project level in the Vercel dashboard. The code cannot self-verify this. If it is not enabled, the effective `maxDuration` on Hobby tier is capped at 10s regardless of what `vercel.json` declares. This blocker was flagged in both SUMMARY files.

#### 2. Status Page Visual States — End-to-End Browser Test

**Test:** Deploy the worker, open the root URL in a browser, observe the status page renders without JS errors; then call `/resolve?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ` (with auth header), reload the status page, verify it shows "WORKING" (green, blinking dot); call `/resolve?url=https://invalid.invalid` (with auth header), reload, verify it shows "DEGRADED" (red, no blink) with error text in the error box
**Expected:** State transitions correctly from IDLE to WORKING to DEGRADED; error text from yt-dlp is shown in the LAST RESOLVE ERROR box
**Why human:** State machine transitions require actual resolve calls through the deployed binary. The logic is verified by code inspection, but the end-to-end visual behavior (colors, blink animation, error box content) requires a running deployment.

#### 3. Session Stats Accuracy

**Test:** Make 5 resolve calls (mix of success and failure), reload status page, verify total requests = 5, errors = N (matching actual failure count), avg response time is a plausible ms value
**Expected:** Counters accumulate correctly within a warm instance
**Why human:** Module-level state persistence depends on Vercel keeping the instance warm across requests. Cannot verify warm-instance behavior programmatically; needs a deployed environment with sequential requests.

---

### Gaps Summary

No gaps found. All 10 must-have truths are verified against actual code. All 9 requirement IDs claimed for Phase 1 are satisfied by the implementation. No anti-patterns detected.

The three human verification items above are deployment-time checks, not code defects. The code correctly implements everything specified.

---

_Verified: 2026-02-26T18:03:52Z_
_Verifier: Claude (gsd-verifier)_
