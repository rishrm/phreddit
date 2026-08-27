import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import LinkFlair from "../models/LinkFlair.js";
import { createApp } from "../server.js";
import {
  clearTestDb,
  connectTestDb,
  createTestCommunity,
  createTestUser,
  disconnectTestDb
} from "./testHelpers.js";

test("discovery searches communities, public users, and flairs without private fields", async (t) => {
  await connectTestDb();
  await clearTestDb();
  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });

  const user = await createTestUser({
    displayName: "nebula",
    email: "nebula@example.com"
  });
  await createTestCommunity(user, {
    name: "spacebuilders",
    description: "A nebula-focused community for deep-space projects."
  });
  await LinkFlair.create({ content: "Nebula" });

  const response = await supertest(createApp({ useSessionStore: false }))
    .get("/api/search")
    .query({ q: "nebula" });

  assert.equal(response.status, 200);
  assert.equal(response.body.communities[0].name, "spacebuilders");
  assert.equal(response.body.communities[0].memberCount, 1);
  assert.equal(response.body.communities[0].members, undefined);
  assert.equal(response.body.communities[0].createdAt, undefined);
  assert.equal(response.body.users[0].displayName, "nebula");
  assert.equal(response.body.users[0].email, undefined);
  assert.equal(response.body.users[0].passwordHash, undefined);
  assert.equal(response.body.users[0].createdAt, undefined);
  assert.equal(response.body.linkFlairs[0].content, "Nebula");
});

test("discovery rejects missing, non-string, and oversized queries", async (t) => {
  await connectTestDb();
  await clearTestDb();
  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });

  const app = createApp({ useSessionStore: false });
  const responses = await Promise.all([
    supertest(app).get("/api/search"),
    supertest(app).get("/api/search").query({ q: ["one", "two"] }),
    supertest(app).get("/api/search").query({ q: "x".repeat(201) })
  ]);

  assert.deepEqual(responses.map((response) => response.status), [400, 400, 400]);
});
