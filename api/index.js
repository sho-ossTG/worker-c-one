const { getResolveRuntimeStats } = require("./resolve");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function maskUrl(url) {
  if (!url) return "-";
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return String(url).slice(0, 30) + "...";
  }
}

async function checkServerB(serverBUrl) {
  if (!serverBUrl) {
    return { ok: false, warning: true, error: "SERVER_B_URL not set" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const startedAt = Date.now();
  try {
    const healthUrl = new URL("/api/health", serverBUrl).toString();
    const response = await fetch(healthUrl, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      return {
        ok: false,
        ms: Date.now() - startedAt,
        error: `status ${response.status}`
      };
    }
    return { ok: true, ms: Date.now() - startedAt };
  } catch (e) {
    if (e && e.name === "AbortError") {
      return { ok: false, ms: Date.now() - startedAt, error: "health timeout after 5000ms" };
    }
    return {
      ok: false,
      ms: Date.now() - startedAt,
      error: String(e && e.message ? e.message : e).slice(0, 200)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function renderPage(state) {
  const color = state.checkResult == null
    ? "#888888"
    : (state.checkResult.warning ? "#ff8800" : (state.checkResult.ok ? "#00ff5a" : "#ff4444"));
  const label = state.checkResult == null
    ? "IDLE"
    : (state.checkResult.warning ? "NOT CONFIGURED" : (state.checkResult.ok ? "ONLINE" : "DEGRADED"));

  const checkValue = state.checkResult == null
    ? "Press Check to run"
    : (state.checkResult.ok
      ? `ok (${state.checkResult.ms}ms)`
      : `${escapeHtml(state.checkResult.error || "error")} (${state.checkResult.ms || 0}ms)`);

  const checkClass = state.checkResult == null
    ? "warn"
    : (state.checkResult.warning ? "warn" : (state.checkResult.ok ? "ok" : "err"));

  const runtime = state.runtimeStats || {};
  const lastResolveText = runtime.lastResolve
    ? `${runtime.lastResolve.ok ? "success" : "failed"} @ ${runtime.lastResolve.timestamp}`
    : "-";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Server C - Status</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; color: #ccc; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { border: 1px solid ${color}44; padding: 32px; border-radius: 12px; box-shadow: 0 0 30px ${color}12; max-width: 560px; width: 100%; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: ${color}; box-shadow: 0 0 10px ${color}; flex-shrink: 0; }
    .title { font-size: 1.15rem; color: ${color}; letter-spacing: 1px; font-weight: bold; }
    .subtitle { font-size: 0.75rem; color: #444; margin-top: 3px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid #141414; font-size: 0.85rem; }
    .row:last-child { border-bottom: none; }
    .label { color: #555; }
    .ok { color: #00ff5a; }
    .warn { color: #ffaa00; }
    .err { color: #ff4444; text-align: right; max-width: 300px; word-break: break-all; }
    .val { color: #ddd; }
    .section-header { color: #444; font-size: 0.75rem; letter-spacing: 1px; text-transform: uppercase; padding: 14px 0 6px; border-bottom: 1px solid #1a1a1a; }
    .actions { margin-top: 12px; margin-bottom: 8px; }
    button { background: #111; color: #ddd; border: 1px solid #2a2a2a; border-radius: 8px; padding: 8px 14px; font-family: inherit; font-size: 0.82rem; cursor: pointer; }
    button:hover { border-color: #444; color: #fff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="dot"></div>
      <div>
        <div class="title">SERVER C - ${label}</div>
        <div class="subtitle">Worker - Vercel Serverless</div>
      </div>
    </div>

    <div class="section-header">Health Checks</div>
    <div class="actions">
      <form method="POST">
        <button type="submit">Check B Connectivity</button>
      </form>
    </div>
    <div class="row"><span class="label">Server B /api/health</span><span class="${checkClass}">${checkValue}</span></div>

    <div class="section-header">Runtime Stats</div>
    <div class="row"><span class="label">totalRequests</span><span class="val">${Number(runtime.totalRequests || 0)}</span></div>
    <div class="row"><span class="label">errorCount</span><span class="val">${Number(runtime.errorCount || 0)}</span></div>
    <div class="row"><span class="label">resolveState</span><span class="val">${escapeHtml(String(runtime.resolveState || "idle"))}</span></div>
    <div class="row"><span class="label">lastResolve</span><span class="val">${escapeHtml(lastResolveText)}</span></div>

    <div class="section-header">Connections</div>
    <div class="row"><span class="label">SERVER_B_URL</span><span class="${state.serverBUrl ? "ok" : "warn"}">${state.serverBUrl ? escapeHtml(maskUrl(state.serverBUrl)) : "not set"}</span></div>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const serverBUrl = String(process.env.SERVER_B_URL || "").trim();
  const runCheck = String(req.method || "GET").toUpperCase() === "POST";
  const checkResult = runCheck ? await checkServerB(serverBUrl) : null;
  const runtimeStats = getResolveRuntimeStats();

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(renderPage({ serverBUrl, checkResult, runtimeStats }));
};
