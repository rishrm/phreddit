import { randomBytes, timingSafeEqual } from "node:crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function sameOriginAsRequest(origin, req) {
  const host = req.get("host");
  if (!host) return false;
  return origin === `${req.protocol}://${host}`;
}

export function createTrustedOriginGuard({
  allowedOrigins = new Set(),
  enforce = process.env.NODE_ENV === "production"
} = {}) {
  return function trustedOriginGuard(req, res, next) {
    if (!enforce || SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get("origin");
    if (
      origin &&
      (allowedOrigins.has(origin) || sameOriginAsRequest(origin, req))
    ) {
      next();
      return;
    }

    res.status(403).json({
      error: "Request origin is not allowed."
    });
  };
}

export function ensureCsrfToken(req) {
  if (!req.session) {
    const error = new Error("Session middleware is required for CSRF protection.");
    error.status = 500;
    throw error;
  }

  if (!CSRF_TOKEN_PATTERN.test(req.session.csrfToken || "")) {
    req.session.csrfToken = randomBytes(32).toString("base64url");
  }

  return req.session.csrfToken;
}

function csrfTokensMatch(expectedToken, suppliedToken) {
  if (
    !CSRF_TOKEN_PATTERN.test(expectedToken || "") ||
    !CSRF_TOKEN_PATTERN.test(suppliedToken || "")
  ) {
    return false;
  }

  const expected = Buffer.from(expectedToken, "utf8");
  const supplied = Buffer.from(suppliedToken, "utf8");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function csrfProtection(req, res, next) {
  const enforce =
    process.env.NODE_ENV === "production" || process.env.ENABLE_CSRF === "true";

  if (!enforce || SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const storedCsrfToken = req.session?.csrfToken;
  const suppliedCsrfToken = req.get("x-csrf-token");

  if (csrfTokensMatch(storedCsrfToken, suppliedCsrfToken)) {
    next();
    return;
  }

  res.status(403).json({
    error: "CSRF token is invalid or missing.",
    code: "CSRF_TOKEN_INVALID"
  });
}
