# Phreddit API

All endpoints are rooted at `/api`. Browser requests use a signed, HTTP-only
session cookie. Every response is marked `Cache-Control: private, no-store` and
includes a bounded `X-Request-ID`. JSON errors have the shape
`{ "error": "message" }`; registration validation may return
`{ "errors": ["message"] }`, and unhandled server errors also include the
request ID used by structured server logs.

## Request Security

All `/api` requests share a bounded per-IP budget. Responses expose the
standard combined `RateLimit` and `RateLimit-Policy` headers; exhausted budgets
return `429` with `Retry-After`. Login and registration also use a smaller,
path-specific authentication budget.

In production, `POST`, `PUT`, `PATCH`, and `DELETE` requests must include an
`X-CSRF-Token` matching the random synchronizer token stored in the signed
server session. Authenticated `GET /auth/me` and public `GET /auth/csrf` return
the token; a guest `GET /auth/me` stays session-free. Login rotates both the
session ID and token. A missing or stale token returns
`403` with code `CSRF_TOKEN_INVALID`. The client refreshes once and retries.

Unsafe production requests must also include an `Origin` matching
`CLIENT_ORIGIN` or the API's own origin. The Vercel deployment proxies REST
calls through same-origin `/api` and uses `SameSite=Lax`; the Origin check is a
second independent CSRF boundary. Tests may enable the token middleware with
`ENABLE_CSRF=true`; Playwright does so in CI.

## Authentication

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Create an account; does not start a session |
| POST | `/auth/login` | Public | Regenerate the session and authenticate |
| POST | `/auth/logout` | Public | Destroy the current session |
| GET | `/auth/me` | Public | Return the current user and token; guests receive only `{ user: null }` |
| GET | `/auth/csrf` | Public | Return or initialize the session CSRF token |

## Communities and Discovery

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/communities` | Public | Lightweight community summaries, joined first |
| GET | `/communities/:id` | Public | Community details |
| POST | `/communities` | User | Create a community |
| PUT/DELETE | `/communities/:id` | Owner/Admin | Edit or cascade-delete |
| POST | `/communities/:id/join` | User | Join a community |
| POST | `/communities/:id/leave` | User | Leave a community |
| GET | `/linkflairs` | Public | List link flairs |
| POST | `/linkflairs` | User | Create a unique link flair |
| GET | `/search?q=` | Public | Up to six safe community, public-user, and flair matches per group |

Discovery uses weighted text indexes. Community results include a computed
member count rather than member IDs; user results include only display name and
reputation; flair results include only their public label.

## Posts and Comments

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/posts` | Public | Paginated listing/search/filter/sort |
| GET | `/posts/:id/summary` | Public | Lightweight post id/title for creation forms |
| GET | `/posts/:id` | Public | Post plus an arbitrary-depth comment tree |
| POST | `/posts/:id/view` | Public | Atomically increment views |
| POST | `/posts` | User | Create a post |
| PUT/DELETE | `/posts/:id` | Owner/Admin | Edit or cascade-delete |
| POST | `/posts/:id/vote` | Eligible user | Add, remove, or switch a vote |
| POST | `/comments` | User | Create a comment or reply |
| PUT/DELETE | `/comments/:id` | Owner/Admin | Edit or cascade-delete |
| POST | `/comments/:id/vote` | Eligible user | Add, remove, or switch a vote |

`GET /posts` accepts `page`, `limit`, `sort=newest|oldest|active`, `community`,
`linkFlair`, and `search`. Authenticated feeds prioritize joined communities
before applying page boundaries. Vote histories are never serialized; responses
contain only `userVote` for the caller. Search resolves at most 5,000 matching
post ids and returns `searchTruncated=true` if more exist. Detailed post
responses include at most 5,000 comments and return `commentsTruncated=true`
when the guard is reached.

## Profiles and Moderation

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/users/:id/public` | Public | Safe public profile and recent activity |
| GET | `/users/:id/profile-content` | Self/Admin | Editable profile content |
| GET | `/users` | Admin | User-management listing |
| DELETE | `/users/:id` | Admin | Cascade-delete a non-admin account |
| POST/DELETE | `/users/me/saved-posts/:postId` | User | Save or unsave a post |
| POST | `/reports/posts/:postId` | User | Report a post once while pending |
| GET | `/reports?status=` | Admin | Queue/history filtered by `pending`, `dismissed`, `content_removed`, or `all` |
| POST | `/reports/:id/resolve` | Admin | Atomically claim, dismiss, or remove reported content |

State-changing post/comment operations emit `post:updated` to the corresponding
Socket.IO `post:<id>` room. The client treats these events as invalidations and
refetches authoritative API state.

Reports preserve a bounded content/author/community snapshot when submitted so
administrators retain review evidence if live references later disappear. A
pending report is moved through a short `processing` claim state so concurrent
administrators cannot resolve it twice.
