import test from "node:test";
import assert from "node:assert/strict";
import {
  createPostCursorContext,
  decodePostCursor,
  encodePostCursor
} from "../utils/postCursor.js";

const postId = "111111111111111111111111";

function context(overrides = {}) {
  return createPostCursorContext({
    sort: "active",
    community: "222222222222222222222222",
    search: "threaded comments",
    viewerId: "333333333333333333333333",
    joinedCommunityIds: [
      "555555555555555555555555",
      "444444444444444444444444"
    ],
    ...overrides
  });
}

test("post cursors round-trip their typed ordering keys", () => {
  const cursorContext = context();
  const encoded = encodePostCursor({
    context: cursorContext,
    sort: "active",
    joinedRank: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    latestCommentAt: new Date("2026-02-01T00:00:00.000Z"),
    id: postId
  });

  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodePostCursor(encoded, {
    context: cursorContext,
    sort: "active"
  }), {
    joinedRank: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    latestCommentAt: new Date("2026-02-01T00:00:00.000Z"),
    id: postId
  });
});

test("post cursor contexts are stable across joined-community input order", () => {
  assert.equal(context(), context({
    joinedCommunityIds: [
      "444444444444444444444444",
      "555555555555555555555555"
    ]
  }));
});

test("post cursors reject malformed, altered, or cross-listing values", () => {
  const cursorContext = context();
  const encoded = encodePostCursor({
    context: cursorContext,
    sort: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    id: postId
  });

  assert.throws(
    () => decodePostCursor("not+a+cursor", { context: cursorContext, sort: "active" }),
    { code: "INVALID_POST_CURSOR", status: 400 }
  );
  assert.throws(
    () => decodePostCursor(`${encoded}x`, { context: cursorContext, sort: "active" }),
    { code: "INVALID_POST_CURSOR", status: 400 }
  );
  assert.throws(
    () => decodePostCursor(encoded, { context: context({ search: "different" }), sort: "active" }),
    { code: "INVALID_POST_CURSOR", status: 400 }
  );
  assert.throws(
    () => decodePostCursor(encoded, { context: cursorContext, sort: "newest" }),
    { code: "INVALID_POST_CURSOR", status: 400 }
  );
});

test("post cursor validation rejects incorrect types, dates, versions, and excessive length", () => {
  const options = { context: context(), sort: "active" };
  const encoded = encodePostCursor({ ...options, createdAt: new Date(), id: postId });
  const parsed = JSON.parse(Buffer.from(encoded, "base64url"));
  const invalidPayloads = [null, [], {}, { ...parsed, v: 2 }, { ...parsed, r: 2 },
    { ...parsed, t: null }, { ...parsed, t: 0 }, { ...parsed, t: [] },
    { ...parsed, a: "bad date" }, { ...parsed, a: 0 }, { ...parsed, i: { $gt: "" } },
    { ...parsed, extra: true }];
  const invalidValues = [null, [encoded], "", "x".repeat(1025), " " + encoded,
    ...invalidPayloads.map((payload) => Buffer.from(JSON.stringify(payload)).toString("base64url"))];
  for (const value of invalidValues) {
    assert.throws(() => decodePostCursor(value, options), { status: 400, code: "INVALID_POST_CURSOR" });
  }
  assert.throws(() => encodePostCursor({ ...options, createdAt: null, id: postId }), TypeError);
});
