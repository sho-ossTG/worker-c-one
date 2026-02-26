# Testing Patterns

**Analysis Date:** 2026-02-26

## Test Framework

**Runner:**
- Not configured — no test files exist
- Recommended: **Jest** (industry standard for Node.js/Vercel projects)
  - Config file: `jest.config.js` (not present)
  - Test commands: `npm test`, `npm run test:watch`, `npm run test:coverage`

**Assertion Library:**
- None currently; should use Jest's built-in assertions or similar (e.g., `expect()`)

**Run Commands (recommended setup):**
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate coverage report
npm run test:integration   # Run integration tests against live endpoints
```

## Test File Organization

**Location (recommended):**
- Co-locate near source: `api/resolve.test.js` next to `api/resolve.js`
- Or separate test dir: `tests/api/resolve.test.js`

**Naming:**
- Pattern: `[module].test.js` or `[module].spec.js`
- Example: `resolve.test.js`

**Structure (recommended):**
```
api/
├── resolve.js           # Implementation
└── resolve.test.js      # Tests (to be created)

tests/                    # Or alternative structure
├── unit/
│   └── resolve.test.js
├── integration/
│   └── resolve.e2e.js
└── fixtures/
    └── sample-urls.json
```

## Test Structure

**Suite Organization (recommended pattern):**
```javascript
describe('Worker C — resolve.js', () => {
  describe('isHttpUrl()', () => {
    it('accepts valid http URLs', () => {
      // test
    });

    it('accepts valid https URLs', () => {
      // test
    });

    it('rejects non-http URLs', () => {
      // test
    });
  });

  describe('checkAuth()', () => {
    it('allows requests with correct Bearer token', () => {
      // test
    });

    it('rejects requests with missing token', () => {
      // test
    });

    it('allows all requests when WORKER_SECRET is unset', () => {
      // test
    });
  });

  describe('escapeHtml()', () => {
    it('escapes HTML special chars', () => {
      // test
    });
  });

  describe('runYtDlp()', () => {
    it('resolves with URL on successful execution', async () => {
      // test
    });

    it('rejects on yt-dlp error', async () => {
      // test
    });

    it('respects 20s timeout', async () => {
      // test
    });
  });

  describe('runSelfTest()', () => {
    it('resolves with ok:true when binary works', async () => {
      // test
    });

    it('resolves with ok:false when binary missing', async () => {
      // test
    });
  });

  describe('GET / (status page)', () => {
    it('returns HTML with ONLINE status when healthy', async () => {
      // test
    });

    it('returns HTML with DEGRADED status when unhealthy', async () => {
      // test
    });
  });

  describe('GET /health (JSON health check)', () => {
    it('returns 200 with status:ok when binary works', async () => {
      // test
    });

    it('returns 503 with status:error when binary missing', async () => {
      // test
    });

    it('includes worker_id in response', async () => {
      // test
    });
  });

  describe('GET /resolve?url=... (resolve endpoint)', () => {
    it('requires Bearer auth when WORKER_SECRET is set', async () => {
      // test
    });

    it('returns 401 on missing/wrong token', async () => {
      // test
    });

    it('returns 400 when url param missing', async () => {
      // test
    });

    it('returns 400 when url is not http(s)', async () => {
      // test
    });

    it('returns 500 on yt-dlp execution error', async () => {
      // test
    });

    it('returns 502 when yt-dlp returns empty result', async () => {
      // test
    });

    it('returns 200 with direct URL on success', async () => {
      // test (requires mocking execFile)
    });
  });

  describe('GET /unknown-path', () => {
    it('returns 404 for unknown routes', async () => {
      // test
    });
  });
});
```

## Mocking

**Framework:** Jest's `jest.mock()` or `jest-mock-extended`

**Patterns (recommended):**
```javascript
const { execFile } = require('child_process');
jest.mock('child_process');

it('should handle yt-dlp success', async () => {
  execFile.mockImplementationOnce((bin, args, opts, callback) => {
    // Simulate successful execution
    callback(null, 'https://cdn.example.com/video.mp4\n', '');
  });

  const url = await runYtDlp('https://example.com/video');
  expect(url).toBe('https://cdn.example.com/video.mp4');
});

