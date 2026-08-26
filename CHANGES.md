# Changelog — Portfolio Release

## Security
- **Fixed a critical auth bypass:** the `x-test-user-id` header is now honored only when `NODE_ENV=test` (previously it worked unconditionally, allowing anyone to act as any user in production).
- Session ID regeneration on login (prevents session fixation); registration returns to Welcome before authentication.
- Password length of 8-128 characters (server-validated, enforced in the UI).
- `helmet` security headers; CORS allowlist unchanged; `trust proxy` configurable for hosted deployments.
- `votedBy` lists are not exposed by any API surface, including profile content; responses include only the caller's own `userVote`.
- Password hashes are excluded by default by the Mongoose schema and selected explicitly only during login.
- Production administrator promotion moved to a guarded explicit script; startup only verifies the configured administrator.

## Backend
- **Voting overhaul:** vote / unvote (toggle) / switch with atomic conditional updates; self-voting blocked; reputation deltas apply and reverse correctly (+5/-10 and ±15 on switch).
- **Pagination + server-side sorting** on `GET /api/posts` (`page`, `limit`, `sort=newest|oldest|active`); Active uses the latest comment across multiple threads and joined-community priority is applied before pagination.
- **Full-text search** now uses the existing MongoDB text indexes on posts and comments (previously unindexed regex scans).
- **Flat comment fetching:** `GET /api/posts/:id` loads up to 5,000 comments in one indexed query and builds the tree iteratively — nesting depth is no longer silently truncated at depth 4.
- **View counting** moved to `POST /api/posts/:id/view`; `GET` is idempotent.
- **Realtime:** Socket.IO server with `post:<id>` rooms; comment/vote/edit/delete/moderation actions emit `post:updated`.
- **Public profiles:** `GET /api/users/:id/public` (display name, reputation, recent activity; no email).
- Community detail endpoint slimmed (posts now come from the paginated listing); removed duplicate `GET /users/me`; Mongoose `ValidationError` → 400; new compound indexes on posts and comments.
- Cascade user deletion reverses the deleted voter's reputation impact before removing vote records.
- Community/comment/flair length limits, Markdown link rules, and link-flair existence are enforced by the API.
- Replica-set deployments use MongoDB transactions for multi-document writes; CI forces this path while local standalone MongoDB retains an idempotent fallback.
- Benchmark tooling: guarded `bench/seed.js` plus a dependency-free concurrent HTTP runner with req/s and percentile output.

## Frontend
- **react-router-dom migration:** real URLs and deep links for home, search (`?q=`), communities, posts, public users, and profile; 404 page; redirect-aware auth pages.
- **Vote UI:** toggleable buttons with pressed state, per-user vote highlighting, disabled state + hint below 50 reputation and on own content.
- **Live post pages** via socket.io-client (auto refetch on remote changes).
- **Markdown rendering** (marked + DOMPurify) for posts, comments, and community descriptions.
- **Comment sorting** (Newest / Top) applied recursively.
- Pagination UI (Load More) on Home, Search, and Community; explicit loading, error, retry, and return states.
- Toast notifications with success/error tones and proper ARIA live regions.
- Focus-trapped ConfirmDialog replaces `window.confirm`; moderation resolutions accept an optional note; profile tabs implement keyboard navigation.
- Public user profile page; usernames link throughout the app.
- Assignment-aligned registration/login, post excerpts, post timestamps, dedicated comment/reply pages, and admin profile defaults.

## Testing & CI
- Integration regression coverage includes registration/login, authorization negatives, vote math, multi-thread Active sorting, cross-page membership ordering, profile privacy, and cascade reputation repair.
- Client unit tests (Vitest + React Testing Library) cover utilities, sorting semantics, listing excerpts, and dialog keyboard behavior.
- Playwright covers the assignment register/login flow, dedicated New Comment page, two-user vote lifecycle, two-browser realtime invalidation, and mobile keyboard/overflow behavior.
- GitHub Actions CI: dependency audits, lint + unit + build, and integration/e2e jobs against a MongoDB replica set with diagnostics uploaded on browser failures.
- GitHub's repository-level CodeQL default setup scans JavaScript and workflow data flows without duplicating configuration in this repository.
- Production API and authentication budgets use `express-rate-limit`, allowing CodeQL to verify the app-level denial-of-service guard across every route.

## Deployment & Docs
- `render.yaml` blueprint for the API; `vercel.json` handles SPA deep links and a same-origin REST proxy while `VITE_SOCKET_URL` keeps realtime connected directly to Render.
- README, API contract, security policy, MIT license, Dependabot configuration, and agent invariants are aligned with the release.

## Intentionally deferred (documented as future work)
TypeScript migration, cursor-based pagination, distributed rate limiting, and managed image uploads.
