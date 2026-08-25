import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Community from "../models/Community.js";
import Post from "../models/Post.js";
import Report from "../models/Report.js";
import User from "../models/User.js";
import { emitPostUpdated } from "../realtime.js";
import { runAtomic, sessionOptions, withSession } from "./transactions.js";

function uniqueObjectIds(values) {
  const ids = new Map();
  for (const value of values || []) {
    if (!value) continue;
    ids.set(String(value), new mongoose.Types.ObjectId(String(value)));
  }
  return [...ids.values()];
}

function emitPosts(postIds) {
  for (const postId of uniqueObjectIds(postIds)) {
    emitPostUpdated(postId);
  }
}

async function collectCommentTreeIds(rootIds, session) {
  const collected = new Map(
    uniqueObjectIds(rootIds).map((id) => [String(id), id])
  );
  let frontier = [...collected.values()];

  while (frontier.length > 0) {
    const children = await withSession(
      Comment.find({ parentComment: { $in: frontier } }).select("_id").lean(),
      session
    );
    frontier = [];
    for (const child of children) {
      const key = String(child._id);
      if (collected.has(key)) continue;
      collected.set(key, child._id);
      frontier.push(child._id);
    }
  }

  return [...collected.values()];
}

async function deleteCommentsByIds(commentIds, session) {
  const ids = uniqueObjectIds(commentIds);
  if (ids.length === 0) return [];

  const comments = await withSession(
    Comment.find({ _id: { $in: ids } }).select("post").lean(),
    session
  );
  if (comments.length === 0) return [];

  const existingIds = comments.map((comment) => comment._id);
  const postIds = uniqueObjectIds(comments.map((comment) => comment.post));
  const options = sessionOptions(session);

  await Comment.updateMany(
    { replies: { $in: existingIds } },
    { $pull: { replies: { $in: existingIds } } },
    options
  );
  await Post.updateMany(
    { comments: { $in: existingIds } },
    { $pull: { comments: { $in: existingIds } } },
    options
  );
  await User.updateMany(
    { createdComments: { $in: existingIds } },
    { $pull: { createdComments: { $in: existingIds } } },
    options
  );

  await Comment.deleteMany({ _id: { $in: existingIds } }, options);
  return postIds;
}

export async function deleteCommentTreeInSession(commentId, session = null) {
  const root = await withSession(
    Comment.findById(commentId).select("_id post").lean(),
    session
  );
  if (!root) return { deleted: false, postIds: [] };

  const ids = await collectCommentTreeIds([root._id], session);
  const postIds = await deleteCommentsByIds(ids, session);
  return { deleted: true, postIds };
}

export async function deleteCommentAndReplies(commentId, { emit = true } = {}) {
  const result = await runAtomic((session) =>
    deleteCommentTreeInSession(commentId, session)
  );
  if (emit) emitPosts(result.postIds);
  return result;
}

export async function deletePostsInSession(
  postIds,
  { deleteReports = true, session = null } = {}
) {
  const ids = uniqueObjectIds(postIds);
  if (ids.length === 0) return { deletedPostIds: [], touchedPostIds: [] };

  const posts = await withSession(
    Post.find({ _id: { $in: ids } }).select("_id").lean(),
    session
  );
  const existingPostIds = posts.map((post) => post._id);
  if (existingPostIds.length === 0) {
    return { deletedPostIds: [], touchedPostIds: [] };
  }

  const rootComments = await withSession(
    Comment.find({ post: { $in: existingPostIds } }).select("_id").lean(),
    session
  );
  const allCommentIds = await collectCommentTreeIds(
    rootComments.map((comment) => comment._id),
    session
  );
  const touchedPostIds = await deleteCommentsByIds(allCommentIds, session);
  const options = sessionOptions(session);

  await Community.updateMany(
    { posts: { $in: existingPostIds } },
    { $pull: { posts: { $in: existingPostIds } } },
    options
  );
  await User.updateMany(
    { createdPosts: { $in: existingPostIds } },
    { $pull: { createdPosts: { $in: existingPostIds } } },
    options
  );
  await User.updateMany(
    { savedPosts: { $in: existingPostIds } },
    { $pull: { savedPosts: { $in: existingPostIds } } },
    options
  );
  if (deleteReports) {
    await Report.deleteMany({ targetPost: { $in: existingPostIds } }, options);
  }

  await Post.deleteMany({ _id: { $in: existingPostIds } }, options);
  return {
    deletedPostIds: existingPostIds,
    touchedPostIds: uniqueObjectIds([...existingPostIds, ...touchedPostIds])
  };
}

export async function deletePostAndComments(
  postId,
  { deleteReports = true, emit = true } = {}
) {
  const result = await runAtomic((session) =>
    deletePostsInSession([postId], { deleteReports, session })
  );
  if (emit) emitPosts(result.touchedPostIds);
  return result;
}

