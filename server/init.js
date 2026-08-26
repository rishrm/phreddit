import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import Comment from "./models/Comment.js";
import Community from "./models/Community.js";
import LinkFlair from "./models/LinkFlair.js";
import Post from "./models/Post.js";
import Report from "./models/Report.js";
import User from "./models/User.js";
import {
  PASSWORD_MIN_LENGTH,
  validateEmail
} from "./utils/validation.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/phreddit";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || randomBytes(18).toString("base64url");

async function clearDatabase() {
  await Promise.all([
    User.deleteMany({}),
    Community.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
    LinkFlair.deleteMany({}),
    Report.deleteMany({})
  ]);
}

async function createPost({ title, content, community, postedBy, linkFlair, views = 0 }) {
  const post = await Post.create({
    title,
    content,
    community: community._id,
    postedBy: postedBy._id,
    linkFlair: linkFlair?._id || null,
    views,
    comments: [],
    upvotes: 0,
    downvotes: 0,
    votedBy: []
  });

  await Community.findByIdAndUpdate(community._id, {
    $addToSet: { posts: post._id }
  });

  await User.findByIdAndUpdate(postedBy._id, {
    $addToSet: { createdPosts: post._id }
  });

  return post;
}

async function createComment({ content, post, commentedBy, parentComment = null }) {
  const comment = await Comment.create({
    content,
    commentedBy: commentedBy._id,
    post: post._id,
    parentComment: parentComment?._id || null,
    replies: [],
    upvotes: 0,
    downvotes: 0,
    votedBy: []
  });

  if (parentComment) {
    await Comment.findByIdAndUpdate(parentComment._id, {
      $addToSet: { replies: comment._id }
    });
  } else {
    await Post.findByIdAndUpdate(post._id, {
      $addToSet: { comments: comment._id }
    });
  }

  await User.findByIdAndUpdate(commentedBy._id, {
    $addToSet: { createdComments: comment._id }
  });

  return comment;
}

async function main() {
  const [emailArg, displayNameArg] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD;

  if (!emailArg || !displayNameArg || !password) {
    console.error(
      "Usage: ADMIN_PASSWORD=<password> CONFIRM_DATABASE_RESET=<database> node init.js <adminEmail> <adminDisplayName>"
    );
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const displayName = displayNameArg.trim();

  if (!validateEmail(email)) {
    console.error("Admin email must be a valid email address.");
    process.exit(1);
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    console.error(`Admin password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  const databaseName = mongoose.connection.name;
  if (process.env.CONFIRM_DATABASE_RESET !== databaseName) {
    throw new Error(
      `Refusing to erase ${databaseName}. Set CONFIRM_DATABASE_RESET=${databaseName} to continue.`
    );
  }
  await clearDatabase();

  const [adminPasswordHash, demoPasswordHash] = await Promise.all([
    bcrypt.hash(password, 12),
    bcrypt.hash(DEMO_PASSWORD, 12)
  ]);

  const admin = await User.create({
    firstName: "Admin",
    lastName: "User",
    email,
    displayName,
    passwordHash: adminPasswordHash,
    reputation: 1000,
    isAdmin: true,
    joinedCommunities: [],
    createdCommunities: [],
    createdPosts: [],
    createdComments: []
  });

  const [alex, jamie, taylor] = await User.create([
    {
      firstName: "Alex",
      lastName: "Morgan",
      email: "alex@example.com",
      displayName: "alexm",
      passwordHash: demoPasswordHash,
      reputation: 115,
      isAdmin: false
    },
    {
      firstName: "Jamie",
      lastName: "Rivera",
      email: "jamie@example.com",
      displayName: "jamier",
      passwordHash: demoPasswordHash,
      reputation: 95,
      isAdmin: false
    },
    {
      firstName: "Taylor",
      lastName: "Chen",
      email: "taylor@example.com",
      displayName: "taylortech",
      passwordHash: demoPasswordHash,
      reputation: 80,
      isAdmin: false
    }
  ]);

  const [questionFlair, showcaseFlair, discussionFlair] = await LinkFlair.create([
    { content: "Question" },
    { content: "Showcase" },
    { content: "Discussion" }
  ]);

  const [webDev, designReview, filmClub] = await Community.create([
    {
      name: "webdev",
      description: "A place to trade frontend, backend, and deployment notes.",
      creator: alex._id,
      members: [alex._id, jamie._id, taylor._id],
      posts: []
    },
    {
      name: "designreview",
      description: "Share product ideas, UI critiques, and interaction patterns.",
      creator: jamie._id,
      members: [jamie._id, taylor._id],
      posts: []
    },
    {
      name: "filmclub",
      description: "Recommendations, reviews, and watch-party planning.",
      creator: taylor._id,
      members: [taylor._id, alex._id],
      posts: []
    }
  ]);

  await Promise.all([
    User.findByIdAndUpdate(alex._id, {
      $set: {
        joinedCommunities: [webDev._id, filmClub._id],
        createdCommunities: [webDev._id]
      }
    }),
    User.findByIdAndUpdate(jamie._id, {
      $set: {
        joinedCommunities: [webDev._id, designReview._id],
        createdCommunities: [designReview._id]
      }
    }),
    User.findByIdAndUpdate(taylor._id, {
      $set: {
        joinedCommunities: [webDev._id, designReview._id, filmClub._id],
        createdCommunities: [filmClub._id]
      }
    })
  ]);

  const deployPost = await createPost({
    title: "What is your favorite way to deploy a MERN app?",
    content: "I am comparing simple VPS deploys, managed platforms, and container-based setups.",
    community: webDev,
    postedBy: alex,
    linkFlair: questionFlair,
    views: 24
  });

  const portfolioPost = await createPost({
    title: "Polished a community forum dashboard",
    content: "I added search, reputation-aware voting, and a profile page that collects user activity.",
    community: designReview,
    postedBy: jamie,
    linkFlair: showcaseFlair,
    views: 17
  });

  const moviePost = await createPost({
    title: "Weekend watch list",
    content: "Drop a movie that pairs well with a low-key Friday night.",
    community: filmClub,
    postedBy: taylor,
    linkFlair: discussionFlair,
    views: 31
  });

  const deployComment = await createComment({
    content: "Managed platforms are hard to beat for demos because setup is quick.",
    post: deployPost,
    commentedBy: jamie
  });

  await createComment({
    content: "Agreed. For production, I still like having a repeatable deploy script.",
    post: deployPost,
    commentedBy: taylor,
    parentComment: deployComment
  });

  await createComment({
    content: "The profile page makes the app feel much easier to navigate.",
    post: portfolioPost,
    commentedBy: alex
  });

  await createComment({
    content: "My pick is a smart mystery with a short runtime.",
    post: moviePost,
    commentedBy: jamie
  });

  await User.findByIdAndUpdate(admin._id, {
    $set: {
      savedPosts: [portfolioPost._id, deployPost._id]
    }
  });

  console.log(`Initialized ${databaseName} with admin user ${admin.email}.`);
  console.log(`Demo users use password: ${DEMO_PASSWORD}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
