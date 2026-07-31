# Phreddit

[![CI](https://github.com/rishrm/phreddit/actions/workflows/ci.yml/badge.svg)](https://github.com/rishrm/phreddit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Phreddit is a full-stack Reddit-inspired community forum built with React, Express, MongoDB, and Mongoose. It supports guest browsing, session-based accounts, communities, posts, link flair, unbounded-depth threaded comments, saved posts, toggleable reputation-aware voting, live post updates over WebSockets, Markdown rendering, public user profiles, reporting, and admin moderation flows.

The project is structured as a portfolio-ready MERN application with client-side routing, server-side pagination and sorting, isolated backend integration tests, client unit tests, Playwright e2e coverage, and a CI pipeline.

**Live demo:** [phreddit.vercel.app](https://phreddit.vercel.app)
Visitors can browse as a guest or register a new account.

## Screenshots

![Home feed with persistent navigation and flair filtering](images/screenshots/home.png)

![Admin profile user management](images/screenshots/admin-profile.png)

## Features

- Guest browsing plus registration, login, logout, and persisted sessions
- Client-side routing with real URLs and deep links (`/posts/:id`, `/communities/:id`, `/users/:id`, `/search?q=...`)
- Live post pages: comments, votes, and edits from other users appear in real time over Socket.IO
- Server-side pagination and sorting (Newest, Oldest, Active) with a Load More UI
- Full-text search across post titles, content, and comments using MongoDB text indexes
- Toggleable voting: vote, unvote, or switch votes with atomic database updates; no self-voting; reputation deltas reverse correctly
- Unbounded-depth threaded comments assembled from a single indexed query, with Newest/Top comment sorting
- Markdown post and comment bodies, sanitized with DOMPurify before rendering
- Public user profiles showing display name, reputation, and recent activity (no private data)
- Saved posts/bookmarks with a dedicated profile tab
- Post reporting with duplicate-report protection, an admin moderation queue, and optional resolution notes
- Admin user list, viewing another user's profile, and cascade user deletion behind an accessible confirm dialog
- Cascade deletion for communities, posts, comments, replies, and user-owned content
- Session hardening: session ID regeneration on login, trusted-origin CSRF defense, helmet headers, CORS allowlist, and bounded global/auth rate limiting
- Responsive layout, keyboard-visible focus states, loading/empty/error states, and toast notifications with distinct success/error styling
- Unit (server + client), integration, and Playwright e2e tests, run in GitHub Actions CI

## Tech Stack

- **Client:** React 18, Vite, react-router-dom, socket.io-client, marked + DOMPurify, Vitest + React Testing Library, Playwright
- **Server:** Node.js, Express 4, Socket.IO, Mongoose 8, express-session + connect-mongo, bcrypt, helmet
- **Database:** MongoDB (text indexes for search, compound indexes for listings)

## Project Structure

```
phreddit/
├── client/               # React app (Vite)
│   ├── src/
│   │   ├── api/          # fetch wrapper for the REST API
│   │   ├── components/   # Banner, PostCard, CommentItem, ConfirmDialog, RichText, ...
│   │   ├── pages/        # routed pages (Home, Post, Community, Profile, UserProfile, ...)
│   │   ├── realtime.js   # Socket.IO subscription helper
│   │   └── utils/        # formatting + post/comment helpers (unit tested)
│   └── e2e/              # Playwright specs
├── server/
│   ├── bench/            # autocannon benchmark + volume seeder
│   ├── middleware/        # auth, rate limiting
│   ├── models/           # Mongoose schemas + indexes
│   ├── routes/           # REST endpoints
│   ├── tests/            # node:test unit + integration suites
│   ├── utils/            # voting, serialization, validation, cascade deletes
│   ├── realtime.js       # Socket.IO emit wrapper
│   └── server.js         # app factory + HTTP/Socket.IO bootstrap
├── .github/workflows/ci.yml
├── AGENTS.md             # commands + invariants for AI coding agents
├── render.yaml           # Render blueprint for the API
└── vercel.json           # Vercel config for the client
```

## Setup

Requirements: Node.js 20+ and a local MongoDB (or Atlas connection string).

```bash
# 1) Install dependencies
npm run install:all

# 2) Configure the server
cp server/.env.example server/.env   # edit values as needed

# 3) (Optional) seed demo data — pass your admin credentials as arguments
node server/init.js admin@example.com adminuser AdminPass123!

# 4) Run the API (http://localhost:8000)
npm --prefix server run dev

# 5) Run the client (http://localhost:5173) in another terminal
npm --prefix client run dev
```

The Vite dev server proxies both `/api` and the `/socket.io` WebSocket to the API, so no client env vars are needed locally.

## Demo Accounts

`node server/init.js <adminEmail> <adminDisplayName> <adminPassword>` seeds sample communities, posts, and comments, creates an admin with the credentials you pass, and always creates:

| Role | Email              | Password       |
|------|--------------------|----------------|
| User | `demo@example.com` | `DemoPass123!` |

## Environment Variables

Server (`server/.env`):

| Variable | Purpose | Default |
|---|---|---|
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/phreddit` |
| `PORT` | API port | `8000` |
| `SESSION_SECRET` | Session signing secret (set a long random value) | dev fallback |
| `CLIENT_ORIGIN` | Comma-separated allowed CORS origins | localhost:5173 |
| `ADMIN_EMAIL` | Existing account to promote as the production owner at startup | unset |
| `SESSION_COOKIE_SAMESITE` | `lax` locally, `none` for cross-site prod | `lax` |
| `SESSION_COOKIE_SECURE` | `true` in production (HTTPS) | `false` |
| `TRUST_PROXY` | `true` behind a reverse proxy (Render, etc.) | `false` |
| `JSON_BODY_LIMIT` | Request body size cap | `1mb` |
| `AUTH_RATE_LIMIT_*`, `API_RATE_LIMIT_*`, `DISABLE_RATE_LIMIT` | Login/register and global API rate limiting | see `.env.example` |

Client (`client/.env`):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API base URL in production (e.g. `https://phreddit-api.onrender.com/api`). Socket.IO uses the same origin. Leave unset in dev. |

`NODE_ENV=test` (set automatically by the test scripts) enables a test-only `x-test-user-id` auth header used by the integration suite. It is inert in any other environment.

## Scripts

Root convenience scripts:

| Script | What it does |
|---|---|
| `npm run install:all` | `npm ci` in both `server/` and `client/` |
| `npm run lint` | ESLint for server and client |
| `npm run test:unit` | Server unit tests (node:test) + client unit tests (Vitest) |
| `npm run test:int` | Server integration tests (needs MongoDB; uses a disposable database) |
| `npm run test:e2e` | Playwright end-to-end tests (boots API + client; needs MongoDB) |
| `npm run build` | Production client build |

Server extras: `npm --prefix server run bench:seed` (seed ~2,000 posts into a bench database) and `npm --prefix server run bench` (autocannon load test against the paginated listing endpoint).

## Testing

| Suite | Command | Needs MongoDB | CI job |
|---|---|---|---|
| Server unit (node:test) | `npm --prefix server run test:unit` | No | lint-and-unit |
| Client unit (Vitest + RTL) | `npm --prefix client run test:unit` | No | lint-and-unit |
| Server integration (supertest, disposable DB per file) | `npm run test:int` | Yes | integration |
| End-to-end (Playwright, boots API + client) | `npm run test:e2e` | Yes | e2e |

Integration tests spin up the Express app in-process against a throwaway database, so they're safe to run repeatedly. Regression coverage includes multi-thread Active sorting, membership-aware pagination, private vote serialization, cascade reputation correction, and the vote lifecycle. The e2e suite exercises registration/login, creation, dedicated comment pages, profile management, and two-user voting.

Contributing with an AI coding agent? Repo commands and invariants live in [AGENTS.md](AGENTS.md).

## Benchmarks

To produce a defensible throughput/latency number for the listing endpoint:

```bash
# Terminal 1 — seed and serve a volume dataset
MONGO_URI=mongodb://127.0.0.1:27017/phreddit_bench npm --prefix server run bench:seed
MONGO_URI=mongodb://127.0.0.1:27017/phreddit_bench npm --prefix server start

# Terminal 2 — run the load test (50 connections, 15s by default)
npm --prefix server run bench
```

Record the reported req/s and p97.5/p99 latency, and cite them with the machine/dataset used. Results depend on hardware; measure before quoting numbers.

## Deployment

The client and API deploy separately.

**Database — MongoDB Atlas (free M0):**
1. Create a cluster, a database user, and allow access from `0.0.0.0/0` (or Render's IPs).
2. Copy the connection string; this is `MONGO_URI`.

**API — Render (free):**
1. Push this repo to GitHub, then in Render choose **New → Blueprint** and select the repo (`render.yaml` configures the service).
2. Set `MONGO_URI` to the Atlas string and `CLIENT_ORIGIN` to your exact Vercel URL (e.g. `https://phreddit.vercel.app`). The blueprint already sets secure cross-site cookies, proxy trust, and the global API rate limit. Unsafe production requests require a matching `Origin`, providing CSRF protection for the cross-site session cookie.
3. Verify `https://<api>.onrender.com/api/health` returns `{ "ok": true }`. Register the production owner through the app, set `ADMIN_EMAIL` to that existing account, and redeploy once; startup promotes it without storing or resetting its password.
4. To replace an empty database with the complete local demo dataset instead, run `node server/init.js <adminEmail> <adminName> <adminPassword>` locally with `MONGO_URI` pointed at Atlas. This command intentionally clears existing Phreddit data first.

**Client — Vercel (free):**
1. Import the repo into Vercel; `vercel.json` handles the build and SPA rewrites (needed for deep links with client-side routing).
2. Add the env var `VITE_API_BASE_URL=https://<api>.onrender.com/api` and deploy.
3. Update the Live demo link at the top of this README.

## Architecture Notes

- **App factory:** `createApp()` builds the Express app without binding a port, so integration tests run against an in-process app with a disposable database per test file. `startServer()` wraps it in an HTTP server and attaches Socket.IO.
- **Realtime:** route handlers publish through a small `realtime.js` wrapper (`emitPostUpdated`). Clients on a post page join a `post:<id>` room and refetch on updates — an invalidation-style design that stays correct without duplicating server state on the client.
- **Voting:** vote add/remove/switch are single conditional `findOneAndUpdate` operations, so concurrent requests cannot double-count. `votedBy` is never sent to clients; each response carries only the caller's own `userVote`.
- **Comments:** fetched flat with one indexed query (`{ post: 1, createdAt: -1 }`) and assembled into a tree in memory — no depth limit, unlike nested populate.
- **Search:** MongoDB text indexes on posts and comments; matching ids are resolved first because `$text` cannot appear inside `$or`.
- **Listings:** pagination and all three sorts are computed database-side; "Active" uses an aggregation with a comments `$lookup`. Page-number pagination is intentional at this scale; cursor pagination is the documented next step if feeds grow unbounded.
- **Sessions:** stored in MongoDB via connect-mongo; the session ID is regenerated on login to prevent fixation. Unsafe production requests must come from `CLIENT_ORIGIN` (or the API's own origin), preventing cross-site form attacks even though deployment requires `SameSite=None`. Registration intentionally returns to Welcome before login, matching the assignment flow. The `x-test-user-id` test header is inert outside `NODE_ENV=test`.
- **Cascade deletes** run children-first and are idempotent. Multi-document transactions (Atlas replica sets) are the production path for strict atomicity and are intentionally not required for local single-node MongoDB.
- **Markdown** is rendered client-side with `marked` and sanitized with DOMPurify (scripts, event handlers, and `javascript:` URLs are stripped; links open in a new tab with `rel="noopener"`).

The REST surface and authorization rules are summarized in [docs/API.md](docs/API.md). Security reporting and supported-version information live in [SECURITY.md](SECURITY.md).

## Reliability and Security Review

The release branch includes fixes found through adversarial review rather than happy-path testing alone:

- Active sorting is tested with multiple commented posts and uses the latest comment timestamp.
- Joined-community priority is computed before pagination, so later pages cannot reorder the feed.
- `votedBy` arrays are stripped from every post/comment response, including private profile endpoints.
- Deleting a voter reverses their reputation impact before removing vote records.
- User-content limits and Markdown hyperlink rules are enforced by both forms and the API.
- Duplicate-key races return a stable `409`, production requires a session secret, and auth limiter storage is bounded.
- A global per-IP request budget protects every API route; unsafe methods also enforce a trusted browser origin before parsing request bodies.
- Destructive dialogs trap and restore focus; profile tabs support arrow, Home, and End keys.

## Portfolio Talking Points

- Migrated a state-machine UI to client-side routing with deep links, then moved sorting/pagination server-side so URLs, refreshes, and shared links all behave correctly.
- Designed race-safe vote toggling with pure conditional updates instead of read-modify-write, and verified the reputation math with integration tests.
- Replaced depth-limited nested populate with a flat fetch + in-memory tree build, turning N populate queries into one indexed query.
- Added Socket.IO live updates with a no-op-in-tests emitter so the realtime layer never leaks into the test suite.
- Closed a test-only auth header behind `NODE_ENV=test` after identifying it as a production auth bypass during a security review.
- Added layered request security after CodeQL review: global throttling, strict unsafe-request origin checks, linear-time validators, and explicit database-query normalization.

## Assignment Contribution

**Rishabh Mittal** designed and implemented the complete project: React interface and routing, Express/Mongoose API, session authentication, MongoDB models and cascade deletion, voting/reputation logic, Socket.IO updates, moderation and admin workflows, automated tests, CI, deployment configuration, documentation, and the final accessibility/security review.

## License

Released under the [MIT License](LICENSE).
