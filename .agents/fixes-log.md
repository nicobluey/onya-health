# Fixes Log

## 2026-08-08 - Durable doctor resets and accurate patient account checks

### Symptoms

- The doctor portal always reported that a reset link had been sent, but no email arrived for the address shown in the bug report.
- A valid doctor reset link could fail when its request and confirmation reached different Vercel function instances.
- The certificate details form could continue showing an earlier email's existing-account warning after the address changed, then block a new address that the live API reported as available.

### Root causes

1. The reported reset address belongs to a patient account, not a practitioner account; the generic response intentionally does not expose that distinction.
2. Doctor reset tokens were stored in local JSON under Vercel's ephemeral `/tmp` filesystem instead of durable production storage.
3. Supabase Admin metadata updates merge keys, so omitting a consumed reset key did not remove it.
4. The booking form trusted its debounced advisory lookup during submission and did not synchronously invalidate that state when the email changed.

### Files changed

- `api/index.js`
  - stores hashed doctor reset state and expiry in Supabase Auth metadata, validates it against the trusted `profiles.role`, clears it after use, and keeps the local JSON flow only for non-Supabase development.
  - clears consumed patient reset metadata with an explicit `null` value and no longer returns another patient's email when a phone number matches.
- `frontend/src/components/FlowSteps.tsx`
  - invalidates stale email checks on edit, always performs an authoritative current-value check on submit, distinguishes email and phone matches, and removes the duplicate warning.
- `backend/server.js`
  - mirrors the account-check response privacy rule for local development.

### Verification

1. `npm run build`, `npm run lint`, `node --check api/index.js backend/server.js`, and `git diff --check` pass.
2. A temporary approved practitioner in production Supabase completed reset request, mock email generation, password confirmation, new-password login, and single-use-token rejection; reset state was cleared afterward.
3. A temporary auth user with doctor-like editable metadata but a trusted patient profile received no doctor reset state or email.
4. All three production aliases reported `exists: false` for the exact email and phone in the booking screenshot before the fix, confirming that the block was stale browser state rather than a database match.
5. A browser regression pass reproduced an existing-account warning, changed to the screenshot email, confirmed the warning cleared immediately, and received the available-account state with no console errors.
6. Vercel promoted commit `d260e3e` to `supadoc.com.au`, `www.supadoc.com.au`, and `onya-health.vercel.app`; all aliases returned `200` health and account-check responses.
7. A live reset request for the approved practitioner stored durable Supabase reset state, and production SMTP accepted the reset email with no rejected recipients. The reported patient account remained unchanged and generated no doctor email.
8. `npm audit --omit=dev --audit-level=high` reports zero production dependency vulnerabilities. The full development-tree audit reports five high-severity advisories in build tooling, including a breaking `sharp` upgrade, and is tracked separately from this release.

## 2026-08-08 - Doctor patient search and shared clinical records

### Symptoms

- Doctors could review only the active certificate queue and could not find a patient by name or see previous requests together.
- Medical history entered in the patient portal lived only in browser storage, so it was unavailable to clinicians and on other devices.
- The patient portal recorded an uploaded file name but never stored the actual report.

### Root causes

1. There was no server-backed clinical-profile model or private attachment bucket.
2. Doctor APIs were request-oriented only and had no authenticated patient directory/detail endpoints.
3. Patient record widgets updated local state without syncing medical history, medications, allergies, lifestyle notes, or test documents to the backend.
4. The first search implementation read the full certificate collection and repeated patient/profile lookups, producing slow live response times.

### Files changed

- `supabase/migrations/20260808_add_patient_clinical_profiles.sql`
  - adds the protected clinical-profile table and private `patient-medical-records` bucket.
- `backend/lib/storage.js`, `api/index.js`, `backend/server.js`
  - add normalized local/Supabase persistence, private signed downloads, patient profile APIs, indexed name-filtered doctor searches, parallel detail hydration, and audit events.
- `frontend/src/pages/PatientPortalPage.tsx`, `frontend/src/patient-portal/home/HomeTab.tsx`, `frontend/src/patient-portal/model.ts`
  - sync patient-entered records to the server, migrate existing local records, and upload/open real attachments.
- `frontend/public/doctor/patients/index.html`, `backend/doctor-portal/patients.html`, doctor queue pages, and `vercel.json`
  - add the responsive doctor patient-record workspace and route it from the queue.

### Verification

1. `npm run build` and `npm run lint` pass.
2. `node --check api/index.js backend/server.js backend/lib/storage.js` passes.
3. An isolated local API smoke test passed patient login, clinical-profile save, private attachment upload/download, bootstrap hydration, unauthenticated doctor rejection, doctor login, name search, record detail, request history, and doctor attachment access.
4. Doctor patient records passed desktop `1440x1000` and mobile `390x844` visual checks with no horizontal overflow or browser-console errors.
5. The production migration was applied and a read-only query confirmed the table plus a private 2.5 MB storage bucket.
6. Direct production-Supabase checks measured the targeted name query at about `0.8s` and parallel history/profile hydration at about `1.4s`, replacing the initial full-table and redundant-read path.
7. Live authenticated checks on `supadoc.com.au` returned `200` for login, queue, patient search, and patient detail; search completed in about `0.7s`, detail in about `2.8s`, unauthenticated search returned `401`, and private storage paths were absent from the API payload.

## 2026-06-29 - Remove meal-plan product surface and refocus production on med certs

### Symptoms

- Meal-plan/nutrition features added heavy portal reads and distracted from the highest-converting medical-certificate funnel.
- Public navigation and homepage still advertised inactive or secondary service lines.

### Root causes

1. The patient portal imported the full weight-loss/meal-planning bundle and hydrated meal-plan APIs from route/query state.
2. Public service config, header/footer links, sitemap entries, and warmup assets still included nutrition/psychology routes.
3. Meal-plan API endpoints remained callable by stale clients.

### Files changed

- `frontend/src/pages/PatientPortalPage.tsx`
  - removed weight-loss onboarding/dashboard imports, state, hydration, generation, and visible timeline injection.
  - filters historical nutrition service rows from visible portal timelines.
- `frontend/src/patient-portal/home/HomeTab.tsx`, `frontend/src/patient-portal/model.ts`
  - removed the nutrition dashboard card and simplified portal consult options to medical certificates only.
- `frontend/src/pages/HomePage.tsx`, `frontend/src/consult-flow/services.ts`
  - refocused homepage/service registry on doctor-reviewed medical certificates.
- `frontend/src/app/AppRouter.tsx`, `frontend/src/components/HeaderDropdown.tsx`, `frontend/src/components/Footer.tsx`
  - redirect removed nutrition/psychology routes to `/doctor` and remove public links.
- `api/index.js`, `backend/server.js`
  - added `ENABLE_MEAL_PLAN_FEATURE` gate; meal-plan API routes return `410` unless explicitly re-enabled.
- `scripts/generate-sitemap.mjs`, `frontend/public/sitemap.xml`
  - removed nutrition/psychology route publication.

### Verification

