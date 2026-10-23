# BookLeaf Author Support Portal

A full-stack support portal for BookLeaf authors and support administrators. Authors can review their imported catalogue and royalty snapshot, raise support tickets, and follow public replies. Admins triage the global queue, use optional AI suggestions, assign and update tickets, add private notes, and send reviewed replies.

## Features

- Separate author and admin login flows and layouts, backed by authenticated REST APIs.
- Independent author/admin build targets for separate deployment URLs and role-scoped browser sessions.
- Author-scoped book, royalty, and ticket data. Admin support operations span all authors.
- Ticket conversations with public messages separated from internal notes.
- Admin queue search, filters, sorting, pagination, assignment, status/category/priority overrides, and change audit trail.
- Optional backend-only AI classification, priority explanation, and editable response draft grounded in the BookLeaf Knowledge Base.
- Socket.IO invalidation events with server-authorized rooms, reconnect reconciliation, and a REST polling fallback.
- Repeatable seed of the provided 10 authors and 18 books with original IDs, relationships, source values, nulls, and zeroes preserved.
- Responsive React UI, API error states, health endpoint, automated API/realtime/seed tests, and a production frontend build.

Attachments currently have a picker UI only. Files are not uploaded or persisted.

## Technology and architecture

| Layer           | Technology                                                                         |
| --------------- | ---------------------------------------------------------------------------------- |
| Frontend        | React 18, Vite, React Router, Axios, Socket.IO client; separate author/admin builds |
| Backend         | Node.js 20+, Express 4, Socket.IO 4                                                |
| Persistence     | MongoDB 6+, Mongoose 8                                                             |
| Authentication  | bcryptjs password hashes, signed JWT in HTTP-only cookie, CSRF token for mutations |
| Optional AI     | Google Gemini API via `@google/genai`, structured JSON schema output, server-side only |
| Automated tests | Node test runner, Supertest, mongodb-memory-server, socket.io-client               |

Express is organized around routes, middleware, controllers, services, and Mongoose models. Routes validate and authorize requests, services implement support workflows, and the central error handler returns a consistent error envelope. React has separate author/admin route layouts and build targets, allowing each interface to deploy at its own URL. Both target one API and use different role-scoped session cookies. REST is the source of truth; socket events prompt a resource refresh rather than carrying privileged records.

```text
client/src/              React pages, role layouts, API, realtime context
server/src/routes/       REST route declarations
server/src/controllers/  Authentication and health handlers
server/src/services/     Ticket, admin queue, and AI workflows
server/src/models/       User, Book, Ticket, Message
server/src/ai/           Provider adapter and structured prompts
server/src/knowledgeBase/ Approved BookLeaf policy facts
server/src/realtime/     Authenticated Socket.IO rooms and events
server/src/seed/         Repeatable sample-data import
server/test/             API, AI-mock, seed, and realtime integration tests
docs/openapi.yaml        OpenAPI 3.1 HTTP API specification
```

## Prerequisites and local setup

- Node.js 20 or newer and npm.
- MongoDB 6 or newer, local or a reachable managed MongoDB deployment.
- Optional: a Gemini API key. The app and test suite run without it; AI is disabled unless explicitly enabled.

### Configure and seed the backend

```powershell
cd server
npm ci
Copy-Item .env.example .env
```

Edit `server/.env`: provide a MongoDB URI, a randomly generated `JWT_SECRET` of at least 32 characters, an author demo password, an admin email, and a separate admin password. Demo passwords must be at least 12 characters. Do not use the placeholder values in a shared or production environment.

From the `server` directory:

```powershell
npm run seed
npm run dev
```

The seed upserts stable source IDs and is safe to repeat against the same database. It does not delete tickets or other unrelated records. It sets demo credentials for the seeded authors and admin; use a dedicated development database because reseeding also resets those accounts to the configured demo passwords.

### Start the frontends

In separate terminals, run the two interfaces on distinct local ports:

```powershell
cd client
npm ci
Copy-Item .env.example .env
npm run dev:author
# in another terminal, from client/
npm run dev:admin
```

Open `http://localhost:5173` for authors and `http://localhost:5174/admin/login` for admins. Both use `VITE_API_URL` (normally `http://localhost:4000/api/v1`). Set backend `CORS_ORIGIN` to both exact origins: `http://localhost:5173,http://localhost:5174`. These portal builds use separate session cookies, so author and admin accounts can stay signed in in the same browser profile. `npm run dev` and `npm run build` still run the combined app for convenience.

