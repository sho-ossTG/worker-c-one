# Deploying a Worker C Instance

Worker C (this repo) receives a video URL, runs yt-dlp, and returns the direct media stream URL. Server B is the brain: it load-balances requests across workers and caches results. Server A is the Stremio-facing API that forwards requests to B. As an operator, you only need to deploy Worker C — this guide covers exactly that.

---

## Steps

### 1. Clone the repo

```bash
git clone https://github.com/your-org/yt-dlp.git
cd yt-dlp
```

No build step is required. The yt-dlp binary (`bin/dlp-jipi`) is already present in the repo — nothing to compile or install.

### 2. Create a Vercel project

1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Import the Git repo you just cloned.
3. **Do NOT click Deploy yet** — environment variables must be set before the first deployment.

**Enable Fluid Compute:** After the project is created, go to **Settings → Functions** and confirm Fluid Compute is enabled. This lets yt-dlp run up to 60 seconds. Without it, requests silently time out at 10 seconds even though `vercel.json` sets `maxDuration: 60`.

### 3. Set environment variables

Go to **Settings → Environment Variables** and add the following:

| Variable | Example value | Required | What breaks if missing |
|---|---|---|---|
| `WORKER_ID` | `worker-c1` | Yes | All responses report `worker_id: "worker"` — Server B cannot distinguish workers |
| `SERVER_B_URL` | `https://your-server-b.vercel.app` | Yes (for status visibility) | Worker status page cannot run B connectivity checks and shows `SERVER_B_URL not set` warning |
| `WORKER_SECRET` | `abc123-long-random-string` | Recommended | `/resolve` endpoint accepts requests without authentication |

> **⚠ Required for security:** Without this, anyone who knows your worker URL can use it. Set this before sharing the URL with Server B.

Click **Save** after adding each variable. Then click **Deploy** and wait for the deployment to complete.

### 4. Verify

Open `https://{your-project}.vercel.app` in your browser.

The page header shows **IDLE** or **WORKING**. IDLE means the worker is online but has not resolved any URLs yet. WORKING means it has resolved at least one URL successfully.

If the header shows BINARY ERROR or DEGRADED, check the error text on the status page.

---

## Endpoints

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /` | None | HTML status page |
| `GET /health` | None | JSON `{"status":"ok","worker_id":"...","yt_dlp_version":"..."}` |
| `GET /resolve?url=X` | None (current runtime) | JSON `{"url":"...","worker_id":"..."}` on success |

---

## Common Mistakes

**Mistake: WORKER_SECRET not set**

- **Symptom:** The status page shows "Auth: ⚠ disabled" in yellow. Anyone with your worker URL can call `/resolve` without credentials.
- **Fix:** Add `WORKER_SECRET` to **Settings → Environment Variables** and redeploy.

**Mistake: WORKER_ID not set or duplicated across workers**

- **Symptom:** Multiple workers all respond with the same `worker_id` (e.g., `"worker"` or `"worker-c1"`). Server B cannot distinguish which worker handled or failed a request.
- **Fix:** Each deployed worker must have a unique `WORKER_ID` (e.g., `worker-c1`, `worker-c2`). Update in **Settings → Environment Variables** and redeploy.

**Mistake: Fluid Compute not enabled**

- **Symptom:** yt-dlp calls return a timeout error after about 10 seconds, even though `vercel.json` sets `maxDuration: 60`.
- **Fix:** Go to the Vercel project dashboard → **Settings → Functions** → enable Fluid Compute. The setting in `vercel.json` alone is not enough; the dashboard toggle must also be on.

**Mistake: SERVER_B_URL not set**

- **Symptom:** Worker status page shows `SERVER_B_URL not set` warning and does not run B `/api/health` connectivity checks.
- **Fix:** Add `SERVER_B_URL` to **Settings → Environment Variables** using your Server B deployment URL (for example `https://your-server-b.vercel.app`) and redeploy.

---

## Adding a Second Worker

Same steps above. Use a new Vercel project with a different project name. Set `WORKER_ID=worker-c2` (or any unique name). Use the same `WORKER_SECRET` as all other workers. Add the new deployment URL to Server B as the next indexed worker variable (`SERVER_C2_URL`, `SERVER_C3_URL`, etc.). No code changes required anywhere.
