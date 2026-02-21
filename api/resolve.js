const { execFile } = require("child_process");
const path = require("path");

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

    execFile(
      ytdlpPath,
      args,
      { timeout: 20000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || err.message || err).trim().slice(0, 1200);
          reject(new Error(detail || "yt-dlp process failed"));
          return;
        }
        const directUrl = String(stdout).trim().split("\n").filter(Boolean)[0] || "";
        resolve(directUrl);
      }
    );
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return;
    }

    const inputUrl = String(req.query.url || "").trim();

    if (!inputUrl) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jipi Worker (C) - Status</title>
    <style>
        body { background: #000; color: #00ff5a; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .status-box { border: 1px solid #00ff5a; padding: 30px; border-radius: 12px; box-shadow: 0 0 20px rgba(0,255,90,0.15); text-align: center; max-width: 400px; }
        .dot { height: 12px; width: 12px; background-color: #00ff5a; border-radius: 50%; display: inline-block; margin-right: 12px; box-shadow: 0 0 8px #00ff5a; animation: blink 1.5s infinite; }
        @keyframes blink { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        h1 { font-size: 1.5rem; margin: 0 0 10px 0; letter-spacing: 1px; }
        p { color: #888; margin: 0; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="status-box">
        <h1><span class="dot"></span>WORKER (C) IS ONLINE</h1>
        <p>Awaiting resolution requests from Broker (B)...</p>
    </div>
</body>
</html>`;

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }

    if (!isHttpUrl(inputUrl)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid url parameter; expected http(s) URL" }));
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
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url: directUrl }));
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