### Demo accounts

For this evaluation, all ten author accounts use the email addresses in `FULLSTACK-SAMPLEDATA.json` and the same password. The admin account has separate credentials. Set these in `server/.env` before running `npm run seed`:

```dotenv
DEMO_AUTHOR_PASSWORD=BookLeafAuthorDemo2026!
ADMIN_EMAIL=admin@bookleaf.test
ADMIN_PASSWORD=BookLeafAdminDemo2026!
```

The seed hashes passwords with bcryptjs. These credentials are for the evaluation demo only; do not reuse them in production.

## Environment variables

`server/.env.example` documents every server setting; `client/.env.example` contains only browser-safe build settings. Copy them and replace placeholders for your environment.

| Variable                           | Required                | Purpose                                                                                                                                                |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                         | No                      | `development` locally; set to `production` on deployment. Enables Secure cookies and production-safe errors.                                           |
| `PORT`                             | No                      | HTTP server port; defaults to 4000 and should use the hosting platform's injected value.                                                               |
| `MONGODB_URI`                      | Yes                     | MongoDB connection string. Use a restricted database user and TLS for managed MongoDB.                                                                 |
| `JWT_SECRET`                       | Yes                     | At least 32 random characters; generate/store in a secret manager.                                                                                     |
| `SESSION_TTL_SECONDS`              | No                      | Session expiry, 300–604800 seconds; default 28800.                                                                                                     |
| `CORS_ORIGIN`                      | No                      | Exact comma-separated allowed frontend origins; include both author and admin frontend URLs.                                                           |
| `COOKIE_SAME_SITE`                 | No                      | `lax` locally. For cross-site frontend/API domains in production, set `none`; production cookies are then Secure. Same-site deployments can use `lax`. |
| `COOKIE_NAME`, `CSRF_COOKIE_NAME`  | No                      | Author role cookie names; defaults are `bookleaf_session` / `bookleaf_csrf`.                                                                             |
| `ADMIN_COOKIE_NAME`, `ADMIN_CSRF_COOKIE_NAME` | No           | Admin role cookie names; defaults are `bookleaf_admin_session` / `bookleaf_admin_csrf`.                                                                  |
| `DEMO_AUTHOR_PASSWORD`             | For seed                | Development/demo password for supplied author accounts; at least 12 characters.                                                                        |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`    | For seed                | Separate admin account credentials; password at least 12 characters.                                                                                   |
| `SAMPLE_DATA_FILE`                 | No                      | Optional path to a JSON fixture shaped like the supplied `FULLSTACK-SAMPLEDATA.json`.                                                                  |
| `AI_PROVIDER`                      | Optional                | `gemini` enables live Gemini calls; `disabled` disables them. Defaults to `disabled`.                                                                |
| `GEMINI_API_KEY`, `GEMINI_MODEL`   | Optional                | Backend-only key and model. Defaults to `gemini-3.8-flash`; set key only in `server/.env` or backend secrets. Never use a `VITE_` variable for a secret. |
| `AI_TIMEOUT_MS`                    | No                      | Provider timeout, 1000–60000 ms; default 12000.                                                                                                        |
| `AI_CLASSIFICATION_MAX_TOKENS`      | No                      | Bounded output budget; default 250.                                                                                                                    |
| `AI_DRAFT_MAX_TOKENS`              | No                      | Bounded output budget; default 450.                                                                                                                    |
| `VITE_API_URL`                     | Frontend build          | Public backend API URL including `/api/v1`; configure the same API URL for both portal builds.                                                          |
| `VITE_SOCKET_URL`                  | Optional frontend build | Public Socket.IO origin if different from `VITE_API_URL` origin. Never place secrets here.                                                             |

## Database and sample data

The seed reads `FULLSTACK-SAMPLEDATA.json` from the repository root when run from `server/`. It imports 10 authors and 18 books using the source IDs as MongoDB IDs. Books reference authors by `authorId`. Ticket records reference authors/books; conversation records reference tickets and senders. Internal notes and author-visible messages are separate `Message` records differentiated by visibility.

To run the seed against the configured development database:

```powershell
cd server
npm run seed
```

Verify with `mongosh` using the database name from your URI:

```javascript
db.users.countDocuments({ role: "author" }); // 10
db.books.countDocuments(); // 18
db.users.findOne({ _id: "AUTH001" }); // source author ID
db.books.findOne({ _id: "BK001" }); // source book ID and authorId
```

The seed is an upsert, not a destructive reset. It preserves other users and support records, and overwrites the imported fields/passwords for the known source IDs. Use a dedicated demo database. It does not invent missing sales or royalty data.

## API

The full OpenAPI 3.1 document, including field schemas, examples, validation responses, and authorization errors, is [docs/openapi.yaml](docs/openapi.yaml). The API prefix is `/api/v1`. All success responses use a `data` object and list responses may include `meta`. Errors use `{ "error": { "code", "message", "details?" }, "requestId" }`.

Authentication uses role-scoped HTTP-only session cookies: `bookleaf_session` for authors and `bookleaf_admin_session` for admins by default. Each frontend sends `X-BookLeaf-Portal: author|admin`; this selects the expected cookie, while the API still validates the signed user role and permissions. Obtain the matching CSRF token from the login response or `GET /auth/csrf?role=author|admin`. Send it as `X-CSRF-Token` on mutations with browser credentials enabled. The author identity always comes from the authenticated session, not request data.

### Main routes

| Method and route                              | Access                     | Purpose                                                                                                    |
| --------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /health`                                 | Public                     | API and MongoDB readiness.                                                                                 |
| `GET /auth/csrf`                              | Public                     | Issue a CSRF token/cookie.                                                                                 |
| `POST /auth/login`                            | Public, rate limited       | Login with `{ "email", "password" }`; returns user and CSRF token.                                         |
| `GET /auth/me`                                | Authenticated              | Current user.                                                                                              |
| `POST /auth/logout`                           | Authenticated + CSRF       | Clear session and disconnect its sockets.                                                                  |
| `GET /authors/me`                             | Author                     | Own profile.                                                                                               |
| `GET /authors`                                | Admin                      | Author list for support.                                                                                   |
| `GET /authors/{authorId}`                     | Admin or same author       | Author profile; other-author lookup returns 404.                                                           |
| `GET /books`                                  | Authenticated              | Author's own books; admins may filter with `authorId`.                                                     |
| `GET /tickets`                                | Authenticated              | Author's own tickets; admins may use status/category/priority and pagination filters.                      |
| `POST /tickets`                               | Author + CSRF              | Create a ticket from `{ "bookId?", "subject", "description" }`; omit `bookId` for General / Account Level. |
| `GET /tickets/{ticketId}`                     | Owner or admin             | Ticket conversation; author view excludes internal and admin-only fields.                                  |
| `GET /tickets/{ticketId}/conversation`        | Owner or admin             | Conversation endpoint (same privacy rules).                                                                |
| `POST /tickets/{ticketId}/messages`           | Authenticated owner + CSRF | Author-visible message.                                                                                    |
| `POST /tickets/{ticketId}/notes`              | Admin + CSRF               | Private internal note.                                                                                     |
| `PATCH /tickets/{ticketId}/status`            | Admin + CSRF               | Update status.                                                                                             |
| `GET /admin/tickets`                          | Admin                      | Search, filter, sort, and paginate global queue.                                                           |
| `GET /admin/tickets/{ticketId}`               | Admin                      | Ticket detail; first AI draft is generated on demand if configured.                                        |
| `POST /admin/tickets/{ticketId}/draft`        | Admin + CSRF               | Explicitly regenerate a draft; never sends it.                                                             |
| `PATCH /admin/tickets/{ticketId}/category`    | Admin + CSRF               | Override category.                                                                                         |
| `PATCH /admin/tickets/{ticketId}/priority`    | Admin + CSRF               | Override priority.                                                                                         |
| `PATCH /admin/tickets/{ticketId}/status`      | Admin + CSRF               | Change status.                                                                                             |
| `POST /admin/tickets/{ticketId}/assign-to-me` | Admin + CSRF               | Assign to authenticated admin.                                                                             |
| `POST /admin/tickets/{ticketId}/notes`        | Admin + CSRF               | Add internal-only note.                                                                                    |
| `POST /admin/tickets/{ticketId}/replies`      | Admin + CSRF               | Send author-visible response and update ticket status.                                                     |

