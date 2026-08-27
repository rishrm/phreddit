import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import Comment from "../models/Comment.js";
import Post from "../models/Post.js";
import { createApp } from "../server.js";
import { syncPostActivity } from "../utils/postActivity.js";
import {
  clearTestDb,
  connectTestDb,
  createTestCommunity,
  createTestUser,
  disconnectTestDb
} from "./testHelpers.js";

test("post listings paginate, sort server-side, and search via text indexes", async (t) => {
  await connectTestDb();
  await clearTestDb();

  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });

  const user = await createTestUser();
  const community = await createTestCommunity(user);
  const app = createApp({ useSessionStore: false });

  const first = await Post.create({
    title: "Alpha zebra thread",
    content: "First created post.",
    postedBy: user._id,
    community: community._id,
    comments: []
  });
  await Post.create({
    title: "Beta thread",
    content: "Second created post mentioning giraffes.",
    postedBy: user._id,
    community: community._id,
    comments: []
  });
  const third = await Post.create({
    title: "Gamma thread",
    content: "Third created post.",
    postedBy: user._id,
    community: community._id,
    comments: []
  });

  const thirdComment = await Comment.create({
    content: "A comment about zebra migration.",
    commentedBy: user._id,
    post: third._id,
    parentComment: null,
    replies: []
  });

  const firstComment = await Comment.create({
    content: "A newer comment on the oldest post.",
    commentedBy: user._id,
    post: first._id,
    parentComment: null,
    replies: []
  });

  await Promise.all([
    Comment.collection.updateOne(
      { _id: thirdComment._id },
      { $set: { createdAt: new Date("2025-01-01T00:00:00.000Z") } }
    ),
    Comment.collection.updateOne(
      { _id: firstComment._id },
      { $set: { createdAt: new Date("2026-01-01T00:00:00.000Z") } }
    )
  ]);
  await syncPostActivity([first._id, third._id]);

  // Pagination: newest-first, two pages.
  const pageOne = await supertest(app).get("/api/posts").query({ limit: 2, page: 1 });
  assert.equal(pageOne.status, 200);
  assert.equal(Object.hasOwn(pageOne.body.posts[0], "comments"), false);
  assert.equal(Object.hasOwn(pageOne.body.posts[0], "votedBy"), false);
  assert.equal(Object.hasOwn(pageOne.body.posts[0], "__v"), false);
  assert.equal(Object.hasOwn(pageOne.body.posts[0], "id"), false);
  assert.equal(pageOne.body.posts.length, 2);
  assert.equal(pageOne.body.total, 3);
  assert.equal(pageOne.body.hasMore, true);
  assert.deepEqual(
    pageOne.body.posts.map((post) => post.title),
    ["Gamma thread", "Beta thread"]
  );

  const pageTwo = await supertest(app).get("/api/posts").query({ limit: 2, page: 2 });
  assert.equal(pageTwo.body.posts.length, 1);
  assert.equal(pageTwo.body.hasMore, false);
  assert.equal(pageTwo.body.posts[0].title, "Alpha zebra thread");

  // Oldest sort.
  const oldest = await supertest(app).get("/api/posts").query({ sort: "oldest", limit: 10 });
  assert.equal(oldest.body.posts[0].title, "Alpha zebra thread");

  // Active sort uses latest comment time across multiple active posts.
  const active = await supertest(app).get("/api/posts").query({ sort: "active", limit: 10 });
  assert.deepEqual(
    active.body.posts.map((post) => post.title),
    ["Alpha zebra thread", "Gamma thread", "Beta thread"]
  );
  assert.equal(active.body.posts[0].commentCount, 1);

  // Search matches post titles/content and comment content via text indexes.
  const zebraSearch = await supertest(app).get("/api/posts").query({ search: "zebra" });
  assert.deepEqual(
    zebraSearch.body.posts.map((post) => post.title).sort(),
    ["Alpha zebra thread", "Gamma thread"]
  );

  const giraffeSearch = await supertest(app).get("/api/posts").query({ search: "giraffes" });
  assert.deepEqual(
    giraffeSearch.body.posts.map((post) => post.title),
    ["Beta thread"]
  );

  const noResults = await supertest(app).get("/api/posts").query({ search: "nonexistentterm" });
  assert.equal(noResults.body.posts.length, 0);
  assert.equal(noResults.body.total, 0);

});

test("joined-community posts stay ahead of other posts across page boundaries", async (t) => {
  await connectTestDb();
  await clearTestDb();

  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });

  const viewer = await createTestUser();
  const otherOwner = await createTestUser();
  const joinedCommunity = await createTestCommunity(viewer, { name: "joined-community" });
  const otherCommunity = await createTestCommunity(otherOwner, { name: "other-community" });

  for (let index = 0; index < 3; index += 1) {
    await Post.create({
      title: `Other ${index}`,
      content: "Other community post",
      postedBy: otherOwner._id,
      community: otherCommunity._id,
      comments: []
    });
  }
  for (let index = 0; index < 3; index += 1) {
    await Post.create({
      title: `Joined ${index}`,
      content: "Joined community post",
      postedBy: viewer._id,
      community: joinedCommunity._id,
      comments: []
    });
  }

  const app = createApp({ useSessionStore: false });
  const pageOne = await supertest(app)
    .get("/api/posts")
    .query({ page: 1, limit: 2 })
    .set("x-test-user-id", String(viewer._id));
  const pageTwo = await supertest(app)
    .get("/api/posts")
    .query({ page: 2, limit: 2 })
    .set("x-test-user-id", String(viewer._id));

  assert.ok(pageOne.body.posts.every((post) => post.title.startsWith("Joined")));
  assert.equal(pageTwo.body.posts[0].title.startsWith("Joined"), true);
  assert.equal(pageTwo.body.posts[1].title.startsWith("Other"), true);
});
