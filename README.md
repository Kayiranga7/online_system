# IMIZI — Garden & Landscape Studio

A full-stack e-commerce and workforce-management platform for a garden design and
plant retail business operating across Rwanda's districts. Built from the IMIZI
project specification, with the role-based architecture (Admin / Manager / Employee
/ Customer), the four functional modules, and several proposed additions to make it
a genuinely usable system end-to-end.

**Stack:** React 18 + Vite (frontend) · Node.js/Express (backend) · MySQL 8 (database) · Socket.IO (real-time) · MTN Mobile Money (Rwanda)

---

## 1. What's implemented

### Module 1 — User & Authentication
- Email/password registration with mandatory district + institution type (personal/business)
- Email verification (24h token), bcrypt password hashing (12 rounds)
- JWT access tokens (15 min) + httpOnly rotating refresh tokens (7 days)
- Google OAuth sign-in (`google-auth-library` + Google Identity Services), with a **Continue with Google** button and first-time profile completion (district/institution type)
- Auth0 single sign-on (`@auth0/auth0-react`), JWKS-verified access tokens, linked to the same `users` row and app session
- TOTP-based Two-Factor Authentication (`speakeasy` + QR code), with backup codes
- Forgot/reset password flow, account lockout after 5 failed logins (15 min)
- Full RBAC middleware (`authenticate`, `authorize(...roles)`, `scopeToDistrict`)
- Admin creates Managers; Manager/Admin create Employees (auto-approved by creator)
- Audit log table recording every sensitive action (login, order, status change, etc.)

### Module 2 — E-Commerce (Plants & Designs)
- Full plant & garden-design catalogue: search (MySQL FULLTEXT), filters (sunlight,
  water needs, care difficulty, price, style), sorting, pagination
- Cart, wishlist, reviews (with verified-purchase detection tied to delivered orders)
- Order placement with transactional stock decrement, 18% VAT, delivery fee calculation
- Order status state machine: `pending_payment → paid → processing → assigned →
  in_progress → delivered/installed → completed` (or `cancelled` at early stages)
- **MTN Mobile Money** — Collections API Request-to-Pay and status polling, plus a
  one-time provisioning script (`scripts/provision-momo.js`). Checkout currently
  supports this provider only. Local payment simulation requires an explicit opt-in;
  it is disabled in production.
- Rule-based fraud-scoring service flags suspicious payments for Admin review
- Rule-based "AI" plant recommendation engine (climate/district + stated preferences)

### AR / 3D preview
- Plant and design detail pages render a "View in 3D / AR" button when an item has
  an attached `.glb`/`.gltf` model, using Google's open-source `<model-viewer>` web
  component (no API keys needed). On mobile, the built-in "View in your space" button
  launches iOS Quick Look / Android Scene Viewer automatically.
- The `model-viewer` library (~1MB) is dynamically imported only when a user opens
  the AR panel, so it doesn't bloat the main app bundle (confirmed via build: main
  chunk stays at ~760KB, model-viewer ships as a separate on-demand chunk).
- Admins attach images and AR models per item via a `MediaManager` panel on
  `/admin/plants` (Catalog management), which uploads through the same storage
  abstraction used everywhere else.

### File storage
- `storageService.js` abstracts uploads behind one interface: local disk by default
  (zero-config), or any S3-compatible object storage (AWS S3, Cloudflare R2,
  DigitalOcean Spaces, MinIO) the moment `S3_BUCKET` is set in `.env`. No controller
  or route code changes when switching backends.

### Module 3 — Institution & Workforce
- Institution registration (personal gardens / business sites) with Manager/Admin approval
- Task creation, assignment, and completion with work reports + photo attachments
- Equipment inventory with checkout/check-in tracking and condition notes
- Employee transfer requests (district or institution) with Manager/Admin review
- Shift scheduling and GPS-stamped attendance check-in/out

### Module 4 — Operations & Notifications
- Real-time in-app notifications via Socket.IO (per-user and per-role rooms)
- Email notifications through a transactional provider API (Resend) or any SMTP
  relay, queued in the `email_queue` table for retry/audit