### Example requests and responses

Login:

```http
POST /api/v1/auth/login
Content-Type: application/json
X-BookLeaf-Portal: author

{"email":"author@example.test","password":"<demo-password>"}
```

```json
{
  "data": {
    "user": {
      "_id": "AUTH001",
      "role": "author",
      "name": "Example Author",
      "email": "author@example.test"
    },
    "csrfToken": "<csrf-token>"
  }
}
```

Create a general ticket (include session cookie and CSRF header):

```http
POST /api/v1/tickets
Content-Type: application/json
Cookie: bookleaf_session=<http-only-session-cookie>; bookleaf_csrf=<csrf-cookie>
X-BookLeaf-Portal: author
X-CSRF-Token: <csrf-token>

{"subject":"Account question","description":"Please help me update my account contact details."}
```

```json
{
  "data": {
    "ticket": {
      "_id": "<ticket-id>",
      "authorId": "AUTH001",
      "bookId": null,
      "subject": "Account question",
      "status": "Open",
      "category": "General Inquiry",
      "priority": "Medium"
    },
    "originalQuery": {
      "ticketId": "<ticket-id>",
      "senderRole": "author",
      "body": "Please help me update my account contact details.",
      "visibility": "public"
    }
  }
}
```

Successful API calls may return 200, 201, or 204 according to the operation. Common errors include `400 VALIDATION_ERROR` / `INVALID_JSON`, `401 UNAUTHENTICATED` / `INVALID_CREDENTIALS`, `403 FORBIDDEN` / `CSRF_INVALID`, `404 TICKET_NOT_FOUND` / `BOOK_NOT_FOUND`, `409 DUPLICATE_RECORD`, and `429 LOGIN_RATE_LIMITED`. Error bodies include a stable code/message and request ID. The OpenAPI file documents the shared response shape and route-level outcomes.

