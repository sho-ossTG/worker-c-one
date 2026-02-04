const { execFile } = require("child_process");
const path = require("path");

// In-memory cache (may reset anytime on serverless; still useful)
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

function runYtDlp(inputUrl) {
  return new Promise((resolve, reject) => {
    const ytdlpPath = path.join(process.cwd(), "bin", "dlp-jipi");

    const args = [
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      "-f", "bv*+ba/b",
      "-g",
      inputUrl
    ];

    execFile(ytdlpPath, args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr || err.message || String(err)).slice(0, 800)));
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

    const inputUrl = String(req.query.url || "");
    if (!inputUrl) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing url parameter" }));
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
      res.end(JSON.stringify({ error: "yt-dlp returned empty/invalid url" }));
      return;
    }

    cacheSet(inputUrl, directUrl);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url: directUrl, cached: false }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "yt-dlp failed" }));
  }
};
