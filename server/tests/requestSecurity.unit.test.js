import test from "node:test";
import assert from "node:assert/strict";
import {
  createTrustedOriginGuard,
  csrfProtection,
  ensureCsrfToken
} from "../middleware/requestSecurity.js";

function makeRequest(method, origin = null, { session = {}, csrfToken } = {}) {
  return {
    method,
    protocol: "https",
    session,
    get(name) {
      if (name === "origin") return origin;
      if (name === "host") return "api.example.com";
      if (name === "x-csrf-token") return csrfToken;
      return undefined;
    }
  };
}

function makeResponse() {
  return {
    statusCode: null,
    body: null,
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

test("trusted origin guard allows safe requests and configured browser origins", () => {
  const guard = createTrustedOriginGuard({
    allowedOrigins: new Set(["https://client.example.com"]),
    enforce: true
  });
  let nextCalls = 0;

  guard(makeRequest("GET"), makeResponse(), () => { nextCalls += 1; });
  guard(
    makeRequest("POST", "https://client.example.com"),
    makeResponse(),
    () => { nextCalls += 1; }
  );
  guard(
    makeRequest("DELETE", "https://api.example.com"),
    makeResponse(),
    () => { nextCalls += 1; }
  );

  assert.equal(nextCalls, 3);
});

test("trusted origin guard rejects unsafe requests without an allowed origin", () => {
  const guard = createTrustedOriginGuard({
    allowedOrigins: new Set(["https://client.example.com"]),
    enforce: true
  });

  for (const origin of [null, "https://malicious.example"]) {
    const response = makeResponse();
    guard(makeRequest("POST", origin), response, () => {
      assert.fail("Untrusted request should not continue.");
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error, "Request origin is not allowed.");
  }
});

test("ensureCsrfToken creates one stable session-bound token", () => {
  const request = makeRequest("GET");
  const firstToken = ensureCsrfToken(request);
  const secondToken = ensureCsrfToken(request);

  assert.match(firstToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(secondToken, firstToken);
  assert.equal(request.session.csrfToken, firstToken);
});

test("csrfProtection validates unsafe requests when explicitly enabled", (t) => {
  const previousValue = process.env.ENABLE_CSRF;
  process.env.ENABLE_CSRF = "true";
  t.after(() => {
    if (previousValue === undefined) delete process.env.ENABLE_CSRF;
    else process.env.ENABLE_CSRF = previousValue;
  });

  const session = {};
  const csrfToken = ensureCsrfToken(makeRequest("GET", null, { session }));
  let nextCalls = 0;

  csrfProtection(makeRequest("GET"), makeResponse(), () => { nextCalls += 1; });
  csrfProtection(
    makeRequest("POST", null, { session, csrfToken }),
    makeResponse(),
    () => { nextCalls += 1; }
  );
  assert.equal(nextCalls, 2);

  for (const suppliedToken of [undefined, "incorrect-token"]) {
    const response = makeResponse();
    csrfProtection(
      makeRequest("DELETE", null, { session, csrfToken: suppliedToken }),
      response,
      () => assert.fail("Invalid CSRF token should not continue.")
    );
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, "CSRF_TOKEN_INVALID");
  }
});
