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

    // If no url param, show alive text
    if (!inputUrl) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Addon is alive.");
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
