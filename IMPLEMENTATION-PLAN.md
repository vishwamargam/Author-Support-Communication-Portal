# BookLeaf Author Support & Communication Portal

## Scope and decisions

This plan treats `FULLSTACK-SAMPLEDATA.json` as the canonical seed source. It contains **10 authors and 18 books**. Preserve every supplied field and value, including nullable publication/royalty values and the production status of BK013 and BK015. The file does not define login credentials, ticket examples, support categories, priority rules, a Knowledge Base, AI vendor, or deployment target.

### Assumptions to confirm against the original assignment

1. **Ticket categories:** “six specified categories” are referenced, but their names are absent from the supplied requirements and repository. Use a configurable enum with provisional values: `royalty_payment`, `book_production`, `distribution`, `sales_reporting`, `account_profile`, `other`. Replace these labels before implementation if the brief names different categories.
2. **Knowledge Base:** no BookLeaf policies or FAQs are present. Authoritative policy answers and AI grounding cannot be completed until approved KB content is supplied. Seed a small clearly labeled demo KB only if the assignment expects an end-to-end demonstration; never present invented policy as fact.
3. **Priority:** persist a 0–100 score plus `Critical | High | Medium | Low`. Start with an explainable rule rubric (impact, urgency, blocked publication/payment, age/SLA), map configurable score bands to labels, and let admins override the result. Thresholds below are initial defaults, not assignment facts: Critical 80–100, High 60–79, Medium 30–59, Low 0–29.
4. **Identity:** sample authors have no passwords. Seed them as accounts with a development-only password from an environment variable, or require an invitation/password setup flow. Do not infer passwords from email or expose credentials in the seed JSON. Seed at least one admin from environment configuration.
5. **Royalty figures:** show supplied snapshot fields as imported data; do not recompute totals or infer payout cadence. The source does not provide transaction-level royalty ledger entries.
6. **Admin scope:** assume one `admin` role with access to all tickets, assignments, notes, and author/book data. Additional staff permissions, team queues, and audit retention are unspecified.
7. **Deployment:** use one Node API and managed MongoDB, with two separately built React static frontends (author and admin) deployed at distinct URLs. Configure both origins in API CORS. Use separate role-scoped cookies so both roles can coexist in the same browser. Prefer HTTPS sibling subdomains for cookie compatibility; exact provider/domain and production email delivery remain unspecified. Keep configuration portable with environment variables.

## 1. Architecture and request/data flow

Use a modular monolith: React SPA, Express REST API, MongoDB/Mongoose, and Socket.IO attached to the same HTTP server. Backend modules own routes, validation, controllers, services, models, and authorization. Controllers translate HTTP to service calls; services contain business rules and coordinate persistence, AI, and event publication. Keep AI behind an `AiService` interface so provider choice can change without changing ticket logic.

Typical ticket flow:

1. User submits a validated ticket; authentication supplies the author identity (never trust an author ID from the form).
2. Ticket service persists ticket and first message in a transaction where supported, with initial status `Open`.
3. After persistence, enqueue classification/draft work (an in-process job queue is adequate for the four-day MVP; persist an AI job state for retry visibility). AI receives the ticket text and relevant approved KB snippets, returns schema-validated category, score/label, rationale, and optional draft.
4. Save AI output as suggestions with model/version, timestamp, and confidence; do not send a generated reply automatically. An admin reviews, edits, and sends it.
5. Persist every public reply/internal note and status/assignment change. Emit a Socket.IO event only after the corresponding database write succeeds.
6. Clients refresh or reconcile their ticket/query cache from the event and use REST as the source of truth after reconnect.

For a reply, the API checks role and ticket visibility, writes the message, updates `lastActivityAt`, applies any explicit status transition, and then emits `ticket:message_created` and `ticket:updated`. Internal notes are admin-only in API serialization and event rooms. Author sockets join only their own author room; admins join an admin room after authentication.

## 2. Project structure