1. `node --check api/index.js backend/server.js backend/lib/storage.js` succeeds.
2. `npx tsc -b --pretty false` succeeds.
3. `npm run lint` succeeds.
4. `npm run build` succeeds; main JS bundle reduced from about `803.84 kB` to `642.25 kB` minified after removing portal meal-plan imports.
5. Local Playwright checks passed on desktop `1440x1000` and mobile `390x844` for `/`, `/doctor`, `/doctor#book`, and `/patient-login`.
6. Local route checks confirm `/nutritionist`, `/psychologist`, and `/weight-loss-reset` redirect to `/doctor`.

## 2026-06-29 - Launch bug batch: docs, pricing, auth, doctor approval, SEO, and meal-plan safety

### Symptoms

- Public certificate pricing and copy were inconsistent (`from $9`, instant-certificate implications, and outdated Stripe cent defaults).
- Carer's certificate add-on lacked required certificate details and was priced too close to a standalone certificate.
- Patient auth/account checks and password reset could surface raw `fetch failed`/500 behavior.
- Sending a patient-to-doctor message could be followed by a portal logout.
- Public doctor self-signup granted practitioner access without admin approval.
- Doctor reset email failure blocked recovery diagnostics.
- Homepage/body content was weak for non-JavaScript crawlers.
- Dietitian meal-plan generation could accept very low daily calories for high-body-weight profiles.
- Project docs referenced unused FE/BE agent files.

### Root causes

1. Pricing/copy constants drifted between frontend display, checkout helpers, env defaults, and landing metadata.
2. Carer add-on state existed as a boolean only, without a typed detail payload or server validation.
3. Several auth/email routes let downstream lookup or email-provider failures bubble into user-visible failures.
4. Public doctor signup returned a token immediately and notification recipient lookup included all local doctor accounts.
5. Meal-plan quality checks used fixed low calorie floors rather than profile-informed thresholds.
6. Vite client rendering left important crawlable text mostly inside JavaScript-rendered routes.
7. Legacy `.agents/FE_AGENT.md` and `.agents/BE_AGENT.md` duplicated active workflow guidance.

### Files changed

- `AGENTS.md`, `SKILL.md`, `SKILLS.md`, `PLANS.md`, `DESIGN.md`, `backend/README.md`
- `.agents/README.md`
- removed `.agents/FE_AGENT.md` and `.agents/BE_AGENT.md`
- `api/index.js`, `backend/server.js`
- `backend/lib/doctor-auth.js`, `backend/lib/meal-plan-ai.js`
- `frontend/src/components/FlowSteps.tsx`
- `frontend/src/consult-flow/pricing.ts`, `frontend/src/consult-flow/state.tsx`
- `frontend/src/lib/api.ts`, `frontend/src/types.ts`
- `frontend/src/pages/MedicalCertificateUseCasePage.tsx`
- `frontend/src/pages/CertificateCampaignPage.tsx`
- `frontend/src/pages/PatientPortalPage.tsx`
- `frontend/src/pages/PrivacyPolicyPage.tsx`
- `frontend/src/components/HowItWorks.tsx`
- `frontend/src/weight-loss-reset/mealPlanning.ts`
- `frontend/public/doctor/login/index.html`, `frontend/public/doctor/queue/index.html`
- `backend/doctor-portal/login.html`, `backend/doctor-portal/queue.html`
- `frontend/index.html`, `frontend/public/sitemap.xml`
- `scripts/generate-sitemap.mjs`

### Verification

1. `npm run build` passed.
2. `npm run lint` passed.
3. `npm audit --audit-level=high` passed with `0` vulnerabilities after package updates.
4. `node --check api/index.js backend/server.js backend/lib/doctor-auth.js backend/lib/meal-plan-ai.js` passed.
5. `npm run sitemap:generate` generated 70 URLs.
6. Local backend smoke test with temporary auth storage confirmed:
   - pending doctor login returns `403`;
   - admin doctor login returns a token;
   - admin approval endpoint returns `approved`;
   - approved doctor login returns a token and provider number;
   - `/api/patient/account-exists` returns controlled `200`.
7. Grep checks found no remaining `from $9`, `$10`, or instant-certificate phrasing in active frontend/API/backend source.

## 2026-05-13 - Generated recipe image persistence + storage URL hardening

### Symptoms

- Most generated meals were missing images in dashboard cards and swap modals.
- Some meals showed mismatched visuals after repeated cache hydration cycles.
- Meal payloads felt sluggish due large inline image data when present.

### Root causes

1. `meal_planner_recipes` upsert logic wrote `image_url: null` when cache-derived recipe payloads omitted image fields, which clobbered previously correct stored images.
2. Cache bundle compaction dropped recipe image fields completely, increasing chance of null-image upserts during historical recipe backfills.
3. Generated image data URIs were not consistently normalized into storage URLs, causing heavier payloads and inconsistent rendering paths.

### Files changed

- `backend/lib/storage.js`
  - changed recipe mapping to avoid null-writing `image_url` when image is absent
  - added image-preservation merge logic in Supabase upsert path
  - added storage upload pipeline for recipe `data:image/...` payloads to Supabase bucket
  - syncs `source.image_url`/`source.imageUrl` with resolved stored URL
- `api/index.js`
  - cache recipe compaction now keeps HTTP image URL (`imageUrl`) in bundle payload when available
- `scripts/backfill-generated-recipe-images.mjs`
  - new script for DB stats + bulk backfill of missing generated recipe images
  - converts existing data-URI images into storage URLs
  - updates `meal_planner_recipes.image_url` and `source` image fields
- `package.json`
  - added:
    - `nutrition:images:stats`
    - `nutrition:images:backfill`
- `.agents/README.md`, `.agents/BE_AGENT.md`
  - documented mandatory production alias deployment policy and meal DB/image architecture constraints

### Verification

1. `node scripts/backfill-generated-recipe-images.mjs` reports current totals and missing-image counts.
2. Upsert path now preserves existing `image_url` when incoming row lacks image payload.
3. Data-URI images are uploaded to Supabase storage and rewritten as public URL references.
4. Production backfill run result:
   - total generated recipes: `287`
   - missing generated images: `0`
   - generated data-URI images: `0`
   - APD image URLs present: `0`

## 2026-05-11 - Account/profile editing, magic-link-first auth, and duplicate email trigger hardening

### Symptoms

- Patient account details were partially static and not fully editable from portal settings.
- Checkout/onboarding could continue for users who already had an account, creating auth confusion.
- Magic-link flow was fragmented and not first-class in login.
- Medical certificate payment flow could trigger duplicate confirmation/review emails.
- Practitioner and patient profile image handling needed production-safe storage-backed updates.

### Root causes

1. Profile editing endpoint and UI wiring for address/photo fields were incomplete.
2. Pre-check for existing account by email/phone before checkout was missing.
3. Login page favored mixed auth patterns without a clear magic-link-first path.
4. Payment completion logic had multiple code paths capable of firing email side effects.

### Files changed

