---
name: onya-health-plans
description: Living execution plan, validation log, and repository map for Onya Health.
version: 1.0.0
---

# PLANS.md - Onya Health Execution Plan

This is a living document. Keep it accurate enough that a new Codex session can resume from this file plus the current working tree.

## How To Use This File

For substantial work:

1. State assumptions.
2. Break work into milestones.
3. Define verification for each milestone.
4. Update progress after completed steps.
5. Record decisions that change scope, architecture, or compliance posture.

Do not turn this into a full changelog. Use `.agents/fixes-log.md` for incident/fix history.

## Current Objective

Stabilize the Onya Health launch surface: public medical-certificate pages, booking and pricing, patient auth/account creation, doctor portal access, patient portal messaging, privacy copy, SEO crawlability, and nutrition meal-plan safety.

Current implementation state:

- Vite + React + TypeScript frontend in `frontend/`.
- Node/Vercel API entrypoint in `api/index.js`.
- Local Node backend wrapper in `backend/server.js`.
- Primary public web origin is `https://supadoc.com.au`; Onya Health mail remains on
  the existing Onya Health domain until explicitly migrated.
- Doctor portal static pages under `frontend/public/doctor`.
- Patient portal in `frontend/src/pages/PatientPortalPage.tsx`.
- Patient-entered clinical history and private test-result attachments are persisted through
  `patient_clinical_profiles` and the private `patient-medical-records` storage bucket.
- Approved doctors can search patients by name at `/doctor/patients`, review previous
  certificate requests, filter by submission date and certificate duration, and inspect
  patient-shared clinical records.
- Stripe Checkout uses Supadoc session branding, a solid primary-blue summary panel, and the
  Supadoc favicon for its compact header and product imagery. Canonical
  prices are `$11.21` for 1 day, linear through `$29.71` at day 5, capped through day 7,
  `$4.95` for a carer certificate, and `$19.00` monthly for All Access.
- Doctors can edit the default clinical certificate statement and regenerate the PDF
  preview repeatedly before approval; only the approved wording is persisted.
- Approved portal users can send a certificate-thread update as either the authenticated
  doctor or the fixed `Customer support` identity. Both remain visible to the doctor and
  patient, while the authenticated account remains in the server audit event.
- Booking flow in `frontend/src/consult-flow`.
- Weight-loss reset and meal planning in `frontend/src/weight-loss-reset`.
- Supabase migrations and helper scripts under `supabase/` and `scripts/`.
- Public SEO artifacts in `frontend/public/robots.txt` and `frontend/public/sitemap.xml`.

## Active Bug Batch

Source folder: `/Users/nicolasvanhoorick/Desktop/Private & Shared/Website Bugs/`

Reports in scope:

- Dietitian portal produces unsafe/unrealistic meal plans.
- Update Privacy Policy with patient-record retention period.
- High priority site content not readable/crawlable by search tools.
- Fix patient portal auth, password reset, and account creation failures.
- Header copy compliance risk: remove instant-certificate wording on `/doctor`.
- Doctor portal password reset email is not sending.
- Patient portal logs user out after messaging doctor.
- Add carer's certificate add-on details step.
- Update carer's certificate pricing.
- Update Stripe pricing.
- Create doctor account for end-to-end certificate testing with admin approval.

## Assumptions

- Brand spelling in product code/docs is `Onya Health`; user shorthand `Anya` refers to this repository.
- Public medical-certificate copy must be conservative and reviewed before launch.
- Stripe live price-object changes may require external dashboard/API credentials; code can enforce display and checkout amount consistency where prices are calculated locally.
- Production email delivery depends on configured provider credentials; local verification may use mock outbox.
- Real doctor account creation may require environment/DB access and should not bypass admin approval.

## Milestones

### M1 - Documentation Baseline

Status: completed on 2026-06-29.

Deliverables:

- `AGENTS.md`
- `SKILL.md`
- `SKILLS.md`
- `PLANS.md`
- `DESIGN.md`
- `backend/README.md`
- duplicate copied markdown stubs pointing to canonical docs where needed

Verification:

- Docs describe current Onya architecture, commands, safety boundaries, and bug workflow.

### M2 - Public Site Compliance And SEO

Status: completed on 2026-06-29.

Deliverables:

- `/doctor` and medical-certificate landing copy no longer implies instant or guaranteed certificate issue.
- Privacy policy includes patient-record retention period: 7 years after a patient leaves the practice, or until a child patient turns 25.
- Robots/sitemap/metadata/static crawl support reviewed and updated as practical for the current Vite architecture.

