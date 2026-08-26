import { describe, expect, it } from "vitest";
import {
  commentCountOf,
  flattenComments,
  isPostSavedByUser,
  sortComments,
  splitPostsByMembership
} from "./posts.js";

describe("commentCountOf", () => {
  it("prefers the server-computed commentCount", () => {
    expect(commentCountOf({ commentCount: 7, comments: [{}] })).toBe(7);
  });

  it("falls back to counting the nested comment tree", () => {
    const post = {
      comments: [
        { replies: [{ replies: [] }, { replies: [{ replies: [] }] }] },
        { replies: [] }
      ]
    };
    expect(commentCountOf(post)).toBe(5);
  });

  it("returns 0 when there are no comments", () => {
    expect(commentCountOf({})).toBe(0);
  });
});

describe("isPostSavedByUser", () => {
  it("matches saved posts stored as ids or documents", () => {
    const user = { savedPosts: ["abc", { _id: "def" }] };
    expect(isPostSavedByUser(user, "abc")).toBe(true);
    expect(isPostSavedByUser(user, "def")).toBe(true);
    expect(isPostSavedByUser(user, "zzz")).toBe(false);
    expect(isPostSavedByUser(null, "abc")).toBe(false);
  });
});

describe("splitPostsByMembership", () => {
  const posts = [
    { _id: "1", community: { _id: "c1" } },
    { _id: "2", community: "c2" },
    { _id: "3", community: { _id: "c3" } }
  ];

  it("groups posts from joined communities first", () => {
    const user = { joinedCommunities: ["c2", { _id: "c3" }] };
    const { joinedPosts, otherPosts } = splitPostsByMembership(posts, user);
    expect(joinedPosts.map((post) => post._id)).toEqual(["2", "3"]);
    expect(otherPosts.map((post) => post._id)).toEqual(["1"]);
  });

  it("treats guests as having no joined communities", () => {
    const { joinedPosts, otherPosts } = splitPostsByMembership(posts, null);
    expect(joinedPosts).toEqual([]);
    expect(otherPosts).toHaveLength(3);
  });
});

describe("sortComments", () => {
  const tree = [
    {
      _id: "old-high",
      createdAt: "2024-01-01T00:00:00Z",
      upvotes: 10,
      downvotes: 0,
      replies: [
        { _id: "r-old", createdAt: "2024-01-02T00:00:00Z", upvotes: 0, downvotes: 0, replies: [] },
        { _id: "r-new", createdAt: "2024-03-01T00:00:00Z", upvotes: 5, downvotes: 0, replies: [] }
      ]
    },
    { _id: "new-low", createdAt: "2024-02-01T00:00:00Z", upvotes: 1, downvotes: 5, replies: [] }
  ];

  it("sorts newest-first by default, recursively", () => {
    const sorted = sortComments(tree, "newest");
    expect(sorted.map((comment) => comment._id)).toEqual(["new-low", "old-high"]);
    expect(sorted[1].replies.map((reply) => reply._id)).toEqual(["r-new", "r-old"]);
  });

  it("sorts by score in top mode", () => {
    const sorted = sortComments(tree, "top");
    expect(sorted.map((comment) => comment._id)).toEqual(["old-high", "new-low"]);
    expect(sorted[0].replies.map((reply) => reply._id)).toEqual(["r-new", "r-old"]);
  });

  it("does not mutate the input tree", () => {
    const before = JSON.stringify(tree);
    sortComments(tree, "top");
    expect(JSON.stringify(tree)).toBe(before);
  });

  it("sorts and flattens very deep threads without recursive stack overflow", () => {
    const root = {
      _id: "comment-0",
      createdAt: "2024-01-01T00:00:00Z",
      replies: []
    };
    let cursor = root;
    for (let depth = 1; depth <= 3000; depth += 1) {
      const reply = {
        _id: `comment-${depth}`,
        createdAt: "2024-01-01T00:00:00Z",
        replies: []
      };
      cursor.replies.push(reply);
      cursor = reply;
    }

    expect(commentCountOf({ comments: [root] })).toBe(3001);
    const flattened = flattenComments(sortComments([root]));
    expect(flattened).toHaveLength(3001);
    expect(flattened.at(-1)).toMatchObject({
      depth: 3000,
      comment: { _id: "comment-3000" }
    });
  });
});
