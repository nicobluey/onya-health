# BE Agent Guide (Patient + Dietitian Profile Model)

## Purpose
Backend profile identity must come from database tables and support many dietitians per patient over time.

## Database model (production)
- `patients`
  - canonical patient profile fields
  - includes: `id`, `owner_id`, `email`, `full_name`, `phone`, `dob`, `address`, `profile_photo_path`, timestamps
- `dietitians`
  - dietitian directory
  - includes: `id`, `full_name`, `phone`, `credentials`, `bio`, `profile_photo_path`, `is_active`, timestamps
- `patient_dietitians`
  - assignment join table
  - includes: `patient_id`, `dietitian_id`, `is_primary`, `assigned_at`

## Key constraints/indexes
- unique primary assignment per patient (partial unique index on `patient_id where is_primary = true`)
- lookup indexes:
  - `patients(lower(email))` unique
  - `patients(owner_id)`
  - `patient_dietitians(patient_id)`
  - `patient_dietitians(dietitian_id)`

## Storage rules
- Profile photos/headshots are storage objects, not DB blobs.
- DB stores path only (for example `dietitians/felicity-profile.webp`).
- API derives public URL via Supabase storage public URL builder.
- patient profile photos are uploaded by API from data-url payloads and stored in Supabase Storage; DB stores only `profile_photo_path`.

## Active server resolution path
Main resolver:
- `api/index.js` -> `resolvePatientProfileByEmail(...)`

Resolution order:
1. Find patient row by indexed `patients.email`.
2. Enrich with `profiles` row for `dob` and name fallback.
3. Resolve primary dietitian from `patient_dietitians`.
4. Fallback to first active dietitian if no primary assignment.
5. Final fallback to static dietitian object only if DB cannot resolve.

Returned API identity contract:
- `patient`: full profile object for UI
- `dietitian`: assigned primary dietitian profile object

## Auth + account flow (current)
- Primary sign-in path supports magic link:
  - `POST /api/patient/magic-link/request`
  - `POST /api/patient/magic-link/consume`
- Pre-check endpoint before checkout:
  - `POST /api/patient/account-exists` (email/phone collision guard)
- Profile update endpoint (authenticated):
  - `POST /api/patient/profile`
  - supports `fullName`, `email`, `dob`, `phone`, `address`, optional `profilePhotoDataUrl`
  - email-change path:
    - validates collision before update
    - updates Supabase auth email
    - syncs `profiles`/`patients` rows
    - updates local auth account
    - returns rotated patient token when email changes
- Checkout confirmation:
  - `POST /api/checkout/confirm` auto-creates patient account when missing and sends magic-link email after payment.

## Sync points
When account/profile records are created/updated:
- `createPatientAccountViaSupabase(...)` and `upsertSupabasePatientMetadata(...)`
- both call `upsertSupabasePatientProfileRows(...)`
- this keeps `profiles` and `patients` in sync
- these sync paths now include `address` and `profilePhotoPath`.

## Email idempotency rule
- Doctor review confirmation email sending is constrained to webhook-finalization path (`stripe_webhook`) in `markPaidFromStripeSession(...)` to prevent duplicate sends from multiple payment completion code paths.

## Payment reconciliation rule
- To reduce stale `awaiting_payment` states, patient API reads now run a bounded reconciliation pass:
  - fetch up to 5 recent `awaiting_payment` certificates with Stripe session IDs
  - re-check Stripe session payment status
  - auto-mark paid via `markPaidFromStripeSession(...)` when Stripe confirms `paid` or `no_payment_required`
- Reconciliation currently runs on:
  - `GET /api/patient/bootstrap`
  - `GET /api/patient/me`
  - `GET /api/patient/requests`

## Certificate duration cap
- Duration is hard-capped to 7 days at all pricing/draft points:
  - `buildDraftCertificate(...)`
  - `stripePricingFromRequest(...)`
- This prevents frontend bypass and keeps billing/certificate issuance aligned.

## Migrations applied for this model
- `supabase/migrations/20260508_refactor_patient_dietitian_profiles.sql`
- `supabase/migrations/20260509_add_patient_email_index.sql`
- `supabase/migrations/20260511_add_patient_address_and_phone_index.sql`

## Operational checklist before deploy
1. Ensure migration files are applied to target project.
2. Confirm at least one active dietitian exists.
3. Confirm each active patient has a primary assignment or fallback assignment path works.
4. Verify auth endpoints return `{ patient, dietitian }`.
5. Smoke test `/api/patient/bootstrap` with a real token.
6. Smoke test profile email change and ensure returned token can still load `/api/patient/bootstrap`.