- Escalation/dispute system routed to Manager + Admin
- Role-specific dashboard with KPIs (admin: revenue & district breakdown chart;
  manager: district orders/tasks/employees; employee: active/completed tasks;
  customer: orders & wishlist)

### Proposed additions beyond the spec
- **Persistent audit trail** (`audit_logs`) for every state-changing action
- **Rule-based fraud detection** on payments (explainable score + reasons, not a black box)
- **18% VAT calculation** matching Rwandan tax convention
- **Soft deletes** on users/plants/designs (never lose history)
- **Rate limiting** tiers (general API / auth endpoints / payment endpoints)
- **Socket.IO real-time layer** for instant notification delivery, not just polling
- **AR/3D preview** for plants and designs via `<model-viewer>`, with an admin upload UI
- **Storage backend abstraction** so the app runs zero-config locally but switches to
  S3-compatible object storage in production by setting one env var
- **Seed data** with realistic Rwandan context (real districts, locally-relevant plants
  like Jacaranda, Bougainvillea, Hibiscus; demo accounts for every role)

---

## 2. Project structure

```
imizi/
├── backend/
│   ├── src/
│   │   ├── config/        # database pool, logger, upload config
│   │   ├── controllers/   # one per resource (auth, orders, payments, tasks, …)
│   │   ├── middleware/    # auth/RBAC, rate limiting, validation, error handling
│   │   ├── routes/        # Express routers, wired in app.js
│   │   ├── services/      # email, notifications, audit, fraud scoring
│   │   ├── utils/         # JWT helpers, order-number generator
│   │   └── validators/    # express-validator chains
│   ├── database/
│   │   ├── migrations/001_schema.sql   # full schema, 4 modules
│   │   ├── seeds/002_seed.sql          # districts, demo users, plants, designs
│   │   ├── migrate.js / seed.js        # runner scripts
│   ├── scripts/
│   │   └── provision-momo.js           # one-time MTN MoMo sandbox setup
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/    # Navbar, cards, modals, shared UI
    │   ├── context/       # Auth, Cart, Notifications (React context)
    │   ├── pages/         # one per route
    │   ├── services/      # axios client w/ auto token refresh
    │   └── styles/tokens.css   # design system (colors, type, spacing)
    ├── vite.config.js     # dev proxy to backend
    └── package.json
```

---

## 3. Setup

### Prerequisites
- Node.js 18+
- MySQL 8+
- (Optional) MTN MoMo sandbox credentials for real payment-request testing

### Backend

```bash
cd backend
npm install
cp .env.example .env        # then fill in DB credentials, JWT secrets, etc.
npm run migrate             # creates imizi_db and all tables
npm run seed                # demo districts, users, plants, designs, equipment
npm run dev                 # starts on http://localhost:5000
```

Minimum `.env` values to get running locally:
```
DB_HOST=localhost
DB_USER=imizi_user
DB_PASSWORD=your_password
DB_NAME=imizi_db
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48>
```
Google OAuth and email are optional for local testing — the app degrades gracefully
(emails log to the console instead of sending when no email provider is configured;
the Google button stays hidden unless `VITE_GOOGLE_CLIENT_ID` is set, and the login
route returns 401 without `GOOGLE_CLIENT_ID`).

**Email:** `EMAIL_PROVIDER` picks the transport — `resend` (a transactional
provider's HTTPS API, the production path) or `smtp` (any relay through Nodemailer:
`smtp.resend.com`, `smtp.postmarkapp.com`, a self-hosted server, or a capture tool
like Mailtrap for staging). Leave it unset to infer the transport from whichever
credentials are present. For production sending:

1. Create a [Resend](https://resend.com) API key and set `RESEND_API_KEY` (free tier:
   3,000 emails/month, 100/day)
2. Add a sending domain in Resend and publish the SPF/DKIM records it shows you
3. Set `EMAIL_FROM` to an address on that verified domain — until then
   `onboarding@resend.dev` only delivers to your own Resend account address

