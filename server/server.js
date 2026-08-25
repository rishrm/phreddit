import http from "node:http";
import MongoStore from "connect-mongo";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import mongoose from "mongoose";
import { Server as SocketIOServer } from "socket.io";
import authRoutes from "./routes/authRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import communityRoutes from "./routes/communityRoutes.js";
import linkFlairRoutes from "./routes/linkflairRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { attachCurrentUser } from "./middleware/auth.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";
import { createTrustedOriginGuard } from "./middleware/requestSecurity.js";
import { setIo } from "./realtime.js";
import { ensureConfiguredAdmin } from "./utils/adminBootstrap.js";
import Comment from "./models/Comment.js";
import Community from "./models/Community.js";
import LinkFlair from "./models/LinkFlair.js";
import Post from "./models/Post.js";
import Report from "./models/Report.js";
import User from "./models/User.js";

dotenv.config();

export const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/phreddit";
export const PORT = Number(process.env.PORT || 8000);
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_POST_ROOMS_PER_SOCKET = 20;
const SOCKET_JOIN_LIMIT_PER_MINUTE = 120;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAllowedOrigins() {
  const configuredOrigins = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localOrigins = process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:5173", "http://127.0.0.1:5173"];
  return new Set([...localOrigins, ...configuredOrigins]);
}

export function createApp({ useSessionStore = true } = {}) {
  const app = express();
  const allowedOrigins = getAllowedOrigins();
  const cookieSameSite = process.env.SESSION_COOKIE_SAMESITE || "lax";
  const cookieSecure =
    process.env.SESSION_COOKIE_SECURE === "true" || cookieSameSite === "none";
  const sessionTtlMs = positiveNumber(
    process.env.SESSION_TTL_MS,
    DEFAULT_SESSION_TTL_MS
  );

  if (cookieSecure || process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", 1);
  }

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // Allow server-to-server requests (no browser Origin header).
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        const error = new Error("CORS origin is not allowed.");
        error.status = 403;
        callback(error);
      },
      credentials: true
    })
  );

  app.use("/api", apiRateLimiter);
  app.use("/api", createTrustedOriginGuard({ allowedOrigins }));
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));

  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in production.");
  }

  const sessionConfig = {
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: cookieSecure,
      maxAge: sessionTtlMs
    }
  };

  if (useSessionStore) {
    sessionConfig.store = MongoStore.create({
      mongoUrl: MONGO_URI,
      ttl: Math.ceil(sessionTtlMs / 1000)
    });
  }

  app.use(session(sessionConfig));
  app.use(attachCurrentUser);

  app.get("/api/health", (_req, res) => {
    const payload = { ok: true };
    if (process.env.NODE_ENV === "test" && process.env.ENABLE_E2E_RESET === "true") {
      payload.database = mongoose.connection.name;
    }
    res.json(payload);
  });

  if (process.env.NODE_ENV === "test" && process.env.ENABLE_E2E_RESET === "true") {
    app.post("/api/test/reset", async (_req, res, next) => {
      try {
        await Promise.all([
          User.deleteMany({}),
          Community.deleteMany({}),
          Post.deleteMany({}),
          Comment.deleteMany({}),
          LinkFlair.deleteMany({}),
          Report.deleteMany({})
        ]);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    });
  }

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/communities", communityRoutes);
  app.use("/api/linkflairs", linkFlairRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/comments", commentRoutes);
  app.use("/api/reports", reportRoutes);

  app.use((req, res) => {
    res.status(404).json({
      error: `Route not found: ${req.method} ${req.originalUrl}`
    });
  });

  app.use((error, _req, res, _next) => {
    let status = error.status || 500;
    let message = error.message || "Internal server error.";

    if (error.name === "CastError") {
      status = 400;
      message = "Invalid resource id.";
    } else if (error.name === "ValidationError") {
      status = 400;
      message = Object.values(error.errors || {})
        .map((detail) => detail.message)
        .join(" ") || "Invalid input.";
    } else if (error.code === 11000) {
      status = 409;
      message = "That value is already in use.";
    } else if (error.type === "entity.parse.failed") {
      status = 400;
      message = "Request body must contain valid JSON.";
    }

    if (status >= 500) {
      console.error(error);
      message = "Internal server error.";
    }

    res.status(status).json({
      error: message
    });
  });

  return app;
}

export async function startServer() {
  await mongoose.connect(MONGO_URI);
  const adminBootstrap = await ensureConfiguredAdmin();
  if (adminBootstrap.configured) {
    console.log("Verified the configured administrator account.");
  } else if (adminBootstrap.reason !== "not-configured") {
    throw new Error(
      adminBootstrap.reason === "not-found"
        ? "ADMIN_EMAIL does not match an existing account."
        : "ADMIN_EMAIL must already belong to an administrator. Run npm run admin:promote explicitly."
    );
  }

  const app = createApp();
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: [...getAllowedOrigins()],
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    let joinWindowStartedAt = Date.now();
    let joinsInWindow = 0;

    socket.on("post:join", async (postId) => {
      const now = Date.now();
      if (now - joinWindowStartedAt >= 60_000) {
        joinWindowStartedAt = now;
        joinsInWindow = 0;
      }
      joinsInWindow += 1;
      if (joinsInWindow > SOCKET_JOIN_LIMIT_PER_MINUTE) return;

      if (typeof postId !== "string" || !mongoose.isValidObjectId(postId)) return;
      const postRooms = [...socket.rooms].filter((room) => room.startsWith("post:"));
      if (postRooms.length >= MAX_POST_ROOMS_PER_SOCKET) return;
      try {
        if (!(await Post.exists({ _id: postId }))) return;
        await socket.join(`post:${postId}`);
      } catch {
        // A failed room lookup should not terminate the socket process.
      }
    });
    socket.on("post:leave", (postId) => {
      if (typeof postId === "string" && mongoose.isValidObjectId(postId)) {
        socket.leave(`post:${postId}`);
      }
    });
  });

  setIo(io);

  return server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startServer().catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
}