- `api/index.js`
  - added `POST /api/patient/account-exists` (email/phone collision check)
  - added `POST /api/patient/profile` (full name, dob, phone, address, profile photo upload)
  - added `POST /api/patient/magic-link/request` and `POST /api/patient/magic-link/consume`
  - added signed magic-link token issue/verify helpers
  - extended patient profile sync (`createPatientAccountViaSupabase`, `upsertSupabasePatientMetadata`, `upsertSupabasePatientProfileRows`) with `address` and `profilePhotoPath`
  - added Supabase storage upload helpers for patient profile photos from data-URL payloads
  - updated `POST /api/checkout/confirm` to auto-create account post-payment and send patient magic link
  - constrained doctor review email dispatch in `markPaidFromStripeSession(...)` to webhook-finalization path to prevent duplicate sends
- `backend/lib/email-templates.js`
  - added patient magic-link email template renderer
- `frontend/src/components/FlowSteps.tsx`
  - details page now collects address
  - checks `/api/patient/account-exists` before checkout and blocks with sign-in guidance when matched
- `frontend/src/pages/PatientLoginPage.tsx`
  - implemented magic-link request/consume UX as primary quick-login path
- `frontend/src/pages/PatientPortalPage.tsx`
  - made sidebar profile section actionable (opens account/settings)
  - account settings now editable: full name, phone, dob, address, profile photo
  - save flow wired to `/api/patient/profile` with local state refresh
- `frontend/src/patient-portal/model.ts`
  - aligned patient model shape for `address` support
- `frontend/src/weight-loss-reset/components/ProfileAvatar.tsx`
  - added secondary fallback image URL before initials fallback
- `frontend/src/weight-loss-reset/components/PatientDashboardWeightLossCard.tsx`
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - wired avatar fallback usage for practitioner display consistency
- `supabase/migrations/20260511_add_patient_address_and_phone_index.sql`
  - adds/backfills `patients.address`
  - adds phone index for patient lookup performance

### Verification

1. `npm run build` succeeds.
2. Profile updates persist via `/api/patient/profile`, including address and photo path.
3. Login supports magic-link request and token consume successfully.
4. Checkout confirm auto-creates account when needed and sends magic link email.
5. Existing-account detection blocks duplicate-account checkout path.
6. Duplicate review-email behavior is mitigated by webhook-only email trigger path.

## 2026-05-09 - Database-backed patient/dietitian profiles and production headshot wiring

### Symptoms

- Portal and onboarding still relied on hardcoded placeholder profile values in parts of the frontend.
- Dietitian profile rendering was not fully wired from API payloads through all weight-loss screens.
- Infrastructure needed to support multiple dietitians (not a single static placeholder assumption).

### Root causes

1. `PatientPortalPage` initialized with hardcoded fallback patient identity and did not maintain a dedicated assigned-dietitian state from bootstrap payloads.
2. `HomeTab` did not accept/pass dietitian profile through to the weight-loss dashboard card.
3. Profile data model support existed partially but required production migration + wiring completion end-to-end.

### Files changed

- `supabase/migrations/20260508_refactor_patient_dietitian_profiles.sql`
  - creates/normalizes `patients`, `dietitians`, `patient_dietitians`
  - adds primary-assignment safeguards, indexes, RLS policies
  - seeds active default dietitian row and assignments where missing
- `supabase/migrations/20260509_add_patient_email_index.sql`
  - adds/backfills `patients.email`
  - adds unique lower(email) index and `owner_id` index
- `api/index.js`
  - resolves patient + dietitian profile from DB via `resolvePatientProfileByEmail`
  - returns `{ patient, dietitian }` across auth/bootstrap endpoints
  - persists patient profile rows via `upsertSupabasePatientProfileRows`
- `backend/lib/storage.js`
  - keeps `patients` profile columns in sync during request/profile writes
- `frontend/src/pages/PatientPortalPage.tsx`
  - removed hardcoded patient placeholders
  - added normalized patient/dietitian hydration from API payload
  - stores assigned dietitian state and passes to onboarding/dashboard/home card
- `frontend/src/patient-portal/home/HomeTab.tsx`
  - accepts dietitian prop and passes into `PatientDashboardWeightLossCard`
- `frontend/src/weight-loss-reset/components/PatientDashboardWeightLossCard.tsx`
  - dynamic dietitian profile rendering with avatar fallback
  - removed hardcoded CTA copy mentioning Felicity
- `frontend/src/weight-loss-reset/components/OnboardingFlow.tsx`
  - dynamic dietitian identity rendering + generic expert-label helper usage
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - dynamic assigned dietitian rendering from props
- `frontend/src/weight-loss-reset/components/ProfileAvatar.tsx`
  - resilient image fallback avatar component
- `frontend/src/weight-loss-reset/constants.ts`
  - centralized default production dietitian image URL and generic helper aliasing
- `frontend/public/felicity-profile.webp`
  - production dietitian headshot asset
- `.agents/FE_AGENT.md`, `.agents/BE_AGENT.md`
  - implementation contracts and regression checklists

### Verification

1. `npm run build` succeeds.
2. `GET /api/patient/bootstrap` returns both `patient` and `dietitian`.
3. Onboarding + dashboard + home card display assigned dietitian profile from payload.
4. Missing/invalid profile image gracefully falls back to initials avatar.

## 2026-05-08 - GPT-only catalog enforcement, swap recovery, and generation progress fix

### Symptoms

- Swap options were missing large parts of previously generated meals.
- Legacy APD recipes were resurfacing in active meal plans and swaps.
- "Building your updated weekly plan" progress UI could appear stuck around `6%`.

### Root causes

1. Recipe eligibility was not enforced consistently at all read paths, so APD/legacy rows could still be hydrated from cache and reused.
2. Catalog hydration requested a small slice (`limit=72`), which constrained swap candidate variety.
3. Generation progress effect in dashboard depended on `generationProgress`, causing interval restarts and apparent stalling.
4. Historical generated recipes were not fully backfilled from cache/event bundle rows into the primary recipe table.

### Files changed

- `backend/lib/storage.js`
  - enforced GPT/rules eligibility at Supabase read layer
  - added resilient query filtering fallback for missing columns
  - expanded recipe-id normalization and chunked `id IN (...)` fetches for large historical catalogs
  - raised patient cache list bounds for larger historical recovery windows
- `api/index.js`
  - tightened generated-recipe detection; APD URLs/providers are now explicitly excluded
  - prevented legacy/APD recipes from being rehydrated/backfilled into generated catalog paths
  - increased catalog recovery breadth and enabled generated global fallback in patient catalog route
  - adjusted recipe normalization so rules fallback does not overwrite existing OpenAI provenance
- `frontend/src/pages/PatientPortalPage.tsx`
  - increased patient catalog hydration request from `72` to `420`
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - fixed generation progress floor/timing behavior and removed self-reset loop behavior
- `supabase/migrations/20260508_phase_out_apd_and_recover_generated_catalog.sql`
  - adds/normalizes `generated_by`, `source_provider`, `is_active`
  - backfills recipes from `meal_plan_generation_cache` and `request_events` bundles
  - deactivates APD/legacy recipes and indexes active generated read paths

### Verification

1. `npm run build` succeeds.
2. Live DB post-migration checks:
   - APD active leaks = `0`
   - Active generated recipes remain available (OpenAI + rules provenance)
3. Cache-derived recipe recovery repopulates generated recipe rows before catalog reads.

## 2026-05-08 - Meal history and image compatibility recovery

### Symptoms

