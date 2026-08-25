import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryRateLimiter } from "../middleware/rateLimit.js";

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test("memory rate limiter blocks repeated requests and resets after the window", () => {
  let currentTime = 1000;
  const limiter = createMemoryRateLimiter({
    windowMs: 1000,
    max: 2,
    keyPrefix: "test",
    message: "Slow down.",
    now: () => currentTime
  });
  const req = { ip: "127.0.0.1", path: "/login" };
  let nextCalls = 0;

  limiter(req, makeResponse(), () => { nextCalls += 1; });
  limiter(req, makeResponse(), () => { nextCalls += 1; });

  const limitedResponse = makeResponse();
  limiter(req, limitedResponse, () => { nextCalls += 1; });

  assert.equal(nextCalls, 2);
  assert.equal(limitedResponse.statusCode, 429);
  assert.equal(limitedResponse.body.error, "Slow down.");
  assert.equal(limitedResponse.headers["Retry-After"], "1");
  assert.equal(limitedResponse.headers["RateLimit-Limit"], "2");
  assert.equal(limitedResponse.headers["RateLimit-Remaining"], "0");

  currentTime = 2100;
  limiter(req, makeResponse(), () => { nextCalls += 1; });

  assert.equal(nextCalls, 3);
});

test("memory rate limiter can share one budget across API paths", () => {
  const limiter = createMemoryRateLimiter({
    windowMs: 1000,
    max: 1,
    includePath: false
  });
  let nextCalls = 0;

  limiter(
    { ip: "127.0.0.1", path: "/posts" },
    makeResponse(),
    () => { nextCalls += 1; }
  );
  const limitedResponse = makeResponse();
  limiter(
    { ip: "127.0.0.1", path: "/communities" },
    limitedResponse,
    () => { nextCalls += 1; }
  );

  assert.equal(nextCalls, 1);
  assert.equal(limitedResponse.statusCode, 429);
});

test("memory rate limiter normalizes path casing and trailing slashes", () => {
  const limiter = createMemoryRateLimiter({ windowMs: 1000, max: 1 });
  let nextCalls = 0;

  limiter(
    { ip: "127.0.0.1", path: "/Login/" },
    makeResponse(),
    () => { nextCalls += 1; }
  );
  const limitedResponse = makeResponse();
  limiter(
    { ip: "127.0.0.1", path: "/login" },
    limitedResponse,
    () => { nextCalls += 1; }
  );

  assert.equal(nextCalls, 1);
  assert.equal(limitedResponse.statusCode, 429);
});
