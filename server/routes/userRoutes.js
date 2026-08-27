import express from "express";
import Comment from "../models/Comment.js";
import Community from "../models/Community.js";
import Post from "../models/Post.js";
import User from "../models/User.js";
import {
  requireAdmin,
  requireLogin,
  SESSION_USER_FIELDS
} from "../middleware/auth.js";
import { deleteUserCascade } from "../utils/cascadeDelete.js";
import { attachPostStats } from "../utils/postStats.js";
import { presentVotable } from "../utils/serialize.js";

const router = express.Router();

// Public profile: safe subset of a user's identity and activity, so
// display names around the app can link somewhere. No email, no saved posts.
router.get("/:id/public", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      "displayName reputation createdAt"
    );
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const [posts, comments] = await Promise.all([
      Post.find({ postedBy: user._id })
        .select("title community createdAt upvotes downvotes")
        .populate("community", "name")
        .sort({ createdAt: -1 })
        .limit(30),
      Comment.find({ commentedBy: user._id })
        .select("content post createdAt upvotes downvotes")
        .populate("post", "title")
        .sort({ createdAt: -1 })
        .limit(30)
    ]);

    return res.json({
      user,
      posts,
      comments: comments.map((comment) => {
        const plain = comment.toObject();
        if (plain.content.length > 200) {
          plain.content = `${plain.content.slice(0, 200)}...`;
        }
        return plain;
      })
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireLogin, requireAdmin, async (_req, res, next) => {
  try {
    const users = await User.find({
      isAdmin: false
    })
      .select("displayName email reputation createdAt")
      .sort({ displayName: 1 });
    return res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.post("/me/saved-posts/:postId", requireLogin, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    const user = await User.findByIdAndUpdate(
      req.currentUser._id,
      { $addToSet: { savedPosts: post._id } },
      { new: true }
    ).select(SESSION_USER_FIELDS);

    return res.json({
      message: "Post saved.",
      user
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/me/saved-posts/:postId", requireLogin, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.currentUser._id,
      { $pull: { savedPosts: req.params.postId } },
      { new: true }
    ).select(SESSION_USER_FIELDS);

    return res.json({
      message: "Post removed from saved posts.",
      user
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/profile-content", requireLogin, async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    if (!req.currentUser.isAdmin && String(req.currentUser._id) !== String(targetUserId)) {
      return res.status(403).json({
        error: "You do not have permission to view this profile content."
      });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({
        error: "User not found."
      });
    }

    const communities = await Community.find({
      creator: user._id
    }).sort({ createdAt: -1 });

    const posts = await Post.find({
      postedBy: user._id
    })
      .select("title content community createdAt updatedAt votedBy")
      .populate("community", "name")
      .sort({ createdAt: -1 });

    const comments = await Comment.find({
      commentedBy: user._id
    })
      .select("content post parentComment createdAt updatedAt upvotes downvotes votedBy")
      .populate("post", "title")
      .sort({ createdAt: -1 });

    const savedPosts = await Post.find({
      _id: { $in: user.savedPosts || [] }
    })
      .select("title community postedBy linkFlair createdAt views upvotes downvotes votedBy")
      .populate("postedBy", "displayName")
      .populate("community", "name")
      .populate("linkFlair", "content")
      .sort({ createdAt: -1 });

    return res.json({
      user,
      communities,
      posts: posts.map((post) => presentVotable(post, req.currentUser._id)),
      comments: comments.map((comment) => presentVotable(comment, req.currentUser._id)),
      savedPosts: await attachPostStats(savedPosts, req.currentUser._id)
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireLogin, requireAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: "User not found."
      });
    }

    if (user.isAdmin) {
      return res.status(400).json({
        error: "Admin users cannot be deleted through this route."
      });
    }

    await deleteUserCascade(user._id);

    return res.json({
      message: "User deleted successfully."
    });
  } catch (error) {
    next(error);
  }
});

export default router;