- Older generated meal plans were not showing for some patients.
- Recipe images from previously generated plans were missing.

### Root causes

1. The API accepted only WebP image formats (`.webp` or `data:image/webp`), so legacy `.png`/`.jpg`/other valid image URLs were dropped.
2. `GET /api/patient/meal-plan/latest` returned `found: false` if the latest cache row could not hydrate, without falling back to older valid cache rows.
3. `GET /api/patient/meal-plan/catalog` filtered out recipes without resolved image URLs, reducing usable historical catalog coverage.
4. Frontend generation flow blocked applying a valid meal plan when image coverage was below a hard threshold.

### Files changed

- `api/index.js`
  - relaxed supported recipe image formats (HTTP + data URI)
  - added hydration fallback to older patient cache rows for `/patient/meal-plan/latest`
  - removed image-only filter from `/patient/meal-plan/catalog`
  - updated recipe image proxy to serve non-WebP data URIs safely
- `frontend/src/pages/PatientPortalPage.tsx`
  - relaxed concrete image detection to include non-WebP formats
  - changed generation behavior to keep meal plan even with partial image coverage
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - relaxed concrete image detection to include non-WebP formats

### Verification

1. `npm run build` succeeds.
2. Supabase check confirms historical cache rows exist for affected patients.
3. API path now supports legacy image formats and older valid cache rows.
4. Frontend no longer discards generated meals when image coverage is incomplete.

## 2026-05-08 - Felicity profile headshot rollout and patient-name provenance trace

### Symptoms

- Felicity profile cards were still icon-only/text-only in onboarding and dashboard states.
- Need to verify where patient full name `Fff` originated for `n.vanhoorick1@gmail.com`.

### Root causes

1. Weight-loss reset UI used placeholder iconography instead of a dedicated dietitian headshot asset.
2. Patient display name is sourced from persisted patient identity fields, and for this account those fields were already set to `Fff` in upstream data.

### Files changed

- `frontend/public/felicity-profile.webp`
  - new WebP headshot asset (converted from provided source image).
- `frontend/src/weight-loss-reset/constants.ts`
  - added `FELICITY_PROFILE_IMAGE_URL` shared constant.
- `frontend/src/weight-loss-reset/components/PatientDashboardWeightLossCard.tsx`
  - replaced icon-only Felicity block with headshot + profile text.
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - replaced right-rail Felicity icon block with headshot + profile text.
- `frontend/src/weight-loss-reset/components/OnboardingFlow.tsx`
  - added Felicity headshot to match preview and onboarding match card.

### Data provenance findings (`Fff`)

- API identity resolution path:
  - `api/index.js` `buildPatientIdentity(...)` prefers `latestCertificate.certificateDraft.fullName`, then falls back to account full name.
  - `api/index.js` `patientProfileFromCertificate(...)` returns `certificateDraft.fullName`.
- Live Supabase records for `n.vanhoorick1@gmail.com` show `Fff` exists in both:
  - `auth.users.user_metadata.full_name = "Fff"`
  - `medical_certificate_requests.patient_full_name = "Fff"` on latest request (`request_id = 3fd92cd6-ce7b-4cdf-8ecc-2c959de7193c`).

### Verification

1. `npm run build` passes.
2. Felicity headshot renders in:
   - onboarding match preview,
   - onboarding step 8 matched card,
   - dashboard right-rail Felicity card,
   - patient dashboard match card.
3. Patient-name trace confirms `Fff` is data-originated, not generated by frontend defaults.

## 2026-05-11 - Production alignment + account/consult/payment polish

### Symptoms

- Production custom domain was serving an older deployment.
- Felicity image + profile/account fixes were not visible live.
- Account latest consult still used plain text status (not severity color chips).
- Consult flow did not clearly show recent nutrition consult activity.
- Some paid requests could remain in `awaiting_payment` state due missed webhook windows.

### Root causes

1. Vercel alias for production domain was not pointing to the newest deployment output.
2. Status-tone logic existed in Home tab only; Account latest consult used plain text.
3. Consult tab had no recent-consult timeline section.
4. Payment finalization depended heavily on webhook timing without a patient-read reconciliation pass.

### Files changed

- `frontend/src/pages/PatientPortalPage.tsx`
  - account latest consult now uses status chips (green/yellow/gray/red mapping)
  - consult tab now includes `Latest consults` section (shows nutrition consult activity)
  - desktop sidebar profile chip renders patient photo fallback correctly
  - account settings supports editable email and token rotation response handling
  - nutrition clinical context passed to dashboard
- `frontend/src/patient-portal/home/HomeTab.tsx`
  - status chips aligned with requested semantics
  - consult timeline uses synthetic recurring nutrition consult entry when needed
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - shared clinical context panel added (history/allergies/medications)
- `frontend/src/components/FlowSteps.tsx`
  - max certificate duration capped to 7 days in UI
  - duplicate-account detection now shows direct sign-in CTA
- `frontend/src/consult-flow/state.tsx`
  - duration clamped to max 7 days
- `frontend/src/consult-flow/pricing.ts`
  - pricing day normalization clamped to 7-day cap
- `frontend/src/components/UpsellModal.tsx`
  - removed star icon from unlimited plan card
- `frontend/src/weight-loss-reset/constants.ts`
  - Felicity fallback image pinned to `/felicity-profile.webp`
- `api/index.js`
  - profile endpoint now supports email updates + rotated token return
  - Supabase email-update helper + conflict guard
  - patient read endpoints reconcile stale `awaiting_payment` status via Stripe session check
  - certificate/pricing duration clamped to 7 days
- `backend/lib/patient-auth.js`
  - local auth profile update supports email changes + reset-token email migration

### Deployment operations

- Verified latest deployment and re-pointed production aliases to current deployment:
  - `onyahealth.com.au`
  - `www.onyahealth.com.au`
- Note: `www.onyourhealth.com.au` did not resolve in DNS during verification.

### Verification

1. `npm run build` succeeds.
2. Live domain serves `felicity-profile.webp` from production.
3. Account and consult tabs now show status chips with requested tone mapping.
4. Patient profile update supports email + profile fields with token continuity.

## 2026-05-11 - Nutrition card photo + consult UX/state cleanup

### Symptoms

- Felicity photo missing from the `Crafted for you` personal note card.
- Home hero `Consults on file` implied active consult access for users who have not started nutrition onboarding.
- Consult history showed `Weight Loss` label instead of nutritionist consult wording.
- Sidebar bottom profile chip could appear missing on longer Home/Account pages.
- Some records remained visually stuck at `Awaiting payment confirmation`.

### Root causes

1. `Crafted for you` card did not include a dietitian identity/photo region.
2. Home hero consult-count block did not gate for not-started nutrition flow.
3. `consultTitle(...)` did not map `weight_loss` to user-facing nutrition consult copy.
4. Sidebar layout was not pinned to viewport height, so the bottom profile chip could scroll out of view.
5. Supabase status mapping inferred `awaiting_payment` too broadly and did not persist updated payment metadata back into `medical_certificate_requests.raw_submission`.

### Files changed

- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - added Felicity/dietitian photo badge to the `Crafted for you` header card.
- `frontend/src/patient-portal/home/HomeTab.tsx`
  - home hero now shows locked nutrition upsell copy when plan is not started.
  - reduced latest-consults heading prominence.
