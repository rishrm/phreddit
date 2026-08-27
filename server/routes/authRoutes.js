import bcrypt from "bcrypt";
import express from "express";
import User from "../models/User.js";
import { SESSION_USER_FIELDS } from "../middleware/auth.js";
import { authRateLimiter } from "../middleware/rateLimit.js";
import { ensureCsrfToken } from "../middleware/requestSecurity.js";
import { validateRegistrationInput } from "../utils/validation.js";

const router = express.Router();
const DUMMY_PASSWORD_HASH = "$2b$12$ogtnBzbWXBMMmZuwLMOjvehPf40NS7j1ymbwxCwhZOuHsw248.5oW";

// Regenerating the session id on privilege change prevents session fixation.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

router.post("/register", authRateLimiter, async (req, res, next) => {
  try {
    const validation = validateRegistrationInput(req.body);
    if (!validation.ok) {
      return res.status(400).json({ errors: validation.errors });
    }

    const email = req.body.email.trim().toLowerCase();
    const displayName = req.body.displayName.trim();

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({
        error: "An account with that email already exists."
      });
    }

    const existingDisplayName = await User.findOne({ displayName });
    if (existingDisplayName) {
      return res.status(409).json({
        error: "That display name is already taken."
      });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);

    const user = await User.create({
      firstName: req.body.firstName.trim(),
      lastName: req.body.lastName.trim(),
      email,
      displayName,
      passwordHash,
      reputation: 100,
      isAdmin: false
    });

    return res.status(201).json({
      message: "Account created successfully. You can now log in.",
      csrfToken: ensureCsrfToken(req),
      user: {
        _id: user._id,
        displayName: user.displayName
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", authRateLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await User.findOne({ email })
      .select(SESSION_USER_FIELDS)
      .select("+passwordHash");
    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash || DUMMY_PASSWORD_HASH
    );
    if (!user || !passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    await regenerateSession(req);
    req.session.userId = String(user._id);
    const csrfToken = ensureCsrfToken(req);

    return res.json({
      message: "Logged in successfully.",
      csrfToken,
      user
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie("connect.sid");
    return res.json({
      message: "Logged out successfully."
    });
  });
});

router.get("/me", async (req, res) => {
  if (!req.currentUser) {
    // Guest browsing is read-only, so do not allocate a persisted session
    // until the client actually performs an unsafe request.
    return res.json({ user: null });
  }
  return res.json({ user: req.currentUser, csrfToken: ensureCsrfToken(req) });
});

router.get("/csrf", (req, res) => {
  res.json({ csrfToken: ensureCsrfToken(req) });
});

export default router;
