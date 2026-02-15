const { execFile } = require("child_process");
const path = require("path");

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

    // Alive page (green on black, like the screenshot)
    if (!inputUrl) {
      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Alive</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { background:#000; color:#00ff5a; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; margin:0; }
    .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .badge { border:1px solid #00ff5a; padding:14px 18px; border-radius:12px; box-shadow: 0 0 0 2px rgba(0,255,90,0.12) inset; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="badge">Addon is alive.</div>
  </div>
</body>
</html>`;

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }

    const directUrl = await runYtDlp(inputUrl);
    if (!directUrl || !directUrl.startsWith("http")) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "yt-dlp returned empty or invalid url" }));
      return;
    }

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