- `frontend/src/patient-portal/model.ts`
  - maps `weight_loss`/`nutritionist` service titles to `Nutritionist Consult`.
- `frontend/src/pages/PatientPortalPage.tsx`
  - pinned desktop sidebar behavior (`sticky top-0 h-screen`) and adjusted wrapper overflow for persistent bottom profile chip visibility.
- `backend/lib/storage.js`
  - `awaiting_payment` inference requires Stripe session id.
  - persisted `raw_submission` patch during certificate updates so Stripe payment status propagation sticks.

### Verification

1. `npm run build` succeeds.
2. `Crafted for you` card now renders Felicity profile image/name block.
3. Home hero shows locked upsell copy for non-started nutrition plan users.
4. Consult history labels show `Nutritionist Consult` (not `Weight Loss`).
5. Paid-session updates persist payment metadata and reduce stale awaiting-payment states.

## 2026-05-11 - Weekly dietitian podcast section with OpenAI TTS

### Symptoms

- Weight-loss dashboard had no weekly audio coaching section.
- Users could not get a deeply personal narrated weekly plan check-in.
- No integrated disclosure for AI-generated voice output.

### Root causes

1. The meal-plan experience had no TTS generation route in the patient API.
2. Dashboard lacked weekly podcast UI state, generation triggers, and playback controls.
3. No voice-profile mapping existed for preferred tone variants (happy female / authoritative male).

### Files changed

- `api/index.js`
  - added `POST /api/patient/meal-plan/podcast` authenticated route.
  - uses existing `OPENAI_API_KEY` and sets default TTS model to `gpt-4o-mini-tts`.
  - validates/normalizes script length to weekly-brief target range (~40 seconds).
  - maps voice profiles:
    - `happy_female` -> `marin`
    - `authoritative_male` -> `cedar`
  - returns transcript, audio payload, duration estimate, and AI-voice disclosure text.
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - added weekly podcast card inside the meal-plan "Crafted for you" section.
  - added voice profile controls, regenerate control, prominent play/pause button, progress scrubber, duration timer.
  - reused existing `audio-wave` visuals and added console-style transcript block for the AI briefing text.
  - auto-generates weekly podcast when meal plan is present and refreshes with weekly key + selected voice.
  - shows explicit disclosure that the voice is AI-generated.

### Verification

1. `npm run build` succeeds.
2. `node --check api/index.js` succeeds.
3. Dashboard compiles with new podcast UI and TTS request flow.

## 2026-05-11 - Progress entry editing + podcast request timeout hardening

### Symptoms

- Patient could not correct historical weight logs (for example accidental `343 kg` entry).
- Weekly podcast generation could appear stuck during long-running network requests.

### Root causes

1. Progress tab only supported creating new weight entries; no update path existed in state or UI.
2. Podcast generation fetch had no explicit timeout boundary, so stalled requests could keep loading state active too long.

### Files changed

- `frontend/src/weight-loss-reset/useWeightLossResetState.ts`
  - added `updateWeightLog(...)` state action to edit existing entries by id.
- `frontend/src/pages/PatientPortalPage.tsx`
  - wired `updateWeightLog` into `WeightLossResetDashboard` props.
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - added progress entry edit UX:
    - edit button on historical entries
    - form prefill in edit mode
    - `Save changes` and `Cancel` controls
  - added high-value confirm guard for unusual inputs (`>250 kg`) to reduce typo mistakes.
  - added 35-second abort timeout for podcast generation and explicit timeout error messaging.

### Verification

1. `npm run build` succeeds.
2. `node --check api/index.js` succeeds.
3. Built client bundle contains:
   - `Weekly podcast brief`
   - `Save changes`
   - `Podcast generation timed out. Please tap Regenerate.`

## 2026-05-12 - Compact scientific podcast UI and simplified controls

### Symptoms

- Podcast module was too large and visually heavy.
- UI included transcript, disclosure text, voice selectors, and regenerate control that were not needed.
- Playback waveform used static animation instead of reflecting actual audio signal.
- Podcast script over-emphasized goal-progress and weight values in spoken content.

### Root causes

1. Podcast panel included extra metadata/controls beyond desired playback-only interaction.
2. Visualizer used decorative CSS bars, not signal-driven analyzer data.
3. Script builder included explicit weight/progress lines.

### Files changed

- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - narrowed podcast voice profile to a single `happy_female` voice path.
  - removed transcript block, generated-meta line, disclosure text, and podcast-specific regenerate/voice selector controls.
  - redesigned podcast panel to a compact player footprint.
  - added Web Audio analyzer-driven visualizer bars that react to the live audio spectrum.
  - adjusted generation cache key to include the current script so stale weekly audio is replaced when script content changes.
  - rewrote podcast script to keep a personal but more scientific tone and removed explicit weight/progress narration.

### Verification

1. `npm run build` succeeds.
2. Built output includes `Weekly science podcast`.
3. Removed strings are absent from podcast UI source (`AI Console Transcript`, `Authoritative male`, podcast `Regenerate` control, `Happy female` label).

## 2026-05-12 - Weekly podcast caching, 90s target, and progress formula fix

### Symptoms

- Goal progress bars stayed at `0%` for users with weight-gain goals.
- Weekly podcast regenerated repeatedly instead of being reused.
- Podcast duration remained around 40-50 seconds instead of ~90 seconds.
- Meal-plan header still displayed `Crafted for you` and the section leaned too heavily on blue surface fills.

### Root causes

1. Progress math only handled weight-loss direction.
2. Podcast generation lacked persisted client-side reuse keyed by week/script.
3. API script word limits were capped for ~40-second output.
4. Summary card retained older heading copy and heavier blue visual treatment.

### Files changed

- `frontend/src/weight-loss-reset/mealPlanning.ts`
  - updated `calculateGoalProgress(...)` to support both gain and loss directions with proper clamping.
- `frontend/src/weight-loss-reset/useWeightLossResetState.ts`
  - switched dashboard progress calculation to shared `calculateGoalProgress(...)`.
- `frontend/src/weight-loss-reset/components/WeightLossResetDashboard.tsx`
  - podcast title updated to `Personal science podcast tailored to your body`.
  - removed `Crafted for you` label row.
  - styled Felicity note as a comment-style attached block.
  - softened blue-heavy surfaces by moving key cards to white backgrounds.
  - introduced podcast cache (`localStorage`) with hashed generation keys and reuse-on-load behavior.
  - podcast script rewritten for scientific/personal voice without claiming Felicity as speaker.
- `api/index.js`
  - increased TTS script limits and updated word-range normalization for ~90-second output.
  - fallback podcast script updated for scientific tone without naming Felicity as narrator.

### Verification

1. `npm run build` succeeds.
2. `node --check api/index.js` succeeds.
3. Vercel inspect on latest production deployment shows status `Ready`.

## 2026-06-29 - Promote staged launch deployment to production aliases

### Symptoms

- Git push and Vercel build completed for commit `92a7151`, but live domains still served
  the older production HTML/API behavior.
- Vercel deployment list showed the latest deployment as ready under Environment
  `Production`, which made the state look deployed at first glance.