### Admin portal: screens and endpoint workflow

Open the separate admin frontend at `http://localhost:5174/admin/login` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `server/.env`. The protected queue is at `/admin`; selecting a row opens `/admin/tickets/{ticketId}`. Admin pages call the API with the admin session cookie (`withCredentials`) and add `X-CSRF-Token` to mutations. Admin role is checked on every admin endpoint by the server; hiding a page in React is not considered authorization.

The usual workflow is:

1. Load and filter the queue with `GET /api/v1/admin/tickets`.
2. Open ticket context with `GET /api/v1/admin/tickets/{ticketId}`. The response includes author details, selected book (or `null`), all conversation messages including internal notes, audit trail, assignment, and AI draft status. The first draft is generated on demand if AI is configured; generation failure leaves manual response available.
3. Optionally override triage, update status, or assign to the current admin.
4. Add staff-only context through the notes endpoint, or send an edited author-visible response through replies.

Admin ticket detail response shape:

```json
{
  "data": {
    "ticket": {
      "_id": "<ticket-id>",
      "subject": "Royalty question",
      "status": "Open",
      "category": "Royalty & Payments",
      "priority": "Medium",
      "aiDraft": {
        "status": "complete",
        "text": "<suggested reply for admin review>"
      },
      "auditTrail": []
    },
    "author": {
      "_id": "AUTH001",
      "name": "Priya Sharma",
      "email": "priya.sharma@email.com"
    },
    "book": null,
    "assignee": null,
    "messages": [
      {
        "senderRole": "author",
        "visibility": "public",
        "body": "Please explain this statement."
      },
      {
        "senderRole": "admin",
        "visibility": "internal",
        "body": "Check the quarterly ledger before replying."
      }
    ],
    "currentAdminId": "ADMIN001"
  }
}
```

The `messages` list above is the admin view. Author ticket APIs omit internal messages, AI draft fields, assignment, and admin audit data.

#### Queue query parameters

`GET /api/v1/admin/tickets` accepts:

| Parameter       | Allowed values / format                                          | Behavior                                                                            |
| --------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `status`        | `Open`, `In Progress`, `Waiting on Author`, `Resolved`, `Closed` | Exact status filter.                                                                |
| `category`      | One of the six categories listed above                           | Exact category filter.                                                              |
| `priority`      | `Critical`, `High`, `Medium`, `Low`                              | Exact priority filter.                                                              |
| `from`, `to`    | `YYYY-MM-DD`                                                     | Inclusive UTC created-date range; invalid calendar dates or `from > to` return 400. |
| `q`             | Up to 120 characters                                             | Subject, author name/email, or ticket ID; accepts the optional `BL-` ID prefix.     |
| `sort`          | `oldest` (default), `newest`, `activity`                         | Creation order or most recent activity.                                             |
| `assignee`      | `any` (default), `me`, `unassigned`                              | Filter by assignment to this admin or no assignee.                                  |
| `page`, `limit` | Positive integer; `limit` max 100 (default 25)                   | Paginated result and metadata.                                                      |

