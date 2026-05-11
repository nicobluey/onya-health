# Fixes Log

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
