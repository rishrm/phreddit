export function createMemoryRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 20,
  maxEntries = 10000,
  keyPrefix = "rate-limit",
  includePath = true,
  message = "Too many requests. Please try again later.",
  now = () => Date.now()
} = {}) {
  const attempts = new Map();
  let lastSweep = 0;

  return function memoryRateLimiter(req, res, next) {
    if (process.env.DISABLE_RATE_LIMIT === "true") {
      next();
      return;
    }

    const timestamp = now();
    if (timestamp - lastSweep >= windowMs || attempts.size >= maxEntries) {
      for (const [storedKey, entry] of attempts) {
        if (entry.resetAt <= timestamp) attempts.delete(storedKey);
      }
      while (attempts.size >= maxEntries) {
        attempts.delete(attempts.keys().next().value);
      }
      lastSweep = timestamp;
    }
    const keyParts = [
      keyPrefix,
      req.ip || req.socket?.remoteAddress || "unknown"
    ];
    if (includePath) {
      const normalizedPath = String(req.path || req.originalUrl || "")
        .toLowerCase()
        .replace(/\/$/, "") || "/";
      keyParts.push(normalizedPath);
    }
    const key = keyParts.join(":");
    const current = attempts.get(key);

    if (!current || current.resetAt <= timestamp) {
      const resetAt = timestamp + windowMs;
      attempts.set(key, { count: 1, resetAt });
      res.set("RateLimit-Limit", String(max));
      res.set("RateLimit-Remaining", String(Math.max(0, max - 1)));
      res.set("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
      next();
      return;
    }

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));

    if (current.count >= max) {
      res.set("RateLimit-Remaining", "0");
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: message });
      return;
    }

    current.count += 1;
    res.set("RateLimit-Remaining", String(Math.max(0, max - current.count)));
    next();
  };
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

let authLimiterInstance = null;
export function authRateLimiter(req, res, next) {
  authLimiterInstance ??= createMemoryRateLimiter({
    windowMs: positiveNumber(
      process.env.AUTH_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000
    ),
    max: positiveNumber(process.env.AUTH_RATE_LIMIT_MAX, 20),
    keyPrefix: "auth",
    message: "Too many authentication attempts. Please wait and try again."
  });
  authLimiterInstance(req, res, next);
}

let apiLimiterInstance = null;
export function apiRateLimiter(req, res, next) {
  apiLimiterInstance ??= createMemoryRateLimiter({
    windowMs: positiveNumber(
      process.env.API_RATE_LIMIT_WINDOW_MS,
      5 * 60 * 1000
    ),
    max: positiveNumber(process.env.API_RATE_LIMIT_MAX, 300),
    keyPrefix: "api",
    includePath: false,
    message: "Too many API requests. Please wait and try again."
  });
  apiLimiterInstance(req, res, next);
}
