import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { createApp } from "../server.js";

test("session-bound CSRF tokens protect unsafe API requests", async (t) => {
  const previousValue = process.env.ENABLE_CSRF;
  process.env.ENABLE_CSRF = "true";
  t.after(() => {
    if (previousValue === undefined) delete process.env.ENABLE_CSRF;
    else process.env.ENABLE_CSRF = previousValue;
  });

  const agent = supertest.agent(createApp({ useSessionStore: false }));
  const tokenResponse = await agent.get("/api/auth/csrf");
  assert.equal(tokenResponse.status, 200);
  assert.match(tokenResponse.body.csrfToken, /^[A-Za-z0-9_-]{43}$/);

  const missingToken = await agent.post("/api/auth/logout");
  assert.equal(missingToken.status, 403);
  assert.equal(missingToken.body.code, "CSRF_TOKEN_INVALID");

  const wrongToken = await agent
    .post("/api/auth/logout")
    .set("X-CSRF-Token", "incorrect-token");
  assert.equal(wrongToken.status, 403);

  const loggedOut = await agent
    .post("/api/auth/logout")
    .set("X-CSRF-Token", tokenResponse.body.csrfToken);
  assert.equal(loggedOut.status, 200);

  const reusedToken = await agent
    .post("/api/auth/logout")
    .set("X-CSRF-Token", tokenResponse.body.csrfToken);
  assert.equal(reusedToken.status, 403);

  const replacement = await agent.get("/api/auth/csrf");
  assert.equal(replacement.status, 200);
  assert.notEqual(replacement.body.csrfToken, tokenResponse.body.csrfToken);
});