Verification:

- Grep for risky instant-certificate wording.
- Inspect rendered public pages.
- Build passes.

### M3 - Pricing And Booking Flow

Status: completed on 2026-06-29.

Deliverables:

- Exact certificate pricing displayed consistently.
- Confusing `from $9` wording removed; the current one-day price is `$11.21`.
- Stripe/checkout pricing helpers align with displayed public pricing.
- Carer's certificate add-on is cheaper than standalone one-day certificate.
- Add-on selection collects carer name, DOB, relationship/caring context, and certificate dates before completion.

Verification:

- Pricing helper checks.
- Booking flow browser QA.
- Build passes.

### M4 - Patient Auth And Account Creation

Status: completed on 2026-06-29.

Deliverables:

- `/api/patient/password/reset/request`, `/api/patient/login`, magic link, account-exists, account creation, and checkout handoff return controlled non-500 responses.
- Patient-facing errors avoid raw `fetch failed`.
- Existing-account flow remains safe and clear.

Verification:

- Local API smoke checks where env permits.
- Browser QA patient login/reset/details flow.
- Build passes.

### M5 - Doctor Portal Access

Status: completed on 2026-06-29.

Deliverables:

- Doctor password reset token/email flow works with configured email or mock outbox.
- Practitioner account creation requires approval by the configured administrator or an already approved doctor before queue access.
- Owner/test account path supports AHPRA/provider-number metadata and later provider-number updates.

Verification:

- Local doctor auth route smoke checks.
- Static doctor login/queue/review flow QA.

### M6 - Portal Messaging

Status: completed on 2026-06-29.

Deliverables:

- Sending a patient-to-doctor message does not log out the patient on success.
- Invalid session handling remains explicit.

Verification:

- Trace submit handler and route response handling.
- Browser or API smoke check where feasible.

### M7 - Meal-Plan Safety

Status: completed on 2026-06-29.

Deliverables:

- Hard calorie guardrails based on profile inputs.
- Serving count fixed to the intended patient serving context.
- Validation catches low-calorie, macro, ingredient/description, and recipe-step inconsistencies.
- Edge-case checks include high body weight.

Verification:

- Deterministic meal-planning helper checks.
- Build passes.

### M8 - Doctor Patient Records

Status: completed on 2026-08-08.

Deliverables:

- Patient medical history, allergies, medications, lifestyle notes, and uploaded test records are server-backed.
- Uploaded medical records use a private Supabase bucket and short-lived authenticated download URLs.
- Approved doctors can search by patient name and review patient identity, shared clinical history, attachments, and all certificate requests.
- Doctor record and attachment access produces audit entries.

Verification:

- Isolated patient/doctor API smoke test.
- Desktop and mobile doctor-portal visual checks.
- Production migration verification, build, lint, and syntax checks.

### M9 - Doctor Search, Checkout Consistency, And Certificate Wording

Status: completed and production-validated on 2026-08-08.

Deliverables:

- Doctor navigation uses `Search` for patient records and `Approvals` for practitioner access requests.
- Patient search supports server-backed submitted-within, custom date-range, and 1-7 day duration filters.
- Stripe prices, recurrence, product names, and favicon-based product imagery match the public funnel.
- Checkout Session branding uses Supadoc colors, logo, icon, and clinically safe submit copy.
- The default certificate statement uses the requested consultation wording.
- Doctors can edit the certificate statement and regenerate an in-place PDF preview more than once.

Verification:

- `npm test`, build, lint, audit, and Node syntax checks.
- Read-only Supabase filter query checks.
- Desktop and 390 px doctor search/review checks.
- Stripe Checkout Session API inspection plus desktop/mobile Checkout screenshots.
- Rendered PDF inspection and text extraction.
- Production aliases serve the release, protected doctor search rejects unauthenticated access,
  and a live unpaid Checkout Session was inspected and expired after validation.

### M10 - Customer Support Certificate Replies

Status: completed locally on 2026-08-09; production validation pending.

Deliverables:

- Doctor review includes an explicit `Doctor` / `Customer support` sender control.
- Support replies use a fixed display identity and a distinct audit event without hiding the
  authenticated portal account that sent them.
- Doctors and patients retain one complete shared conversation with visually distinct sender states.
- Support replies notify the patient by email and clear the queue's pending-reply indicator.

Verification:

- Shared message mapping and support email unit tests.
- Isolated authenticated API reply and mock-email smoke test.
- Desktop and 390 px doctor review visual checks.
- Build, lint, Node syntax, audit, and production alias checks.

