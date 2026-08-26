import express from "express";
import Comment from "../models/Comment.js";
import Post from "../models/Post.js";
import User from "../models/User.js";
import { requireLogin } from "../middleware/auth.js";
import { deleteCommentAndReplies } from "../utils/cascadeDelete.js";
import { canUserVote } from "../utils/voting.js";
import { applyVote } from "../utils/voteService.js";
import { presentVotable } from "../utils/serialize.js";
import { requireValidObjectId, requireValidUserContent } from "../utils/validation.js";
import { emitPostUpdated } from "../realtime.js";
import { runAtomic, sessionOptions, withSession } from "../utils/transactions.js";

const router = express.Router();

router.post("/", requireLogin, async (req, res, next) => {
  try {
    const content = requireValidUserContent(req.body.content, "Comment content", 500);
    const postId = requireValidObjectId(req.body.post, "Post");

    const parentCommentId = req.body.parentComment
      ? requireValidObjectId(req.body.parentComment, "Parent comment")
      : null;
    const result = await runAtomic(async (session) => {
      const post = await withSession(Post.findById(postId).select("_id"), session);
      if (!post) return { error: "Post not found.", status: 404 };

      const parentComment = parentCommentId
        ? await withSession(Comment.findById(parentCommentId).select("_id post"), session)
        : null;
      if (parentCommentId && !parentComment) {
        return { error: "Parent comment not found.", status: 404 };
      }
      if (parentComment && String(parentComment.post) !== String(post._id)) {
        return { error: "Parent comment does not belong to this post.", status: 400 };
      }

      const [comment] = await Comment.create(
        [{
          content,
          commentedBy: req.currentUser._id,
          post: post._id,
          parentComment: parentComment?._id || null,
          replies: [],
          upvotes: 0,
          downvotes: 0,
          votedBy: []
        }],
        sessionOptions(session)
      );

      const parentUpdate = parentComment
        ? Comment.updateOne(
            { _id: parentComment._id, post: post._id },
            { $addToSet: { replies: comment._id } },
            sessionOptions(session)
          )
        : Post.updateOne(
            { _id: post._id },
            { $addToSet: { comments: comment._id } },
            sessionOptions(session)
          );
      const referenceUpdate = await parentUpdate;
      const userUpdate = await User.updateOne(
        { _id: req.currentUser._id },
        { $addToSet: { createdComments: comment._id } },
        sessionOptions(session)
      );
      if (referenceUpdate.matchedCount !== 1 || userUpdate.matchedCount !== 1) {
        throw new Error("Comment references could not be updated.");
      }
      return { comment, postId: post._id };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    emitPostUpdated(result.postId);

    return res.status(201).json({
      message: "Comment created successfully.",
      comment: presentVotable(result.comment, req.currentUser._id)
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireLogin, async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({
        error: "Comment not found."
      });
    }

    if (!req.currentUser.isAdmin && String(comment.commentedBy) !== String(req.currentUser._id)) {
      return res.status(403).json({
        error: "You can only edit comments you created."
      });
    }

    comment.content = requireValidUserContent(req.body.content, "Comment content", 500);
    await comment.save();
    emitPostUpdated(comment.post);

    return res.json({
      message: "Comment updated successfully.",
      comment: presentVotable(comment, req.currentUser._id)
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireLogin, async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({
        error: "Comment not found."
      });
    }

    if (!req.currentUser.isAdmin && String(comment.commentedBy) !== String(req.currentUser._id)) {
      return res.status(403).json({
        error: "You can only delete comments you created."
      });
    }

    await deleteCommentAndReplies(comment._id);

    return res.json({
      message: "Comment deleted successfully."
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/vote", requireLogin, async (req, res, next) => {
  try {
    const voteType = req.body.voteType;

    if (!["upvote", "downvote"].includes(voteType)) {
      return res.status(400).json({
        error: "voteType must be upvote or downvote."
      });
    }

    if (!canUserVote(req.currentUser)) {
      return res.status(403).json({
        error: "Users with reputation below 50 cannot vote."
      });
    }

    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({
        error: "Comment not found."
      });
    }

    if (String(comment.commentedBy) === String(req.currentUser._id)) {
      return res.status(400).json({
        error: "You cannot vote on your own comment."
      });
    }

    const voteResult = await runAtomic(async (session) => {
      const currentComment = await withSession(Comment.findById(comment._id), session);
      if (!currentComment) return null;
      const result = await applyVote(
        Comment,
        currentComment._id,
        req.currentUser._id,
        voteType,
        { session }
      );
      if (!result) return { conflict: true };

      let commenterReputation = null;
      if (result.repDelta !== 0) {
        const updatedCommenter = await User.findByIdAndUpdate(
          currentComment.commentedBy,
          { $inc: { reputation: result.repDelta } },
          { new: true, ...sessionOptions(session) }
        );
        if (!updatedCommenter) throw new Error("Comment author no longer exists.");
        commenterReputation = updatedCommenter.reputation;
      }
      return { ...result, commenterReputation, postId: currentComment.post };
    });

    if (!voteResult || voteResult.conflict) {
      return res.status(409).json({
        error: "Vote could not be applied. Please try again."
      });
    }

    emitPostUpdated(voteResult.postId);

    return res.json({
      message:
        voteResult.action === "removed"
          ? "Vote removed."
          : voteResult.action === "switched"
            ? "Vote changed."
            : "Vote recorded successfully.",
      comment: presentVotable(voteResult.doc, req.currentUser._id),
      commenterReputation: voteResult.commenterReputation
    });
  } catch (error) {
    next(error);
  }
});

export default router;