```text
.
├── IMPLEMENTATION-PLAN.md
├── README.md
├── docs/
│   ├── api.md
│   └── technical-approach.md       # one-page architecture/deployment rationale
├── data/
│   └── FULLSTACK-SAMPLEDATA.json   # canonical input; retain supplied file if desired
├── server/
│   ├── src/
│   │   ├── app.js                  # middleware and route registration
│   │   ├── server.js               # HTTP + Socket.IO lifecycle
│   │   ├── config/                 # env, database, category/priority configuration
│   │   ├── middleware/             # auth, role, validation, errors, rate limits
│   │   ├── modules/
│   │   │   ├── auth/{auth.routes,auth.controller,auth.service}
│   │   │   ├── authors/{author.routes,author.controller,author.service}
│   │   │   ├── books/{book.routes,book.controller,book.service}
│   │   │   ├── tickets/{ticket.routes,ticket.controller,ticket.service,ticket.policy}
│   │   │   ├── messages/{message.routes,message.controller,message.service}
│   │   │   ├── knowledge-base/{kb.routes,kb.service}
│   │   │   └── ai/{ai.service,ai.provider,ai.schemas,priority.service}
│   │   ├── models/                 # Mongoose schemas
│   │   ├── realtime/               # socket auth, rooms, event publisher
│   │   ├── jobs/                   # AI processing/retry
│   │   ├── utils/                  # pagination, async wrapper, API errors
│   │   └── seed/                   # idempotent import + dev account seed
│   └── package.json
├── client/
│   ├── src/
│   │   ├── app/                    # router, providers, auth guards
│   │   ├── layouts/{AuthorLayout,AdminLayout}.jsx
│   │   ├── features/{auth,author-dashboard,books,royalties,tickets,admin-queue,knowledge-base}/
│   │   ├── components/             # shared forms, status/priority badges
│   │   ├── services/               # typed API client and socket client
│   │   └── styles/
│   └── package.json
└── deployment/                     # optional Docker/hosting configuration
```

## 3. MongoDB collections and relationships

Use references for independently queried records and retain source IDs as unique external identifiers. Add timestamps and indexes deliberately.

| Collection | Main fields and relationships | Important indexes / access rules |
|---|---|---|
| `users` | `email` normalized/unique, `passwordHash`, `role: author|admin`, `authorId` for author users, `isActive`, optional refresh-token hash/version | unique email; author cannot select their own role at signup; never return password/hash |
| `authors` | `externalId` (`AUTH001`), name, email, phone, city, joined date | unique externalId; email index; login identity maps to corresponding user |
| `books` | `externalId` (`BK001`), `authorId` ref, ISBN, title, genre, publication/status, MRP, per-copy royalty, sales and royalty snapshot, payout date, partner, availability | unique externalId; index authorId; all supplied values preserved; `authorId` is the relationship rather than embedded book duplication |
| `tickets` | `authorId`, optional `bookId`, subject, description/initial message reference, status, category, priority `{score,label,source,rationale}`, assignment `{userId,assignedAt}`, `lastActivityAt`, `closedAt`, AI analysis metadata | indexes `{status,lastActivityAt}`, `{assignedTo.userId,status}`, `{authorId,lastActivityAt}`, `{category,status}` |
| `messages` | `ticketId`, `authorId`/`senderId`, `senderRole`, `body`, `visibility: public|internal`, optional attachments metadata, createdAt | `{ticketId,createdAt}`; internal visibility must be filtered server-side for authors |
| `knowledgeBaseArticles` | title, body, category/tags, source/reference, status `draft|published|archived`, effective dates, updatedBy | published/effective articles only are eligible for AI retrieval |
| `ticketEvents` (optional MVP) | ticketId, actorId, event type, safe before/after summary, timestamp | audit/status timeline; may defer if message/ticket history is sufficient for demo |

Ticket statuses: `Open`, `In Progress`, `Waiting on Author`, `Resolved`, `Closed` (configurable if the assignment defines other labels). A ticket embeds current category/priority/assignee for queue reads; messages remain separate and append-only. `authorId` and `bookId` are database references; imported external IDs remain unique and stable. Never expose internal notes or admin-only AI metadata on author APIs.

## 4. REST endpoint plan

Prefix all endpoints with `/api/v1`. Use JSON, consistent `{ data, meta }` success responses and `{ error: { code, message, details? }, requestId }` errors. Paginate list endpoints with `limit` and cursor/page; validate query/body/path parameters.

