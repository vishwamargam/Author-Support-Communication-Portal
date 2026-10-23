# BookLeaf Author Support API

Node.js/Express/Mongoose backend foundation. It includes author/admin users, imported book snapshots, tickets, public messages/internal notes, JWT login, structured errors, request logging, MongoDB health status, and an idempotent data seeder.

## Assumptions

- The repository supplies `../FULLSTACK-SAMPLEDATA.json`; the requested `bookleaf_sample_data.json` is not present. The seeder accepts either filename and can be pointed to another path with `SAMPLE_DATA_FILE`.
- Source `author_id` and `book_id` values are MongoDB string `_id`s. `User` doubles as the author identity/profile, and each `Book.authorId` references that user. This preserves IDs and author/book relationships without duplicating an `Author` collection.
- Six category enum values and five ticket status values are provisional because the supplied materials do not list authoritative names. Royalty fields are imported snapshots only.
- Demo credentials are set by the developer in the untracked `.env`; the seed never ships a password or stores plaintext. All ten author accounts share the configured local demo author password. Admin has a separate configured email/password.

## Requirements

- Node.js 20 or newer
- MongoDB 6 or newer (local or hosted)

## Install and configure

```powershell
cd server
npm install
Copy-Item .env.example .env
```

Edit `.env`: set a MongoDB URI, a random `JWT_SECRET` with at least 32 characters, and two distinct demo passwords of at least 12 characters. These values are examples/placeholders and must be replaced locally. Never commit `.env`.

### Local demo credentials

After setting `.env`, seed creates these accounts:

- Admin: `admin@bookleaf.test` with the evaluation password configured as `ADMIN_PASSWORD`.
- Authors: each source email, such as `priya.sharma@email.com`, with the shared evaluation password configured as `DEMO_AUTHOR_PASSWORD`.

For this evaluation, use `DEMO_AUTHOR_PASSWORD=BookLeafAuthorDemo2026!` and `ADMIN_PASSWORD=BookLeafAdminDemo2026!`. These are demo-only credentials; do not reuse them in production.

The password values are deliberately not published in this repository. Choose them in your local `.env`; their bcrypt hashes (cost 12) are saved in MongoDB. Login with `POST /api/v1/auth/login`; the API sets an HTTP-only session JWT cookie.

## Commands

```powershell
npm run seed    # idempotent upsert of source authors/books plus local demo admin
npm run dev     # development server with Node's built-in watch mode
npm start       # production server
npm test        # auth/access-control integration tests with an ephemeral MongoDB
```

The seed only upserts the 10 source authors and 18 source books and one reserved `ADMIN001` user. It does not clear collections or modify tickets/messages. Rerunning it updates imported author/book fields from the source file, including nulls. For a clean local reset, use a dedicated local database name in `MONGODB_URI` and drop that database explicitly with MongoDB tooling; never run database drops against shared/production databases.

## Verify