Example request:

```http
GET /api/v1/admin/tickets?q=Priya&status=Open&priority=High&from=2026-01-01&to=2026-12-31&sort=oldest&assignee=unassigned&page=1&limit=25
Cookie: bookleaf_admin_session=<http-only-session-cookie>
X-BookLeaf-Portal: admin
```

Example response shape:

```json
{
  "data": {
    "tickets": [
      {
        "_id": "<ticket-id>",
        "subject": "Royalty question",
        "status": "Open",
        "category": "Royalty & Payments",
        "priority": "High",
        "author": {
          "_id": "AUTH001",
          "name": "Priya Sharma",
          "email": "priya@example.test"
        },
        "book": null,
        "assignee": null,
        "originalQuery": { "body": "Please help explain this statement." }
      }
    ]
  },
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 1,
    "pages": 1,
    "oldestUnresolvedTicketId": "<ticket-id>"
  }
}
```

#### Admin ticket actions

Every write below requires the admin session cookie, matching CSRF cookie, and `X-CSRF-Token` header. The server derives the acting admin from the session, validates enum values, persists an audit entry with actor/time, then emits the relevant event.

| Method and route                                     | Request body                                                        | Result                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/tickets/{ticketId}`               | None                                                                | Ticket detail, author/book context, messages, assignment, audit trail, and AI draft metadata/text.                              |
| `POST /api/v1/admin/tickets/{ticketId}/draft`        | Empty                                                               | Explicit AI draft regeneration; returns `{ "data": { "aiDraft": ... } }`; does not send.                                        |
| `PATCH /api/v1/admin/tickets/{ticketId}/category`    | `{ "category": "ISBN & Metadata Issues" }`                          | Saves human override; subsequent classification does not overwrite it.                                                          |
| `PATCH /api/v1/admin/tickets/{ticketId}/priority`    | `{ "priority": "High" }`                                            | Saves human override and audit change.                                                                                          |
| `PATCH /api/v1/admin/tickets/{ticketId}/status`      | `{ "status": "In Progress" }`                                       | Changes status and records transition.                                                                                          |
| `POST /api/v1/admin/tickets/{ticketId}/assign-to-me` | Empty                                                               | Assigns only to the logged-in admin; client cannot choose another assignee.                                                     |
| `POST /api/v1/admin/tickets/{ticketId}/notes`        | `{ "body": "Ask production to verify the ISBN record." }`           | Creates a private internal message; never shown to authors.                                                                     |
| `POST /api/v1/admin/tickets/{ticketId}/replies`      | `{ "body": "We will verify the ISBN record and update you here." }` | Creates a public reply, moves ticket to `Waiting on Author`, and makes the message visible in the author's ticket conversation. |

For example, to override priority:

```http
PATCH /api/v1/admin/tickets/<ticket-id>/priority
Content-Type: application/json
Cookie: bookleaf_admin_session=<http-only-session-cookie>; bookleaf_admin_csrf=<csrf-cookie>
X-BookLeaf-Portal: admin
X-CSRF-Token: <same-csrf-token>

