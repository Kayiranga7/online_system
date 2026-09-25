# IMIZI Garden Studio — Changes in this update

This covers the 5 items you asked about. Updated project: `imizi_2_fixed7.zip`
(node_modules were stripped out to keep the file small — run `npm install`
in both `frontend/` and `backend/` after unzipping).

---

## 1. Institutions now require an assigned employee + institution on every task

**Problem:** A manager could create a task without picking an institution or
an employee, leaving it floating with no owner and no one responsible for it.

**What changed:**
- `backend/src/controllers/taskController.js` — `createTask` now:
  - Rejects the request if `institutionId` or `assignToEmployeeId` is missing.
  - Confirms the institution exists, and (for managers) that it's in their
    own district.
  - Confirms the employee exists and is actually an employee, and (for
    managers) that they're in the same district — the same rule that was
    already enforced on the separate "assign" endpoint, now applied at
    creation time too.
  - Creates the task and assigns the employee in one step, instead of
    leaving it `unassigned`.
- `backend/src/routes/taskRoutes.js` — added validators so `institutionId`
  and `assignToEmployeeId` must be positive integers on `POST /tasks`.
- `frontend/src/pages/TasksPage.jsx` — the "Create task" form now has a
  required **Institution** dropdown (pulled from `GET /institutions?status=active`)
  alongside the required **Assign to** dropdown. Both are enforced as
  required fields; you can no longer submit the form without picking both.

The old "Assign…" dropdown in the tasks table still works, for handling any
tasks that were left unassigned before this change.

---

## 2. Fixed the "Verification failed" error on a link that actually worked

**Root cause:** In development, React 18's `StrictMode` intentionally runs
effects twice to help catch bugs. Your `VerifyEmailPage` called the
verify-email API inside a plain `useEffect`, so it fired the request twice.
The verification token is single-use — the first request verified the
account and cleared the token; the second request (fired a moment later)
found no matching token and reported "invalid or expired." That's exactly
the symptom: an error shown on screen, but the account was already verified,
so logging in worked immediately after.

**What changed (two layers of fix, so it's solid in both dev and production):**
- `frontend/src/pages/AuthExtras.jsx` — added a `ref` guard so the same
  token is only ever submitted once per page load, no matter how many times
  the effect itself runs.
- `backend/src/controllers/authController.js` — `verifyEmail` is now
  idempotent: if the *exact same link* is hit again shortly after a
  successful verification (this also covers corporate email-security
  scanners that "click" links before a person does), it now returns success
  instead of an error, rather than relying on the frontend fix alone.
- `backend/database/migrations/003_email_verification_idempotent.sql` — new
  migration adding a small `email_verification_last_token` column that
  remembers which token verified an account, so a repeat hit on the same
  link can be recognized as "already done" rather than "invalid."

**Action needed:** run the new migration against your database
(`node backend/database/migrate.js`, or apply
`003_email_verification_idempotent.sql` manually).

---

## 3. Profile / Dashboard / Sign out menu is now hover-only

**What changed:** `frontend/src/components/Navbar.jsx` — the user menu
used to open on **click**. It now opens on **hover** (mouse enters the
button or the menu) and closes shortly after the mouse leaves both. A short
150ms close delay was added so moving the cursor diagonally from the button
down into the dropdown doesn't cause it to snap shut on the way. Clicking a
link inside still closes the menu as before.

---

## 4. Home page now shows real plants and designs

**Problem:** The home page was text-only — a hero banner and four feature
cards with emoji, no actual photos of plants or garden designs.

**What changed:** `frontend/src/pages/LandingPage.jsx` now fetches a few
featured items straight from your existing catalogue:
- 4 recent plants (`GET /plants?limit=4&sort=newest`)
- 3 garden designs (`GET /designs?limit=3`)

...and displays them using the same `PlantCard` / `DesignCard` components
already used on the Plants and Designs pages, in two new sections ("Plants
ready for your garden" and "Garden designs to fall in love with"), each with
a "See all" link through to the full catalogue. Styling was added in
`frontend/src/pages/Landing.module.css` to match the existing design system
(same color tokens, card shadows, and spacing as the rest of the site).

If a plant or design doesn't have a photo uploaded yet, its card falls back
to the same placeholder the catalogue pages already use — no crash, just a
placeholder box.

---

## Files touched in this update

```
backend/src/controllers/taskController.js
backend/src/controllers/authController.js
backend/src/routes/taskRoutes.js
backend/database/migrations/003_email_verification_idempotent.sql   (new)
frontend/src/pages/TasksPage.jsx
frontend/src/pages/AuthExtras.jsx
frontend/src/components/Navbar.jsx
frontend/src/pages/LandingPage.jsx
frontend/src/pages/Landing.module.css
```

## Verified before packaging
- `cd backend && node -c <each changed file>` — syntax OK on all three.
- `cd frontend && npm run build` — production build completed with no
  errors (only the existing "chunk size" warning, unrelated to this change).

## Still worth a decision from you
Carried over from before: whether to remove the legacy direct MTN MoMo
checkout option now that Flutterwave covers MTN Mobile Money, Airtel Money,
cards, and bank transfer — or keep it as a simulated fallback. Not touched
in this update.
