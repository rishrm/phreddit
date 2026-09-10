import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import Comment from "../models/Comment.js";
import Post from "../models/Post.js";
import User from "../models/User.js";
import LinkFlair from "../models/LinkFlair.js";
import { createApp } from "../server.js";
import { syncPostActivity } from "../utils/postActivity.js";
import {
  clearTestDb,
  connectTestDb,
  createTestCommunity,
  createTestUser,
  disconnectTestDb
} from "./testHelpers.js";

test("post listings use stable cursors, sort server-side, and search via text indexes", async (t) => {
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
  const second = await Post.create({
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
  const quiet = await Post.create({
    title: "Delta thread",
    content: "An older quiet post.",
    postedBy: user._id,
    community: community._id,
    comments: []
  });

  await Promise.all([
    Post.collection.updateOne(
      { _id: first._id },
      { $set: { createdAt: new Date("2025-01-01T00:00:00.000Z") } }
    ),
    Post.collection.updateOne(
      { _id: second._id },
      // Equal timestamps exercise the ObjectId cursor tie-breaker.
      { $set: { createdAt: new Date("2025-01-03T00:00:00.000Z") } }
    ),
    Post.collection.updateOne(
      { _id: third._id },
      { $set: { createdAt: new Date("2025-01-03T00:00:00.000Z") } }
    ),
    Post.collection.updateOne(
      { _id: quiet._id },
      { $set: { createdAt: new Date("2024-12-31T00:00:00.000Z") } }
    )
  ]);

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

  // Cursor pagination remains stable when a newer post arrives between requests.
  const pageOne = await supertest(app).get("/api/posts").query({ limit: 2 });
  assert.equal(pageOne.status, 200);
  assert.equal(Object.hasOwn(pageOne.body.posts[0], "comments"), false);
  assert.equal(Object.hasOwn(pageOne.body.posts[0], "votedBy"), false);
  assert.equal(Object.hasOwn(pageOne.body.posts[0], "__v"), false);
  assert.equal(Object.hasOwn(pageOne.body.posts[0], "id"), false);
  assert.equal(pageOne.body.posts.length, 2);
  assert.equal(pageOne.body.total, 4);
  assert.equal(pageOne.body.hasMore, true);
  assert.equal(typeof pageOne.body.nextCursor, "string");
  assert.equal(Object.hasOwn(pageOne.body, "page"), false);
  assert.deepEqual(
    pageOne.body.posts.map((post) => post.title),
    ["Gamma thread", "Beta thread"]
  );

  const inserted = await Post.create({
    title: "Inserted thread",
    content: "Created after the first page was read.",
    postedBy: user._id,
    community: community._id,
    comments: []
  });
  await Post.collection.updateOne(
    { _id: inserted._id },
    { $set: { createdAt: new Date("2025-01-04T00:00:00.000Z") } }
  );

  const pageTwo = await supertest(app)
    .get("/api/posts")
    .query({ limit: 2, cursor: pageOne.body.nextCursor });
  assert.equal(pageTwo.status, 200);
  assert.equal(pageTwo.body.posts.length, 2);
  assert.equal(pageTwo.body.hasMore, false);
  assert.equal(pageTwo.body.nextCursor, null);
  assert.equal(Object.hasOwn(pageTwo.body, "total"), false);
  assert.deepEqual(
    pageTwo.body.posts.map((post) => post.title),
    ["Alpha zebra thread", "Delta thread"]
  );
  assert.equal(pageTwo.body.posts.some((post) => post.title === "Inserted thread"), false);
  await Post.deleteOne({ _id: inserted._id });

  const legacyPage = await supertest(app).get("/api/posts").query({ limit: 2, page: 2 });
  assert.equal(legacyPage.status, 200);
  assert.equal(legacyPage.body.page, 2);
  assert.deepEqual(
    legacyPage.body.posts.map((post) => post.title),
    ["Alpha zebra thread", "Delta thread"]
  );

  const malformedCursor = await supertest(app)
    .get("/api/posts")
    .query({ cursor: "not+a+cursor" });
  assert.equal(malformedCursor.status, 400);
  assert.equal(malformedCursor.body.code, "INVALID_POST_CURSOR");

  const wrongSortCursor = await supertest(app)
    .get("/api/posts")
    .query({ sort: "oldest", cursor: pageOne.body.nextCursor });
  assert.equal(wrongSortCursor.status, 400);
  assert.equal(wrongSortCursor.body.code, "INVALID_POST_CURSOR");

  const mixedPagination = await supertest(app)
    .get("/api/posts")
    .query({ page: 2, cursor: pageOne.body.nextCursor });
  assert.equal(mixedPagination.status, 400);

  // Oldest cursors use the opposite comparison direction.
  const oldestPageOne = await supertest(app)
    .get("/api/posts")
    .query({ sort: "oldest", limit: 2 });
  const oldestPageTwo = await supertest(app)
    .get("/api/posts")
    .query({ sort: "oldest", limit: 2, cursor: oldestPageOne.body.nextCursor });
  assert.deepEqual(
    [...oldestPageOne.body.posts, ...oldestPageTwo.body.posts].map((post) => post.title),
    ["Delta thread", "Alpha zebra thread", "Beta thread", "Gamma thread"]
  );

  // Active cursors cross cleanly from dated activity to null/quiet posts.
  const activePageOne = await supertest(app)
    .get("/api/posts")
    .query({ sort: "active", limit: 2 });
  const activePageTwo = await supertest(app)
    .get("/api/posts")
    .query({ sort: "active", limit: 2, cursor: activePageOne.body.nextCursor });
  const active = [...activePageOne.body.posts, ...activePageTwo.body.posts];
  assert.deepEqual(
    active.map((post) => post.title),
    ["Alpha zebra thread", "Gamma thread", "Beta thread", "Delta thread"]
  );
  assert.equal(active[0].commentCount, 1);

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

test("joined-community posts stay ahead of other posts across cursor boundaries", async (t) => {
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
    .query({ limit: 2 })
    .set("x-test-user-id", String(viewer._id));
  const pageTwo = await supertest(app)
    .get("/api/posts")
    .query({ cursor: pageOne.body.nextCursor, limit: 2 })
    .set("x-test-user-id", String(viewer._id));
  const pageThree = await supertest(app)
    .get("/api/posts")
    .query({ cursor: pageTwo.body.nextCursor, limit: 2 })
    .set("x-test-user-id", String(viewer._id));

  assert.ok(pageOne.body.posts.every((post) => post.title.startsWith("Joined")));
  assert.equal(pageTwo.body.posts[0].title.startsWith("Joined"), true);
  assert.equal(pageTwo.body.posts[1].title.startsWith("Other"), true);
  assert.ok(pageThree.body.posts.every((post) => post.title.startsWith("Other")));
  const allIds = [...pageOne.body.posts, ...pageTwo.body.posts, ...pageThree.body.posts]
    .map((post) => post._id);
  assert.equal(new Set(allIds).size, 6);
  assert.equal(pageThree.body.nextCursor, null);

  const wrongViewer = await supertest(app)
    .get("/api/posts")
    .query({ cursor: pageOne.body.nextCursor, limit: 2 });
  assert.equal(wrongViewer.status, 400);
  assert.equal(wrongViewer.body.code, "INVALID_POST_CURSOR");
});

async function cursorFixture(t) {
  await connectTestDb();
  await clearTestDb();
  t.after(async () => { await clearTestDb(); await disconnectTestDb(); });
  const user = await createTestUser();
  const joined = await createTestCommunity(user);
  const other = await createTestCommunity(await createTestUser());
  const flair = await LinkFlair.create({ content: "Cursor coverage" });
  const createdAt = new Date("2025-01-01T00:00:00.000Z");
  const latestCommentAt = new Date("2026-01-01T00:00:00.000Z");
  const posts = [];
  for (const community of [joined, other]) {
    for (let index = 0; index < 4; index += 1) {
      posts.push(await Post.create({
        title: `Cursorneedle ${posts.length}`, content: "Cursorneedle coverage",
        postedBy: user._id, community: community._id, linkFlair: flair._id,
        createdAt, latestCommentAt: index < 2 ? latestCommentAt : null,
        commentCount: index < 2 ? 1 : 0
      }));
    }
  }
  return { app: createApp({ useSessionStore: false }), user, joined, other, flair, posts };
}

test("every cursor sort traverses equal timestamps, quiet posts, and membership boundaries", async (t) => {
  const { app, user, joined, flair, posts } = await cursorFixture(t);
  for (const sort of ["newest", "oldest", "active"]) {
    for (const filters of [{}, { community: String(joined._id), linkFlair: String(flair._id), search: "cursorneedle" }]) {
      const expected = posts.filter((post) => !filters.community || String(post.community) === filters.community)
        .sort((left, right) => {
          const rank = (post) => String(post.community) === String(joined._id) ? 1 : 0;
          const activity = (post) => post.latestCommentAt?.getTime() ?? 0;
          return rank(right) - rank(left) ||
            (sort === "active" ? activity(right) - activity(left) : 0) ||
            String(left._id).localeCompare(String(right._id)) * (sort === "oldest" ? 1 : -1);
        }).map((post) => String(post._id));
      let cursor;
      const actual = [];
      for (let window = 0; window <= posts.length; window += 1) {
        const response = await supertest(app).get("/api/posts")
          .set("x-test-user-id", String(user._id))
          .query({ sort, limit: 1, ...filters, ...(cursor ? { cursor } : {}) });
        assert.equal(response.status, 200);
        assert.equal(response.body.posts.length, 1);
        actual.push(response.body.posts[0]._id);
        assert.equal(response.body.hasMore, Boolean(response.body.nextCursor));
        cursor = response.body.nextCursor;
        if (!cursor) break;
      }
      assert.deepEqual(actual, expected, `${sort} ${JSON.stringify(filters)}`);
    }
  }
});

test("listing cursors reject changed filters, changed membership, and structured inputs", async (t) => {
  const { app, user, joined, flair } = await cursorFixture(t);
  const first = await supertest(app).get("/api/posts")
    .set("x-test-user-id", String(user._id)).query({ limit: 1 });
  for (const query of [
    { cursor: first.body.nextCursor, community: String(joined._id) },
    { cursor: first.body.nextCursor, linkFlair: String(flair._id) },
    { cursor: first.body.nextCursor, search: "cursorneedle" },
    { cursor: [first.body.nextCursor, first.body.nextCursor] },
    { "cursor[$gt]": "" }, { cursor: "" }, { cursor: "x".repeat(1025) }
  ]) {
    const response = await supertest(app).get("/api/posts")
      .set("x-test-user-id", String(user._id)).query(query);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "INVALID_POST_CURSOR");
  }
  await User.updateOne({ _id: user._id }, { $set: { joinedCommunities: [] } });
  const staleMembership = await supertest(app).get("/api/posts")
    .set("x-test-user-id", String(user._id)).query({ cursor: first.body.nextCursor });
  assert.equal(staleMembership.status, 400);
});

test("a deleted cursor anchor does not prevent reaching the remaining posts", async (t) => {
  const { app } = await cursorFixture(t);
  const first = await supertest(app).get("/api/posts").query({ limit: 2 });
  const firstIds = first.body.posts.map((post) => post._id);
  await Post.deleteOne({ _id: firstIds.at(-1) });
  const next = await supertest(app).get("/api/posts").query({ cursor: first.body.nextCursor, limit: 50 });
  assert.equal(next.status, 200);
  assert.equal(next.body.posts.length, 6);
  assert.equal(next.body.posts.some((post) => firstIds.includes(post._id)), false);
  assert.equal(next.body.nextCursor, null);
});
