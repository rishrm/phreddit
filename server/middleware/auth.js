import User from "../models/User.js";

export const SESSION_USER_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "displayName",
  "reputation",
  "isAdmin",
  "joinedCommunities",
  "savedPosts",
  "createdAt",
  "updatedAt"
].join(" ");

export async function attachCurrentUser(req, _res, next) {
  try {
    // The x-test-user-id header is a test-only convenience. It is disabled
    // unless the process is explicitly running in test mode, so it can never
    // act as an auth bypass in a deployed environment.
    const testUserId =
      process.env.NODE_ENV === "test" ? req.header("x-test-user-id") : null;
    const userId = req.session?.userId || testUserId;
    req.currentUser = userId
      ? await User.findById(userId).select(SESSION_USER_FIELDS)
      : null;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireLogin(req, res, next) {
  if (!req.currentUser) {
    return res.status(401).json({
      error: "You must be logged in to perform this action."
    });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.currentUser?.isAdmin) {
    return res.status(403).json({
      error: "Admin access is required."
    });
  }
  next();
}
