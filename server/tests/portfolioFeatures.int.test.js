import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
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

test("Users can save, view, and unsave posts", async (t) => {
  await connectTestDb();
  await clearTestDb();

  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });

  const author = await createTestUser();
  const saver = await createTestUser();
  const community = await createTestCommunity(author);
  const post = await Post.create({
    title: "Save-worthy post",
    content: "This post should appear in a saved list.",
    postedBy: author._id,
    community: community._id,
    comments: []
  });

  const app = createApp({ useSessionStore: false });
  const saveResponse = await supertest(app)
    .post(`/api/users/me/saved-posts/${post._id}`)
    .set("x-test-user-id", String(saver._id));

  assert.equal(saveResponse.status, 200);
  assert.ok(saveResponse.body.user.savedPosts.some((id) => String(id) === String(post._id)));

  const profileResponse = await supertest(app)
    .get(`/api/users/${saver._id}/profile-content`)
    .set("x-test-user-id", String(saver._id));

  assert.equal(profileResponse.status, 200);
  assert.deepEqual(
    profileResponse.body.savedPosts.map((savedPost) => savedPost.title),
    ["Save-worthy post"]
  );

  const unsaveResponse = await supertest(app)
    .delete(`/api/users/me/saved-posts/${post._id}`)
    .set("x-test-user-id", String(saver._id));

  assert.equal(unsaveResponse.status, 200);
  assert.equal(unsaveResponse.body.user.savedPosts.length, 0);
});

test("profile content never exposes votedBy histories", async (t) => {
  await connectTestDb();
  await clearTestDb();

  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });

  const author = await createTestUser();
  const voter = await createTestUser();
  const community = await createTestCommunity(author);
  const post = await Post.create({
    title: "Private voting history",
    content: "The API should expose only the current user's vote.",
    postedBy: author._id,
    community: community._id,
    comments: [],
    upvotes: 1,
    votedBy: [{ user: voter._id, voteType: "upvote" }]
  });
  await Comment.create({
    content: "Comment with a private voter list",
    commentedBy: author._id,
    post: post._id,
    replies: [],
    upvotes: 1,
    votedBy: [{ user: voter._id, voteType: "upvote" }]
  });

  const app = createApp({ useSessionStore: false });
  const response = await supertest(app)
    .get(`/api/users/${author._id}/profile-content`)
    .set("x-test-user-id", String(author._id));

  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(response.body.posts[0], "votedBy"), false);
  assert.equal(Object.hasOwn(response.body.comments[0], "votedBy"), false);
  assert.equal(response.body.posts[0].userVote, null);
  assert.equal(response.body.comments[0].userVote, null);
});

test("Admins can review, dismiss, and remove reported posts", async (t) => {
  await connectTestDb();
  await clearTestDb();

  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });

  const admin = await createTestUser({ isAdmin: true, displayName: "adminUser", email: "admin@example.com" });
  const author = await createTestUser();
  const reporter = await createTestUser();
  const community = await createTestCommunity(author);
  const post = await Post.create({
    title: "Questionable post",
    content: "Moderators should be able to review this post.",
    postedBy: author._id,
    community: community._id,
    comments: []
  });

  const app = createApp({ useSessionStore: false });
  const reportResponse = await supertest(app)
    .post(`/api/reports/posts/${post._id}`)
    .set("x-test-user-id", String(reporter._id))
    .send({ reason: "spam", details: "Repeated promotion" });

  assert.equal(reportResponse.status, 201);
  assert.equal(reportResponse.body.report.reason, "spam");

  const duplicateResponse = await supertest(app)
    .post(`/api/reports/posts/${post._id}`)
    .set("x-test-user-id", String(reporter._id))
    .send({ reason: "spam" });

  assert.equal(duplicateResponse.status, 409);

  const listResponse = await supertest(app)
    .get("/api/reports")
    .set("x-test-user-id", String(admin._id));

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.reports.length, 1);
  assert.equal(listResponse.body.reports[0].targetPost.title, "Questionable post");

  const invalidStatusResponse = await supertest(app)
    .get("/api/reports")
    .query({ status: ["pending", "dismissed"] })
    .set("x-test-user-id", String(admin._id));

  assert.equal(invalidStatusResponse.status, 400);
  assert.equal(invalidStatusResponse.body.error, "Invalid report status.");

  const dismissResponse = await supertest(app)
    .post(`/api/reports/${reportResponse.body.report._id}/resolve`)
    .set("x-test-user-id", String(admin._id))
    .send({ action: "dismiss", note: "Allowed after review" });

  assert.equal(dismissResponse.status, 200);
  assert.equal(dismissResponse.body.reports.length, 0);

  const dismissedList = await supertest(app)
    .get("/api/reports")
    .query({ status: "dismissed" })
    .set("x-test-user-id", String(admin._id));
  assert.equal(dismissedList.status, 200);
  assert.equal(dismissedList.body.reports.length, 1);
  assert.equal(dismissedList.body.reports[0].resolutionNote, "Allowed after review");
  assert.equal(dismissedList.body.reports[0].resolvedBy.displayName, "adminUser");

  const secondPost = await Post.create({
    title: "Remove this post",
    content: "This report resolution should delete the post.",
    postedBy: author._id,
    community: community._id,
    comments: []
  });

  const secondReportResponse = await supertest(app)
    .post(`/api/reports/posts/${secondPost._id}`)
    .set("x-test-user-id", String(reporter._id))
    .send({ reason: "harassment", details: "Personal attack" });

  const removeResponse = await supertest(app)
    .post(`/api/reports/${secondReportResponse.body.report._id}/resolve`)
    .set("x-test-user-id", String(admin._id))
    .send({ action: "delete_post", note: "Violates community expectations" });

  assert.equal(removeResponse.status, 200);
  assert.equal(await Post.findById(secondPost._id), null);

  const removalHistory = await supertest(app)
    .get("/api/reports")
    .query({ status: "content_removed" })
    .set("x-test-user-id", String(admin._id));
  assert.equal(removalHistory.status, 200);
  assert.equal(removalHistory.body.reports.length, 1);
  assert.equal(removalHistory.body.reports[0].targetPost, null);
  assert.equal(removalHistory.body.reports[0].contentSnapshot.title, "Remove this post");
  assert.equal(
    removalHistory.body.reports[0].resolutionNote,
    "Violates community expectations"
  );

  const resolvedReport = await Report.findById(secondReportResponse.body.report._id);
  assert.equal(resolvedReport.status, "content_removed");
  assert.equal(String(resolvedReport.resolvedBy), String(admin._id));

  const refreshedReporter = await User.findById(reporter._id);
  assert.ok(refreshedReporter);
});