### Root causes

1. The latest deployment `Dk4Fw4vFBJRrQV5Di55eF64dUzzS` was still marked `Staged`.
2. Deployment details showed `Assigning Custom Domains: Skipped`, so public aliases were
   not moved to the new build.
3. A duplicate Vercel project named `repo` was connected to the same GitHub repository,
   creating extra deployment noise. Production domains are owned by the `onya-health`
   Vercel project.

### Files/areas changed

- Vercel dashboard:
  - promoted `onya-health` deployment `Dk4Fw4vFBJRrQV5Di55eF64dUzzS`
  - commit `92a7151 Stabilize launch flows and docs`
  - confirmed deployment detail changed to `Current`
  - confirmed domains included `www.onyahealth.com.au` and `onya-health.vercel.app`
- `AGENTS.md`
  - documented the `Staged` vs `Current` Vercel distinction.
- `.agents/README.md`
  - documented the promotion flow and duplicate-project caveat.

### Verification

1. `https://www.onyahealth.com.au/` returns `200` with `Last-Modified: Mon, 29 Jun 2026`
   and static crawl fallback content.
2. `https://onyahealth.com.au/` returns `307` to `https://www.onyahealth.com.au/`.
3. `https://www.onyahealth.com.au/sitemap.xml` includes
   `/medical-certificate-doctor` and `/medical-certificate-carers-leave`.
4. Sitemap no longer contains the private `/patient` route.
5. `POST /api/checkout/session` with a carer add-on but missing carer details returns
   `400` with code `CARER_CERTIFICATE_DETAILS_REQUIRED`.
6. `POST /api/patient/account-exists` returns controlled `200` JSON for a non-existent
   probe email.

## 2026-06-29 - Reduce patient portal and account-check latency

### Symptoms

- Patient account checks and sign-in-adjacent portal loads felt slow in production.
- Live timing showed account-exists requests taking up to ~2.5s for known emails.
- Patient portal bootstrap was ~4.3s cold, and meal-plan hydration endpoints were
  ~3-4.4s with catalog responses around 640 KB.

### Root causes

1. The lightweight account-exists flow used the full patient lookup helper, which can
   call Supabase Auth Admin and fall back to listing auth users.
2. Booking email checks were triggered aggressively and stale requests were ignored but
   not aborted.
3. Meal-plan catalog reads loaded too many cache rows, enabled global generated fallback
   by default, and returned hundreds of recipes.
4. Latest meal-plan reads inlined data-image payloads by default and scanned more cache
   rows than needed for normal portal hydration.
5. Meal-plan read endpoints synchronously backfilled legacy cached recipes during portal
   reads, which made normal sign-in hydration wait on maintenance writes.
6. Portal bootstrap loaded billing after certificates instead of overlapping independent
   Supabase reads.

### Files changed

- `api/index.js`
  - added a direct patient-row existence lookup for `/api/patient/account-exists`.
  - reduced meal-plan catalog default limit/cache scan and made global fallback opt-in.
  - made latest meal-plan data-image inlining opt-in and reduced fallback scan limits.
  - uses cached recipe bundles before querying the recipe table for latest meal plans.
  - makes legacy recipe backfill non-blocking during read endpoints.
  - overlaps patient billing and certificate reads during Supabase portal bootstrap.
- `backend/lib/storage.js`
  - reduced latest meal-plan cache lookup from 24 rows to 1 row.
- `frontend/src/components/FlowSteps.tsx`
  - aborts stale account-check requests and caches the latest email check result.
- `frontend/src/pages/PatientPortalPage.tsx`
  - requests smaller meal-plan catalogs and avoids inline data images.
  - reduced the patient portal catalog request from 120 generated recipes to 60.

### Verification

1. `node --check api/index.js backend/lib/storage.js` succeeds.
2. `npm run lint` succeeds.
3. `npm run build` succeeds.

## 2026-07-17 - Move public web canonical domain to Supadoc

### Symptoms

- `supadoc.com.au` needed to become the primary public web domain.
- Existing Onya Health email/sender infrastructure needed to remain on the Onya domain.

### Root causes

1. The Vercel project had not been connected to the Supadoc apex and `www` domains.
2. SEO metadata, social preview URLs, robots, and sitemap output still used
   `www.onyahealth.com.au` as the canonical public origin.
3. Project deployment docs still treated the old Onya domains as the required production
   aliases.

### Files/areas changed

- Vercel project `onya-health`
  - added `supadoc.com.au`
  - added `www.supadoc.com.au`
  - updated production `APP_BASE_URL`, `FRONTEND_BASE_URL`, and `VITE_API_BASE_URL`
    to `https://supadoc.com.au`
  - updated production `CORS_ORIGIN` to allow Supadoc, existing Onya, and Vercel
    production origins during the transition
  - removed the accidental/dead `superdoc.com.au` domain entry after confirming the
    GoDaddy account is for `supadoc.com.au`
- GoDaddy DNS
  - apex `A @` points to `76.76.21.21`
  - `www` CNAME points to `cname.vercel-dns.com.`
  - nameservers and mail-related records left unchanged
- `frontend/index.html`
  - canonical, Open Graph, and Twitter image URLs now use `https://supadoc.com.au`.
- `frontend/public/robots.txt`
  - sitemap URL now uses `https://supadoc.com.au`.
- `frontend/public/sitemap.xml`
  - generated route URLs now use `https://supadoc.com.au`.
- `frontend/src/pages/HealthTopicLandingPage.tsx`
  - health-topic canonical/structured-data base URL now uses `https://supadoc.com.au`.
- `scripts/generate-sitemap.mjs`
  - default sitemap base URL now uses `https://supadoc.com.au`.
- `AGENTS.md`, `PLANS.md`, `.agents/README.md`
  - deployment policy now uses Supadoc as the primary web domain and keeps Onya mail
    migration separate.

### Verification

1. `npm run lint` succeeds.
2. `npm run build` succeeds.
3. `npx vercel domains inspect supadoc.com.au` finds the domain attached to
   `onya-health`; Vercel sees GoDaddy nameservers.
4. `npx vercel domains inspect www.supadoc.com.au` finds the domain attached to
   `onya-health`; Vercel sees GoDaddy nameservers.
5. `dig +short supadoc.com.au NS` returns `ns23.domaincontrol.com.` and
   `ns24.domaincontrol.com.`.
6. `dig +short supadoc.com.au A` returns `76.76.21.21`.
7. `dig +short www.supadoc.com.au CNAME` returns `cname.vercel-dns.com.`.
8. Earlier `superdoc.com.au` checks returned no public DNS; the GoDaddy account and
   public DNS records are for `supadoc.com.au`.
9. Production deployment `dpl_4xcY58yxLF8midrV2XcUcobwThzC` is `Ready`.
10. `vercel alias ls` shows active aliases on the latest deployment for
    `supadoc.com.au`, `www.supadoc.com.au`, `onyahealth.com.au`,
    `www.onyahealth.com.au`, and `onya-health.vercel.app`.
11. `https://supadoc.com.au/` returns `200` and includes Supadoc canonical, Open Graph,
    and Twitter image URLs.
