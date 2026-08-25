import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import Comment from "../models/Comment.js";
import Community from "../models/Community.js";
import LinkFlair from "../models/LinkFlair.js";
import Post from "../models/Post.js";
import Report from "../models/Report.js";
import User from "../models/User.js";
import { createApp } from "../server.js";
import {
  clearTestDb,
  connectTestDb,
  createTestCommunity,
  createTestUser,
  disconnectTestDb
} from "./testHelpers.js";

async function withDatabase(t) {
  await connectTestDb();
  await clearTestDb();
  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });
}

test("post creation commits a new flair and all ownership references together", async (t) => {
  await withDatabase(t);
  const user = await createTestUser();
  const community = await createTestCommunity(user);
  const app = createApp({ useSessionStore: false });

  const response = await supertest(app)
    .post("/api/posts")
    .set("x-test-user-id", String(user._id))
    .send({
      title: "Atomic post",
      content: "The post and its new flair belong to one operation.",
      community: String(community._id),
      newFlair: "Architecture"
    });

  assert.equal(response.status, 201);
  const [post, flair, refreshedCommunity, refreshedUser] = await Promise.all([
    Post.findById(response.body.post._id),
    LinkFlair.findOne({ content: "Architecture" }),
    Community.findById(community._id),
    User.findById(user._id)
  ]);
  assert.ok(post);
  assert.ok(flair);
  assert.equal(String(post.linkFlair), String(flair._id));
  assert.ok(refreshedCommunity.posts.some((id) => String(id) === String(post._id)));
  assert.ok(refreshedUser.createdPosts.some((id) => String(id) === String(post._id)));
});

test("community APIs expose membership state and counts without leaking member lists", async (t) => {
  await withDatabase(t);
  const owner = await createTestUser();
  const community = await createTestCommunity(owner);
  const app = createApp({ useSessionStore: false });

  const memberResponse = await supertest(app)
    .get(`/api/communities/${community._id}`)
    .set("x-test-user-id", String(owner._id));
  const guestResponse = await supertest(app).get(`/api/communities/${community._id}`);
  const listResponse = await supertest(app).get("/api/communities");

  assert.equal(memberResponse.status, 200);
  assert.equal(memberResponse.body.community.isJoined, true);
  assert.equal(memberResponse.body.community.memberCount, 1);
  assert.equal(Object.hasOwn(memberResponse.body.community, "members"), false);
  assert.equal(guestResponse.body.community.isJoined, false);
  assert.equal(Object.hasOwn(listResponse.body.communities[0], "members"), false);
});

test("post summary stays lightweight and malformed JSON returns a stable client error", async (t) => {
  await withDatabase(t);
  const user = await createTestUser();
  const community = await createTestCommunity(user);
  const post = await Post.create({
    title: "Lightweight summary",
    content: "This full body must not be returned by the summary endpoint.",
    postedBy: user._id,
    community: community._id,
    comments: []
  });
  const app = createApp({ useSessionStore: false });

  const summary = await supertest(app).get(`/api/posts/${post._id}/summary`);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.post.title, "Lightweight summary");
  assert.equal(Object.hasOwn(summary.body.post, "content"), false);

  const malformed = await supertest(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send('{"email":');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "Request body must contain valid JSON.");
});

test("comment cascade follows parentComment even when cached reply arrays are stale", async (t) => {
  await withDatabase(t);
  const user = await createTestUser();
  const community = await createTestCommunity(user);
  const post = await Post.create({
    title: "Authoritative comment graph",
    content: "Cached arrays are intentionally left empty.",
    postedBy: user._id,
    community: community._id,
    comments: []
  });
  const root = await Comment.create({
    content: "Root",
    commentedBy: user._id,
    post: post._id,
    parentComment: null,
    replies: []
  });
  const reply = await Comment.create({
    content: "Reply",
    commentedBy: user._id,
    post: post._id,
    parentComment: root._id,
    replies: []
  });
  const nestedReply = await Comment.create({
    content: "Nested reply",
    commentedBy: user._id,
    post: post._id,
    parentComment: reply._id,
    replies: []
  });
  await User.findByIdAndUpdate(user._id, {
    $addToSet: { createdComments: { $each: [root._id, reply._id, nestedReply._id] } }
  });

  const app = createApp({ useSessionStore: false });
  const response = await supertest(app)
    .delete(`/api/comments/${root._id}`)
    .set("x-test-user-id", String(user._id));

  assert.equal(response.status, 200);
  assert.equal(await Comment.countDocuments({ post: post._id }), 0);
  const refreshedUser = await User.findById(user._id);
  assert.equal(refreshedUser.createdComments.length, 0);
  assert.ok(await Post.findById(post._id));
});

test("moderation stores evidence and only one concurrent resolver can claim a report", async (t) => {
  await withDatabase(t);
  const admin = await createTestUser({ isAdmin: true });
  const author = await createTestUser();
  const reporter = await createTestUser();
  const community = await createTestCommunity(author, { name: "evidence" });
  const post = await Post.create({
    title: "Evidence title",
    content: "Evidence body",
    postedBy: author._id,
    community: community._id,
    comments: []
  });
  const app = createApp({ useSessionStore: false });

  const submitted = await supertest(app)
    .post(`/api/reports/posts/${post._id}`)
    .set("x-test-user-id", String(reporter._id))
    .send({ reason: "spam", details: "Review this" });
  assert.equal(submitted.status, 201);
  assert.deepEqual(submitted.body.report.contentSnapshot, {
    title: "Evidence title",
    content: "Evidence body",
    communityName: "evidence",
    authorDisplayName: author.displayName,
    postedAt: post.createdAt.toISOString()
  });

  const reportId = submitted.body.report._id;
  const resolutions = await Promise.all([
    supertest(app)
      .post(`/api/reports/${reportId}/resolve`)
      .set("x-test-user-id", String(admin._id))
      .send({ action: "dismiss" }),
    supertest(app)
      .post(`/api/reports/${reportId}/resolve`)
      .set("x-test-user-id", String(admin._id))
      .send({ action: "dismiss" })
  ]);

  assert.deepEqual(resolutions.map((response) => response.status).sort(), [200, 409]);
  const resolved = await Report.findById(reportId);
  assert.equal(resolved.status, "dismissed");
  assert.equal(resolved.contentSnapshot.title, "Evidence title");
});