{"priority":"High"}
```

Invalid enum/body values return `400 VALIDATION_ERROR`; missing/expired login returns `401 UNAUTHENTICATED`; a non-admin session returns `403 FORBIDDEN`; a malformed ticket ID returns `400 INVALID_TICKET_ID`; an unknown ticket returns `404 TICKET_NOT_FOUND`. All use the shared `{ "error": { "code", "message" }, "requestId" }` envelope. See [docs/openapi.yaml](docs/openapi.yaml) for the full OpenAPI route specification.

## AI behavior and cost controls

Google Gemini is called only from the backend through the provider adapter. Set `AI_PROVIDER=gemini` and `GEMINI_API_KEY` to enable it; `AI_PROVIDER=disabled` (the default) preserves manual support without live AI. `GEMINI_MODEL` is configurable and defaults to `gemini-3.5-flash-lite`. Ticket classification selects exactly one of six categories and one of four priority levels with a short explanation. The instructions explicitly reserve Critical for severe imminent impact; author text is treated as untrusted input. Classification uses structured JSON schema output and server validation. A failed call leaves the ticket available with safe defaults and records a safe failure status/code.

Response drafts use a separate structured prompt. The service selects only a few relevant articles from `server/src/knowledgeBase/bookleafKnowledgeBase.js` and supplies ticket subject, original query, status, category, and selected book title. The system instructions prohibit inventing payout dates, investigation outcomes, or operational actions. Drafts are saved and cached; an admin can explicitly regenerate, edit, and send. AI never sends a message automatically. If the key, quota, or provider is unavailable, staff can write a manual response.

Timeout and output token budgets are configurable and bounded. Requests disable automatic provider retries. Drafts and classification do not resend the full conversation or full knowledge base. There is no background retry loop. Provider rate limits, quota errors, invalid keys, timeouts, and malformed responses map to safe stored error codes. Tests inject mock providers, so no live API key or paid request is needed. Google changes model availability and free-tier limits; check the [Gemini model list](https://ai.google.dev/gemini-api/docs/models) and [pricing/free-tier page](https://ai.google.dev/gemini-api/docs/pricing) for current account availability and quotas. Google currently indicates that free-tier content may be used to improve its products; do not send sensitive author data unless that use is acceptable for your deployment.

Prompt strategy and constraints live in `server/src/ai/prompts.js`; the maintainable policy source is `server/src/knowledgeBase/bookleafKnowledgeBase.js`. The app stores provider/model, process time, article IDs, and safe error codes—not API keys or full provider request logs.

## Real-time events

Socket.IO uses the same authenticated session cookie at `/api/v1/socket.io`. Admins enter the admin queue room automatically; individual ticket room membership is requested with `ticket:subscribe` and authorized server-side. Authors can subscribe only to their own tickets. The server persists mutations before emitting. Internal note events are restricted to the admin ticket room and contain no unrelated author profile data.

Events are invalidation hints: `queue:ticket-created`, `queue:ticket-updated`, `ticket:updated`, `ticket:message` (public only), and `ticket:internal-note` (admin only). The React client reloads via REST after relevant events/reconnect, deduplicates event IDs, and polls REST every 15 seconds while disconnected. See [docs/realtime-events.md](docs/realtime-events.md) for event payloads, recipients, subscription acknowledgements, and privacy rules.

| Event                                           | Recipient               | Purpose                                            |
| ----------------------------------------------- | ----------------------- | -------------------------------------------------- |
| `queue:ticket-created` / `queue:ticket-updated` | Authorized admin queue  | Invalidate and reload queue data.                  |
| `ticket:updated`                                | Authorized ticket rooms | Refresh status/category/priority/assignment state. |
| `ticket:message`                                | Ticket owner and admins | Public conversation message only.                  |
| `ticket:internal-note`                          | Admin ticket room/queue | Private staff note; never emitted to author rooms. |

The server authenticates the same HTTP-only cookie used for REST. Admins join the queue room on connection; individual ticket subscriptions are validated against the authenticated user on the server. A client cannot choose an arbitrary room or role.

API documentation is in [docs/openapi.yaml](docs/openapi.yaml). The one-page design summary is [docs/technical-approach.md](docs/technical-approach.md).

## Tests and local verification

From the repository root (PowerShell):

```powershell
cd server
npm ci
npm test