12. `https://www.supadoc.com.au/` returns `200` and includes the same Supadoc canonical
    and social sharing URLs.
13. `https://supadoc.com.au/sitemap.xml` returns `200` and sitemap URLs use
    `https://supadoc.com.au`.
14. `POST https://supadoc.com.au/api/patient/account-exists` with
    `Origin: https://supadoc.com.au` returns `200` JSON and
    `access-control-allow-origin: https://supadoc.com.au`.

## 2026-08-04 - Activate Isaac doctor account and restrict notification recipients

### Symptoms

- `isaacsupadoc@gmail.com` had a complete, email-confirmed practitioner record but was
  still pending approval and could not access the live doctor queue.
- Supabase notification discovery included every doctor-role account, even when the
  account was pending or rejected.

### Root causes

1. The Isaac account had not completed the explicit admin-approval step.
2. `listSupabaseDoctorEmails()` filtered by role but not by approval status, creating a
   risk that unapproved accounts could receive patient and certificate notifications.

### Files/areas changed

- Production Supabase/Auth and doctor admin API:
  - rotated the Isaac account to a new temporary password;
  - changed approval status from `pending` to `approved` through the authenticated live
    admin route;
  - retained the existing practitioner identity and registration metadata.
- `api/index.js`
  - limited discovered Supabase doctor recipients to approved accounts and configured
    admin doctors.
- `backend/README.md`
  - documented doctor welcome/reset and clinical notification routing.
- `PLANS.md`
  - recorded the account activation and notification-safety change.

### Verification

1. Live doctor login for `isaacsupadoc@gmail.com` returned `200`.
2. Authenticated `GET /api/doctor/profile` returned `200` with `approved` status.
3. Authenticated `GET /api/doctor/certificates` returned `200`.
4. No patient certificate was approved or modified during verification.

## 2026-08-04 - Complete doctor/patient messaging and certificate email delivery

### Symptoms

- Doctors received patient-message emails but the email had no reply button.
- Patient messages were audit events only and were not visible on the doctor review page,
  so the doctor could not reply in context from the portal.
- Patient message and completed-certificate emails did not consistently provide a clear
  route back to the patient portal.

### Root causes

1. `PATIENT_MESSAGE_SENT` events were written to `request_events`, but certificate review
   responses did not load those events.
2. There was no dedicated authenticated doctor-to-patient message endpoint.
3. The patient-message email template did not receive a certificate-specific review URL.
4. The completed-certificate email attached the PDF but only showed a portal link in its
   attachment-failure fallback.

### Files/areas changed

- `backend/lib/storage.js`
  - added local and Supabase retrieval of patient, doctor, and more-information message
    events for a certificate.
- `api/index.js`, `backend/server.js`
  - return message history in authenticated request detail responses;
  - persist patient messages with stable sender metadata;
  - added `POST /api/doctor/certificates/:id/message` to store a doctor reply and email the
    patient;
  - preserve controlled success responses when email delivery fails.
- `backend/lib/email-templates.js`
  - added direct doctor-review and patient-portal calls to action;
  - added the doctor-reply email template;
  - kept the generated certificate PDF attached to approval emails.
- `frontend/public/doctor/*`, `backend/doctor-portal/*`
  - added the patient conversation and reply composer to certificate review;
  - preserved the target review through doctor sign-in;
  - escaped patient and message data before rendering HTML.
- `frontend/src/pages/PatientPortalPage.tsx`, `frontend/src/patient-portal/model.ts`
  - load and display the request conversation in the queued patient view;
  - update the thread immediately after a patient message.

### Verification

1. `node --check` passes for the API, local backend, storage, and email template modules.
2. `npm run lint` passes.
3. `npm run build` passes.
4. Isolated local API smoke test confirmed:
   - historical patient audit messages load in doctor request details;
   - a doctor reply is stored and returned in the thread;
   - the patient reply email includes an `Open patient portal` button;
   - certificate approval creates an email with a PDF attachment and patient-portal button.
5. Production Supabase message-history lookup returned existing patient messages through
   the new storage query without exposing message contents in logs.
6. Doctor review screenshots at `1440x1000` and `390x844` confirmed the conversation,
   reply composer, clinical notes, and decision controls remain readable without overlap.

## 2026-08-04 - Show patient messages awaiting a doctor reply in the queue

### Symptoms

- The doctor queue did not show which certificate requests had a patient message waiting
  for a response.
- Doctors had to open requests individually to find conversations needing follow-up.

### Root cause

- The queue endpoint returned certificate and risk information but no conversation
  summary, even though patient and doctor messages were already stored in the request
  audit trail.

### Files/areas changed

- `backend/lib/storage.js`
  - added bulk local and Supabase message-summary retrieval for queue request IDs;
  - marks a thread as needing a reply only when its latest valid message is from the
    patient.
- `api/index.js`, `backend/server.js`
  - include a content-free `messageSummary` in each authenticated queue item without a
    database query per certificate.
- `frontend/public/doctor/queue/index.html`, `backend/doctor-portal/queue.html`
  - show a message icon and `Needs reply` badge on waiting threads;
  - remove the badge automatically after a doctor becomes the latest sender;
  - preserve a clear mobile review action and escape queue values before HTML rendering.

### Verification

1. `node --check` passes for the storage, production API, and local backend modules.
2. `npm run lint` passes.
3. `npm run build` passes.
4. Isolated storage and authenticated queue smoke tests confirmed that patient-last
   threads are flagged and doctor-last threads are not.
5. Queue screenshots at `1440x1000` and `390x844` confirmed the badge, card emphasis, and
   review action remain readable without overlap.
6. A read-only production Supabase smoke check confirmed the bulk query returns existing
   patient-last and doctor-last conversation summaries without logging patient data.

## 2026-08-08 - Repair doctor signup feedback and Stripe checkout persistence

### Symptoms

- A successful doctor signup displayed `Cannot read properties of null (reading 'reset')`
  instead of the pending-approval confirmation.
- Checkout created a live Stripe Session but returned a raw Supabase `23503` foreign-key
  error because the referenced patient row did not exist.
- Failed checkout attempts left two open, unpaid Stripe Sessions that the browser never
  received.

### Root causes

1. The doctor signup handler read `event.currentTarget` after an asynchronous request;
   native event dispatch had already cleared that property.
2. Supabase profile and patient upserts were launched in parallel background work even
   though `patients` depends on `profiles` and `service_requests` depends on `patients`.
3. Stripe Session creation ran in parallel with request persistence, so Stripe could
   succeed even when the database write failed.
4. The production API passed internal provider errors directly to checkout UI copy.

### Files/areas changed

- `frontend/public/doctor/login/index.html`, `backend/doctor-portal/login.html`
  - retain the submitted form before awaiting the registration request and reset that
    stable reference after a successful pending registration.
- `backend/lib/storage.js`
  - await profile and patient upserts in foreign-key order on every submission, including
    cached patient IDs;
  - cache patient IDs only after required rows exist;
  - resolve patient identity from the submitted email instead of trusting a caller-supplied
    patient ID.
- `api/index.js`, `backend/server.js`
  - persist the certificate request before creating a Stripe Checkout Session;
  - return controlled checkout-unavailable copy while retaining detailed server logs;
  - disable the legacy static doctor credential path whenever Supabase is configured.
