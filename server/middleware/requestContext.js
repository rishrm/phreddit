import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

function requestIdFrom(req) {
  const supplied = req.get("x-request-id");
  return REQUEST_ID_PATTERN.test(supplied || "") ? supplied : randomUUID();
}

// API responses depend on session state (joined communities, saved posts, and
// the caller's own vote), so shared caches must never retain them. A bounded
// request id gives clients and production logs one safe correlation key.
export function requestContext(req, res, next) {
  req.requestId = requestIdFrom(req);
  res.set("X-Request-ID", req.requestId);
  res.set("Cache-Control", "private, no-store");
  next();
}

