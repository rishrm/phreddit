import "dotenv/config";
import { rateLimit } from "express-rate-limit";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 20,
  message = "Too many requests. Please try again later."
} = {}) {
  return rateLimit({
    windowMs: positiveInteger(windowMs, 15 * 60 * 1000),
    limit: positiveInteger(max, 20),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.DISABLE_RATE_LIMIT === "true",
    message: { error: message }
  });
}

export const authRateLimiter = createRateLimiter({
  windowMs: positiveInteger(
    process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000
  ),
  max: positiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 20),
  message: "Too many authentication attempts. Please wait and try again."
});

export const apiRateLimiter = createRateLimiter({
  windowMs: positiveInteger(
    process.env.API_RATE_LIMIT_WINDOW_MS,
    5 * 60 * 1000
  ),
  max: positiveInteger(process.env.API_RATE_LIMIT_MAX, 300),
  message: "Too many API requests. Please wait and try again."
});
