# BookLeaf QA plan and execution record

## Priorities

| Priority | Coverage | Automated checks |
| --- | --- | --- |
| P0 | Authentication, role-scoped session cookies, logout/CSRF, roles, author isolation, private ticket data | `server/test/auth.integration.test.js`; `server/test/realtime.integration.test.js` |
| P0 | Exact supplied seed fidelity, stable IDs/relationships, password hashing, repeatability | `server/test/seed.integration.test.js` against an ephemeral MongoDB |
| P0 | Ticket validation, book ownership, general tickets, author replies, admin notes, public replies | Auth and workflow integration tests |
| P1 | Queue filters/search/sort/pagination, assignment, category/priority/status changes, audit metadata | Auth integration workflow tests |
| P1 | Six AI categories, all priorities, malformed output, provider failures, cached drafts and manual fallback | Mock provider tests in `auth.integration.test.js`; no live key required |
| P1 | Socket authentication, room authorization, private note delivery, public message delivery, reconnect/rejoin | `server/test/realtime.integration.test.js` |
| P1 | API error shape, health, zero/null data, frontend duplicate-event handling | API integration tests and `client/test/realtimeEventDeduper.test.js` |
| P1 | Input bounds/unknown fields, escaped queue search, secret placement, and environment validation | Request validation tests plus source/config review |
| P2 | Browser-level visual states, keyboard/accessibility, cross-browser cookies, live Mongo/production hosting | Manual or browser/E2E checks; not configured in this repository |

## Execution record

Executed 2026-10-22 in the repository environment:

- `cd server; npm test` — passed: 24 tests, including ephemeral MongoDB seed twice, exact source field comparisons, and a Socket.IO reconnect test.
- `cd client; npm test` — passed: 2 event deduplication tests.
- `cd client; npm run build` — passed. Vite emitted two non-fatal `use client` directive warnings from React Router dependency modules.
- AI provider tests use injected mocks. No OpenAI credential or paid API request is required.

## Separate portal deployment verification (2026-10-23)

- `cd server; npm test` â€” passed: 26 tests, including author/admin sessions coexisting in one cookie jar, portal-role mismatch rejection, role-scoped logout, authorization, Socket.IO, and seed checks.
- `cd client; npm test` â€” passed: 2 tests.
- `cd client; npm run build:author` â€” passed.
- `cd client; npm run build:admin` â€” passed.
- Live hosting was not tested. Configure both deployed origins in backend `CORS_ORIGIN` and follow [docs/deployment.md](docs/deployment.md).

Not executed: browser-driven end-to-end tests for rendered loading/empty/network-error states, manual cross-browser/two-window workflow, and deployment against a separately managed production MongoDB. The project has no browser automation dependency or configured production target. API health was exercised while the integration test held an ephemeral MongoDB connection.

## Reproduction commands (PowerShell)

```powershell
cd server
npm test

cd ..\client
npm test
npm run build
npm run build:author
npm run build:admin
```

Seed-specific checks are included in `npm test`; the test injects local demo credentials and an ephemeral database. To manually run the seed against a development database, configure `server/.env` from `server/.env.example`, then run `cd server; npm run seed`. Verify with `mongosh`:

```javascript
use bookleaf_author_support
db.users.countDocuments({ role: "author" }) // 10
db.books.countDocuments()                    // 18
db.users.findOne({ _id: "AUTH001" })         // stable author ID
db.books.findOne({ _id: "BK001" })           // stable book ID and AUTH001 relationship
```

For a live local API, use `cd server; npm run dev` and request `http://localhost:4000/api/v1/health`; expected JSON reports `status: "ok"` and `database: "connected"`. Keep OpenAI values unset for ordinary tests; never place the backend key in a `VITE_` variable.
