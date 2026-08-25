import express from "express";
import Post from "../models/Post.js";
import Report from "../models/Report.js";
import { requireAdmin, requireLogin } from "../middleware/auth.js";
import { deletePostsInSession } from "../utils/cascadeDelete.js";
import { requireNonEmptyString } from "../utils/validation.js";
import { emitPostUpdated } from "../realtime.js";
import { runAtomic, sessionOptions, withSession } from "../utils/transactions.js";

const router = express.Router();
const VALID_REASONS = new Set(["spam", "harassment", "off-topic", "other"]);

function normalizeReason(value) {
  const reason = requireNonEmptyString(value, "Report reason");
  if (!VALID_REASONS.has(reason)) {
    const error = new Error("Report reason must be spam, harassment, off-topic, or other.");
    error.status = 400;
    throw error;
  }
  return reason;
}

function normalizeOptionalNote(value, fieldName) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    const error = new Error(`${fieldName} must be text.`);
    error.status = 400;
    throw error;
  }
  const trimmed = value.trim();
  if (trimmed.length > 400) {
    const error = new Error(`${fieldName} must be 400 characters or less.`);
    error.status = 400;
    throw error;
  }
  return trimmed;
}

function normalizeReportStatus(value) {
  switch (value ?? "pending") {
    case "pending":
      return "pending";
    case "dismissed":
      return "dismissed";
    case "content_removed":
      return "content_removed";
    case "all":
      return null;
    default: {
      const error = new Error("Invalid report status.");
      error.status = 400;
      throw error;
    }
  }
}

function populateReport(query) {
  return query
    .populate("reportedBy", "displayName reputation")
    .populate("resolvedBy", "displayName")
    .populate({
      path: "targetPost",
      select: "title content community postedBy createdAt",
      populate: [
        { path: "community", select: "name" },
        { path: "postedBy", select: "displayName reputation" }
      ]
    });
}

router.post("/posts/:postId", requireLogin, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.postId)
      .populate("postedBy", "displayName")
      .populate("community", "name");
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    if (String(post.postedBy?._id || post.postedBy) === String(req.currentUser._id)) {
      return res.status(400).json({ error: "You cannot report your own post." });
    }

    const reason = normalizeReason(req.body.reason);
    const details = normalizeOptionalNote(req.body.details, "Report details");
    const existingReport = await Report.findOne({
      targetPost: post._id,
      reportedBy: req.currentUser._id,
      status: "pending"
    });

    if (existingReport) {
      return res.status(409).json({ error: "You already have a pending report for this post." });
    }

    const report = await Report.create({
      targetPost: post._id,
      reportedBy: req.currentUser._id,
      reason,
      details,
      contentSnapshot: {
        title: post.title,
        content: post.content,
        communityName: post.community?.name || "",
        authorDisplayName: post.postedBy?.displayName || "",
        postedAt: post.createdAt
      }
    });

    return res.status(201).json({
      message: "Report submitted for administrator review.",
      report
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireLogin, requireAdmin, async (req, res, next) => {
  try {
    const status = normalizeReportStatus(req.query.status);
    const filter = status === "pending"
      ? { status: { $in: ["pending", "processing"] } }
      : status
        ? { status }
        : {};
    const query = Report.find(filter);

    const reports = await populateReport(
      query.sort({ createdAt: -1 }).limit(50)
    );

    return res.json({ reports });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/resolve", requireLogin, requireAdmin, async (req, res, next) => {
  try {
    const action = req.body.action;
    if (!["dismiss", "delete_post"].includes(action)) {
      return res.status(400).json({ error: "Resolution action must be dismiss or delete_post." });
    }

    const resolutionNote = normalizeOptionalNote(req.body.note, "Resolution note");
    const resolvedAt = new Date();
    let result;
    try {
      result = await runAtomic(async (session) => {
        const report = await Report.findOneAndUpdate(
          { _id: req.params.id, status: "pending" },
          {
            $set: {
              status: "processing",
              resolvedBy: req.currentUser._id,
              resolvedAt,
              resolutionNote
            }
          },
          { new: true, ...sessionOptions(session) }
        );
        if (!report) return null;

        let touchedPostIds = [];
        if (action === "delete_post") {
          const deletion = await deletePostsInSession(
            [report.targetPost],
            { deleteReports: false, session }
          );
          touchedPostIds = deletion.touchedPostIds;
          await Report.updateMany(
            {
              targetPost: report.targetPost,
              status: { $in: ["pending", "processing"] }
            },
            {
              $set: {
                status: "content_removed",
                resolvedBy: req.currentUser._id,
                resolvedAt,
                resolutionNote
              }
            },
            sessionOptions(session)
          );
        } else {
          const update = await Report.updateOne(
            { _id: report._id, status: "processing" },
            { $set: { status: "dismissed" } },
            sessionOptions(session)
          );
          if (update.matchedCount !== 1) {
            throw new Error("Report resolution claim was lost.");
          }
        }

        return { touchedPostIds };
      });
    } catch (error) {
      await Report.updateOne(
        {
          _id: req.params.id,
          status: "processing",
          resolvedBy: req.currentUser._id
        },
        {
          $set: { status: "pending" },
          $unset: {
            resolvedBy: "",
            resolvedAt: "",
            resolutionNote: ""
          }
        }
      ).catch(() => {});
      throw error;
    }

    if (!result) {
      const exists = await withSession(Report.exists({ _id: req.params.id }), null);
      return res.status(exists ? 409 : 404).json({
        error: exists
          ? "This report has already been resolved or is being processed."
          : "Report not found."
      });
    }

    for (const postId of result.touchedPostIds) {
      emitPostUpdated(postId);
    }

    const reports = await populateReport(
      Report.find({ status: "pending" }).sort({ createdAt: -1 }).limit(50)
    );

    return res.json({
      message: action === "delete_post" ? "Reported post deleted." : "Report dismissed.",
      reports
    });
  } catch (error) {
    next(error);
  }
});

export default router;
