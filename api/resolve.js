const { execFile } = require("child_process");
const path = require("path");

const BINARY = path.join(process.cwd(), "bin", "dlp-jipi");
const WORKER_ID = process.env.WORKER_ID || "worker";

// ─── Session state (reset on each cold start) ────────────────────────────────

const COLD_START = Date.now();

let totalRequests   = 0;
let errorCount      = 0;
let totalDurationMs = 0;

let lastResolve     = null;  // { timestamp, ok, durationMs }
let resolveErrors   = [];    // last 10 failures, oldest first

// resolveState: "idle" | "working" | "degraded"
let resolveState     = "idle";
let lastResolveError = null;

// Self-test cache (30s TTL — avoids spawning yt-dlp on every /health poll)
let selfTestCache  = null;
let selfTestExpiry = 0;

// ─── Helpers ────────────────────────────────────────────────────────────────

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Core functions ──────────────────────────────────────────────────────────

function runYtDlp(inputUrl) {
  return new Promise((resolve, reject) => {
    execFile(
      BINARY,
      [
        "--no-playlist",
        "--no-warnings",
        "--add-header",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-f", "bv*+ba/b",
        "-g",
        inputUrl,
      ],
      { timeout: 57000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(String(stderr || err.message || err).trim().slice(0, 1200)));
          return;
        }
        const url = String(stdout).trim().split("\n").filter(Boolean)[0] || "";
        resolve(url);
      }
    );
  });
}

function runSelfTest() {
  return new Promise((resolve) => {
    execFile(BINARY, ["--version"], { timeout: 5000 }, (err, stdout) => {
      if (err) resolve({ ok: false, error: String(err.message || err).trim() });
      else resolve({ ok: true, version: stdout.trim() });
    });
  });
}