- `backend/lib/auth.js`
  - remove the default doctor email/password fallback so missing configuration fails
    closed.

### Verification

1. Mocked Supabase checks confirmed both new and cached identities write in this order:
   Auth user, profile, patient, service request, medical-certificate request.
2. `node --check` passed for the production API, local backend, and storage module.
3. `npm run lint`, `npm run build`, and `npm audit --omit=dev --audit-level=high` passed.
4. Local browser signup with a delayed response cleared the form and showed the pending
   approval confirmation without the null-reference error; the 390 px layout remained
   readable.
5. Production checkout returned `200`, created all required Supabase rows, and produced an
   open/unpaid live Stripe Session. The session was expired and the temporary medical
   request was removed after verification.
6. The two open/unpaid orphan Sessions from the reported failures were expired.
7. Production demo-patient login and bootstrap returned `200`. Demo-doctor registration
   returned `201`, while login correctly returned `403` until practitioner verification.
8. The approved production practitioner login, profile, queue, and patient-search APIs
   returned `200`. Desktop and 390 px browser checks found no console errors or horizontal
   overflow.
9. `supadoc.com.au`, `www.supadoc.com.au`, and `onya-health.vercel.app` resolve to the
   current Vercel production deployment.
10. The legacy production doctor fallback was still using its default account and
    password. The code now disables that bypass whenever Supabase is configured and has no
    built-in fallback values; the obsolete Vercel variables were removed after deployment.
    The approved Isaac Supabase account passed direct Auth and portal API checks. No
    credential value is stored in the repository.

## 2026-08-08 - Add controlled doctor account approvals

### Symptoms

- New doctor accounts remained pending, but the portal had no interface for an authorized
  reviewer to approve them.
- The approval API accepted only a configured admin email, excluding already approved
  doctors from helping with onboarding.
- The intended administrator email still had a patient auth role, so it could not enter
  the doctor portal.

### Root causes

1. Approval authorization was tied to legacy static-login configuration rather than a
   dedicated administrator list plus trusted doctor approval state.
2. The approval endpoint did not refresh the approver's Supabase status before mutating a
   target account, leaving a stale-token authorization risk.
3. The checkout identity upsert could overwrite an existing provider/admin profile role
   with `patient` when the same email was submitted.

### Files/areas changed

- `api/index.js`, `backend/server.js`, `backend/lib/doctor-auth.js`
  - allow the explicit administrator and currently approved doctors to list and review
    doctor account applications;
  - re-check current trusted approval state for every approval operation;
  - remove legacy static doctor-login values from administrator discovery.
- `frontend/public/doctor/queue/index.html`, `backend/doctor-portal/queue.html`
  - add a responsive Accounts panel with pending applicant details and Approve/Reject
    controls.
- `backend/lib/storage.js`
  - block patient checkout persistence from changing provider/admin identities to patients.
- Production Supabase and Vercel configuration
  - migrated `n.vanhoorick1@gmail.com` to an approved non-clinical provider/admin identity
    while preserving its historical patient row;
  - configured `ADMIN_DOCTOR_EMAILS` and removed obsolete static doctor credentials.

### Verification

1. Isolated API flow confirmed a pending account receives `403`, an approved doctor can
   list and approve it, and login succeeds after approval.
2. After the same account was rejected, its previously issued token received `403` from
   the account-list endpoint.
3. `node --check` passed for the production API, local backend, storage, and doctor-auth
   modules.
4. `npm run build`, `npm run lint`, and
   `npm audit --omit=dev --audit-level=high` passed.
5. Live `supadoc.com.au` checks returned `200` for the configured administrator and an
   approved doctor, `403` for the pending demo doctor, `401` without authentication, and
   `401` for the removed legacy static credentials. Both authorized accounts could list
   pending applications and submit an approval action without changing the demo account's
   pending state.
6. Vercel assigned `supadoc.com.au`, `www.supadoc.com.au`, and `onya-health.vercel.app` to
   production commit `e689956`. Desktop and 390 px browser measurements found no
   horizontal overflow; both account decision buttons remained within the mobile card.

## 2026-08-08 - Add patient filters, align Checkout, and make certificate previews editable

### Symptoms

- The doctor portal used ambiguous `Patients` and `Accounts` navigation and could not narrow
  patient histories by request date or certificate duration.
- Production Stripe amounts were `$11.21`, `$27.11`, and `$19.17`, while the public funnel
  displayed `$9.71`, up to `$29.71`, and `$19.00` monthly.
- Checkout used stale product presentation, a generic lifestyle thumbnail, a near-white background,
  and no session-level Supadoc branding.
- Certificate wording was fixed in code, and the PDF preview button became disabled after
  the first preview.

### Root causes

1. Patient search accepted only a name and performed no request-level filtering.
2. Vercel amount variables and Stripe default prices had drifted from the frontend pricing helper.
3. Stripe Session creation did not provide `branding_settings`, and the existing WebP logo
   format was not accepted by Stripe's logo slot.
4. The certificate statement was assembled only inside the PDF generator, so doctors could
   neither edit it nor persist approved wording.
5. Review busy-state cleanup did not explicitly re-enable the preview and AI-summary buttons.

### Files/areas changed

- `frontend/public/doctor/*`, `backend/doctor-portal/*`
  - rename patient navigation to `Search` and doctor onboarding to `Approvals`;
  - add responsive submission-date, date-range, and duration filters;
  - add editable certificate wording and repeatable preview state.
- `backend/lib/doctor-patient-filters.js`, `backend/lib/storage.js`
  - validate filters and apply them in local and Supabase request queries.
- `backend/lib/stripe-pricing.js`, `api/index.js`, `backend/server.js`
  - centralize 1-7 day, carer, and monthly pricing;
  - add Supadoc Checkout branding and clinically safe payment copy.
- `backend/lib/pdf.js`
  - use the requested default clinical statement, accept approved custom wording, and render
    the preview watermark behind certificate content.
- `frontend/public/checkout-logo.png`, `frontend/public/generated/medcert-checkout.webp`
  - add a trimmed 15 KB PNG logo compatible with Stripe Checkout and a certificate-specific
    product thumbnail designed to remain legible at Stripe's compact image size.
- `package.json`, `package-lock.json`
  - add the focused test command and update vulnerable dependencies, including Sharp 0.35.3.

### Verification

1. Eight focused Node tests cover filters, Brisbane date boundaries, all 1-7 day prices,
   the carer add-on, monthly recurrence, and default certificate wording.
2. Build and lint pass; `npm audit --audit-level=high` reports zero vulnerabilities.
3. A read-only Supabase query confirmed name, date, and duration filters execute successfully.
4. Desktop and 390 px doctor search/review checks found no horizontal overflow.
5. Two consecutive PDF previews produced different blob URLs and left the preview control enabled.
6. PDF text extraction confirmed custom wording; rendered inspection confirmed the watermark no
   longer obscures the clinical statement or doctor details.
7. A live unpaid Stripe Session returned A$11.21, the certificate product image, Supadoc colors,
   and the clinical review notice on desktop and mobile; it was expired after inspection.
8. Production application and alias verification is pending deployment.
