const test = require("node:test");
const assert = require("node:assert/strict");

function loadFreshHandler() {
  delete require.cache[require.resolve("./resolve.js")];
  return require("./resolve.js");
}

async function invoke(handler, { method = "GET", url = "/api/stats", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const responseHeaders = {};
    let body = "";

    const req = {
      method,
      url,
      headers: {
        host: "localhost",
        ...headers,
      },
    };

    const res = {
      statusCode: 200,
      setHeader(name, value) {
        responseHeaders[String(name).toLowerCase()] = value;
      },
      end(chunk = "") {
        body += String(chunk);
        resolve({
          statusCode: this.statusCode,
          headers: responseHeaders,
          body,
        });
      },
    };

    Promise.resolve(handler(req, res)).catch(reject);
  });
}

test("GET /api/stats returns TELE-03 contract keys for server C", async () => {
  const handler = loadFreshHandler();
  const response = await invoke(handler, { method: "GET", url: "/api/stats" });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/json");
  assert.deepEqual(Object.keys(payload), ["server", "hour", "request_count", "error_count"]);
  assert.equal(payload.server, "C");
});

test("GET /api/stats returns current UTC hour format", async () => {
  const handler = loadFreshHandler();
  const response = await invoke(handler, { method: "GET", url: "/api/stats" });
  const payload = JSON.parse(response.body);

  assert.match(payload.hour, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
});

test("GET /api/stats defaults request and error counters to zero", async () => {
  const handler = loadFreshHandler();
  const response = await invoke(handler, { method: "GET", url: "/api/stats" });
  const payload = JSON.parse(response.body);

  assert.equal(payload.request_count, 0);
  assert.equal(payload.error_count, 0);
});

test("non-GET /api/stats returns 405 with JSON error payload", async () => {
  const handler = loadFreshHandler();
  const response = await invoke(handler, { method: "POST", url: "/api/stats" });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "GET");
  assert.equal(response.headers["content-type"], "application/json");
  assert.deepEqual(payload, { error: "Method Not Allowed" });
});
