const { execFile } = require("child_process");
const path = require("path");

const CACHE = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheGet(key) {
  const item = CACHE.get(key);
  if (!item) return null;
  if (Date.now() - item.time > TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(key, value) {
  CACHE.set(key, { value, time: Date.now() });
}

function aliveHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Alive</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { background:#000; color:#00ff5a; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; margin:0; }
    .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; padding:24px; text-align:center; }
    .badge { border:1px solid #00ff5a; padding:10px 14px; border-radius:10px; }
    .small { color:#66ff99; opacity:0.85; font-size:14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="badge">JIPI IS ALIVE</div>
    <div class="small">OK</div>
  </div>
</body>
</html>`;
}

function runYtDlp(inputUrl) {
  return new Promise((resolve, reject) => {
    const ytdlpPath = path.join(process.cwd(), "bin", "dlp-jipi");

    const args = [
      "--no-playlist",
      "--no-warnings",
      "--add-header",
      "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "-f",
      "bv*+ba/b",
      "-g",
      inputUrl
    ];

    execFile(ytdlpPath, args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(String(stderr || err.message || err)));
        return;
      }
      const directUrl = String(stdout).trim().split("\n").filter(Boolean)[0] || "";
      resolve(directUrl);
    });
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    const inputUrl = String(req.query.url || "").trim();

    // If no url param, show alive page (green on black)
    if (!inputUrl) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(aliveHtml());
      return;
    }

    const cached = cacheGet(inputUrl);
    if (cached) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ url: cached, cached: true }));
      return;
    }

    const directUrl = await runYtDlp(inputUrl);
    if (!directUrl || !directUrl.startsWith("http")) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "yt-dlp returned empty or invalid url" }));
      return;
    }

    cacheSet(inputUrl, directUrl);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url: directUrl, cached: false }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "yt-dlp failed",
        detail: String(e && e.message ? e.message : e).slice(0, 1200)
      })
    );
  }
};
