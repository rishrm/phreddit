import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Post from "../models/Post.js";
import { sessionOptions, withSession } from "./transactions.js";

const DEFAULT_BACKFILL_BATCH_SIZE = 500;

function uniqueObjectIds(values) {
  const ids = new Map();
  for (const value of values || []) {
    if (!value || !mongoose.isValidObjectId(value)) continue;
    ids.set(String(value), new mongoose.Types.ObjectId(String(value)));
  }
  return [...ids.values()];
}

function aggregateWithSession(pipeline, session) {
  const aggregate = Comment.aggregate(pipeline);
  return session ? aggregate.session(session) : aggregate;
}

export async function syncPostActivity(postIds, { session = null } = {}) {
  const ids = uniqueObjectIds(postIds);
  if (ids.length === 0) return 0;

  const posts = await withSession(
    Post.find({ _id: { $in: ids } }).select("_id").lean(),
    session
  );
  if (posts.length === 0) return 0;

  const existingIds = posts.map((post) => post._id);
  const stats = await aggregateWithSession([
    { $match: { post: { $in: existingIds } } },
    {
      $group: {
        _id: "$post",
        commentCount: { $sum: 1 },
        latestCommentAt: { $max: "$createdAt" }
      }
    }
  ], session);
  const statsByPostId = new Map(
    stats.map((item) => [String(item._id), item])
  );

  await Post.bulkWrite(
    posts.map((post) => {
      const activity = statsByPostId.get(String(post._id));
      return {
        updateOne: {
          filter: { _id: post._id },
          update: {
            $set: {
              commentCount: activity?.commentCount || 0,
              latestCommentAt: activity?.latestCommentAt || null
            }
          }
        }
      };
    }),
    sessionOptions(session)
  );

  return posts.length;
}

export async function backfillMissingPostActivity({
  batchSize = DEFAULT_BACKFILL_BATCH_SIZE
} = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new Error("Post activity backfill batch size must be between 1 and 5000.");
  }

  let updated = 0;
  while (true) {
    const posts = await Post.find({
      $or: [
        { commentCount: { $exists: false } },
        { latestCommentAt: { $exists: false } }
      ]
    })
      .select("_id")
      .limit(batchSize)
      .lean();

    if (posts.length === 0) return updated;
    updated += await syncPostActivity(posts.map((post) => post._id));
  }
}
