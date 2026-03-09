# Building Server B — Worker C Integration Guide

Server B receives a request for a video URL, picks a Worker C instance, calls its
`/resolve` endpoint, and returns the result. Worker C handles the yt-dlp execution
and returns a direct CDN URL.

This guide is a step-by-step checklist — follow it sequentially to get a working
integration. Each step includes runnable code you can drop into your implementation.

---

## Step 1: Set up your environment variables

Server B needs two env vars to talk to the worker pool.

| Variable | Example value | Purpose |
|---|---|---|
| `WORKER_URLS` | `https://c1.vercel.app,https://c2.vercel.app` | Comma-separated list of all Worker C URLs |
| `WORKER_SECRET` | `abc123-long-random-string` | Shared secret — all workers use the same value |

Set these in your Vercel project dashboard (or `.env` locally).

> **Adding a worker:** Append its URL to the `WORKER_URLS` CSV and redeploy Server B.
> No code changes required.

---

## Step 2: Parse the worker list at startup

Split the CSV string into an array once at startup (per cold start on Vercel serverless).

```js
const workers = process.env.WORKER_URLS.split(",").map(u => u.trim());
const WORKER_SECRET = process.env.WORKER_SECRET;
```

Place this at the top of your handler file, outside the request handler function.
On Vercel, this runs once per cold start and is reused across requests.

---

## Step 3: Pick a worker (round-robin)

Use an atomic counter in Redis/Upstash if Server B is stateless (Vercel serverless).
Each request gets the next worker in the rotation.

```js
// Requires Redis/Upstash — atomic across cold starts
const index = await redis.incr("worker:counter");
const worker = workers[index % workers.length];
```

If Server B has persistent memory (always-on process), a simple in-memory counter
works instead.

```js
let counter = 0;
function pickWorker() {
  return workers[counter++ % workers.length];
}
```

---

## Step 4: Call the worker

Send a GET request to the worker's `/resolve` endpoint with the Authorization header.

```js
async function callWorker(workerUrl, videoUrl) {
  const response = await fetch(
    `${workerUrl}/resolve?url=${encodeURIComponent(videoUrl)}`,
    {
      headers: { "Authorization": `Bearer ${WORKER_SECRET}` },
      signal: AbortSignal.timeout(63000), // above worker's 60s maxDuration
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data.url;
}
```

The 63000ms timeout is intentionally above the worker's `maxDuration: 60` (60s) — it
gives the worker time to finish and return a response before Server B cuts the connection.

---

## Step 5: Add failover (try next worker on failure)

If one worker fails, try the next automatically. This means a single bad worker never
breaks a request.

```js
async function resolveWithFallback(videoUrl) {
  const startIndex = await getNextWorkerIndex(); // your round-robin counter
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[(startIndex + i) % workers.length];
    try {
      return await callWorker(worker, videoUrl);
    } catch (err) {
      console.error(`Worker ${worker} failed:`, err.message);
    }
  }
  throw new Error("All workers failed");
}
```

On failure, the loop moves to the next worker until one succeeds or all have been tried.

---

## Step 6: Cache resolved URLs in Redis (optional but recommended)

yt-dlp CDN URLs are valid for several hours. Caching them dramatically reduces worker
load under real usage.

```js
// Before calling a worker
const cached = await redis.get(`resolve:${videoUrl}`);
if (cached) return cached;

// After a worker succeeds
await redis.set(`resolve:${videoUrl}`, directUrl, "EX", 3600 * 5); // 5-hour TTL
```

Cache hit rate climbs quickly under real usage — most repeated video requests never
hit the worker at all.

---

## Step 7: Health check workers (optional)

Poll `/health` on each worker periodically to skip unhealthy ones. On stateless
Vercel B, store health state in Redis.

```js
async function checkHealth(workerUrl) {
  try {
    const res = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok; // HTTP 200 = healthy, 503 = degraded
  } catch {
    return false;
  }
}
```

Run `checkHealth` on each worker URL periodically (e.g., every 60 seconds via a
cron job) and store results in Redis. Your round-robin logic can then skip workers
where `workerHealth[url] === false`.

---

## Worker Response Reference

Use these to handle responses from `/resolve` and `/health` in your code.

**Resolve success (HTTP 200):**
```json
{ "url": "https://cdn.example.com/video.mp4", "worker_id": "worker-c1" }
```

**Resolve failure (HTTP 400 / 401 / 500 / 502):**
```json
{ "error": "yt-dlp failed", "detail": "...", "worker_id": "worker-c1" }
```

**Health check (HTTP 200 = ok, HTTP 503 = degraded):**
```json
{
  "status": "ok",
  "worker_id": "worker-c1",
  "yt_dlp_version": "2024.xx.xx",
  "error": null,
  "region": "iad1",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

The `worker_id` field is present in every response — use it for logging to know which
instance handled or failed each request.

---

## Summary

| Concern | Complexity | Notes |
|---|---|---|
| Worker list from env var | Trivial | Split CSV — no code changes to add a worker |
| Round-robin selection | Easy | Atomic Redis counter or in-memory |
| Auth header on every request | Trivial | Bearer token in headers |
| Failover on error | Easy | Try next worker in loop |
| URL caching in Redis | Easy | Key = video URL, TTL = 5 hours |
| Health checking | Optional | Useful but not required to start |
