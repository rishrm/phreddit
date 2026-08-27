import test from "node:test";
import assert from "node:assert/strict";
import { requestContext } from "../middleware/requestContext.js";

function runContext(suppliedRequestId) {
  const headers = new Map();
  const req = {
    get(name) {
      return name === "x-request-id" ? suppliedRequestId : undefined;
    }
  };
  const res = {
    set(name, value) {
      headers.set(name, value);
    }
  };
  let nextCalls = 0;
  requestContext(req, res, () => { nextCalls += 1; });
  return { req, headers, nextCalls };
}

test("request context preserves a bounded safe correlation id", () => {
  const result = runContext("vercel:request-123");
  assert.equal(result.req.requestId, "vercel:request-123");
  assert.equal(result.headers.get("X-Request-ID"), "vercel:request-123");
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  assert.equal(result.nextCalls, 1);
});

test("request context replaces malformed correlation ids", () => {
  for (const supplied of ["contains spaces", "x".repeat(101), "line\nbreak"]) {
    const result = runContext(supplied);
    assert.match(
      result.req.requestId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  }
});

