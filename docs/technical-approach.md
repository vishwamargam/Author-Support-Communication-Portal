# Technical approach

## What was prioritized

The assignment was implemented around the user-visible support loop: an author can sign in, see only their own BookLeaf records, submit a ticket, and receive a public reply; an admin can find the ticket, triage it, add private working context, and respond. Authentication, author isolation, separation of public messages from internal notes, preservation of the supplied financial snapshot, and reliable manual support were prioritized before optional AI and realtime enhancements. The provided 10-author/18-book fixture is treated as source data: stable IDs, ownership links, nulls, zeroes, ISBNs, statuses, and royalty figures are imported rather than recomputed.

## Architecture decisions

The Express service is split into route, middleware, controller, service, model, AI, knowledge-base, realtime, and seed modules. Routes validate inputs and apply authentication/role checks; service functions contain the ticket workflow and are reused by API handlers. Mongoose schemas define enums, references, timestamps, and indexes. A ticket is separate from its conversation messages so each message has its sender and visibility. Internal notes use a distinct visibility value and are filtered from author REST responses and author socket rooms.

The React codebase produces separate author and admin builds, intended for different frontend URLs, over one credentialed Axios client. Each build sends a role hint; the backend issues separate HTTP-only author/admin session and CSRF cookies so signing in at one portal does not replace the other portal's session in the same browser. The server derives the author ID from the authenticated session. Mutation routes use a signed double-submit CSRF token. Exact CORS origins are allowlisted. Socket.IO authenticates the role-scoped cookie, authorizes room membership server-side, and sends small invalidation hints after persistence. REST remains authoritative; pages refetch on events/reconnect and poll when the socket is down.

## AI design

AI runs only in the backend and is optional. The official Google GenAI SDK is behind the existing provider adapter, selected with `AI_PROVIDER=gemini` or disabled explicitly; `GEMINI_MODEL` remains configurable. Classification uses a structured schema for exactly one of six categories and four priorities. Priority instructions consider impact, urgency, and duration and avoid defaulting every complaint to Critical. Author content is explicitly untrusted and separated from system rules and approved policy. Draft generation uses a separate prompt with a small set of relevant articles from the maintained Knowledge Base. Drafts are validated, cached, editable, and never sent without an admin action.

The model cannot assert an account-specific payout date, investigation result, escalation, reprint, or operational action without verified application data. When those facts are missing, it asks staff to verify. Provider errors, malformed output, timeouts, missing configuration, quota exhaustion, and rate limits leave ticket work available; manual author replies remain possible.

## Cost and reliability trade-offs

Timeouts, bounded output tokens, no automatic retries, selective policy context, and draft caching limit unnecessary provider cost. Tests inject a mock provider and do not require paid credentials. The current best-effort classifier is scheduled in-process after ticket persistence: this keeps assignment code small but work can be lost on a crash. The current Socket.IO rooms are process-local, so deployment is intended for a single backend instance. The frontend also refreshes through REST and falls back to 15-second polling during a socket outage.

## Production evolution

For evaluation, deploy a single backend instance, two separately built React static sites (author and admin), HTTPS, and managed MongoDB with restricted credentials and backups. Use sibling subdomains for author, admin, and API where possible; this keeps credentialed cookies same-site while still allowing separate origins. Put all secrets in the host secret manager and seed a dedicated demo database once. For a multi-instance service, introduce a durable job queue/outbox for classification and a shared Socket.IO adapter, plus compatible WebSocket routing. Add monitoring, tracing, rate-limit storage shared across instances, account password recovery/rotation, attachment upload with scanning and object storage, accessibility/browser E2E checks, audit retention rules, and tested backup restoration before broad production use.