async function reverseVotesByUser(userId, session) {
  const posts = await withSession(
    Post.find({ "votedBy.user": userId }).select("postedBy votedBy").lean(),
    session
  );
  const comments = await withSession(
    Comment.find({ "votedBy.user": userId }).select("commentedBy votedBy").lean(),
    session
  );
  const reputationByAuthor = new Map();

  function collect(authorId, votedBy) {
    const vote = votedBy.find((item) => String(item.user) === String(userId));
    if (!vote || !authorId) return;
    const key = String(authorId);
    const reversal = vote.voteType === "upvote" ? -5 : 10;
    reputationByAuthor.set(key, (reputationByAuthor.get(key) || 0) + reversal);
  }

  posts.forEach((post) => collect(post.postedBy, post.votedBy));
  comments.forEach((comment) => collect(comment.commentedBy, comment.votedBy));

  if (reputationByAuthor.size > 0) {
    await User.bulkWrite(
      [...reputationByAuthor].map(([authorId, reputation]) => ({
        updateOne: {
          filter: { _id: authorId },
          update: { $inc: { reputation } }
        }
      })),
      sessionOptions(session)
    );
  }
}

async function removeVotesByUser(userId, session) {
  const options = sessionOptions(session);
  await Post.updateMany(
    { votedBy: { $elemMatch: { user: userId, voteType: "upvote" } } },
    { $inc: { upvotes: -1 }, $pull: { votedBy: { user: userId } } },
    options
  );
  await Post.updateMany(
    { votedBy: { $elemMatch: { user: userId, voteType: "downvote" } } },
    { $inc: { downvotes: -1 }, $pull: { votedBy: { user: userId } } },
    options
  );
  await Comment.updateMany(
    { votedBy: { $elemMatch: { user: userId, voteType: "upvote" } } },
    { $inc: { upvotes: -1 }, $pull: { votedBy: { user: userId } } },
    options
  );
  await Comment.updateMany(
    { votedBy: { $elemMatch: { user: userId, voteType: "downvote" } } },
    { $inc: { downvotes: -1 }, $pull: { votedBy: { user: userId } } },
    options
  );
}

export async function deleteCommunityCascade(communityId) {
  const result = await runAtomic(async (session) => {
    const community = await withSession(
      Community.findById(communityId).select("_id").lean(),
      session
    );
    if (!community) return { deleted: false, touchedPostIds: [] };

    const posts = await withSession(
      Post.find({ community: community._id }).select("_id").lean(),
      session
    );
    const postResult = await deletePostsInSession(
      posts.map((post) => post._id),
      { session }
    );
    const options = sessionOptions(session);

    await User.updateMany(
      {
        $or: [
          { joinedCommunities: community._id },
          { createdCommunities: community._id }
        ]
      },
      {
        $pull: {
          joinedCommunities: community._id,
          createdCommunities: community._id
        }
      },
      options
    );
    await Community.deleteOne({ _id: community._id }, options);

    return { deleted: true, touchedPostIds: postResult.touchedPostIds };
  });

  emitPosts(result.touchedPostIds);
  return result;
}

export async function deleteUserCascade(userId) {
  const result = await runAtomic(async (session) => {
    const user = await withSession(
      User.findById(userId).select("_id").lean(),
      session
    );
    if (!user) return { deleted: false, touchedPostIds: [] };

    await reverseVotesByUser(user._id, session);

    const communities = await withSession(
      Community.find({ creator: user._id }).select("_id").lean(),
      session
    );
    const communityIds = communities.map((community) => community._id);
    const postFilter = communityIds.length > 0
      ? { $or: [{ postedBy: user._id }, { community: { $in: communityIds } }] }
      : { postedBy: user._id };
    const posts = await withSession(
      Post.find(postFilter).select("_id").lean(),
      session
    );
    const postResult = await deletePostsInSession(
      posts.map((post) => post._id),
      { session }
    );

    const remainingComments = await withSession(
      Comment.find({ commentedBy: user._id }).select("_id").lean(),
      session
    );
    const remainingCommentIds = await collectCommentTreeIds(
      remainingComments.map((comment) => comment._id),
      session
    );
    const commentPostIds = await deleteCommentsByIds(remainingCommentIds, session);

    await removeVotesByUser(user._id, session);
    const options = sessionOptions(session);
    await Community.updateMany(
      { members: user._id },
      { $pull: { members: user._id } },
      options
    );
    if (communityIds.length > 0) {
      await User.updateMany(
        {
          $or: [
            { joinedCommunities: { $in: communityIds } },
            { createdCommunities: { $in: communityIds } }
          ]
        },
        {
          $pull: {
            joinedCommunities: { $in: communityIds },
            createdCommunities: { $in: communityIds }
          }
        },
        options
      );
    }
    await Report.deleteMany({ reportedBy: user._id }, options);
    if (communityIds.length > 0) {
      await Community.deleteMany({ _id: { $in: communityIds } }, options);
    }
    await User.deleteOne({ _id: user._id }, options);

    return {
      deleted: true,
      touchedPostIds: uniqueObjectIds([
        ...postResult.touchedPostIds,
        ...commentPostIds
      ])
    };
  });

  emitPosts(result.touchedPostIds);
  return result;
}
