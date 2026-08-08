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
  certificate requests, and inspect patient-shared clinical records.
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
- Confusing `from $9` wording removed where actual price is `$9.71`.
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
- Practitioner account creation requires admin approval before queue access.
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

## Validation Commands

```bash
npm run build
npm run lint
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
|   `-- lib/                          # Auth, storage, email, PDF, risk, meal-plan helpers
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

2026-08-08:

- Replaced ephemeral Vercel doctor-reset tokens with hashed, expiring Supabase Auth metadata and required the trusted Supabase profile role before issuing or accepting a doctor reset.
- Fixed consumed Supabase reset metadata clearing, verified single-use doctor links, and confirmed patient-role accounts cannot enter the doctor reset flow.
- Fixed stale booking account warnings by invalidating checks on email edits and rechecking the current email/phone on submit; phone matches no longer reveal another account's email.
- The exact screenshot email/phone returned `exists: false` from all production aliases, and a browser regression confirmed a previous warning clears for the new address.
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
- Keep doctor accounts gated by admin approval rather than public self-activation.
- Keep generated meal-plan images and recipe data storage-backed and avoid large base64 payloads.
- Treat `frontend/public/sitemap.xml` and `robots.txt` as deployable artifacts until a more complete prerender/SSR solution is adopted.