## Validation Commands

```bash
npm run build
npm run lint
npm test
npm audit --audit-level=high
```

Targeted local server checks:

```bash
npm run dev -- --port 5173
npm run backend
```

## Current File Map

```text
.
|-- AGENTS.md                         # Root Codex briefing and validation rules
|-- SKILL.md                          # Always-read coding guardrails
|-- SKILLS.md                         # Repeatable project workflows
|-- PLANS.md                          # Living execution plan and file map
|-- DESIGN.md                         # Visual system, copy rules, and asset guidance
|-- README.md                         # Product and local development overview
|-- package.json                      # Root scripts and dependencies
|-- vite.config.ts                    # Vite config
|-- vercel.json                       # Deployment/API routing config
|-- api/
|   |-- index.js                      # Main production API entrypoint
|   `-- lib/patient-snapshot.js       # Patient snapshot helper
|-- backend/
|   |-- README.md                     # Backend/API operational notes
|   |-- server.js                     # Local backend server
|   |-- data/                         # Local fallback JSON/outbox/log data
|   `-- lib/                          # Auth, storage, email, PDF, pricing, search-filter, risk, and meal-plan helpers
|-- frontend/
|   |-- index.html                    # Vite HTML shell
|   |-- public/                       # Static images, doctor portal pages, robots, sitemap
|   `-- src/
|       |-- app/AppRouter.tsx         # Route selection
|       |-- components/               # Shared UI and page sections
|       |-- consult-flow/             # Booking flow state, pricing, services, views
|       |-- pages/                    # Route-level React pages
|       |-- patient-portal/           # Portal model and home widgets
|       |-- weight-loss-reset/        # Onboarding, meal planning, recipes, dashboard
|       |-- blogs/                    # Markdown articles and metadata
|       `-- index.css                 # Global tokens and styling
|-- scripts/                          # SEO, Supabase, image, billing, nutrition utilities
|-- supabase/migrations/              # Production DB migrations
`-- .agents/                          # Operational guides and fixes log
```

Update this map whenever files move or top-level systems are added.

## Markdown Context Tree

Use this tree before substantial changes so the relevant docs are read in order and stale instructions do not override current source reality.

```text
.
|-- AGENTS.md                         # Start here: commands, architecture, safety, deployment
|-- SKILL.md                          # Coding guardrails
|-- SKILLS.md                         # Workflow checklists by task type
|-- PLANS.md                          # Current bug batch, file map, validation state
|-- DESIGN.md                         # Visual system and public-copy rules
|-- backend/README.md                 # Backend/API operating notes
|-- .agents/
|   |-- README.md                     # Production alias policy and data architecture notes
|   |-- design-language.md            # Historical Onya design notes
|   `-- fixes-log.md                  # Required incident/fix history
`-- docs/
    |-- REPO_STRUCTURE.md
    `-- ai-landing-image-prompts.md
```

The old `.agents/FE_AGENT.md` and `.agents/BE_AGENT.md` split was removed because active workflows now live in `SKILLS.md`.

## Latest Validation

2026-08-09:

- Added a fixed `Customer support` reply identity alongside doctor replies in certificate conversations.
- Support replies remain visible in the shared doctor/patient thread, retain the authenticated
  portal account in the audit event, notify the patient by email, and clear `Needs reply`.
- Local unit, API, email, desktop, and 390 px visual checks passed; production deployment is pending.

2026-08-08:

- Made `n.vanhoorick1@gmail.com` the explicit production portal administrator while also
  allowing any currently approved doctor to review new doctor account requests.
- Added a doctor-queue Accounts panel for pending applications, with Approve and Reject
  actions backed by a current Supabase approval check; rejected doctors cannot reuse an
  older token to approve accounts.
- Preserved the administrator identity's historical patient row, changed its trusted auth
  role to `provider`, and left clinical registration fields blank so the non-clinical
  administrator cannot issue certificates.
- Removed the obsolete Vercel static doctor-login variables and added a checkout guard so
  provider/admin identities cannot be silently rewritten as patients.
- Isolated approval tests passed for pending login denial, approved-doctor approval,
  post-approval login, rejection, and stale-token denial. Build, lint, production audit,
  and Node syntax checks passed.
- Production commit `e689956` was current on every required alias. Live API checks confirmed
  administrator and approved-doctor account review, pending-doctor denial, unauthenticated
  denial, legacy-login denial, and the administrator's non-clinical profile. Desktop and
  390 px portal measurements showed no horizontal overflow and both review actions fit.
