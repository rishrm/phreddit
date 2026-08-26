# AGENTS.md — instructions for AI coding agents

Phreddit is a MERN Reddit clone: `client/` (React 18 + Vite + react-router) and
`server/` (Express 4 + Mongoose 8 + Socket.IO), session auth via
express-session + connect-mongo. Node 20+.

## Commands

```bash
npm run install:all                 # npm ci in server/ and client/
npm run lint                        # ESLint, both packages (must pass)
npm --prefix server run test:unit   # node:test, no MongoDB needed
npm --prefix client run test:unit   # Vitest + RTL, no MongoDB needed
npm run test:int                    # server integration tests — NEEDS local MongoDB
npm run test:e2e                    # Playwright — NEEDS MongoDB; boots API + client itself
npm --prefix client run build       # production build (must pass)
npm --prefix server run dev         # API on :8000
npm --prefix client run dev         # client on :5173 (proxies /api and /socket.io)
```

Integration tests create a disposable database per test file (see
`server/tests/testHelpers.js`); they are safe to run repeatedly. Playwright
uses `E2E_MONGO_URI` (defaults to a local `phreddit_e2e` database) and starts
both servers via `client/playwright.config.js` — do not start them manually.
CI runs MongoDB as a replica set and sets `FORCE_TRANSACTIONS=true`; use the
same mode when changing multi-document behavior.

## Definition of done

Any change: `npm run lint` + both unit suites + `npm --prefix client run build`
all pass. Server behavior changes: also `npm run test:int`. UI flow changes:
also `npm run test:e2e`, and update the specs in `client/e2e/` if flows moved.

## Invariants — do not break these

**Server**
- `votedBy` must NEVER appear in an API response. Serialize posts/comments
  through `presentVotable()` (`server/utils/serialize.js`), which strips it
  and adds the caller's own `userVote`.
- All vote mutations go through `applyVote()` (`server/utils/voteService.js`):
  single conditional `findOneAndUpdate`s (remove / switch / add). Never
  read-modify-write vote counts.
- Every mutation that changes what a post page shows (comments, votes, edits,
  deletes, moderation removals) must call `emitPostUpdated(postId)` from
  `server/realtime.js`. It is a no-op in tests by design.
- `GET /api/posts/:id` fetches comments FLAT in one query and builds the tree
  iteratively in memory. Do not reintroduce nested `populate` (it
  depth-truncates). Preserve the 5,000-comment response guard and
  `commentsTruncated` signal.
- View counts increment only via `POST /api/posts/:id/view`. GETs stay
  idempotent.
- The `x-test-user-id` header is honored ONLY when `NODE_ENV === "test"`
  (`server/middleware/auth.js`). Never widen this — it was a production auth
  bypass once already.
- Regenerate the session on login. Registration intentionally returns to the
  Welcome page without creating a session, matching the assignment flow.
- `User.passwordHash` is `select: false`. Only authentication may explicitly
  request it with `.select("+passwordHash")`; never return it from an API.
- Keep the global API limiter and production trusted-origin guard mounted
  before request parsing, and `csrfProtection` mounted after session
  middleware. Unsafe production requests require both a trusted `Origin` and
  the session-bound token from `ensureCsrfToken`; never weaken either boundary.
- Mongo gotchas already handled in `server/routes/postRoutes.js` — keep them:
  `$text` cannot live inside `$or` (resolve matching ids first), and
  aggregation pipelines do NOT auto-cast string ids (use `toObjectId()`).
- Multi-document mutations use `runAtomic()`. Operations inside one MongoDB
  transaction/session must be awaited serially; do not use `Promise.all` with
  the same session.
- `server/init.js`, `bench/seed.js`, and `admin:promote` are intentionally
  guarded destructive/privilege scripts. Do not weaken their confirmation
  environment variables.

**Client**
- Navigation is react-router URLs (`/posts/:id`, `/communities/:id`,
  `/users/:id`, `/search?q=`). No view-state switching; new pages get routes
  in `src/App.jsx` and read shared state via `useOutletContext()`.
- User-authored text renders ONLY through `src/components/RichText.jsx`
  (marked + DOMPurify). Never use `dangerouslySetInnerHTML` elsewhere.
- Notifications: `showMessage(text, tone)` with tone `"info" | "success" |
  "error"`. Destructive actions use `src/components/ConfirmDialog.jsx`, never
  `window.confirm` (Playwright asserts against the dialog).
- Vote buttons reflect `userVote` (`aria-pressed`, `.active`), and are
  disabled on own content and below 50 reputation.
- Vercel production REST calls stay on same-origin `/api` via `vercel.json`;
  Socket.IO uses `VITE_SOCKET_URL` because it connects directly to Render.
- Unsafe API calls go through `src/api/client.js`, which obtains, attaches, and
  refreshes the session CSRF token. Do not bypass that wrapper.

## Test-writing notes

- Server integration tests live in `server/tests/*.int.test.js`, unit in
  `*.unit.test.js` (node:test + supertest against `createApp({ useSessionStore:
  false })`). Authenticate with `.set("x-test-user-id", id)` or a
  `supertest.agent` for real session flows.
- Client unit tests are colocated `src/**/*.test.{js,jsx}`; component tests
  need the `// @vitest-environment jsdom` pragma.
- E2e specifics: registration returns to Welcome and users then log in;
  creating a post returns Home while a new community opens its page; post titles are
  LINKS not buttons, and authors cannot vote on their own posts — use a second
  user to test voting.
- Playwright starts the API with `ENABLE_CSRF=true`; its reset helper must first
  obtain a token from `/api/auth/csrf` and preserve the test session cookie.
- Every e2e test resets only a database whose name begins with
  `phreddit_e2e`; never loosen the reset route or teardown name check.

## Style

ESM everywhere. 2-space indent, double quotes, semicolons (ESLint enforces).
Keep server route handlers thin; shared logic goes in `server/utils/`.
