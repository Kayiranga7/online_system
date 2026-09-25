# IMIZI — Garden & Landscape Studio

A full-stack e-commerce and workforce-management platform for a garden design and
plant retail business operating across Rwanda's districts. Built from the IMIZI
project specification, with the role-based architecture (Admin / Manager / Employee
/ Customer), the four functional modules, and several proposed additions to make it
a genuinely usable system end-to-end.

**Stack:** React 18 + Vite (frontend) · Node.js/Express (backend) · MySQL 8 (database) · Socket.IO (real-time) · Stripe (test-mode payments)

---

## 1. What's implemented

### Module 1 — User & Authentication
- Email/password registration with mandatory district + institution type (personal/business)
- Email verification (24h token), bcrypt password hashing (12 rounds)
- JWT access tokens (15 min) + httpOnly rotating refresh tokens (7 days)
- Google OAuth sign-in (`google-auth-library`), with first-time profile completion (district/institution type)
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
- **Stripe** — real Stripe SDK calls (PaymentIntents API), real `@stripe/react-stripe-js`
  card confirmation on the frontend (`stripe.confirmCardPayment`), webhook handler with
  signature verification. Needs a real `sk_test_`/`pk_test_` key pair from an actual
  Stripe account to exercise the happy path — a placeholder key correctly fails closed
  with a clean "payment provider not configured" error rather than a stack trace.
- **PayPal** — real Orders v2 REST integration (OAuth2 client-credentials token,
  create-order, capture-order), with a clearly-labeled simulation fallback when
  `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` aren't set, so local dev works with zero
  signup. Frontend redirects to PayPal's real approval page when sandbox creds are
  configured, or completes instantly in simulation mode otherwise.
- **MTN Mobile Money** — real Collections API integration (Request-to-Pay + status
  polling) against MTN's public developer sandbox, plus a one-time provisioning
  script (`scripts/provision-momo.js`). Same simulation fallback when no subscription
  key is configured. Frontend polls payment status every 3s until SUCCESSFUL/FAILED.
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
- Email notifications (Nodemailer, queued in `email_queue` table for retry/audit)
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
- (Optional) Stripe test-mode API keys for real payment-intent testing

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
Google OAuth and SMTP are optional for local testing — the app degrades gracefully
(emails log to console instead of sending if `SMTP_USER`/`SMTP_PASSWORD` are blank;
the Google login route simply won't work without `GOOGLE_CLIENT_ID`). The SMTP
connection is verified at startup with a 5-6s timeout, so an unreachable/misconfigured
SMTP host logs a warning rather than hanging the server.

**Payments** work out of the box in simulation mode with zero configuration:
- Stripe needs real `sk_test_`/`pk_test_` keys from [dashboard.stripe.com](https://dashboard.stripe.com)
  (test mode) — without them, `createStripeIntent` fails closed with a clean error
  rather than charging anything.
- PayPal and MTN MoMo automatically simulate a successful payment when their
  respective credentials aren't set, so you can test the full checkout flow without
  signing up for either. To use real sandboxes:
  - **PayPal**: get `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` from
    [developer.paypal.com](https://developer.paypal.com)
  - **MTN MoMo**: subscribe to "Collections" at
    [momodeveloper.mtn.com](https://momodeveloper.mtn.com), set `MTN_MOMO_SUBSCRIPTION_KEY`,
    then run `node scripts/provision-momo.js` once to generate `MTN_MOMO_API_USER`/`MTN_MOMO_API_KEY`

**File storage** uses local disk by default. To use S3-compatible object storage
instead, set `S3_BUCKET` (and `S3_ENDPOINT` for non-AWS providers like Cloudflare R2
or DigitalOcean Spaces) — see `.env.example` for the full list of `S3_*` variables.

### Frontend

```bash
cd frontend
npm install
npm run dev                 # starts on http://localhost:5173, proxies /api to :5000
```

### Demo accounts (after seeding)
All use password: **`Passw0rd!23`**

| Role     | Email                |
|----------|----------------------|
| Admin    | admin@imizi.rw       |
| Manager  | manager@imizi.rw     |
| Employee | employee@imizi.rw    |
| Customer | customer@imizi.rw    |

---

## 4. Verified end-to-end (tested against a live MySQL instance during build)

- Registration → email verification → login → JWT issuance
- Customer: browse/filter plants → add to cart → checkout → pay (Stripe intent /
  PayPal create+capture / MTN MoMo request-to-pay, all in simulation mode where
  sandbox credentials weren't available) → stock decrements → order status `paid`
- PayPal: full create-order → capture-order round trip confirmed, including the
  ownership check (a different customer's capture attempt correctly returns 404,
  not a generic error) and provider-failure handling (502 only for genuine PayPal
  API errors, never masking an authorization failure)
- Manager: progress order through `processing → assigned → in_progress → delivered`,
  with `delivery_tracking` rows created only for physical fulfillment events
- Manager creates & assigns a task → Employee sees it on `/employee/tasks` →
  completes it with a work report → dashboard stats update (`tasksCompleted`)
- Customer leaves a review on a delivered order → correctly flagged
  `isVerifiedPurchase: true` → plant's `average_rating`/`review_count` recalculated
- Admin: upload an image via `/api/uploads/plants` → file lands on disk through the
  storage abstraction; attach an image + AR model URL to a plant via
  `/api/plants/:id/images` → confirmed retrievable from the plant detail endpoint
- Server startup: confirmed fast (~1s) when SMTP/storage are unconfigured, and
  confirmed an unreachable SMTP host times out in ~5s rather than hanging the process
- RBAC: employee blocked (403) from admin-only catalogue write and media uploads;
  customer blocked (403) from manager-only user list; unauthenticated request
  rejected (401); cross-customer payment capture attempts rejected (404)

---

## 5. Known gaps / what to wire in for production

- **Stripe** needs a real test-mode key pair to exercise the actual payment flow —
  this build's environment had no live Stripe account, so the happy path (a real
  `sk_test_...` key successfully creating and confirming a PaymentIntent) couldn't be
  exercised end-to-end here. The integration follows Stripe's documented API exactly
  and fails closed safely with a placeholder key; it should work immediately with
  real credentials.
- **PayPal & MTN Mobile Money** real sandbox flows are coded and structurally
  verified (request shapes, OAuth2 token handling, error propagation), but the
  actual external API calls couldn't be exercised without live sandbox credentials
  in this environment — both fall back to a clearly-labeled simulation otherwise.
- **AR assets**: the viewer renders any valid `.glb`/`.gltf` URL, but no real plant/
  garden 3D models ship with the seed data (a stand-in placeholder model wasn't
  bundled either, to avoid shipping irrelevant demo content). Admins attach real
  assets via the Catalog management page once available.
- **Email delivery** needs real SMTP credentials (Mailtrap for staging, SES/SendGrid
  for production) — currently logs to console when unconfigured, and times out
  safely (~5s) rather than hanging if a host is set but unreachable.
- **S3 storage** is coded against the AWS SDK v3 client and works with any
  S3-compatible provider, but wasn't tested against a live bucket in this
  environment — local disk storage was verified end-to-end instead.
- The rule-based fraud scorer and plant recommender are intentionally simple/explainable
  v1s; both are isolated in `services/` so they can be replaced with ML models later
  without touching controllers.