| Method and path | Purpose / access |
|---|---|
| `POST /auth/login` | Verify credentials, set secure session/refresh cookie, return safe user profile |
| `POST /auth/logout`, `GET /auth/me` | End session and retrieve authenticated identity |
| `GET /author/me` | Author profile; author only |
| `GET /author/me/books` | Own books and royalty snapshot; author only |
| `GET /tickets` | Author gets own tickets; admin gets global queue with filters (`status`, `category`, `priority`, `assignee`, search, date, pagination) |
| `POST /tickets` | Author creates a ticket; optional own `bookId`, subject, body |
| `GET /tickets/:ticketId` | Ticket detail, role-filtered conversation, status/history |
| `POST /tickets/:ticketId/messages` | Add public reply (author or admin); update activity and emit event |
| `POST /tickets/:ticketId/notes` | Add internal note; admin only |
| `PATCH /tickets/:ticketId/status` | Admin status transition with validation; optionally author close only if required |
| `PATCH /tickets/:ticketId/assignment` | Admin assign/unassign to active admin |
| `POST /tickets/:ticketId/ai-analysis` | Admin trigger/retry analysis; return job/analysis status |
| `POST /tickets/:ticketId/ai-draft` | Admin request a grounded draft; no automatic send |
| `GET /admin/queue/summary` | Admin counts grouped by status/priority and optionally category |
| `GET /knowledge-base/articles` | Admin list/manage KB; public eligible subset only if author FAQ view is needed |
| `POST /knowledge-base/articles`, `PATCH /knowledge-base/articles/:id` | Admin KB authoring/publishing, if time permits |
| `GET /health` | Liveness/readiness without secrets |

Return `400` validation, `401` unauthenticated, `403` forbidden, `404` missing or inaccessible ticket (avoid leaking cross-author existence), `409` invalid state conflict, `429` rate limit, and `500/503` safe service errors. Use centralized error middleware and request IDs; never return stack traces in production.

## 5. Authentication and authorization

Use bcrypt/Argon2 password hashing; prefer short-lived access session in `HttpOnly`, `Secure`, `SameSite` cookies with CSRF protection for state-changing calls. If a bearer-token approach is required by hosting constraints, keep access tokens short-lived and refresh tokens rotated/revocable; do not store long-lived tokens in localStorage. Login rate limits and generic credential errors reduce enumeration. Require HTTPS in deployment.

RBAC middleware enforces `author` and `admin`, then service-level ownership checks enforce `ticket.authorId === req.user.authorId` and book ownership for authors. Admin-only operations include global filtering, assignment, internal notes, status management, and AI controls. Every query is scoped at the server; the client role guard is only a UI convenience. Validate Socket.IO handshake credentials with the same session and join rooms from the authenticated server identity, never a client-supplied author ID. Seed admin credentials via deployment secrets; development credentials are documented as local-only.

## 6. AI integration and failure handling

- Define a strict output schema: one configured category, score 0–100, priority label derived from configured bands, short evidence-based rationale, and optional draft with cited KB article IDs. Reject malformed or out-of-enum outputs.
- Retrieve only published, effective BookLeaf KB articles relevant to the ticket; pass the source snippets and IDs to the model. Require the model to state insufficient KB support rather than inventing policy. The prompt treats ticket text as untrusted input and prevents instructions inside it from changing system behavior.
- Classification and draft are suggestions. Persist model/provider/version, KB references, status (`pending|complete|failed`), error class, and human override. Do not put personal or sensitive data in logs; redact model payloads where feasible.
- Set request timeout, bounded retries with backoff for transient errors, and per-user/admin rate limits. Persist failed state and expose retry; never block ticket creation or message posting on AI availability. Use deterministic rules for baseline priority and fallback category `other` when AI is unavailable; mark `source: rules|ai|human` so staff can distinguish it.
- A generated response is not sent automatically. Admin reviews and edits before saving as a public message. If no relevant KB passages exist, return a concise “needs human response” result instead of a policy draft.
- Keep provider key on the server in environment secrets. Track usage and avoid sending unrelated author/book records to the model.

## 7. Real-time event plan