async function runSelfTestCached() {
  if (selfTestCache && Date.now() < selfTestExpiry) return selfTestCache;
  const result = await runSelfTest();
  selfTestCache = result;
  selfTestExpiry = Date.now() + 30_000;
  return result;
}

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s since cold start`;
  if (m > 0) return `${m}m ${s}s since cold start`;
  return `${s}s since cold start`;
}

// ─── Status page (human-readable) ───────────────────────────────────────────

function renderStatusPage(test) {
  // Derive composite headline state
  let headlineState;
  let color;
  let label;
  let dotBlink = false;

  if (!test.ok) {
    headlineState = "binary_error";
    color = "#ff8800";
    label = "BINARY ERROR";
  } else if (resolveState === "working") {
    headlineState = "working";
    color = "#00ff5a";
    label = "WORKING";
    dotBlink = true;
  } else if (resolveState === "degraded") {
    headlineState = "degraded";
    color = "#ff4444";
    label = "DEGRADED";
  } else {
    // idle
    headlineState = "idle";
    color = "#888888";
    label = "IDLE";
  }

  const region = process.env.VERCEL_REGION || "unknown";

  // Session stats
  const uptime = formatUptime(Date.now() - COLD_START);
  const avgMs = totalRequests > 0 ? Math.round(totalDurationMs / totalRequests) : null;

  // Last resolve row
  let lastResolveHtml;
  if (!lastResolve) {
    lastResolveHtml = `<span style="color:#555">no resolves yet</span>`;
  } else if (lastResolve.ok) {
    lastResolveHtml = `<span class="ok">success · ${lastResolve.durationMs}ms · ${escapeHtml(lastResolve.timestamp)}</span>`;
  } else {
    lastResolveHtml = `<span class="err">failed · ${lastResolve.durationMs}ms · ${escapeHtml(lastResolve.timestamp)}</span>`;
  }

  // Recent errors (newest first)
  const errorsReversed = resolveErrors.slice().reverse();
  const errorEntriesHtml = errorsReversed.map(e => {
    const urlDisplay = e.url.length >= 60 ? escapeHtml(e.url) + "…" : escapeHtml(e.url);
    const errDisplay = e.error.length >= 300 ? escapeHtml(e.error) + "…" : escapeHtml(e.error);
    return `<div class="error-entry">
      <span class="err-time">${escapeHtml(e.timestamp)}</span>
      <span class="err-url">${urlDisplay}</span>
      <span class="err-msg">${errDisplay}</span>
    </div>`;
  }).join("");

  // Error box below card
  let errorBoxHtml = "";
  if (headlineState === "binary_error" && test.error) {
    errorBoxHtml = `
    <div class="error-box">
      <div class="error-label">BINARY ERROR</div>
      <div class="error-text">${escapeHtml(test.error)}</div>
    </div>`;
  } else if (headlineState === "degraded" && lastResolveError) {
    errorBoxHtml = `
    <div class="error-box">
      <div class="error-label">LAST RESOLVE ERROR</div>
      <div class="error-text">${escapeHtml(lastResolveError)}</div>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${WORKER_ID} — Status</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; color: #ccc; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { border: 1px solid ${color}44; padding: 32px; border-radius: 12px; box-shadow: 0 0 30px ${color}12; max-width: 480px; width: 100%; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: ${color}; box-shadow: 0 0 10px ${color}; flex-shrink: 0; ${dotBlink ? "animation: blink 2s infinite;" : ""} }
    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .title { font-size: 1.15rem; color: ${color}; letter-spacing: 1px; font-weight: bold; }
    .subtitle { font-size: 0.75rem; color: #444; margin-top: 3px; }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid #141414; font-size: 0.85rem; }
    .row:last-child { border-bottom: none; }
    .label { color: #555; }
    .val { color: #ddd; }
    .ok { color: #00ff5a; }
    .warn { color: #ffaa00; }
    .err { color: #ff4444; }
    .error-box { margin-top: 20px; background: #120000; border: 1px solid #ff444430; border-radius: 8px; padding: 14px; }
    .error-label { color: #ff4444; font-size: 0.78rem; font-weight: bold; margin-bottom: 8px; }
    .error-text { font-size: 0.78rem; color: #ff8888; line-height: 1.6; word-break: break-all; white-space: pre-wrap; }
    .section-header { color: #444; font-size: 0.75rem; letter-spacing: 1px; text-transform: uppercase; padding: 14px 0 6px; border-bottom: 1px solid #1a1a1a; }
    .error-log { margin-top: 4px; }
    .error-entry { border-bottom: 1px solid #141414; padding: 8px 0; font-size: 0.78rem; }
    .err-time { color: #555; display: block; }
    .err-url { color: #888; display: block; word-break: break-all; }
    .err-msg { color: #ff8888; display: block; word-break: break-all; white-space: pre-wrap; }
    details summary { cursor: pointer; color: #555; font-size: 0.85rem; padding: 9px 0; }
    details summary:hover { color: #888; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="dot"></div>
      <div>
        <div class="title">${escapeHtml(WORKER_ID.toUpperCase())} — ${label}</div>
        <div class="subtitle">yt-dlp worker · Vercel Serverless</div>
      </div>
    </div>

    <div class="row"><span class="label">Worker ID</span><span class="val">${escapeHtml(WORKER_ID)}</span></div>
    <div class="row"><span class="label">Region</span><span class="val">${escapeHtml(region)}</span></div>
    <div class="row"><span class="label">Binary</span><span class="${test.ok ? "ok" : "err"}">${test.ok ? "✓ found" : "✗ missing"}</span></div>
    <div class="row"><span class="label">yt-dlp version</span><span class="val">${escapeHtml(test.version || "—")}</span></div>
    <div class="row"><span class="label">Self-test</span><span class="${test.ok ? "ok" : "err"}">${test.ok ? "✓ pass" : "✗ fail"}</span></div>
    <div class="row"><span class="label">Resolve endpoint</span><span class="val">GET /resolve?url=…</span></div>
    <div class="row"><span class="label">Health endpoint</span><span class="val">GET /health</span></div>

    <div class="section-header">Session Stats</div>
    <div class="row"><span class="label">Uptime</span><span class="val">${escapeHtml(uptime)}</span></div>
    <div class="row"><span class="label">Total requests</span><span class="val">${totalRequests} — this instance, since last cold start</span></div>
    <div class="row"><span class="label">Errors</span><span class="${errorCount > 0 ? "err" : "val" }">${errorCount}</span></div>
    <div class="row"><span class="label">Avg response time</span><span class="val">${avgMs !== null ? avgMs + " ms" : "—"}</span></div>
    <div class="row"><span class="label">Last Resolve</span><span class="val">${lastResolveHtml}</span></div>

    <details>
      <summary>Recent errors: ${resolveErrors.length}</summary>
      <div class="error-log">
        ${errorEntriesHtml}
      </div>
    </details>

    ${errorBoxHtml}
  </div>
</body>
</html>`;
}

// ─── Request handler ─────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = reqUrl.pathname;
  const inputUrl = String(reqUrl.searchParams.get("url") || "").trim();

  // GET /health — JSON status for Server B to poll
  if (pathname === "/health") {
    const test = await runSelfTestCached();
    res.statusCode = test.ok ? 200 : 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      status: test.ok ? "ok" : "error",
      worker_id: WORKER_ID,
      yt_dlp_version: test.version || null,
      error: test.error || null,
      region: process.env.VERCEL_REGION || null,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // GET / (no url param) — HTML status page for humans
  if (pathname === "/" && !inputUrl) {
    const test = await runSelfTestCached();
    res.statusCode = test.ok ? 200 : 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderStatusPage(test));
    return;
  }

  // GET /resolve?url=X  or  GET /?url=X — resolve a video URL
  if (pathname === "/resolve" || pathname === "/api/resolve" || pathname === "/") {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return;
    }

    if (!inputUrl) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing url parameter", worker_id: WORKER_ID }));
      return;
    }

    if (!isHttpUrl(inputUrl)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid url; expected http(s) URL", worker_id: WORKER_ID }));
      return;
    }

    totalRequests++;
    const t0 = Date.now();
    try {
      const directUrl = await runYtDlp(inputUrl);
      const durationMs = Date.now() - t0;
      totalDurationMs += durationMs;
      lastResolve = { timestamp: new Date().toISOString(), ok: true, durationMs };

      if (directUrl && directUrl.startsWith("http")) {
        // Self-heal: a successful resolve clears degraded state
        if (resolveState === "degraded" || resolveState === "idle") resolveState = "working";
      }

      if (!directUrl || !directUrl.startsWith("http")) {
        // Count as an error for state purposes
        errorCount++;
        lastResolve = { timestamp: new Date().toISOString(), ok: false, durationMs };
        resolveState = "degraded";
        const errText = "yt-dlp returned empty or invalid url";
        lastResolveError = errText;
        resolveErrors.push({ timestamp: new Date().toISOString(), url: String(inputUrl).slice(0, 60), error: errText });
        if (resolveErrors.length > 10) resolveErrors.shift();

        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "yt-dlp returned empty or invalid url", worker_id: WORKER_ID }));
        return;
      }

      res.statusCode = 200;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ url: directUrl, worker_id: WORKER_ID }));
    } catch (e) {
      const durationMs = Date.now() - t0;
      totalDurationMs += durationMs;
      errorCount++;
      const errText = String(e && e.message ? e.message : e).slice(0, 1200);
      lastResolve = { timestamp: new Date().toISOString(), ok: false, durationMs };
      lastResolveError = errText;
      resolveState = "degraded";
      resolveErrors.push({
        timestamp: new Date().toISOString(),
        url: String(inputUrl).slice(0, 60),
        error: errText.slice(0, 300),
      });
      if (resolveErrors.length > 10) resolveErrors.shift();

      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        error: "yt-dlp failed",
        detail: errText,
        worker_id: WORKER_ID,
      }));
    }
    return;
  }

  // 404
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found", worker_id: WORKER_ID }));
};
