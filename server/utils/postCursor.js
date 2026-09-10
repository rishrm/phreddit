import { createHash } from "node:crypto";

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 1024;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const CONTEXT_PATTERN = /^[a-f\d]{64}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const SORTS = new Set(["newest", "oldest", "active"]);

function invalidCursor() {
  const error = new Error("The post cursor is invalid for this listing.");
  error.status = 400;
  error.code = "INVALID_POST_CURSOR";
  error.exposeCode = true;
  return error;
}

function normalizeOptionalId(value) {
  return value ? String(value) : null;
}

function normalizeDate(value) {
  if (!(value instanceof Date) && typeof value !== "string") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export function createPostCursorContext({
  sort,
  community = null,
  linkFlair = null,
  search = "",
  viewerId = null,
  joinedCommunityIds = []
}) {
  const normalized = {
    sort,
    community: normalizeOptionalId(community),
    linkFlair: normalizeOptionalId(linkFlair),
    search: String(search).trim(),
    viewerId: normalizeOptionalId(viewerId),
    joinedCommunityIds: joinedCommunityIds.map(String).sort()
  };

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export function encodePostCursor({
  context,
  sort,
  joinedRank = 0,
  createdAt,
  latestCommentAt = null,
  id
}) {
  const normalizedCreatedAt = normalizeDate(createdAt);
  const normalizedLatestCommentAt = latestCommentAt === null
    ? null
    : normalizeDate(latestCommentAt);

  if (
    !CONTEXT_PATTERN.test(context) ||
    !SORTS.has(sort) ||
    ![0, 1].includes(joinedRank) ||
    !normalizedCreatedAt ||
    (latestCommentAt !== null && !normalizedLatestCommentAt) ||
    !OBJECT_ID_PATTERN.test(String(id))
  ) {
    throw new TypeError("Cannot encode an invalid post cursor.");
  }

  return Buffer.from(JSON.stringify({
    v: CURSOR_VERSION,
    c: context,
    s: sort,
    r: joinedRank,
    t: normalizedCreatedAt,
    a: normalizedLatestCommentAt,
    i: String(id).toLowerCase()
  })).toString("base64url");
}

export function decodePostCursor(value, { context, sort }) {
  const cursor = value;
  if (
    typeof cursor !== "string" ||
    !cursor ||
    cursor.length > MAX_CURSOR_LENGTH ||
    !CURSOR_PATTERN.test(cursor) ||
    !CONTEXT_PATTERN.test(context) ||
    !SORTS.has(sort)
  ) {
    throw invalidCursor();
  }

  try {
    const decoded = Buffer.from(cursor, "base64url");
    if (decoded.toString("base64url") !== cursor) throw invalidCursor();

    const parsed = JSON.parse(decoded.toString("utf8"));
    const keys = Object.keys(parsed).sort().join(",");
    const createdAt = normalizeDate(parsed.t);
    const latestCommentAt = parsed.a === null ? null : normalizeDate(parsed.a);

    if (
      keys !== "a,c,i,r,s,t,v" ||
      parsed.v !== CURSOR_VERSION ||
      parsed.c !== context ||
      parsed.s !== sort ||
      ![0, 1].includes(parsed.r) ||
      !createdAt ||
      parsed.t !== createdAt ||
      (parsed.a !== null && !latestCommentAt) ||
      (parsed.a !== null && parsed.a !== latestCommentAt) ||
      !OBJECT_ID_PATTERN.test(String(parsed.i)) ||
      parsed.i !== String(parsed.i).toLowerCase()
    ) {
      throw invalidCursor();
    }

    return {
      joinedRank: parsed.r,
      createdAt: new Date(createdAt),
      latestCommentAt: latestCommentAt ? new Date(latestCommentAt) : null,
      id: String(parsed.i)
    };
  } catch (error) {
    if (error?.code === "INVALID_POST_CURSOR") throw error;
    throw invalidCursor();
  }
}
