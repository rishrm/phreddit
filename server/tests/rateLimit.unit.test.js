import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../middleware/rateLimit.js";

function createRequest(path) {
  return {
    app: {
      get(setting) {
        return setting === "trust proxy" ? false : undefined;
      }
    },
    headers: {},
    ip: "127.0.0.1",
    originalUrl: path,
    socket: { remoteAddress: "127.0.0.1" }
  };
}

function createResponse() {
  const headers = new Map();
  return {
    body: null,
    headers,
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    append(name, value) {
      const key = name.toLowerCase();
      const existing = headers.get(key);
      headers.set(key, existing ? `${existing}, ${value}` : value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    send(body) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    status(code) {
      this.statusCode = code;
      return this;
    }
  };
}

async function invoke(limiter, path) {
  const request = createRequest(path);
  const response = createResponse();
  let advanced = false;
  let error = null;
  await limiter(request, response, (nextError) => {
    error = nextError || null;
    advanced = !nextError;
  });
  if (error) throw error;
  return { advanced, request, response };
}

test("rate limiter blocks repeated requests with standard retry metadata", async () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 2,
    message: "Slow down."
  });

  assert.equal((await invoke(limiter, "/one")).advanced, true);
  assert.equal((await invoke(limiter, "/one")).advanced, true);

  const limited = await invoke(limiter, "/one");
  assert.equal(limited.advanced, false);
  assert.equal(limited.response.statusCode, 429);
  assert.deepEqual(limited.response.body, { error: "Slow down." });
  assert.ok(limited.response.headers.get("ratelimit"));
  assert.ok(limited.response.headers.get("retry-after"));
});

test("rate limiter shares one budget across protected API paths", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

  assert.equal((await invoke(limiter, "/one")).advanced, true);
  assert.equal((await invoke(limiter, "/two")).response.statusCode, 429);
});

test("rate limiting can be explicitly disabled for isolated test and benchmark runs", async (t) => {
  const previousValue = process.env.DISABLE_RATE_LIMIT;
  process.env.DISABLE_RATE_LIMIT = "true";
  t.after(() => {
    if (previousValue === undefined) delete process.env.DISABLE_RATE_LIMIT;
    else process.env.DISABLE_RATE_LIMIT = previousValue;
  });

  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  assert.equal((await invoke(limiter, "/one")).advanced, true);
  assert.equal((await invoke(limiter, "/one")).advanced, true);
});
