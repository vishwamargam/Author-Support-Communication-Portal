# Separate portal deployment

The author and admin interfaces are separate Vite build targets. Deploy each as its own static site or frontend service; both connect to the same Express API, MongoDB database, and Socket.IO endpoint. The backend remains one service.

## Recommended URL layout

Use HTTPS sibling subdomains, for example:

- Author portal: `https://authors.example.com`
- Admin portal: `https://support.example.com`
- API and Socket.IO: `https://api.example.com`

The URLs are distinct origins, so the API must allow both frontend origins. Sibling subdomains are same-site for browser cookie policy; retain `COOKIE_SAME_SITE=lax` and keep cookies host-only on the API domain. If the sites are on unrelated registrable domains, configure `COOKIE_SAME_SITE=none` in production, but be aware that browser third-party-cookie restrictions can block cross-site cookie authentication. Prefer same-site subdomains.

## Static hosting

Create two frontend projects/services from the same repository and `client/` root directory:

| Setting | Author site | Admin site |
| --- | --- | --- |
| Install | `npm ci` | `npm ci` |
| Build | `npm run build:author` | `npm run build:admin` |
| Publish directory | `dist` | `dist` |
| Build variable | `VITE_API_URL=https://api.example.com/api/v1` | `VITE_API_URL=https://api.example.com/api/v1` |
| Optional socket variable | `VITE_SOCKET_URL=https://api.example.com` | `VITE_SOCKET_URL=https://api.example.com` |

Configure SPA fallback/rewrite behavior to serve `index.html` for application routes. Each build contains only its respective portal. The role prefix paths remain `/` for authors and `/admin` for admins, so existing links and refreshes work.

For a local production build from PowerShell:

```powershell
cd client
$env:VITE_API_URL = 'https://api.example.com/api/v1'
npm ci
npm run build:author
# Publish client/dist to the author site.
npm run build:admin
# Publish the newly generated client/dist to the admin site.
```

The second build overwrites `dist`; publish the first bundle before running the second, or build in separate clean checkouts/worktrees.

## Container hosting

Build a distinct frontend image for each URL from the `client/` directory. Pass the same public API values to both builds:

```powershell
docker build --build-arg PORTAL=author --build-arg VITE_API_URL=https://api.example.com/api/v1 --build-arg VITE_SOCKET_URL=https://api.example.com -t bookleaf-author-portal .
docker build --build-arg PORTAL=admin --build-arg VITE_API_URL=https://api.example.com/api/v1 --build-arg VITE_SOCKET_URL=https://api.example.com -t bookleaf-admin-portal .
```

Deploy the images as two frontend services on the author and admin domains. The backend image is built from the repository root with `docker build -f server/Dockerfile -t bookleaf-api .` and must use a host that supports Socket.IO/WebSocket upgrades.

## Backend settings and seed

Set backend platform secrets/configuration; do not put secrets in the frontend build or repository:

```text
NODE_ENV=production
MONGODB_URI=<managed MongoDB TLS URI>
JWT_SECRET=<random value of at least 32 characters>
CORS_ORIGIN=https://authors.example.com,https://support.example.com
COOKIE_SAME_SITE=lax
COOKIE_NAME=bookleaf_session
CSRF_COOKIE_NAME=bookleaf_csrf
ADMIN_COOKIE_NAME=bookleaf_admin_session
ADMIN_CSRF_COOKIE_NAME=bookleaf_admin_csrf
```

Also set the hosting platform's `PORT`, seed credentials, and optional backend-only Gemini settings (`AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL`); use `AI_PROVIDER=disabled` to disable live calls. The two frontends send `X-BookLeaf-Portal: author` or `admin`. The API uses that value to select the corresponding cookie and independently validates the signed session role and endpoint authorization. Author and admin cookies can coexist in the same browser profile. Logout clears only the current portal's session.

From the backend project directory (`server/`), run `npm run seed` once against the intended evaluation database. The operation is repeatable and imports the 10 authors and 18 books. Do not run seeding as a routine destructive deployment step because it resets demo account passwords to configured values.

## Verification checklist

1. Check `https://api.example.com/api/v1/health` returns HTTP 200 and connected database status.
2. Sign in to both deployed portal URLs in one browser profile and confirm both sessions remain active after refresh.
3. Verify the author sees only their books/tickets and can submit a ticket for an owned book.
4. Verify the admin queue receives the ticket, shows selected book context, and can assign, add a private note, and send a public response.
5. Confirm the author sees the public response but not the internal note.
6. Confirm Socket.IO works through the chosen host and WebSocket upgrade path. The UI continues to use REST and timed refresh if sockets are unavailable.
7. Run `npm test`, `npm run build:author`, and `npm run build:admin` before release.

This repository provides build/deployment configuration only. The live services must be deployed and smoke-tested in the chosen hosting accounts before deployment can be marked complete.
