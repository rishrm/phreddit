import express from "express";
import LinkFlair from "../models/LinkFlair.js";
import { requireLogin } from "../middleware/auth.js";
import { requireLength } from "../utils/validation.js";

const router = express.Router();

router.get("/", async (_req, res, next) => {
  try {
    const linkFlairs = await LinkFlair.find({}).sort({ content: 1 });
    res.json({ linkFlairs });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireLogin, async (req, res, next) => {
  try {
    const content = requireLength(req.body.content, "Link flair", 30);
    const linkFlair = await LinkFlair.findOneAndUpdate(
      { content },
      { $setOnInsert: { content } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ linkFlair });
  } catch (error) {
    next(error);
  }
});

export default router;
