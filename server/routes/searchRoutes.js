import express from "express";
import Community from "../models/Community.js";
import LinkFlair from "../models/LinkFlair.js";
import User from "../models/User.js";
import { requireLength } from "../utils/validation.js";

const router = express.Router();
const MAX_SEARCH_LENGTH = 200;
const RESULT_LIMIT = 6;

router.get("/", async (req, res, next) => {
  try {
    const search = requireLength(
      req.query.q,
      "Search query",
      MAX_SEARCH_LENGTH
    );
    const textFilter = { $text: { $search: search } };

    const [communities, usersWithScore, flairsWithScore] = await Promise.all([
      Community.aggregate([
        { $match: textFilter },
        {
          $project: {
            name: 1,
            description: 1,
            memberCount: { $size: { $ifNull: ["$members", []] } },
            score: { $meta: "textScore" }
          }
        },
        { $sort: { score: -1, name: 1 } },
        { $limit: RESULT_LIMIT },
        { $unset: "score" }
      ]),
      User.find(
        textFilter,
        {
          displayName: 1,
          reputation: 1,
          score: { $meta: "textScore" }
        }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(RESULT_LIMIT)
        .lean(),
      LinkFlair.find(
        textFilter,
        { content: 1, score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(RESULT_LIMIT)
        .lean()
    ]);

    const withoutScore = (items) => items.map(({ score: _score, ...item }) => item);

    return res.json({
      communities,
      users: withoutScore(usersWithScore),
      linkFlairs: withoutScore(flairsWithScore)
    });
  } catch (error) {
    next(error);
  }
});

export default router;