Authenticate Socket.IO connections with the session cookie/token. Rooms: `admin:queue` for admins and `author:<authorId>` for each author; optionally `ticket:<ticketId>` after server-side visibility checks. Suggested events:

- `ticket:created` → admin queue and owning author.
- `ticket:updated` → authorized ticket viewers after status, assignment, category, or priority changes.
- `ticket:message_created` → authorized ticket viewers; payload excludes internal notes from authors.
- `ticket:note_created` → admins only.
- `ticket:ai_updated` → admins only when analysis/draft state changes.

Emit minimal payloads (`ticketId`, changed fields, `updatedAt`, safe summary), never secrets or full private notes. Persist before emitting; client fetches current detail on event or reconnect. Socket.IO is an update hint, not durable storage; REST polling/refetch handles missed events. For a single API instance the in-memory adapter is sufficient; add a Mongo/Redis adapter only if horizontally scaling.

## 8. Four-day delivery priorities

| Day | Working increment | Exit criteria |
|---|---|---|
| 1 | Bootstrap client/server, env/config, Mongo connection, schemas, idempotent sample seeder, auth and role/ownership middleware, basic layouts/routes | Seed counts exactly 10 authors/18 books; authors can log in via documented dev setup; API protects role and ownership boundaries |
| 2 | Author dashboard, books/royalties, ticket create/list/detail, messages/status display; admin queue, filters, assignment/status, internal notes | Core author-to-admin conversation works through REST; internal notes never appear to author; validation/errors consistent |
| 3 | Socket.IO ticket/message/status updates; AI service adapter, KB retrieval, category/priority analysis and draft review UI; error/retry paths | Two sessions receive permitted live updates; AI failure leaves ticket workflow usable; draft is KB-grounded and requires human send |
| 4 | Polish UX/accessibility, seed/demo accounts, API docs, README, one-page technical approach, deployment config, manual regression and fixes | Fresh setup/deployment instructions work; all core flows demonstrated; known assumptions/limitations documented |

## Testing and acceptance checklist

The assignment does not request a testing method; prioritize a small automated API/service suite plus browser-level manual checks over broad low-value coverage.

- **Seed/data:** idempotent import; exactly 10 authors and 18 books; external IDs unique; nulls and totals match source; BK013/BK015 retain production status.
- **Auth/access:** valid/invalid login, inactive user, logout/session expiry, author cannot access another author’s ticket/book, admin global access, author cannot create internal note or assign/change admin fields.
- **Validation/errors:** missing/invalid fields, malformed IDs, unsupported status/category, oversized message, pagination/filter bounds, consistent error envelope and no stack/secret leaks.
- **Ticket lifecycle:** create with/without a book, list/detail, author/admin public replies, internal notes hidden from authors, status transitions, assignment/unassignment, correct last activity and queue filters.
- **AI:** all six configured categories accepted; invalid model output rejected; priority score maps consistently; KB citation IDs correspond to retrieved published content; no KB match yields no policy claim; timeout/429/provider outage retry path; manual override persists; draft never sends automatically.
- **Realtime:** authenticated room membership, author isolation, admins receive queue updates, note event admin-only, events follow successful writes, reconnect refetch recovers missed events.
- **Frontend:** separate author/admin layouts; loading/empty/error states; responsive queue/detail/conversation; status and priority accessible labels; session expiry returns to login.
- **Release:** clean install and seed from README, environment validation, production build, `/health`, CORS/cookie/HTTPS settings, deploy frontend/API/managed MongoDB, API docs match actual routes, no secrets committed.

## Documentation and deployment deliverables

`README.md` should cover prerequisites, environment variables, install/run/seed commands, local demo login setup, API docs, Socket.IO behavior, deployment steps, and known limitations. `docs/api.md` documents request/response schemas and authorization. `docs/technical-approach.md` should be one page covering modular-monolith rationale, ownership/security model, AI grounding/human review, real-time event flow, deployment, and trade-offs. Deployment should configure MongoDB URI, session/JWT secret, allowed frontend origin, admin seed credentials, and optional AI provider key from the host's secret manager; add health checks and TLS. Exact hosting provider is an open decision, so keep the first deployment provider-neutral.
