import express from "express";
import mongoose from "mongoose";
import Community from "../models/Community.js";
import User from "../models/User.js";
import { requireLogin } from "../middleware/auth.js";
import { deleteCommunityCascade } from "../utils/cascadeDelete.js";
import { requireLength, requireValidUserContent } from "../utils/validation.js";
import { runAtomic, sessionOptions, withSession } from "../utils/transactions.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const currentUserId = req.currentUser?._id || null;
    const communities = await Community.aggregate([
      {
        $project: {
          name: 1,
          description: 1,
          creator: 1,
          createdAt: 1,
          memberCount: { $size: { $ifNull: ["$members", []] } },
          isJoined: currentUserId
            ? { $in: [currentUserId, { $ifNull: ["$members", []] }] }
            : { $literal: false }
        }
      },
      {
        $lookup: {
          from: User.collection.name,
          localField: "creator",
          foreignField: "_id",
          pipeline: [{ $project: { displayName: 1 } }],
          as: "creator"
        }
      },
      { $set: { creator: { $arrayElemAt: ["$creator", 0] } } },
      { $sort: { isJoined: -1, name: 1 } }
    ]);

    return res.json({ communities });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid community id." });
    }
    const currentUserId = req.currentUser?._id || null;
    const [community] = await Community.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $project: {
          name: 1,
          description: 1,
          creator: 1,
          createdAt: 1,
          memberCount: { $size: { $ifNull: ["$members", []] } },
          isJoined: currentUserId
            ? { $in: [currentUserId, { $ifNull: ["$members", []] }] }
            : { $literal: false }
        }
      },
      {
        $lookup: {
          from: User.collection.name,
          localField: "creator",
          foreignField: "_id",
          pipeline: [{ $project: { displayName: 1 } }],
          as: "creator"
        }
      },
      { $set: { creator: { $arrayElemAt: ["$creator", 0] } } }
    ]);

    if (!community) {
      return res.status(404).json({
        error: "Community not found."
      });
    }

    return res.json({ community });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireLogin, async (req, res, next) => {
  try {
    const name = requireLength(req.body.name, "Community name", 100);
    const description = requireValidUserContent(
      req.body.description,
      "Community description",
      500
    );

    const community = await runAtomic(async (session) => {
      const existing = await withSession(Community.exists({ name }), session);
      if (existing) return null;

      const [created] = await Community.create(
        [{
          name,
          description,
          creator: req.currentUser._id,
          members: [req.currentUser._id],
          posts: []
        }],
        sessionOptions(session)
      );
      const userUpdate = await User.updateOne(
        { _id: req.currentUser._id },
        {
          $addToSet: {
            createdCommunities: created._id,
            joinedCommunities: created._id
          }
        },
        sessionOptions(session)
      );
      if (userUpdate.matchedCount !== 1) {
        throw new Error("Community owner no longer exists.");
      }
      return created;
    });

    if (!community) {
      return res.status(409).json({ error: "Community names must be unique." });
    }

    return res.status(201).json({
      message: "Community created successfully.",
      community
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireLogin, async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({
        error: "Community not found."
      });
    }

    if (!req.currentUser.isAdmin && String(community.creator) !== String(req.currentUser._id)) {
      return res.status(403).json({
        error: "You can only edit communities you created."
      });
    }

    if (Object.hasOwn(req.body, "name")) {
      const name = requireLength(req.body.name, "Community name", 100);
      if (name !== community.name) {
        const existing = await Community.findOne({ name });
        if (existing) {
          return res.status(409).json({
            error: "Community names must be unique."
          });
        }
        community.name = name;
      }
    }

    if (Object.hasOwn(req.body, "description")) {
      community.description = requireValidUserContent(
        req.body.description,
        "Community description",
        500
      );
    }

    await community.save();

    return res.json({
      message: "Community updated successfully.",
      community
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireLogin, async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) {
      return res.status(404).json({
        error: "Community not found."
      });
    }

    if (!req.currentUser.isAdmin && String(community.creator) !== String(req.currentUser._id)) {
      return res.status(403).json({
        error: "You can only delete communities you created."
      });
    }

    await deleteCommunityCascade(community._id);

    return res.json({
      message: "Community deleted successfully."
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/join", requireLogin, async (req, res, next) => {
  try {
    const joined = await runAtomic(async (session) => {
      const communityUpdate = await Community.updateOne(
        { _id: req.params.id },
        { $addToSet: { members: req.currentUser._id } },
        sessionOptions(session)
      );
      if (communityUpdate.matchedCount !== 1) return false;
      const userUpdate = await User.updateOne(
        { _id: req.currentUser._id },
        { $addToSet: { joinedCommunities: req.params.id } },
        sessionOptions(session)
      );
      if (userUpdate.matchedCount !== 1) {
        throw new Error("Community member no longer exists.");
      }
      return true;
    });

    if (!joined) {
      return res.status(404).json({ error: "Community not found." });
    }

    return res.json({
      message: "Joined community successfully."
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/leave", requireLogin, async (req, res, next) => {
  try {
    const left = await runAtomic(async (session) => {
      const communityUpdate = await Community.updateOne(
        { _id: req.params.id },
        { $pull: { members: req.currentUser._id } },
        sessionOptions(session)
      );
      if (communityUpdate.matchedCount !== 1) return false;
      const userUpdate = await User.updateOne(
        { _id: req.currentUser._id },
        { $pull: { joinedCommunities: req.params.id } },
        sessionOptions(session)
      );
      if (userUpdate.matchedCount !== 1) {
        throw new Error("Community member no longer exists.");
      }
      return true;
    });

    if (!left) {
      return res.status(404).json({ error: "Community not found." });
    }

    return res.json({
      message: "Left community successfully."
    });
  } catch (error) {
    next(error);
  }
});

export default router;