it('should handle yt-dlp timeout', async () => {
  execFile.mockImplementationOnce((bin, args, opts, callback) => {
    // Simulate timeout
    const err = new Error('ETIMEDOUT');
    callback(err, '', 'Timeout');
  });

  await expect(runYtDlp('https://example.com/video')).rejects.toThrow();
});
```

**What to Mock:**
- `child_process.execFile` — prevents running actual yt-dlp binary during tests
- Environment variables — test both set and unset states:
  ```javascript
  beforeEach(() => {
    process.env.WORKER_ID = 'test-worker';
    process.env.WORKER_SECRET = 'test-secret';
  });
  ```
- HTTP response objects — mock `req` and `res` for handler tests

**What NOT to Mock:**
- The URL constructor — test real URL parsing
- The `escapeHtml()` logic — pure function, safe to test directly
- The handler routing logic — test actual request path matching

## Fixtures and Factories

**Test Data (recommended structure):**
```javascript
const FIXTURES = {
  validUrls: {
    http: 'http://example.com/video',
    https: 'https://example.com/video',
  },
  invalidUrls: {
    malformed: 'not a url',
    ftpProtocol: 'ftp://example.com/file',
    noProtocol: 'example.com/video',
  },
  responses: {
    successResolve: {
      url: 'https://cdn.example.com/video.mp4',
      worker_id: 'test-worker',
    },
    errorResolve: {
      error: 'yt-dlp failed',
      detail: 'Video not available',
      worker_id: 'test-worker',
    },
  },
};
```

**Request/Response Factory (recommended):**
```javascript
function mockRequest(options = {}) {
  return {
    url: options.url || 'http://localhost:3000/resolve?url=https://example.com',
    method: options.method || 'GET',
    headers: {
      'authorization': options.auth || '',
      'host': 'localhost:3000',
      ...options.headers,
    },
  };
}

function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    setHeader: jest.fn(function(key, val) {
      this.headers[key] = val;
    }),
    end: jest.fn(function(data) {
      this.data = data;
    }),
  };
  return res;
}
```

**Location:**
- `tests/fixtures/urls.json` — sample video URLs
- `tests/fixtures/responses.js` — mock API responses
- `tests/helpers/factories.js` — request/response builders

## Coverage

**Requirements:**
- Target: **80% overall coverage** (statements, branches, lines, functions)
- Critical paths must be 100%:
  - `checkAuth()` — all branches (with secret, without secret, wrong secret)
  - `isHttpUrl()` — all URL types (valid http, valid https, invalid)
  - HTTP status code selection in handler

**View Coverage:**
```bash
npm run test:coverage
```

**Coverage report locations:**
- Console output after test run
- HTML report: `coverage/index.html` (open in browser)
- Text summary shows per-file breakdown

## Test Types

**Unit Tests:**
- Scope: Pure functions in isolation (`isHttpUrl`, `checkAuth`, `escapeHtml`, `runYtDlp` with mocked execFile)
- Approach: Fast, deterministic, no external dependencies
- Expected count: ~30 tests

**Integration Tests:**
- Scope: Full handler with mocked `execFile` but real request routing
- Approach: Simulate HTTP requests, verify status codes and response JSON
- Test auth flow, error handling, all endpoints
- Expected count: ~20 tests

**E2E/Manual Tests (not automated):**
- Deploy to Vercel, open status page in browser
- Call `/health` and `/resolve` endpoints with real yt-dlp binary
- Verify status page renders correctly
- Not run in CI — requires live deployment and secret env vars

## Common Patterns

**Async Testing:**
```javascript
it('should resolve video URL', async () => {
  const result = await runYtDlp('https://example.com/video');
  expect(result).toMatch(/^https?:\/\//);
});

// Or with done callback (less preferred)
it('should resolve video URL', (done) => {
  runYtDlp('https://example.com/video').then(result => {
    expect(result).toMatch(/^https?:\/\//);
    done();
  });
});
```

**Error Testing:**
```javascript
it('should reject on yt-dlp crash', async () => {
  execFile.mockImplementationOnce((bin, args, opts, callback) => {
    callback(new Error('ENOENT: no such file or directory'), '', 'not found');
  });

  await expect(runYtDlp('...')).rejects.toThrow();
});

it('should return 500 on yt-dlp failure', async () => {
  execFile.mockImplementationOnce((bin, args, opts, callback) => {
    callback(new Error('Video not found'), '', '');
  });

  const req = mockRequest({ auth: `Bearer test-secret` });
  const res = mockResponse();

  await handler(req, res);

  expect(res.statusCode).toBe(500);
  expect(res.data).toContain('yt-dlp failed');
});
```

**HTTP Status Code Testing:**
```javascript
describe('HTTP status codes', () => {
  it('returns 200 on success', async () => {
    // Mock successful yt-dlp
    const req = mockRequest({ auth: `Bearer ${process.env.WORKER_SECRET}` });
    const res = mockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
  });

  it('returns 400 on missing url param', async () => {
    const req = mockRequest({
      url: 'http://localhost:3000/resolve',
      auth: `Bearer ${process.env.WORKER_SECRET}`,
    });
    const res = mockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.data);
    expect(body.error).toBe('Missing url parameter');
  });

  it('returns 401 on wrong auth', async () => {
    const req = mockRequest({ auth: 'Bearer wrong-secret' });
    const res = mockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });
});
```

## Current State

**Tests in codebase:** None exist
- No `tests/`, `test/`, or `*.test.js` files
- No test config in `package.json`
- No test dependencies installed

**Recommendation:** Create test suite following patterns above before adding new features or modifying handler logic. Priority: unit tests for input validation (`isHttpUrl`, `checkAuth`), then integration tests for all endpoints.

---

*Testing analysis: 2026-02-26*
