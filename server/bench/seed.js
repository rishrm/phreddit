// Seeds a volume dataset for benchmarking listing/search endpoints.
// Usage: MONGO_URI=mongodb://127.0.0.1:27017/phreddit_bench node bench/seed.js [postCount]
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Community from "../models/Community.js";
import Post from "../models/Post.js";
import User from "../models/User.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/phreddit_bench";
const POST_COUNT = Number(process.argv[2] || 2000);
const COMMENTS_PER_POST = 3;

async function main() {
  if (!Number.isInteger(POST_COUNT) || POST_COUNT < 1 || POST_COUNT > 100000) {
    throw new Error("postCount must be an integer between 1 and 100000.");
  }
  await mongoose.connect(MONGO_URI);
  const databaseName = mongoose.connection.name;
  if (
    !databaseName.toLowerCase().includes("bench") ||
    process.env.CONFIRM_DATABASE_RESET !== databaseName
  ) {
    throw new Error(
      `Refusing to erase ${databaseName}. Use a benchmark database and set CONFIRM_DATABASE_RESET=${databaseName}.`
    );
  }
  await Promise.all([
    User.deleteMany({}),
    Community.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({})
  ]);

  const passwordHash = await bcrypt.hash("BenchPass123!", 4);
  const user = await User.create({
    firstName: "Bench",
    lastName: "User",
    email: "bench@example.com",
    displayName: "benchuser",
    passwordHash
  });

  const community = await Community.create({
    name: "benchmark",
    description: "Synthetic data for load testing.",
    creator: user._id,
    members: [user._id],
    posts: []
  });

  const words = ["deploy", "react", "mongo", "vite", "session", "index", "cache", "socket"];
  const posts = [];
  for (let i = 0; i < POST_COUNT; i += 1) {
    posts.push({
      title: `Bench post ${i} about ${words[i % words.length]}`,
      content: `Synthetic content ${i} discussing ${words[(i + 3) % words.length]} performance.`,
      community: community._id,
      postedBy: user._id,
      views: i % 50,
      comments: [],
      upvotes: i % 7,
      downvotes: i % 3,
      votedBy: []
    });
  }
  const createdPosts = await Post.insertMany(posts);

  const comments = [];
  for (const post of createdPosts) {
    for (let j = 0; j < COMMENTS_PER_POST; j += 1) {
      comments.push({
        content: `Bench comment ${j} on ${post.title}`,
        commentedBy: user._id,
        post: post._id,
        parentComment: null,
        replies: [],
        upvotes: 0,
        downvotes: 0,
        votedBy: []
      });
    }
  }
  await Comment.insertMany(comments);

  console.log(`Seeded ${createdPosts.length} posts and ${comments.length} comments into ${databaseName}.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
