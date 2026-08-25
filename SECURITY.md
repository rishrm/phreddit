# Security Policy

## Supported Version

Security fixes are applied to the current `main` branch.

## Reporting a Vulnerability

Please use the repository's private GitHub Security Advisory reporting flow.
Do not publish authentication bypasses, session weaknesses, exposed secrets,
or private-data leaks in a public issue.

Include the affected endpoint or component, reproduction steps, expected and
observed behavior, and any suggested remediation. Reports will be reviewed as
quickly as possible and credited when appropriate.

## Security Boundaries

- Production authentication uses signed server sessions and HTTP-only cookies.
- Password hashes are excluded by default at the Mongoose schema boundary and
  selected explicitly only during password verification.
- The `x-test-user-id` header is accepted only when `NODE_ENV=test`.
- User-authored Markdown is sanitized before rendering.
- Post and comment voter lists are private and must pass through the shared
  serializer before entering an API response.
- Vercel proxies REST requests through same-origin `/api`; unsafe API requests
  also require a trusted `Origin` and all routes share bounded rate limiting.
- Production replica sets use transactions for multi-document votes,
  ownership references, moderation, membership changes, and cascade deletion.
- Administrator privileges are granted only through the guarded
  `admin:promote` script; application startup only verifies `ADMIN_EMAIL`.
- Production startup requires `SESSION_SECRET`; secrets belong in hosting
  environment variables and must never be committed.