- Fixed doctor signup's async form-reset crash; successful public registrations now clear
  the form and show the required pending-admin-approval state.
- Fixed checkout's Supabase foreign-key race by awaiting the Auth profile and patient rows
  before the service request, then persisting the complete request before creating Stripe
  Checkout. Checkout failures now return controlled public copy instead of raw provider or
  database details.
- Production verification on `supadoc.com.au` created and expired an unpaid live Checkout
  Session, confirmed the patient and service rows were created in dependency order, and
  removed the temporary request. Demo patient login/bootstrap and approved doctor
  login/profile/queue/patient-search calls all returned `200`; the unverified demo doctor
  remained blocked with `403` pending approval.
- Desktop and 390 px production browser checks passed for patient and doctor portals with
  no horizontal overflow or browser-console errors. All required live aliases resolve to
  the current deployment.
- Removed the legacy production doctor credential bypass and its unsafe default values;
  approved Supabase Auth is now the only production doctor login path. The final Isaac
  login, profile, queue, and patient-search smoke checks all returned `200`.
- Replaced ephemeral Vercel doctor-reset tokens with hashed, expiring Supabase Auth metadata and required the trusted Supabase profile role before issuing or accepting a doctor reset.
- Fixed consumed Supabase reset metadata clearing, verified single-use doctor links, and confirmed patient-role accounts cannot enter the doctor reset flow.
- Fixed stale booking account warnings by invalidating checks on email edits and rechecking the current email/phone on submit; phone matches no longer reveal another account's email.
- The exact screenshot email/phone returned `exists: false` from all production aliases, and a browser regression confirmed a previous warning clears for the new address.
- Promoted commit `d260e3e` to all required aliases. Live production SMTP accepted a reset email for the approved practitioner with no rejected recipients, while the reported patient account remained outside the doctor reset flow.
- `npm audit --omit=dev --audit-level=high` reports zero production vulnerabilities; five high-severity development/build-tool advisories remain for a separate dependency upgrade because the `sharp` remediation is breaking.
- Added private, server-backed patient clinical profiles and real test-result uploads.
- Added authenticated doctor patient-name search, patient detail, full request history, and protected attachment access.
- Applied and verified `20260808_add_patient_clinical_profiles.sql` in production, including private storage and trigram patient-name indexes.
- `npm run build`, `npm run lint`, and Node syntax checks passed.
- Local authenticated API smoke and doctor portal visual checks passed at `1440x1000` and `390x844`.
- Replaced the initial full-certificate search and redundant detail reads with targeted indexed queries and parallel hydration; direct production-Supabase checks measured about `0.8s` and `1.4s` respectively.
- Live `supadoc.com.au` doctor login, queue, search, and detail checks returned `200`; search measured about `0.7s`, full detail about `2.8s`, unauthenticated search returned `401`, and all required production aliases served the patient-record page.

2026-08-04:

- Activated and verified the approved production practitioner account for
  `isaacsupadoc@gmail.com`; live login, profile, and certificate queue requests returned
  `200`.
- Tightened production doctor notification discovery so pending and rejected Supabase
  practitioner accounts are excluded.
- Added an audit-backed patient/doctor message thread, doctor replies with patient email
  delivery, direct email-to-review links, and patient-portal calls to action on message and
  completed-certificate emails.
- Added a bulk queue message summary and a mobile-safe `Needs reply` indicator when the
  latest conversation entry is from the patient; local storage/API state checks, lint,
  build, desktop/mobile visual checks, and a read-only production Supabase query passed.

2026-06-29:

- `npm run build` passed.
- `npm run lint` passed.
- `npm audit --audit-level=high` passed with `0` vulnerabilities after dependency updates.
- `node --check api/index.js backend/server.js backend/lib/doctor-auth.js backend/lib/meal-plan-ai.js` passed.
- Local API smoke test passed for doctor pending approval, admin approval, approved login, and patient account-exists controlled response.
- `npm run sitemap:generate` regenerated `frontend/public/sitemap.xml`.

## Decision Log

- Use existing Vite/React router logic instead of adding React Router.
- Keep public certificate copy conservative and review-based.
- Keep patient and dietitian identity database/API-backed, never hardcoded in UI.
- Keep doctor accounts gated by approval from the configured administrator or an already approved doctor rather than public self-activation.
- Keep generated meal-plan images and recipe data storage-backed and avoid large base64 payloads.
- Treat `frontend/public/sitemap.xml` and `robots.txt` as deployable artifacts until a more complete prerender/SSR solution is adopted.