The transport is verified at startup (Resend: key accepted + which domains are
verified; SMTP: connection and credentials) with a 5-6s timeout, so a misconfigured
provider logs a warning rather than hanging the server. Sending through a personal
Gmail mailbox is supported via `EMAIL_PROVIDER=smtp` for local testing only.

**Retrying failures:** sending happens in the background, so `/admin/emails` (Admin)
shows the queue - with counts taken over the whole table, so failures stay visible
while the list is filtered - and can re-send them (`POST /api/emails/retry` for the
batch, `POST /api/emails/:id/retry` for one row; `{ "dryRun": true }` returns the plan
without sending). The same logic runs headlessly:

```bash
cd backend
node scripts/retry-failed-emails.js             # dry run - shows what would be re-sent
node scripts/retry-failed-emails.js --apply     # actually re-send
```

Verification and password-reset links are single-use, so a row whose link has expired
or already been used is skipped rather than re-sending a dead link; everything else
(order, KYC, task and transfer notices) has no expiring link and is retried. A run is
refused outright when no provider is configured, because delivery would be a no-op
while the rows were marked `sent`. Retrying updates the original row - attempts counts
failed deliveries - so a row that succeeds on retry reads as "sent, after 1 failure".

**Payments:** Checkout supports MTN MoMo. To exercise the local simulated flow, set
`PAYMENTS_SIMULATION_ENABLED=true` with `NODE_ENV=development` or `test`. Production
always requires MTN MoMo credentials and never marks an order paid through simulation.
For real sandbox requests, subscribe to "Collections" at
[momodeveloper.mtn.com](https://momodeveloper.mtn.com), set `MTN_MOMO_SUBSCRIPTION_KEY`,
then run `node scripts/provision-momo.js` to generate `MTN_MOMO_API_USER` and
`MTN_MOMO_API_KEY`. Stripe, PayPal, and Flutterwave are not currently implemented by
the backend and are not offered at checkout.

**File storage** uses local disk by default. To use S3-compatible object storage
instead, set `S3_BUCKET` (and `S3_ENDPOINT` for non-AWS providers like Cloudflare R2
or DigitalOcean Spaces) — see `.env.example` for the full list of `S3_*` variables.

### Frontend

```bash
cd frontend
npm install
npm run dev                 # starts on http://localhost:5173, proxies /api to :5000
```

### Google sign-in (optional)

The login and register pages show a **Continue with Google** button when
`VITE_GOOGLE_CLIENT_ID` is set at build time. Google Identity Services returns a
signed ID token, which the SPA posts to `POST /api/auth/google`; the API verifies
it against `GOOGLE_CLIENT_ID` and issues the app's normal session. First-time
users pick a district and account type in a modal before the account is created.
No npm package is added — Google's script is fetched on demand and only on the
auth screens.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   create an **OAuth client ID** of type **Web application**.
2. Under **Authorized JavaScript origins** add every origin the site runs on
   (`http://localhost:5173`, `https://<site>`). No redirect URI is used.
3. Set the same client id on both sides.

   Backend `.env`:
   ```
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

   Frontend `.env.local` (inlined by `vite build`, so set it where you build):
   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

Only Google-verified addresses are accepted: a first-time sign-in with an
unverified Google email is refused, and an existing account is linked only when
Google marks the address as verified.

With either value missing the button is not rendered and password/Auth0 login are
unchanged. The client secret is not used by this flow — the API verifies the ID
token's signature against Google's keys.

### Auth0 sign-in (optional)

Password login works without any of this. To turn on the **Continue with Auth0**
buttons:

1. In the Auth0 Dashboard create an application of type **Single Page Web
   Applications** (the PKCE flow needs no client secret).
2. Create an **API** whose Identifier is the audience the backend validates
   (e.g. `https://api.imizi.rw`) and enable **Allow Offline Access** on it.
3. On the SPA application register:
   - Allowed Callback URLs: `http://localhost:5173/callback`, `https://<site>/callback`
   - Allowed Logout URLs: `http://localhost:5173`, `https://<site>`
   - Allowed Web Origins: the same two origins
4. Set the environment variables.

   Backend `.env`:
   ```
   AUTH0_DOMAIN=your-tenant.eu.auth0.com     # no https:// and no trailing slash
   AUTH0_API_AUDIENCE=https://api.imizi.rw   # the API Identifier, not the client id
   ```

   Frontend `.env.local` (inlined by `vite build`, so set it where you build):
   ```
   VITE_AUTH0_DOMAIN=your-tenant.eu.auth0.com
   VITE_AUTH0_CLIENT_ID=<the SPA application client id>
   VITE_AUTH0_AUDIENCE=https://api.imizi.rw
   ```
5. Run `npm run migrate` so `007_auth0.sql` adds `users.auth0_id`.

How it works: the SPA runs Authorization Code + PKCE, then posts the access token
to `POST /api/auth/auth0`. The API verifies signature, issuer and audience against
the tenant's JWKS, reads the profile from `/userinfo`, links it to the matching
`users` row (only when Auth0 reports the email as verified) and issues the app's
normal access/refresh pair - so roles, KYC and the rest are unchanged. First-time
Auth0 users choose a district and account type; accounts with local 2FA still have
to enter their code.

### Demo accounts (after seeding)
All use password: **`Passw0rd!23`**

| Role     | Email                |
|----------|----------------------|
| Admin    | admin@imizi.rw       |
| Manager  | manager@imizi.rw     |
| Employee | employee@imizi.rw    |
| Customer | customer@imizi.rw    |

---

## 4. Verification status

The current CI workflow checks frontend assets and builds the frontend. Backend
controller tests run in CI for payment simulation behavior and KYC access controls.
Real payment-provider and full live-MySQL checkout verification require external
credentials and a configured database; this repository does not claim those flows
have been exercised in this environment.


---

## 5. Deploying

The frontend is a static bundle and the backend is a long-running Node process
with a MySQL connection and a Socket.IO server, so they are deployed separately:
the frontend to any static host, the backend to a host that keeps a process
alive (Render, Railway, Fly, a VPS).

Three settings cause almost every "it works locally but not deployed" failure:

1. **`VITE_API_URL` must be set before the frontend build.** It is inlined at
   build time, so set it in the static host's build environment and redeploy
   after changing it. Use the API origin only (`https://api.example.com`) -
   `/api` is appended by the app, and a trailing slash or an existing `/api`
   suffix is normalized away. Without it the bundle calls `/api` on the static
   host itself, which answers with `index.html`, so the app fails with JSON
   parse errors and 404s.
2. **`CLIENT_URL` on the backend must be the exact deployed frontend origin.**
   A mismatch (wrong scheme, `www.`, a trailing slash, a preview URL instead of
   the production one) blocks every browser request with a CORS error. Set it in
   the backend host's environment, not `.env`, and comma-separate several
   origins if staging and production share a backend.
3. **The refresh cookie must be allowed to travel.** It is `httpOnly`, so it is
   the only thing keeping a user signed in after a reload. Same site (one
   origin, or `app.example.com` + `api.example.com`) needs `COOKIE_SAMESITE=lax`;
   different sites (`app.vercel.app` + `api.onrender.com`) need
   `COOKIE_SAMESITE=none` **and** `COOKIE_SECURE=true` over HTTPS. Get this wrong
   and every reload silently logs the user out. The backend logs the effective
   `sameSite`/`secure` values and the allowed origins at boot so this is checkable
   from the deploy log.

Also required on the backend: `NODE_ENV=production`, the `DB_*` variables for a
reachable MySQL instance, both `JWT_*` secrets, and `npm run migrate` against
that database (the schema is not created by the app). `PORT` is read from the
environment, which most hosts set automatically.

### Railway (backend + database) + Vercel (frontend)

Backend variables on Railway:

```
NODE_ENV=production
CLIENT_URL=https://<your-app>.vercel.app     # exact origin, no trailing slash
COOKIE_SAMESITE=none                          # the two hosts are different sites
COOKIE_SECURE=true
DB_HOST=${{MySQL.MYSQLHOST}}                   # Railway reference variables, or
DB_PORT=${{MySQL.MYSQLPORT}}                   # the values shown on the MySQL
DB_USER=${{MySQL.MYSQLUSER}}                   # service's Variables tab
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
JWT_ACCESS_SECRET=<openssl rand -base64 64>
JWT_REFRESH_SECRET=<openssl rand -base64 64>
```

`COOKIE_SAMESITE=none` is what makes the refresh cookie travel between the two
domains; without it the browser withholds it and every reload logs the user out.
The backend prints `Refresh cookie: sameSite=… secure=…` at boot - if it says
`lax` on a two-domain deployment, the variable did not reach the service.

Note that `SameSite=None` cookies are *third-party* cookies: Safari blocks them
by default, and Chrome is progressively restricting them. Serving the API under
the same site as the frontend (a custom domain such as `api.example.com` with
the app on `example.com`, or proxying `/api` through the frontend host) avoids
that class of failure entirely, because the cookie becomes first-party.

**Uploads do not survive a deploy by default.** The container filesystem is
rebuilt on every release, so files written there disappear and the database is
left pointing at images that no longer exist (they 404 even once the URL is
correct). Either attach a Railway volume - the app picks up
`RAILWAY_VOLUME_MOUNT_PATH` automatically, or set `UPLOAD_DIR` to the mount path
- or configure object storage by setting `S3_BUCKET` plus `S3_ENDPOINT`,
`S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` for any S3-compatible
provider (Cloudflare R2, Backblaze B2, DigitalOcean Spaces, AWS S3). The backend
logs the resolved uploads directory at boot and warns when it is ephemeral.
Files already uploaded from a local machine are not in the deployed environment.
`scripts/migrate-uploads.js` moves them: it reads `backend/uploads`, stores each
file through the same storage layer the app writes with (so S3-compatible
credentials or the volume path decide the destination), and repoints the rows
that reference them. It is a dry run unless you pass `--apply`:

```
node scripts/migrate-uploads.js                 # what would be copied/rewritten
node scripts/migrate-uploads.js --apply         # copy + rewrite
node scripts/migrate-uploads.js --apply --verify  # also read every file back
```

Run it where the files and the destination are both reachable — on the server
for a volume (`UPLOAD_DIR` = mount path), or locally with the bucket's
credentials. It never deletes the source, is safe to re-run, and leaves KYC
rows alone because they store a storage key rather than a URL. Anything not
referenced by a row is still copied, and `--only=`/`--limit=` make a partial run
possible.

## 6. Known gaps / production setup

- **Payment verification** requires MTN sandbox or production credentials to exercise
  provider calls. Local simulation is development-only and must be explicitly enabled.
- **AR assets**: the viewer renders any valid `.glb`/`.gltf` URL, but no real plant/
  garden 3D models ship with the seed data (a stand-in placeholder model wasn't
  bundled either, to avoid shipping irrelevant demo content). Admins attach real
  assets via the Catalog management page once available.
- **Email delivery** is coded against Resend's HTTPS API (with any SMTP relay as an
  alternative transport), but was only exercised against a stubbed API in this
  environment — real delivery needs a Resend API key and a verified sending domain.
  Unconfigured it logs to the console, and a bad key or unreachable SMTP host times
  out (~5-6s) rather than hanging startup.
- **S3 storage** is coded against the AWS SDK v3 client and works with any
  S3-compatible provider, but wasn't tested against a live bucket in this
  environment — local disk storage was verified end-to-end instead.
- **Auth0** is wired end to end but has only been exercised against a mocked tenant
  in tests. A live tenant needs the callback/logout/web-origin URLs and the five
  variables documented above; until then the buttons are hidden and the endpoint
  answers 503.
- **KYC storage** must use a private S3 bucket policy in production. KYC objects are
  stored without public URLs and downloaded through an authenticated, district-scoped
  endpoint; keep the bucket itself private so bucket policies cannot bypass the app.
- The rule-based fraud scorer and plant recommender are intentionally simple/explainable
  v1s; both are isolated in `services/` so they can be replaced with ML models later
  without touching controllers.