cd ..\client
npm ci
npm test
npm run build
npm run build:author
npm run build:admin
```

The backend tests use an ephemeral MongoDB and mocked AI providers. They exercise authentication, author isolation, exact seed fidelity/repeatability, ticket and admin workflows, AI schema/provider failure paths, health/error responses, socket authorization/privacy, and reconnect. Frontend tests cover duplicate socket-event suppression. `npm run build:author` and `npm run build:admin` each produce a production bundle in `client/dist` for the corresponding host; `npm run build` creates the combined local app.

For a manual real-time walkthrough, sign into the author and admin URLs in the same browser profile, submit a ticket, then reply and add an internal note from admin. The reply should reach the author conversation; the note must not. Role-specific cookies keep both sessions distinct.

## Deployment

This repository has **not** been deployed or live-tested. No hosting or database credentials were provided. Production container configs are provided for the backend (`server/Dockerfile`, built with repository root as context and the root `.dockerignore`) and frontend (`client/Dockerfile`, `client/nginx.conf`, built with `client` as context). The frontend Docker image accepts `PORTAL=author|admin`; the same client source also produces separate static builds with `npm run build:author` and `npm run build:admin`. Each build serves only its respective interface and supports React Router fallback. Both builds use one backend URL.

See [docs/deployment.md](docs/deployment.md) for separate static-host/container setup, the two-domain CORS and cookie configuration, and the live verification checklist.

### Deployment procedure

1. Create a managed MongoDB database (for example MongoDB Atlas), a least-privilege database user, and a TLS connection URI. Allow only the backend's egress/network as supported by the provider.
2. Build/deploy the backend container from the repository root: `docker build -f server/Dockerfile -t bookleaf-api .`. Use a Node/Docker hosting service that supports long-lived HTTP connections and WebSocket upgrades. Use one API instance for this assignment; multiple instances need a shared Socket.IO adapter and compatible WebSocket routing.
3. Configure backend secrets in the platform environment/secret manager: `NODE_ENV=production`, platform `PORT`, `MONGODB_URI`, random `JWT_SECRET`, `CORS_ORIGIN=https://authors.example.com,https://support.example.com`, demo/admin credentials, and optional Gemini settings (`AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL`). Do not commit these values. Prefer sibling subdomains for author, admin, and API (`authors.example.com`, `support.example.com`, `api.example.com`), which are separate origins but same-site for browser cookie policy. Keep `COOKIE_SAME_SITE=lax` for this topology. If the frontend and API are genuinely cross-site, set `COOKIE_SAME_SITE=none`; production cookies are Secure. Keep HTTPS enabled everywhere.
4. Deploy two frontend services from the same `client/` directory. For static hosting configure both with root directory `client`, install command `npm ci`, and public build variable `VITE_API_URL=https://api.example.com/api/v1` (plus `VITE_SOCKET_URL=https://api.example.com` only if needed). Author build command is `npm run build:author`, publish directory `dist`; admin build command is `npm run build:admin`, publish directory `dist`. For containers, build twice from `client/`, setting `--build-arg PORTAL=author` for the author URL and `--build-arg PORTAL=admin` for the admin URL, and pass the same API/socket build args. Configure SPA fallback to `index.html` on each static host. Add both exact deployed frontend origins to `CORS_ORIGIN` before testing.
5. Run `npm run seed` once against the production database using the same backend release and the secret environment settings. This creates/updates the 10 sample authors, 18 books, and admin account using stable IDs. Use a dedicated evaluation database: seeding resets demo password hashes and imported source fields for those IDs. Do not configure seeding as an automatic every-deploy destructive job.
6. Verify `GET https://api.example.com/api/v1/health` returns `200`, `{ "data": { "status": "ok", "database": "connected" } }`; visit both deployed URLs and test author/admin login in the same browser profile, books, ticket creation, assignment, public reply, private-note isolation, AI draft generation (if configured), and Socket.IO updates.
7. Review host logs for startup errors and WebSocket upgrade handling. Never include real secrets in screenshots, README, build variables prefixed with `VITE_`, or source control.

Use `npm start` (or container `CMD`) for backend production startup. Use `npm run build:author` and `npm run build:admin` for separate frontend deployments; use `npm run build` only for the combined app. Health endpoint: `/api/v1/health`. Host-specific service files are intentionally not added because the evaluation provider is unknown.

## Known limitations and future improvements

- Attachment uploads are not implemented; selected files are neither sent nor persisted.
- Ticket classification is scheduled in-process after ticket persistence. A process crash or multi-instance deployment can lose/duplicate work; replace it with a durable queue/outbox before scaling.
- Socket.IO is process-local. Multi-instance deployment requires an adapter and appropriate affinity/routing.
- No browser E2E or accessibility automation is configured; perform the two-session walkthrough before an actual submission.
- Demo password management is seed-configured, not a password-reset lifecycle. Rotate demo credentials and use separate production identity management for a real service.
- Royalty amounts are supplied snapshot values. The UI does not calculate earnings from sales or rates, and seed data contains no missing-field backfill.
- Add durable AI retry jobs, metrics/tracing, audit retention policy, attachment malware scanning/object storage, and production backup/restore drills as the service evolves.