Start the API, then check:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health
```

Expected: `status: ok`, `database: connected`.

Check seeded counts in `mongosh` using the database name from `MONGODB_URI`:

```javascript
use bookleaf_author_support
db.users.countDocuments({ role: "author" }) // 10
db.books.countDocuments()                   // 18
db.users.findOne({ _id: "AUTH001" }, { passwordHash: 0 })
db.books.findOne({ _id: "BK001" })
db.books.findOne({ _id: "BK013" }) // production status and null values retained
db.books.findOne({ _id: "BK015" }) // production status and null values retained
```

Test login:

```powershell
$body = @{ email = 'priya.sharma@email.com'; password = '<the value set as DEMO_AUTHOR_PASSWORD>' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login -ContentType 'application/json' -Body $body
```

## API and authentication

- `GET /api/v1/health` — Mongo readiness (`503` while disconnected).
- `POST /api/v1/auth/login` — validates email/password; sets HTTP-only session cookie and non-HTTP-only CSRF cookie; returns safe profile and CSRF token (never the JWT).
- `POST /api/v1/auth/logout` — requires session cookie and `X-CSRF-Token`; expires both cookies.
- `GET /api/v1/auth/me` — current active user from the authenticated session.
- `GET /api/v1/auth/csrf` — issues a CSRF token/cookie for bootstrapping a browser session.
- `GET /api/v1/authors/me` — authenticated author's own profile.
- `GET /api/v1/authors` and `GET /api/v1/authors/:authorId` — admin author lookup; an author may use the latter only for their own ID.
- `GET /api/v1/books` — authors receive only their own books; admins receive all books or may filter with `authorId`.
- `GET /api/v1/tickets` — an author's own tickets or the admin queue, with admin status/category/priority filters.
- `POST /api/v1/tickets` — author creates a ticket; the server sets `authorId`, validates optional book ownership, defaults status to `Open`, and saves the original query as the first public message.
- `GET /api/v1/tickets/:ticketId` — ticket and role-filtered conversation; authors cannot read another author's ticket or internal notes.
- `GET /api/v1/tickets/:ticketId/conversation` — authenticated; authors see only their own public messages, admins see public messages and internal notes.
- `POST /api/v1/tickets/:ticketId/messages` — authenticated public reply; requires CSRF header.
- `POST /api/v1/tickets/:ticketId/notes` — admin-only internal note; requires CSRF header.
- `PATCH /api/v1/tickets/:ticketId/status` — admin-only allowed status update; requires CSRF header.
- `GET /api/v1/admin/tickets` — admin-only global queue with status/category/priority/date/assignee/search/sort/pagination filters and oldest unresolved metadata.
- `GET /api/v1/admin/tickets/:ticketId` — admin-only ticket, full conversation, author/book context, assignment and audit trail.
- `PATCH /api/v1/admin/tickets/:ticketId/category|priority|status` — admin-only validated overrides; actor and before/after values are recorded on the ticket.
- `POST /api/v1/admin/tickets/:ticketId/assign-to-me` — assigns to the authenticated admin; client cannot choose the assignee.
- `POST /api/v1/admin/tickets/:ticketId/notes` — private admin note, stored as an internal `Message`.
- `POST /api/v1/admin/tickets/:ticketId/replies` — public admin response; persisted as a public `Message`, audit recorded, status moves to `Waiting on Author`.

### Session and browser security

The API uses an **HS256 JWT in an HTTP-only cookie**, rather than returning a bearer token to JavaScript. The author and admin interfaces use separate session cookies (`bookleaf_session` and `bookleaf_admin_session` by default) and separate CSRF cookies so both roles can remain signed in from the same browser. Each frontend sends `X-BookLeaf-Portal: author|admin` to select its cookie; the backend verifies the signed session role and authorization independently. State-changing requests require a signed double-submit CSRF token in the matching role-scoped cookie and `X-CSRF-Token` header. Login also checks the request origin when browsers supply it. Logout clears only the active portal's cookies. The JWT lifetime is bounded by `SESSION_TTL_SECONDS` (default 8 hours); each request loads the active user from MongoDB so deactivation and role changes take effect immediately.

Cookies are host-only, scoped to `/api/v1`, `HttpOnly` for sessions, `SameSite=Lax` by default, and `Secure` in production. `SameSite=None` is accepted only with `NODE_ENV=production`, where Secure is enabled. Configure `CORS_ORIGIN` as a comma-separated allowlist of both exact frontend origins; wildcard origins are not supported with credentialed requests. In the frontend, send credentials and echo the role-matched CSRF token for mutations. Avoid setting a broad cookie `Domain`.

Login is limited to 10 attempts per IP per 15-minute window (100 in tests). Error status codes include `400` invalid body, `401` missing/invalid session or credentials, `403` role/CSRF/origin denial, `404` missing or cross-author resource, `409` duplicate data, and `429` login throttling. Errors use `{ error: { code, message, details? }, requestId }`.

### Tests

```powershell
npm test
```

Tests use `mongodb-memory-server` and Supertest; no local MongoDB service is needed. Coverage includes unauthenticated access, author-to-author profile/book/ticket isolation, public-only author conversations, admin-wide support access/internal notes, invalid credentials/body, cookie behavior, CSRF logout, admin filters/audited changes, and the ticket-creation-to-public-admin-reply workflow. `npm audit` currently reports no vulnerabilities.

Request IDs are returned in `X-Request-Id`; Morgan logs each request. Socket.IO and optional AI provider/Knowledge Base support are configured. Ticket attachments are not accepted by the API.

## Schema notes

All models use Mongoose `createdAt`/`updatedAt`; source IDs are stable string IDs for users/books. Tickets and messages use ObjectId IDs with references. Message visibility is `public|internal`; service authorization filters internal notes before responding to authors. `passwordHash` is excluded by default and removed from serialized users.
